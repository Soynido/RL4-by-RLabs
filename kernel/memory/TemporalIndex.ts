/**
 * TemporalIndex - Index temporel avec tri explicite
 * 
 * CORRIGER: Array trié au lieu de Map (ordre garanti)
 * Flush périodique pour éviter IO killer
 */

import * as fs from 'fs';
import * as path from 'path';
import { UnifiedEvent, EventFilter } from './types';

export class TemporalIndex {
    private index: Array<[number, string]> = []; // [timestamp, event_id]
    private indexPath: string;
    private flushTimer: NodeJS.Timeout | null = null;
    private dirty: boolean = false;
    
    constructor(workspaceRoot: string) {
        const memoryDir = path.join(workspaceRoot, '.reasoning_rl4', 'memory', 'indices');
        if (!fs.existsSync(memoryDir)) {
            fs.mkdirSync(memoryDir, { recursive: true });
        }
        this.indexPath = path.join(memoryDir, 'temporal.json');
        this.load();
        this.startFlushTimer();
    }
    
    /**
     * Insérer événement dans index
     */
    insert(event: UnifiedEvent): void {
        this.index.push([event.timestamp, event.id]);
        this.dirty = true;
        // Pas de save() immédiat, flush périodique
    }
    
    /**
     * Requête par range temporel
     */
    rangeQuery(start: number, end: number, filters?: EventFilter): string[] {
        // CORRIGER: Trier avant requête (garantit ordre)
        this.ensureSorted();
        
        const eventIds: string[] = [];
        
        // Binary search pour start
        let startIdx = this.binarySearchStart(start);
        
        // Parcourir jusqu'à end
        for (let i = startIdx; i < this.index.length; i++) {
            const [timestamp, eventId] = this.index[i];
            if (timestamp > end) break; // CORRIGER: Break valide car trié
            if (timestamp >= start) {
                eventIds.push(eventId);
            }
        }
        
        return eventIds;
    }
    
    /**
     * CORRIGER: Trier index si nécessaire
     */
    private ensureSorted(): void {
        if (this.dirty) {
            this.index.sort((a, b) => a[0] - b[0]); // Trier par timestamp
            this.dirty = false;
        }
    }
    
    /**
     * Binary search pour trouver start index
     */
    private binarySearchStart(target: number): number {
        let left = 0;
        let right = this.index.length;
        
        while (left < right) {
            const mid = Math.floor((left + right) / 2);
            if (this.index[mid][0] < target) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }
        
        return left;
    }
    
    /**
     * CORRIGER: Flush périodique (pattern AppendOnlyWriter)
     */
    private startFlushTimer(): void {
        this.flushTimer = setInterval(() => {
            if (this.dirty) {
                this.save();
            }
        }, 5000); // 5 secondes
    }
    
    /**
     * Flush manuel (appelé sur snapshot/shutdown)
     */
    async flush(): Promise<void> {
        if (this.dirty) {
            this.ensureSorted();
            this.save();
        }
    }
    
    private load(): void {
        if (!fs.existsSync(this.indexPath)) {
            return;
        }
        
        try {
            const data = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
            this.index = Array.isArray(data) ? data : [];
            this.ensureSorted(); // Trier au chargement
        } catch (e) {
            // Ignore corruption, start fresh
            this.index = [];
        }
    }
    
    private save(): void {
        const dir = path.dirname(this.indexPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        this.ensureSorted(); // Trier avant sauvegarde
        fs.writeFileSync(this.indexPath, JSON.stringify(this.index));
        this.dirty = false;
    }
    
    async close(): Promise<void> {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        await this.flush();
    }
}

