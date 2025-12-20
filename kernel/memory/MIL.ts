/**
 * MIL (Memory Index Layer) - Classe principale
 * 
 * L'hippocampe de RL4 : normalise, indexe et consolide tous les événements.
 * ZERO-INTELLIGENCE : Structure uniquement, pas d'inférence.
 */

import * as fs from 'fs';
import * as path from 'path';
import { UnifiedEvent, EventSource, EventType, EventFilter, LLMContext } from './types';
import { EventNormalizer } from './EventNormalizer';
import { TemporalIndex } from './TemporalIndex';
import { SpatialIndex } from './SpatialIndex';
import { TypeIndex } from './TypeIndex';
import { AppendOnlyWriter } from '../AppendOnlyWriter';
import { GlobalClock } from '../GlobalClock';

export class MIL {
    private workspaceRoot: string;
    private normalizer: EventNormalizer;
    private temporalIndex: TemporalIndex;
    private spatialIndex: SpatialIndex;
    private typeIndex: TypeIndex;
    private eventsWriter: AppendOnlyWriter;
    private eventsPath: string;
    private seqStatePath: string;
    private clock: GlobalClock;
    private eventCache: Map<string, UnifiedEvent> = new Map(); // Cache en mémoire pour accès rapide
    
    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.normalizer = new EventNormalizer();
        this.clock = GlobalClock.getInstance();
        
        const memoryDir = path.join(workspaceRoot, '.reasoning_rl4', 'memory');
        if (!fs.existsSync(memoryDir)) {
            fs.mkdirSync(memoryDir, { recursive: true });
        }
        
        this.eventsPath = path.join(memoryDir, 'events.jsonl');
        this.eventsWriter = new AppendOnlyWriter(this.eventsPath, { fsync: false, mkdirRecursive: true });
        
        this.temporalIndex = new TemporalIndex(workspaceRoot);
        this.spatialIndex = new SpatialIndex(workspaceRoot);
        this.typeIndex = new TypeIndex(workspaceRoot);
        
        this.seqStatePath = path.join(memoryDir, 'seq_state.json');
    }
    
    /**
     * Initialiser MIL (créer dossiers, charger indices, restaurer seq)
     */
    async init(): Promise<void> {
        await this.eventsWriter.init();
        this.initializeSeq();
    }
    
    /**
     * CORRIGER: Initialiser seq depuis persistance ou dériver depuis events.jsonl
     */
    private initializeSeq(): void {
        // Option 1: Dériver depuis events.jsonl (plus fiable)
        const lastSeq = this.getLastSeqFromEvents();
        if (lastSeq > 0) {
            this.clock.reset(lastSeq);
            return;
        }
        
        // Option 2: Restaurer depuis seq_state.json
        if (fs.existsSync(this.seqStatePath)) {
            try {
                const state = JSON.parse(fs.readFileSync(this.seqStatePath, 'utf-8'));
                if (state.lastSeq && typeof state.lastSeq === 'number') {
                    this.clock.reset(state.lastSeq);
                }
            } catch (e) {
                // Ignore corruption
            }
        }
        
        // Persister seq périodiquement
        setInterval(() => {
            this.persistSeq();
        }, 10000); // 10 secondes
    }
    
    /**
     * Dériver seq depuis ordre d'append dans events.jsonl
     */
    private getLastSeqFromEvents(): number {
        if (!fs.existsSync(this.eventsPath)) {
            return 0;
        }
        
        try {
            const content = fs.readFileSync(this.eventsPath, 'utf-8');
            const lines = content.trim().split('\n').filter(Boolean);
            if (lines.length === 0) {
                return 0;
            }
            
            // Lire dernière ligne
            const lastLine = lines[lines.length - 1];
            const lastEvent = JSON.parse(lastLine);
            return (lastEvent.seq || 0) + 1;
        } catch (e) {
            return 0;
        }
    }
    
    /**
     * CORRIGER: Persister seq
     */
    private persistSeq(): void {
        const dir = path.dirname(this.seqStatePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        try {
            fs.writeFileSync(this.seqStatePath, JSON.stringify({
                lastSeq: this.clock.current(),
                timestamp: Date.now(),
            }));
        } catch (e) {
            // Ignore write errors
        }
    }
    
    /**
     * Ingérer un événement brut dans MIL
     */
    async ingest(rawEvent: any, source: EventSource): Promise<UnifiedEvent> {
        // Normaliser
        const normalized = this.normalizer.normalize(rawEvent, source);
        
        // Indexer
        this.temporalIndex.insert(normalized);
        this.spatialIndex.insert(normalized);
        this.typeIndex.insert(normalized);
        
        // Persister
        await this.eventsWriter.append(normalized);
        
        // Cache en mémoire
        this.eventCache.set(normalized.id, normalized);
        
        return normalized;
    }
    
    /**
     * Construire contexte pour LLM (MVP : seulement pour UnifiedPromptBuilder)
     */
    async buildContextForLLM(anchorEventId?: string, windowMs: number = 3600000): Promise<LLMContext> {
        const now = Date.now();
        const start = anchorEventId ? this.getEventTimestamp(anchorEventId) - windowMs / 2 : now - windowMs;
        const end = anchorEventId ? this.getEventTimestamp(anchorEventId) + windowMs / 2 : now;
        
        // Récupérer événements dans fenêtre temporelle
        const eventIds = this.temporalIndex.rangeQuery(start, end);
        const events = await this.loadEvents(eventIds);
        
        // Extraire contexte spatial
        const spatialContext = this.extractSpatialContext(events);
        
        // MVP: previous_intelligence vide (Phase future)
        const previousIntelligence = undefined;
        
        // Générer questions suggérées
        const suggestedQueries = this.generateSuggestedQueries(events);
        
        return {
            window: {
                start: start,
                end: end,
                duration_ms: end - start
            },
            events: events,
            spatial_context: spatialContext,
            previous_intelligence: previousIntelligence,
            suggested_queries: suggestedQueries
        };
    }
    
    /**
     * Requête temporelle
     */
    async queryTemporal(start: number, end: number, filters?: EventFilter): Promise<UnifiedEvent[]> {
        const eventIds = this.temporalIndex.rangeQuery(start, end);
        let events = await this.loadEvents(eventIds);
        
        // Appliquer filtres
        if (filters) {
            events = events.filter(event => {
                if (filters.type && event.type !== filters.type) return false;
                if (filters.category && event.category !== filters.category) return false;
                if (filters.source && event.source !== filters.source) return false;
                if (filters.files && filters.files.length > 0) {
                    const eventFiles = event.indexed_fields?.files || [];
                    if (!filters.files.some(f => eventFiles.includes(f))) return false;
                }
                return true;
            });
        }
        
        return events;
    }
    
    /**
     * Requête par fichier
     */
    async queryByFile(filePath: string): Promise<UnifiedEvent[]> {
        const eventIds = this.spatialIndex.getByFile(filePath);
        return this.loadEvents(eventIds);
    }
    
    /**
     * Requête par type
     */
    async queryByType(type: EventType): Promise<UnifiedEvent[]> {
        const eventIds = this.typeIndex.getByType(type);
        return this.loadEvents(eventIds);
    }
    
    /**
     * Charger événements depuis cache ou fichier
     */
    private async loadEvents(eventIds: string[]): Promise<UnifiedEvent[]> {
        const events: UnifiedEvent[] = [];
        const missingIds: string[] = [];
        
        // Charger depuis cache
        for (const id of eventIds) {
            const cached = this.eventCache.get(id);
            if (cached) {
                events.push(cached);
            } else {
                missingIds.push(id);
            }
        }
        
        // Charger manquants depuis fichier
        if (missingIds.length > 0 && fs.existsSync(this.eventsPath)) {
            try {
                const content = fs.readFileSync(this.eventsPath, 'utf-8');
                const lines = content.trim().split('\n').filter(Boolean);
                
                for (const line of lines) {
                    const event = JSON.parse(line) as UnifiedEvent;
                    if (missingIds.includes(event.id)) {
                        events.push(event);
                        this.eventCache.set(event.id, event);
                    }
                }
            } catch (e) {
                // Ignore parse errors
            }
        }
        
        // Trier par timestamp
        events.sort((a, b) => a.timestamp - b.timestamp);
        
        return events;
    }
    
    /**
     * Extraire contexte spatial depuis événements
     */
    private extractSpatialContext(events: UnifiedEvent[]): LLMContext['spatial_context'] {
        const files = new Set<string>();
        const modules = new Set<string>();
        const directories = new Set<string>();
        
        for (const event of events) {
            if (event.indexed_fields?.files) {
                event.indexed_fields.files.forEach(f => files.add(f));
            }
            if (event.indexed_fields?.modules) {
                event.indexed_fields.modules.forEach(m => modules.add(m));
            }
            if (event.indexed_fields?.directories) {
                event.indexed_fields.directories.forEach(d => directories.add(d));
            }
        }
        
        return {
            files: Array.from(files),
            modules: Array.from(modules),
            directories: Array.from(directories)
        };
    }
    
    /**
     * Générer questions suggérées pour LLM
     */
    private generateSuggestedQueries(events: UnifiedEvent[]): string[] {
        const queries: string[] = [];
        
        if (events.length === 0) {
            return queries;
        }
        
        // Détecter patterns basiques
        const hasCommits = events.some(e => e.type === EventType.GIT_COMMIT);
        const hasFileChanges = events.some(e => e.type.startsWith('file_'));
        const hasChat = events.some(e => e.source === EventSource.CURSOR_CHAT);
        
        if (hasCommits) {
            queries.push('What architectural decisions were made in this period?');
        }
        
        if (hasFileChanges && hasCommits) {
            queries.push('What causal relationships exist between file changes and commits?');
        }
        
        if (hasChat) {
            queries.push('What development patterns emerge from the chat history?');
        }
        
        queries.push('Generate concise summary of this development episode');
        
        return queries;
    }
    
    /**
     * Obtenir timestamp d'un événement
     */
    private getEventTimestamp(eventId: string): number {
        const cached = this.eventCache.get(eventId);
        if (cached) {
            return cached.timestamp;
        }
        
        // Charger depuis fichier si nécessaire
        if (fs.existsSync(this.eventsPath)) {
            try {
                const content = fs.readFileSync(this.eventsPath, 'utf-8');
                const lines = content.trim().split('\n').filter(Boolean);
                
                for (const line of lines) {
                    const event = JSON.parse(line) as UnifiedEvent;
                    if (event.id === eventId) {
                        this.eventCache.set(eventId, event);
                        return event.timestamp;
                    }
                }
            } catch (e) {
                // Ignore
            }
        }
        
        return Date.now();
    }
    
    /**
     * Fermer MIL (flush tous les indices)
     */
    async close(): Promise<void> {
        this.persistSeq();
        await this.temporalIndex.close();
        await this.spatialIndex.close();
        await this.typeIndex.close();
        await this.eventsWriter.flush();
        await this.eventsWriter.close();
    }
}

