/**
 * Snapshot Rotation - RL4 Kernel Indexer Module
 *
 * Module 8995 - Snapshot rotation and compression management
 *
 * Manages RL4 snapshot lifecycle:
 * - Rotation based on size, age, and count quotas
 * - Compression of old snapshots to save space
 * - Consolidation of multiple snapshots
 * - Safe write operations with append-only compatibility
 * - Metadata management for snapshot tracking
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { execSync } from 'child_process';
import { WriteTracker } from '../WriteTracker';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface SnapshotMetadata {
    id: string;
    filename: string;
    originalFilename: string;
    timestamp: Date;
    size: number;
    compressedSize?: number;
    type: SnapshotType;
    version: string;
    checksum: string;
    tags: string[];
    retentionDays: number;
    isCompressed: boolean;
    isArchived: boolean;
}

export enum SnapshotType {
    FULL = 'full',
    INCREMENTAL = 'incremental',
    DIFF = 'diff',
    STATE = 'state',
    ACTIVITY = 'activity'
}

export interface CognitiveSnapshot {
    snapshot_id: number;
    timestamp: string;
    patterns: any[];
    correlations: any[];
    forecasts: any[];
    cognitive_load: number;
    git_context: any;
    files_active: string[];
}

export interface RotationConfig {
    maxSnapshots: number;
    maxAgeDays: number;
    maxTotalSizeMB: number;
    compressionThresholdMB: number;
    archiveAfterDays: number;
    deleteAfterDays: number;
    enableCompression: boolean;
    enableArchiving: boolean;
    compressionLevel: number; // 1-9
    preserveRatios: {
        full: number;      // Keep at least N full snapshots
        incremental: number; // Keep at least N incremental snapshots
        daily: number;     // Keep at least N daily snapshots
    };
}

export interface RotationResult {
    rotated: SnapshotMetadata[];
    compressed: SnapshotMetadata[];
    archived: SnapshotMetadata[];
    deleted: SnapshotMetadata[];
    errors: string[];
    spaceSaved: number;
    processingTime: number;
}

export interface ConsolidationPlan {
    targetSnapshots: SnapshotMetadata[];
    consolidatedType: SnapshotType;
    estimatedSize: number;
    reason: string;
}

/**
 * Snapshot Rotation Manager
 */
export class SnapshotRotation {
    private workspaceRoot: string;
    private snapshotsDir: string;
    private archiveDir: string;
    private metadataFile: string;
    private config: RotationConfig;
    private metadata: Map<string, SnapshotMetadata> = new Map();
    private writeTracker = WriteTracker.getInstance();

    constructor(workspaceRoot: string, config?: Partial<RotationConfig>) {
        this.workspaceRoot = workspaceRoot;
        this.snapshotsDir = path.join(workspaceRoot, '.reasoning_rl4', 'snapshots');
        this.archiveDir = path.join(this.snapshotsDir, 'archive');
        this.metadataFile = path.join(this.snapshotsDir, 'metadata.json');

        this.config = {
            maxSnapshots: 100,
            maxAgeDays: 30,
            maxTotalSizeMB: 1024, // 1GB
            compressionThresholdMB: 10,
            archiveAfterDays: 7,
            deleteAfterDays: 90,
            enableCompression: true,
            enableArchiving: true,
            compressionLevel: 6,
            preserveRatios: {
                full: 5,
                incremental: 20,
                daily: 14
            },
            ...config
        };

        this.ensureDirectories();
        this.loadMetadata();
    }

    /**
     * Perform snapshot rotation based on current configuration
     */
    async rotateIfNeeded(): Promise<RotationResult> {
        console.log(`SnapshotRotation: Starting rotation check...`);

        const startTime = Date.now();
        const result: RotationResult = {
            rotated: [],
            compressed: [],
            archived: [],
            deleted: [],
            errors: [],
            spaceSaved: 0,
            processingTime: 0
        };

        try {
            // Scan and update metadata
            await this.scanSnapshots();

            // Check if rotation is needed
            const rotationNeeded = await this.shouldRotate();
            if (!rotationNeeded) {
                console.log('SnapshotRotation: No rotation needed');
                result.processingTime = Date.now() - startTime;
                return result;
            }

            // Step 1: Compress old snapshots
            if (this.config.enableCompression) {
                await this.compressOldSnapshots(result);
            }

            // Step 2: Archive old snapshots
            if (this.config.enableArchiving) {
                await this.archiveOldSnapshots(result);
            }

            // Step 3: Consolidate snapshots
            await this.consolidateSnapshots(result);

            // Step 4: Delete expired snapshots
            await this.deleteExpiredSnapshots(result);

            // Step 5: Apply quota limits
            await this.applyQuotaLimits(result);

            // Save updated metadata
            await this.saveMetadata();

            result.processingTime = Date.now() - startTime;
            console.log(`SnapshotRotation: Rotation complete in ${result.processingTime}ms, saved ${this.formatBytes(result.spaceSaved)}`);

            return result;

        } catch (error) {
            result.errors.push(`Rotation failed: ${error}`);
            result.processingTime = Date.now() - startTime;
            console.error(`SnapshotRotation: Rotation failed: ${error}`);
            return result;
        }
    }

    /**
     * Scan snapshots directory and update metadata
     */
    async scanSnapshots(): Promise<void> {
        console.log('SnapshotRotation: Scanning snapshots...');

        if (!fs.existsSync(this.snapshotsDir)) {
            return;
        }

        const files = fs.readdirSync(this.snapshotsDir);

        for (const file of files) {
            const filePath = path.join(this.snapshotsDir, file);
            const stats = fs.statSync(filePath);

            if (stats.isFile() && !file.startsWith('metadata')) {
                await this.processSnapshotFile(filePath, file, stats);
            }
        }
    }

    /**
     * Process individual snapshot file
     */
    private async processSnapshotFile(filePath: string, filename: string, stats: fs.Stats): Promise<void> {
        try {
            const existing = this.metadata.get(filename);

            if (!existing || existing.size !== stats.size || existing.timestamp.getTime() !== stats.mtime.getTime()) {
                const metadata = await this.createMetadata(filePath, filename, stats);
                this.metadata.set(filename, metadata);
            }
        } catch (error) {
            console.log(`SnapshotRotation: Failed to process ${filename}: ${error}`);
        }
    }

    /**
     * Create metadata for snapshot file
     */
    private async createMetadata(filePath: string, filename: string, stats: fs.Stats): Promise<SnapshotMetadata> {
        const isCompressed = filename.endsWith('.gz');
        const baseFilename = isCompressed ? filename.slice(0, -3) : filename;

        // Extract type from filename pattern
        let type = SnapshotType.FULL;
        if (baseFilename.includes('incremental')) type = SnapshotType.INCREMENTAL;
        else if (baseFilename.includes('diff')) type = SnapshotType.DIFF;
        else if (baseFilename.includes('state')) type = SnapshotType.STATE;
        else if (baseFilename.includes('activity')) type = SnapshotType.ACTIVITY;

        // Generate checksum
        const checksum = await this.generateChecksum(filePath);

        return {
            id: this.generateSnapshotId(filename),
            filename,
            originalFilename: baseFilename,
            timestamp: stats.mtime,
            size: stats.size,
            type,
            version: '1.0',
            checksum,
            tags: [],
            retentionDays: this.config.deleteAfterDays,
            isCompressed,
            isArchived: false
        };
    }

    /**
     * Check if rotation is needed
     */
    private async shouldRotate(): Promise<boolean> {
        const snapshots = Array.from(this.metadata.values());
        const totalSize = snapshots.reduce((sum, s) => sum + s.size, 0);
        const oldestAge = this.getOldestSnapshotAge(snapshots);

        return (
            snapshots.length > this.config.maxSnapshots ||
            oldestAge > this.config.maxAgeDays ||
            totalSize > this.config.maxTotalSizeMB * 1024 * 1024
        );
    }

    /**
     * Compress old snapshots
     */
    private async compressOldSnapshots(result: RotationResult): Promise<void> {
        const candidates = Array.from(this.metadata.values()).filter(metadata =>
            !metadata.isCompressed &&
            metadata.size > this.config.compressionThresholdMB * 1024 * 1024 &&
            this.getDaysOld(metadata) >= 1
        );

        for (const metadata of candidates) {
            try {
                const compressed = await this.compressSnapshot(metadata);
                if (compressed) {
                    result.compressed.push(compressed);
                    result.spaceSaved += metadata.size - compressed.size;
                }
            } catch (error) {
                result.errors.push(`Failed to compress ${metadata.filename}: ${error}`);
            }
        }
    }

    /**
     * Compress individual snapshot
     */
    private async compressSnapshot(metadata: SnapshotMetadata): Promise<SnapshotMetadata | null> {
        const filePath = path.join(this.snapshotsDir, metadata.filename);
        const compressedPath = `${filePath}.gz`;

        if (!fs.existsSync(filePath)) {
            return null;
        }

        try {
            const data = fs.readFileSync(filePath);
            const compressed = await gzip(data, { level: this.config.compressionLevel });

            // Write compressed file safely
            await this.safeWrite(compressedPath, compressed);

            // Verify compressed file
            const verification = await gunzip(compressed);
            if (verification.length !== data.length) {
                fs.unlinkSync(compressedPath);
                throw new Error('Compression verification failed');
            }

            // Remove original file
            fs.unlinkSync(filePath);

            // Update metadata
            const updatedMetadata: SnapshotMetadata = {
                ...metadata,
                filename: `${metadata.filename}.gz`,
                compressedSize: compressed.length,
                isCompressed: true
            };

            this.metadata.set(updatedMetadata.filename, updatedMetadata);
            this.metadata.delete(metadata.filename);

            return updatedMetadata;

        } catch (error) {
            // Clean up on failure
            if (fs.existsSync(compressedPath)) {
                fs.unlinkSync(compressedPath);
            }
            throw error;
        }
    }

    /**
     * Archive old snapshots
     */
    private async archiveOldSnapshots(result: RotationResult): Promise<void> {
        const candidates = Array.from(this.metadata.values()).filter(metadata =>
            !metadata.isArchived &&
            this.getDaysOld(metadata) >= this.config.archiveAfterDays
        );

        for (const metadata of candidates) {
            try {
                const archived = await this.archiveSnapshot(metadata);
                if (archived) {
                    result.archived.push(archived);
                }
            } catch (error) {
                result.errors.push(`Failed to archive ${metadata.filename}: ${error}`);
            }
        }
    }

    /**
     * Archive individual snapshot
     */
    private async archiveSnapshot(metadata: SnapshotMetadata): Promise<SnapshotMetadata | null> {
        const sourcePath = path.join(this.snapshotsDir, metadata.filename);
        const archivePath = path.join(this.archiveDir, metadata.filename);

        if (!fs.existsSync(sourcePath)) {
            return null;
        }

        try {
            // Ensure archive directory exists
            if (!fs.existsSync(this.archiveDir)) {
                fs.mkdirSync(this.archiveDir, { recursive: true });
            }

            // Move file to archive
            fs.renameSync(sourcePath, archivePath);

            // Update metadata
            const updatedMetadata: SnapshotMetadata = {
                ...metadata,
                isArchived: true
            };

            this.metadata.set(metadata.filename, updatedMetadata);

            return updatedMetadata;

        } catch (error) {
            // Try to move back on failure
            if (fs.existsSync(archivePath) && !fs.existsSync(sourcePath)) {
                fs.renameSync(archivePath, sourcePath);
            }
            throw error;
        }
    }

    /**
     * Consolidate snapshots to reduce count
     */
    private async consolidateSnapshots(result: RotationResult): Promise<void> {
        const plans = this.createConsolidationPlans();

        for (const plan of plans) {
            try {
                const consolidated = await this.executeConsolidationPlan(plan);
                if (consolidated) {
                    result.rotated.push(consolidated);

                    // Calculate space saved
                    const originalSize = plan.targetSnapshots.reduce((sum, s) => sum + s.size, 0);
                    result.spaceSaved += originalSize - consolidated.size;
                }
            } catch (error) {
                result.errors.push(`Failed to consolidate: ${error}`);
            }
        }
    }

    /**
     * Create consolidation plans
     */
    private createConsolidationPlans(): ConsolidationPlan[] {
        const plans: ConsolidationPlan[] = [];
        const snapshots = Array.from(this.metadata.values())
            .filter(s => !s.isArchived)
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        // Group by type and time periods
        const fullSnapshots = snapshots.filter(s => s.type === SnapshotType.FULL);
        const incrementalSnapshots = snapshots.filter(s => s.type === SnapshotType.INCREMENTAL);

        // Consolidate old incremental snapshots
        if (incrementalSnapshots.length > this.config.preserveRatios.incremental) {
            const toConsolidate = incrementalSnapshots.slice(0, -this.config.preserveRatios.incremental);
            if (toConsolidate.length >= 3) {
                plans.push({
                    targetSnapshots: toConsolidate,
                    consolidatedType: SnapshotType.DIFF,
                    estimatedSize: toConsolidate.reduce((sum, s) => sum + s.size, 0) * 0.3,
                    reason: 'Consolidate old incremental snapshots'
                });
            }
        }

        return plans;
    }

    /**
     * Execute consolidation plan
     */
    private async executeConsolidationPlan(plan: ConsolidationPlan): Promise<SnapshotMetadata | null> {
        const timestamp = new Date();
        const filename = this.generateSnapshotFilename(plan.consolidatedType, timestamp);

        try {
            // Combine snapshots (simplified implementation)
            const consolidatedData = await this.combineSnapshots(plan.targetSnapshots);

            // Write consolidated snapshot
            const filePath = path.join(this.snapshotsDir, filename);
            await this.safeWrite(filePath, consolidatedData);

            // Create metadata for consolidated snapshot
            const stats = fs.statSync(filePath);
            const metadata = await this.createMetadata(filePath, filename, stats);

            // Remove original snapshots
            for (const oldSnapshot of plan.targetSnapshots) {
                const oldPath = path.join(this.snapshotsDir, oldSnapshot.filename);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
                this.metadata.delete(oldSnapshot.filename);
            }

            this.metadata.set(filename, metadata);
            return metadata;

        } catch (error) {
            // Clean up on failure
            const filePath = path.join(this.snapshotsDir, filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            throw error;
        }
    }

    /**
     * Combine multiple snapshots
     */
    private async combineSnapshots(snapshots: SnapshotMetadata[]): Promise<Buffer> {
        const combinedData: Buffer[] = [];

        for (const snapshot of snapshots) {
            const filePath = path.join(this.snapshotsDir, snapshot.filename);

            if (fs.existsSync(filePath)) {
                let data = fs.readFileSync(filePath);

                // Decompress if needed
                if (snapshot.isCompressed) {
                    data = await gunzip(data);
                }

                combinedData.push(data);
            }
        }

        // Simple concatenation with metadata separator
        const separator = Buffer.from('\n--- SNAPSHOT_SEPARATOR ---\n');
        return Buffer.concat(combinedData.flatMap(data => [data, separator]).slice(0, -1));
    }

    /**
     * Delete expired snapshots
     */
    private async deleteExpiredSnapshots(result: RotationResult): Promise<void> {
        const expired = Array.from(this.metadata.values()).filter(metadata =>
            this.getDaysOld(metadata) > metadata.retentionDays
        );

        for (const metadata of expired) {
            try {
                const deleted = await this.deleteSnapshot(metadata);
                if (deleted) {
                    result.deleted.push(deleted);
                    result.spaceSaved += deleted.size;
                }
            } catch (error) {
                result.errors.push(`Failed to delete ${metadata.filename}: ${error}`);
            }
        }
    }

    /**
     * Delete individual snapshot
     */
    private async deleteSnapshot(metadata: SnapshotMetadata): Promise<SnapshotMetadata | null> {
        const filePath = metadata.isArchived ?
            path.join(this.archiveDir, metadata.filename) :
            path.join(this.snapshotsDir, metadata.filename);

        if (!fs.existsSync(filePath)) {
            return null;
        }

        try {
            const size = fs.statSync(filePath).size;
            fs.unlinkSync(filePath);

            this.metadata.delete(metadata.filename);
            return { ...metadata, size };

        } catch (error) {
            throw error;
        }
    }

    /**
     * Apply quota limits
     */
    private async applyQuotaLimits(result: RotationResult): Promise<void> {
        const snapshots = Array.from(this.metadata.values())
            .filter(s => !s.isArchived)
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()); // Newest first

        // Keep preserve ratios
        const toKeep = new Set<string>();
        const types = [SnapshotType.FULL, SnapshotType.INCREMENTAL];

        for (const type of types) {
            const typeSnapshots = snapshots.filter(s => s.type === type);
            const preserveCount = type === SnapshotType.FULL ?
                this.config.preserveRatios.full :
                this.config.preserveRatios.incremental;

            for (let i = 0; i < Math.min(preserveCount, typeSnapshots.length); i++) {
                toKeep.add(typeSnapshots[i].filename);
            }
        }

        // Keep recent snapshots (last 7 days)
        const recentCutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
        for (const snapshot of snapshots) {
            if (snapshot.timestamp.getTime() > recentCutoff) {
                toKeep.add(snapshot.filename);
            }
        }

        // Delete snapshots not in preserve set
        const toDelete = snapshots.filter(s => !toKeep.has(s.filename));

        for (const metadata of toDelete) {
            try {
                const deleted = await this.deleteSnapshot(metadata);
                if (deleted) {
                    result.deleted.push(deleted);
                    result.spaceSaved += deleted.size;
                }
            } catch (error) {
                result.errors.push(`Failed to delete quota exceeded snapshot ${metadata.filename}: ${error}`);
            }
        }
    }

    /**
     * Get snapshot statistics
     */
    getStatistics(): any {
        const snapshots = Array.from(this.metadata.values());
        const totalSize = snapshots.reduce((sum, s) => sum + s.size, 0);
        const compressedSize = snapshots.reduce((sum, s) => sum + (s.compressedSize || s.size), 0);

        return {
            totalSnapshots: snapshots.length,
            totalSize,
            compressedSize,
            compressionRatio: totalSize > 0 ? compressedSize / totalSize : 1,
            archivedCount: snapshots.filter(s => s.isArchived).length,
            compressedCount: snapshots.filter(s => s.isCompressed).length,
            oldestSnapshot: this.getOldestSnapshotAge(snapshots),
            newestSnapshot: this.getNewestSnapshotAge(snapshots),
            types: this.getSnapshotTypeDistribution(snapshots)
        };
    }

    // Helper methods

    private ensureDirectories(): void {
        [this.snapshotsDir, this.archiveDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    private loadMetadata(): void {
        try {
            if (fs.existsSync(this.metadataFile)) {
                const data = fs.readFileSync(this.metadataFile, 'utf8');
                const metadataArray = JSON.parse(data);

                this.metadata.clear();
                for (const metadata of metadataArray) {
                    metadata.timestamp = new Date(metadata.timestamp);
                    this.metadata.set(metadata.filename, metadata);
                }
            }
        } catch (error) {
            console.log(`SnapshotRotation: Failed to load metadata: ${error}`);
            this.metadata.clear();
        }
    }

    private async saveMetadata(): Promise<void> {
        try {
            const metadataArray = Array.from(this.metadata.values());
            fs.writeFileSync(this.metadataFile, JSON.stringify(metadataArray, null, 2));
        } catch (error) {
            console.log(`SnapshotRotation: Failed to save metadata: ${error}`);
        }
    }

    private async generateChecksum(filePath: string): Promise<string> {
        try {
            const data = fs.readFileSync(filePath);
            const crypto = require('crypto');
            return crypto.createHash('sha256').update(data).digest('hex');
        } catch {
            return 'unknown';
        }
    }

    private generateSnapshotId(filename: string): string {
        return `snapshot_${filename}_${Date.now()}`;
    }

    private generateSnapshotFilename(type: SnapshotType, timestamp: Date): string {
        const dateStr = timestamp.toISOString().replace(/[:.]/g, '-');
        return `${type}-${dateStr}.json`;
    }

    private getDaysOld(metadata: SnapshotMetadata): number {
        return Math.floor((Date.now() - metadata.timestamp.getTime()) / (24 * 60 * 60 * 1000));
    }

    private getOldestSnapshotAge(snapshots: SnapshotMetadata[]): number {
        if (snapshots.length === 0) return 0;
        const oldest = snapshots.reduce((oldest, current) =>
            current.timestamp < oldest.timestamp ? current : oldest
        );
        return this.getDaysOld(oldest);
    }

    private getNewestSnapshotAge(snapshots: SnapshotMetadata[]): number {
        if (snapshots.length === 0) return 0;
        const newest = snapshots.reduce((newest, current) =>
            current.timestamp > newest.timestamp ? current : newest
        );
        return this.getDaysOld(newest);
    }

    private getSnapshotTypeDistribution(snapshots: SnapshotMetadata[]): any {
        const distribution: any = {};

        for (const type of Object.values(SnapshotType)) {
            distribution[type] = snapshots.filter(s => s.type === type).length;
        }

        return distribution;
    }

    private async safeWrite(filePath: string, data: Buffer): Promise<void> {
        const tempPath = `${filePath}.tmp.${Date.now()}`;

        try {
            fs.writeFileSync(tempPath, data);
            fs.renameSync(tempPath, filePath);
            this.writeTracker.markInternalWrite(filePath);
        } catch (error) {
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }
            throw error;
        }
    }

    private formatBytes(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    /**
     * Save a lightweight cognitive snapshot for a given cycle.
     */
    async saveSnapshot(cycleId: number, snapshot?: Partial<CognitiveSnapshot>): Promise<void> {
        const filename = path.join(this.snapshotsDir, `snapshot-${cycleId}.json`);
        const payload: CognitiveSnapshot = {
            snapshot_id: cycleId,
            timestamp: new Date().toISOString(),
            patterns: snapshot?.patterns ?? [],
            correlations: snapshot?.correlations ?? [],
            forecasts: snapshot?.forecasts ?? [],
            cognitive_load: snapshot?.cognitive_load ?? 0,
            git_context: snapshot?.git_context ?? {},
            files_active: snapshot?.files_active ?? []
        };
        await fs.promises.mkdir(this.snapshotsDir, { recursive: true });
        fs.writeFileSync(filename, JSON.stringify(payload, null, 2), 'utf-8');
        this.writeTracker.markInternalWrite(filename);
    }

    /**
     * Load a cognitive snapshot by cycle id.
     */
    async loadSnapshot(cycleId: number): Promise<CognitiveSnapshot | null> {
        const filename = path.join(this.snapshotsDir, `snapshot-${cycleId}.json`);
        if (!fs.existsSync(filename)) return null;
        try {
            const content = fs.readFileSync(filename, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            console.error(`SnapshotRotation: failed to load snapshot ${cycleId}:`, error);
            return null;
        }
    }

    /**
     * Find the closest snapshot id to a timestamp (ISO string).
     */
    findClosestSnapshot(timestamp: string): number | null {
        if (!fs.existsSync(this.snapshotsDir)) return null;
        const files = fs.readdirSync(this.snapshotsDir).filter(f => f.startsWith('snapshot-') && f.endsWith('.json'));
        if (files.length === 0) return null;
        const target = new Date(timestamp).getTime();
        let closest: { cycle: number; diff: number } | null = null;
        for (const file of files) {
            const m = file.match(/snapshot-(\d+)\.json/);
            if (!m) continue;
            const cycle = parseInt(m[1], 10);
            const filePath = path.join(this.snapshotsDir, file);
            try {
                const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CognitiveSnapshot;
                const ts = new Date(snapshot.timestamp).getTime();
                const diff = Math.abs(ts - target);
                if (!closest || diff < closest.diff) {
                    closest = { cycle, diff };
                }
            } catch {
                // skip invalid
            }
        }
        return closest ? closest.cycle : null;
    }
}