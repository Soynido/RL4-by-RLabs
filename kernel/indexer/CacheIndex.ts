/**
 * RL4 Cache Index
 * 
 * Optimise l'accès aux données RL4 en maintenant un index en cache
 * plutôt que de reparser les fichiers JSONL à chaque requête.
 * 
 * Problème résolu:
 * - Lecture de 5,863 cycles = 2.6 MB à parser = 200-500ms
 * - Avec index: <50ms pour n'importe quelle requête temporelle
 * 
 * Mise à jour: Automatique à chaque nouveau cycle (incrémental)
 */

import * as fs from 'fs';
import * as path from 'path';

export interface IndexEntry {
    cycleId: number;
    timestamp: string;
    day: string; // "YYYY-MM-DD"
    hour: number; // 0-23
    patterns_count: number;
    forecasts_count: number;
    files: string[]; // Top 3 files pour recherche rapide
}

export interface CacheIndex {
    version: string;
    generated_at: string;
    total_cycles: number;
    date_range: {
        first: string;
        last: string;
    };
    // Indexes
    by_day: Record<string, number[]>; // "2025-11-10" -> [442, 443, 444...]
    by_file: Record<string, number[]>; // "AuthService.ts" -> [100, 200, 300...]
    by_hour: Record<string, number[]>; // "2025-11-10T14" -> [442, 443]
    // Metadata
    entries: IndexEntry[];
}

export interface CacheIndexStats {
    total_cycles: number;
    first: string;
    last: string;
    version: string;
    generated_at: string;
}

export class RL4CacheIndexer {
    private workspaceRoot: string;
    private indexPath: string;
    private cyclesPath: string;
    private fileChangesPath: string;
    
    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.indexPath = path.join(workspaceRoot, '.reasoning_rl4', 'cache', 'index.json');
        this.cyclesPath = path.join(workspaceRoot, '.reasoning_rl4', 'ledger', 'cycles.jsonl');
        this.fileChangesPath = path.join(workspaceRoot, '.reasoning_rl4', 'traces', 'file_changes.jsonl');
    }
    
    /**
     * Rebuild complete index from scratch
     * Utiliser uniquement au premier démarrage ou en cas de corruption
     */
    async rebuild(): Promise<CacheIndex> {
        console.log('🔧 Rebuilding RL4 cache index...');
        const startTime = Date.now();
        
        const index: CacheIndex = {
            version: '1.0.0',
            generated_at: new Date().toISOString(),
            total_cycles: 0,
            date_range: { first: '', last: '' },
            by_day: {},
            by_file: {},
            by_hour: {},
            entries: []
        };
        
        // 1. Index cycles
        if (fs.existsSync(this.cyclesPath)) {
            const lines = fs.readFileSync(this.cyclesPath, 'utf-8')
                .split('\n')
                .filter(l => l.trim());
            
            index.total_cycles = lines.length;
            
            for (const line of lines) {
                try {
                    const cycle = JSON.parse(line);
                    const timestamp = cycle.timestamp || cycle._timestamp;
                    const date = new Date(timestamp);
                    const day = timestamp.substring(0, 10); // "YYYY-MM-DD"
                    const hour = date.getHours();
                    const hourKey = `${day}T${hour.toString().padStart(2, '0')}`; // "2025-11-10T14"
                    
                    // Index by day
                    if (!index.by_day[day]) index.by_day[day] = [];
                    index.by_day[day].push(cycle.cycleId);
                    
                    // Index by hour
                    if (!index.by_hour[hourKey]) index.by_hour[hourKey] = [];
                    index.by_hour[hourKey].push(cycle.cycleId);
                    
                    // Create entry
                    const entry: IndexEntry = {
                        cycleId: cycle.cycleId,
                        timestamp,
                        day,
                        hour,
                        patterns_count: cycle.phases?.patterns?.count || 0,
                        forecasts_count: cycle.phases?.forecasts?.count || 0,
                        files: this.extractTopFiles(cycle)
                    };
                    index.entries.push(entry);
                    
                    // Index by file
                    entry.files.forEach(file => {
                        if (!index.by_file[file]) index.by_file[file] = [];
                        index.by_file[file].push(cycle.cycleId);
                    });
                    
                    // Update date range
                    if (!index.date_range.first || timestamp < index.date_range.first) {
                        index.date_range.first = timestamp;
                    }
                    if (!index.date_range.last || timestamp > index.date_range.last) {
                        index.date_range.last = timestamp;
                    }
                } catch (e) {
                    // Skip invalid lines
                }
            }
        }
        
        // Save index
        this.saveIndex(index);
        
        const duration = Date.now() - startTime;
        console.log(`✅ Cache index rebuilt: ${index.total_cycles} cycles in ${duration}ms`);
        
        return index;
    }
    
    /**
     * Get cycles for a specific day
     */
    getCyclesForDay(day: string): number[] {
        const index = this.loadIndex();
        return index.by_day[day] || [];
    }
    
    /**
     * Get cycles for a specific hour
     */
    getCyclesForHour(day: string, hour: number): number[] {
        const index = this.loadIndex();
        const hourKey = `${day}T${hour.toString().padStart(2, '0')}`;
        return index.by_hour[hourKey] || [];
    }
    
    /**
     * Get cycles for a specific file
     */
    getCyclesForFile(file: string): number[] {
        const index = this.loadIndex();
        return index.by_file[file] || [];
    }

    /**
     * Incrementally update the index with a new cycle.
     * @param cycleData Cycle summary object ({ cycleId, timestamp, phases, metadata, context })
     * @param files Top files for this cycle (optional)
     */
    async updateIncremental(cycleData: any, files: string[] = []): Promise<void> {
        const index = this.loadIndex();

        if (!cycleData || typeof cycleData.cycleId !== 'number' || !cycleData.timestamp) {
            // Guard: invalid cycle data, do nothing
            return;
        }

        const timestamp = cycleData.timestamp || cycleData._timestamp;
        const date = new Date(timestamp);
        const day = timestamp.substring(0, 10);
        const hour = date.getHours();
        const hourKey = `${day}T${hour.toString().padStart(2, '0')}`;

        // Construct entry
        const entry: IndexEntry = {
            cycleId: cycleData.cycleId,
            timestamp,
            day,
            hour,
            patterns_count: cycleData.phases?.patterns?.count || 0,
            forecasts_count: cycleData.phases?.forecasts?.count || 0,
            files: files.length > 0 ? Array.from(new Set(files)).slice(0, 3) : this.extractTopFiles(cycleData)
        };

        // Update collections
        index.entries.push(entry);
        index.total_cycles = index.entries.length;

        if (!index.by_day[day]) index.by_day[day] = [];
        index.by_day[day].push(entry.cycleId);

        if (!index.by_hour[hourKey]) index.by_hour[hourKey] = [];
        index.by_hour[hourKey].push(entry.cycleId);

        entry.files.forEach(file => {
            if (!index.by_file[file]) index.by_file[file] = [];
            index.by_file[file].push(entry.cycleId);
        });

        // Update date range
        if (!index.date_range.first || timestamp < index.date_range.first) {
            index.date_range.first = timestamp;
        }
        if (!index.date_range.last || timestamp > index.date_range.last) {
            index.date_range.last = timestamp;
        }

        this.saveIndex(index);
    }

    /**
     * Returns lightweight stats about the current index.
     */
    getStats(): CacheIndexStats | null {
        const index = this.loadIndex();
        if (!index || index.entries.length === 0) {
            return null;
        }
        return {
            total_cycles: index.total_cycles,
            first: index.date_range.first,
            last: index.date_range.last,
            version: index.version,
            generated_at: index.generated_at
        };
    }
    
    /**
     * Load index from disk
     */
    private loadIndex(): CacheIndex {
        if (!fs.existsSync(this.indexPath)) {
            return {
                version: '1.0.0',
                generated_at: new Date().toISOString(),
                total_cycles: 0,
                date_range: { first: '', last: '' },
                by_day: {},
                by_file: {},
                by_hour: {},
                entries: []
            };
        }
        
        try {
            const content = fs.readFileSync(this.indexPath, 'utf-8');
            return JSON.parse(content);
        } catch (e) {
            console.error('Failed to load cache index:', e);
            return {
                version: '1.0.0',
                generated_at: new Date().toISOString(),
                total_cycles: 0,
                date_range: { first: '', last: '' },
                by_day: {},
                by_file: {},
                by_hour: {},
                entries: []
            };
        }
    }
    
    /**
     * Save index to disk
     */
    private saveIndex(index: CacheIndex): void {
        const dir = path.dirname(this.indexPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(this.indexPath, JSON.stringify(index, null, 2));
    }
    
    /**
     * Extract top files from cycle
     */
    private extractTopFiles(cycle: any): string[] {
        const files: string[] = [];
        
        // Try to extract from various cycle structures
        if (cycle.metadata?.files) {
            files.push(...cycle.metadata.files.slice(0, 3));
        }
        if (cycle.files && Array.isArray(cycle.files)) {
            files.push(...cycle.files.slice(0, 3));
        }
        if (cycle.context?.activeFiles && Array.isArray(cycle.context.activeFiles)) {
            files.push(...cycle.context.activeFiles.slice(0, 3));
        }
        
        // Deduplicate and return
        return Array.from(new Set(files)).slice(0, 3);
    }
}
