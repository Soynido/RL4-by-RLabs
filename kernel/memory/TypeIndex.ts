/**
 * TypeIndex - Index par type d'événement
 * 
 * Flush périodique pour éviter IO killer
 */

import * as fs from 'fs';
import * as path from 'path';
import { UnifiedEvent, EventType } from './types';

export class TypeIndex {
    private index: Map<EventType, Set<string>> = new Map(); // type → Set<event_id>
    private indexPath: string;
    private flushTimer: NodeJS.Timeout | null = null;
    private dirty: boolean = false;
    
    constructor(workspaceRoot: string) {
        const memoryDir = path.join(workspaceRoot, '.reasoning_rl4', 'memory', 'indices');
        if (!fs.existsSync(memoryDir)) {
            fs.mkdirSync(memoryDir, { recursive: true });
        }
        this.indexPath = path.join(memoryDir, 'type_index.json');
        this.load();
        this.startFlushTimer();
    }
    
    /**
     * Insérer événement dans index
     */
    insert(event: UnifiedEvent): void {
        if (!this.index.has(event.type)) {
            this.index.set(event.type, new Set());
        }
        this.index.get(event.type)!.add(event.id);
        
        this.dirty = true;
    }
    
    /**
     * Récupérer événements par type
     */
    getByType(type: EventType): string[] {
        const eventIds = this.index.get(type);
        return eventIds ? Array.from(eventIds) : [];
    }
    
    /**
     * Flush périodique
     */
    private startFlushTimer(): void {
        this.flushTimer = setInterval(() => {
            if (this.dirty) {
                this.save();
            }
        }, 5000); // 5 secondes
    }
    
    /**
     * Flush manuel
     */
    async flush(): Promise<void> {
        if (this.dirty) {
            this.save();
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
                for (const [type, eventIds] of Object.entries(data)) {
                    this.index.set(type as EventType, new Set(eventIds as string[]));
                }
            }
        } catch (e) {
            // Ignore corruption, start fresh
            this.index = new Map();
        }
    }
    
    private save(): void {
        const dir = path.dirname(this.indexPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // Convertir Map en objet pour JSON
        const data: Record<string, string[]> = {};
        for (const [type, eventIds] of this.index.entries()) {
            data[type] = Array.from(eventIds);
        }
        
        fs.writeFileSync(this.indexPath, JSON.stringify(data));
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

