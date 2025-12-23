/**
 * SpatialIndex - Index spatial (fichiers → event_ids)
 * 
 * Flush périodique pour éviter IO killer
 */

import * as fs from 'fs';
import * as path from 'path';
import { UnifiedEvent } from './types';

export class SpatialIndex {
    private index: Map<string, Set<string>> = new Map(); // filePath → Set<event_id>
    private indexPath: string;
    private flushTimer: NodeJS.Timeout | null = null;
    private dirty: boolean = false;
    private flushInProgress: boolean = false;  // NEW: Prevent concurrent flushes
    
    constructor(workspaceRoot: string) {
        const memoryDir = path.join(workspaceRoot, '.reasoning_rl4', 'memory', 'indices');
        if (!fs.existsSync(memoryDir)) {
            fs.mkdirSync(memoryDir, { recursive: true });
        }
        this.indexPath = path.join(memoryDir, 'spatial.json');
        this.load();
        this.startFlushTimer();
    }
    
    /**
     * Insérer événement dans index
     */
    insert(event: UnifiedEvent): void {
        const files = event.indexed_fields?.files || [];
        
        for (const filePath of files) {
            if (!this.index.has(filePath)) {
                this.index.set(filePath, new Set());
            }
            this.index.get(filePath)!.add(event.id);
        }
        
        this.dirty = true;
    }
    
    /**
     * Récupérer événements par fichier
     */
    getByFile(filePath: string): string[] {
        const eventIds = this.index.get(filePath);
        return eventIds ? Array.from(eventIds) : [];
    }
    
    /**
     * Flush périodique
     * NEW: Asynchronous
     */
    private startFlushTimer(): void {
        this.flushTimer = setInterval(async () => {
            if (this.dirty && !this.flushInProgress) {
                await this.save();
            }
        }, 5000); // 5 secondes
    }
    
    /**
     * Flush manuel
     * NEW: Asynchronous
     */
    async flush(): Promise<void> {
        if (this.dirty && !this.flushInProgress) {
            await this.save();
        }
    }
    
    private load(): void {
        if (!fs.existsSync(this.indexPath)) {
            return;
        }
        
        try {
            const data = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
            if (typeof data === 'object' && data !== null) {
                // Convertir objet en Map
                for (const [filePath, eventIds] of Object.entries(data)) {
                    this.index.set(filePath, new Set(eventIds as string[]));
                }
            }
        } catch (e) {
            // Ignore corruption, start fresh
            this.index = new Map();
        }
    }
    
    /**
     * NEW: Asynchronous save
     */
    private async save(): Promise<void> {
        if (this.flushInProgress) return;
        
        this.flushInProgress = true;
        
        try {
            const dir = path.dirname(this.indexPath);
            if (!fs.existsSync(dir)) {
                await fs.promises.mkdir(dir, { recursive: true });
            }
            
            // Convertir Map en objet pour JSON
            const data: Record<string, string[]> = {};
            for (const [filePath, eventIds] of this.index.entries()) {
                data[filePath] = Array.from(eventIds);
            }
            
            await fs.promises.writeFile(this.indexPath, JSON.stringify(data), 'utf-8');
            this.dirty = false;
        } catch (error) {
            console.error(`[SpatialIndex] Failed to save: ${error}`);
        } finally {
            this.flushInProgress = false;
        }
    }
    
    async close(): Promise<void> {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        await this.flush();
    }
}

