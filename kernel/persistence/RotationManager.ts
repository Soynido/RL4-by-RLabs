/**
 * RotationManager - Gestion de Rotation et Purge avec Traçabilité
 * 
 * Gère la rotation/purge des fichiers append-only avec production d'événements de rétention.
 * 
 * ⚠️ INVARIANT : Toute rotation/purge produit un MEMORY_RETENTION_EVENT
 * ⚠️ INVARIANT : HOT data jamais purgée (vérifié avant rotation)
 * 
 * Référence : docs/rl4-memory-contract.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { MemoryClass, MEMORY_CLASS_CONFIGS } from '../memory/MemoryClass';
import { createMemoryRetentionEvent, MemoryRetentionEventPayload } from '../memory/MemoryRetentionEvent';
import { MIL } from '../memory/MIL';
import { EventSource } from '../memory/types';

export interface RotationConfig {
    maxFileSizeMB: number;
    maxAgeDays: number;
    enableArchiving: boolean;
    enableCompression: boolean;
    archiveDir?: string;
    memoryClass: MemoryClass;  // Memory class for this file
}

export interface RotationResult {
    rotated: string[];
    deleted: string[];
    spaceSaved: number;
    retentionEvents: any[];  // UnifiedEvent[]
    errors: string[];
}

export interface ShouldRotateResult {
    shouldRotate: boolean;
    reason?: 'maxAgeDays' | 'maxFileSize' | 'quota';
}

export class RotationManager {
    private workspaceRoot: string;
    private config: RotationConfig;
    private mil?: MIL;

    constructor(
        workspaceRoot: string,
        config: RotationConfig,
        mil?: MIL  // Pour indexer les événements de rétention
    ) {
        this.workspaceRoot = workspaceRoot;
        this.config = config;
        this.mil = mil;
    }

    /**
     * Vérifie si un fichier doit être rotaté
     */
    shouldRotate(filePath: string): ShouldRotateResult {
        if (!fs.existsSync(filePath)) {
            return { shouldRotate: false };
        }

        // ⚠️ INVARIANT : HOT data jamais purgée
        if (this.config.memoryClass === MemoryClass.HOT) {
            return { shouldRotate: false };
        }

        const stats = fs.statSync(filePath);
        const fileSizeMB = stats.size / (1024 * 1024);
        const fileAgeDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
        const config = MEMORY_CLASS_CONFIGS[this.config.memoryClass];

        // Check size
        if (fileSizeMB > this.config.maxFileSizeMB) {
            return { shouldRotate: true, reason: 'maxFileSize' };
        }

        // Check age
        if (fileAgeDays > config.maxAgeDays) {
            return { shouldRotate: true, reason: 'maxAgeDays' };
        }

        return { shouldRotate: false };
    }

    /**
     * Rotate un fichier append-only
     * 
     * ⚠️ CRITIQUE : Produit un MEMORY_RETENTION_EVENT avant rotation
     */
    async rotateFile(filePath: string): Promise<RotationResult> {
        const result: RotationResult = {
            rotated: [],
            deleted: [],
            spaceSaved: 0,
            retentionEvents: [],
            errors: []
        };

        if (!fs.existsSync(filePath)) {
            return result;
        }

        // ⚠️ INVARIANT : HOT data jamais purgée
        if (this.config.memoryClass === MemoryClass.HOT) {
            result.errors.push(`Cannot rotate HOT data: ${filePath}`);
            return result;
        }

        try {
            const stats = fs.statSync(filePath);
            const fileSize = stats.size;

            // Extract range from file (first and last timestamps/seq)
            const range = await this.extractFileRange(filePath);

            // Create retention event BEFORE rotation
            const retentionEvent = createMemoryRetentionEvent({
                component: this.getComponentFromPath(filePath),
                file: filePath,
                reason: this.shouldRotate(filePath).reason || 'maxAgeDays',
                range_affected: {
                    from_timestamp: range.from_timestamp,
                    to_timestamp: range.to_timestamp,
                    from_seq: range.from_seq,
                    to_seq: range.to_seq
                },
                memory_class: this.config.memoryClass,
                rebuild_impact: this.getRebuildImpact()
            });

            // Index event in MIL BEFORE rotation
            if (this.mil) {
                await this.mil.ingest(retentionEvent, EventSource.SYSTEM);
            }

            result.retentionEvents.push(retentionEvent);

            // Rotate file (create new file with timestamp)
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const dir = path.dirname(filePath);
            const basename = path.basename(filePath, path.extname(filePath));
            const ext = path.extname(filePath);
            const rotatedPath = path.join(dir, `${basename}.${timestamp}${ext}`);

            // Copy content to rotated file
            fs.copyFileSync(filePath, rotatedPath);

            // Truncate original file (keep it for new writes)
            fs.truncateSync(filePath, 0);

            result.rotated.push(rotatedPath);
            result.spaceSaved += fileSize; // Space saved by rotation (original file truncated)

            // Archive or delete old rotated files if needed
            if (this.config.enableArchiving) {
                await this.archiveOldRotatedFiles(dir, basename, ext, result);
            } else {
                await this.deleteOldRotatedFiles(dir, basename, ext, result);
            }

        } catch (error: any) {
            result.errors.push(`Failed to rotate ${filePath}: ${error.message}`);
        }

        return result;
    }

    /**
     * Extract timestamp/seq range from JSONL file
     */
    private async extractFileRange(filePath: string): Promise<{
        from_timestamp: number;
        to_timestamp: number;
        from_seq?: number;
        to_seq?: number;
    }> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.trim().split('\n').filter(Boolean);

            if (lines.length === 0) {
                const stats = fs.statSync(filePath);
                return {
                    from_timestamp: stats.mtime.getTime(),
                    to_timestamp: stats.mtime.getTime()
                };
            }

            // Parse first line
            const firstLine = JSON.parse(lines[0]);
            const from_timestamp = firstLine.timestamp || firstLine.isoTimestamp ? 
                Date.parse(firstLine.isoTimestamp || firstLine.timestamp) : 
                Date.now();
            const from_seq = firstLine.seq;

            // Parse last line
            const lastLine = JSON.parse(lines[lines.length - 1]);
            const to_timestamp = lastLine.timestamp || lastLine.isoTimestamp ? 
                Date.parse(lastLine.isoTimestamp || lastLine.timestamp) : 
                Date.now();
            const to_seq = lastLine.seq;

            return {
                from_timestamp,
                to_timestamp,
                from_seq,
                to_seq
            };
        } catch (error) {
            // Fallback to file mtime
            const stats = fs.statSync(filePath);
            return {
                from_timestamp: stats.mtime.getTime(),
                to_timestamp: stats.mtime.getTime()
            };
        }
    }

    /**
     * Get component name from file path
     */
    private getComponentFromPath(filePath: string): string {
        if (filePath.includes('cognitive/decisions')) return 'DecisionStore';
        if (filePath.includes('cognitive/decision_status')) return 'DecisionStore';
        if (filePath.includes('memory/events')) return 'MIL';
        if (filePath.includes('traces/')) return 'Traces';
        return 'Unknown';
    }

    /**
     * Get rebuild impact based on memory class
     */
    private getRebuildImpact(): 'blocking' | 'warning' | 'none' {
        const config = MEMORY_CLASS_CONFIGS[this.config.memoryClass];
        if (config.rebuildRequired) {
            return 'blocking';
        }
        return 'warning';
    }

    /**
     * Archive old rotated files
     */
    private async archiveOldRotatedFiles(
        dir: string,
        basename: string,
        ext: string,
        result: RotationResult
    ): Promise<void> {
        if (!this.config.archiveDir) return;

        const archiveDir = path.join(this.workspaceRoot, '.reasoning_rl4', this.config.archiveDir);
        if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir, { recursive: true });
        }

        const files = fs.readdirSync(dir);
        const rotatedFiles = files.filter(f => 
            f.startsWith(`${basename}.`) && 
            f.endsWith(ext) && 
            f !== `${basename}${ext}`
        );

        const config = MEMORY_CLASS_CONFIGS[this.config.memoryClass];
        const cutoffDays = config.maxAgeDays;

        for (const file of rotatedFiles) {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);
            const ageDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

            if (ageDays > cutoffDays) {
                const archivePath = path.join(archiveDir, file);
                fs.renameSync(filePath, archivePath);
                result.deleted.push(filePath);
                result.spaceSaved += stats.size;
            }
        }
    }

    /**
     * Delete old rotated files
     */
    private async deleteOldRotatedFiles(
        dir: string,
        basename: string,
        ext: string,
        result: RotationResult
    ): Promise<void> {
        const files = fs.readdirSync(dir);
        const rotatedFiles = files.filter(f => 
            f.startsWith(`${basename}.`) && 
            f.endsWith(ext) && 
            f !== `${basename}${ext}`
        );

        const config = MEMORY_CLASS_CONFIGS[this.config.memoryClass];
        const cutoffDays = config.maxAgeDays;

        for (const file of rotatedFiles) {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);
            const ageDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

            if (ageDays > cutoffDays) {
                const fileSize = stats.size;
                fs.unlinkSync(filePath);
                result.deleted.push(filePath);
                result.spaceSaved += fileSize;
            }
        }
    }

    /**
     * Rotate all files in a directory matching a pattern
     */
    async rotateDirectory(dirPath: string, pattern: string): Promise<RotationResult> {
        const result: RotationResult = {
            rotated: [],
            deleted: [],
            spaceSaved: 0,
            retentionEvents: [],
            errors: []
        };

        if (!fs.existsSync(dirPath)) {
            return result;
        }

        const files = fs.readdirSync(dirPath);
        const matchingFiles = files.filter(f => {
            // Simple pattern matching (supports *.jsonl)
            if (pattern.includes('*')) {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                return regex.test(f);
            }
            return f === pattern;
        });

        for (const file of matchingFiles) {
            const filePath = path.join(dirPath, file);
            if (this.shouldRotate(filePath).shouldRotate) {
                const fileResult = await this.rotateFile(filePath);
                result.rotated.push(...fileResult.rotated);
                result.deleted.push(...fileResult.deleted);
                result.spaceSaved += fileResult.spaceSaved;
                result.retentionEvents.push(...fileResult.retentionEvents);
                result.errors.push(...fileResult.errors);
            }
        }

        return result;
    }
}

