/**
 * EventNormalizer - Normalizes raw events from various sources into UnifiedEvent
 * 
 * ZERO-INTELLIGENCE: Structure uniquement, pas d'inférence.
 * Mapping basé sur structure, pas sur contenu sémantique.
 */

import { UnifiedEvent, EventSource, EventType, EventCategory } from './types';
import { GlobalClock } from '../GlobalClock';
import { v4 as uuidv4 } from 'uuid';

/**
 * Normalizes raw events into UnifiedEvent schema
 */
export class EventNormalizer {
    private clock: GlobalClock;
    
    constructor() {
        this.clock = GlobalClock.getInstance();
    }
    
    /**
     * Normalize raw event from any source into UnifiedEvent
     */
    normalize(rawEvent: any, source: EventSource): UnifiedEvent {
        const timestamp = this.parseTimestamp(rawEvent.timestamp || rawEvent.metadata?.timestamp || new Date().toISOString());
        const type = this.mapType(rawEvent, source);
        const category = this.mapCategory(rawEvent, source);
        const indexedFields = this.extractIndexedFields(rawEvent, source);
        
        return {
            id: rawEvent.id || uuidv4(),
            seq: this.clock.nextSeq(),
            timestamp: timestamp,
            type: type,
            source: source,
            category: category,
            source_format: rawEvent.type || 'unknown',
            payload: rawEvent,
            indexed_fields: indexedFields,
            metadata: rawEvent.metadata || {}
        };
    }
    
    /**
     * Map raw event type to normalized EventType
     * CORRIGER: Passer rawEvent, pas rawType
     */
    private mapType(rawEvent: any, source: EventSource): EventType {
        const rawType = rawEvent.type || '';
        
        if (source === EventSource.FILE_SYSTEM) {
            if (rawType === 'file_change') {
                // CORRIGER: Accéder à metadata depuis rawEvent
                const changes = rawEvent.metadata?.changes || [];
                if (changes.some((c: any) => c.type === 'create')) return EventType.FILE_CREATE;
                if (changes.some((c: any) => c.type === 'delete')) return EventType.FILE_DELETE;
                return EventType.FILE_MODIFY;
            }
        }
        
        if (source === EventSource.GIT) {
            if (rawType === 'git_commit') return EventType.GIT_COMMIT;
            if (rawType === 'git_branch') return EventType.GIT_BRANCH;
            if (rawType === 'git_merge') return EventType.GIT_MERGE;
        }
        
        if (source === EventSource.IDE) {
            if (rawType === 'ide_activity') {
                // CORRIGER: Accéder à metadata depuis rawEvent
                const snapshot = rawEvent.metadata;
                if (snapshot?.focused_file) return EventType.IDE_FOCUS;
                if (snapshot?.linter_errors?.total > 0) return EventType.IDE_LINTER;
                return EventType.IDE_EDIT;
            }
        }
        
        if (source === EventSource.CURSOR_CHAT) {
            if (rawType === 'chat_message' || rawType === 'message') return EventType.CHAT_MESSAGE;
            if (rawType === 'chat_query' || rawType === 'query') return EventType.CHAT_QUERY;
            if (rawType === 'chat_response' || rawType === 'response') return EventType.CHAT_RESPONSE;
        }
        
        return EventType.SYSTEM_ERROR;
    }
    
    /**
     * Map event to category
     */
    private mapCategory(rawEvent: any, source: EventSource): EventCategory {
        if (source === EventSource.FILE_SYSTEM || source === EventSource.GIT) {
            return EventCategory.CODE_CHANGE;
        }
        
        if (source === EventSource.CURSOR_CHAT || source === EventSource.IDE) {
            return EventCategory.COMMUNICATION;
        }
        
        return EventCategory.SYSTEM;
    }
    
    /**
     * Extract indexed fields for fast queries
     * LIMITES STRICTES: keywords 4-20 chars, max 5, stop words
     */
    private extractIndexedFields(rawEvent: any, source: EventSource): UnifiedEvent['indexed_fields'] {
        const fields: UnifiedEvent['indexed_fields'] = {};
        
        // Extract files
        if (source === EventSource.FILE_SYSTEM) {
            const changes = rawEvent.metadata?.changes || [];
            const files = (changes as any[]).map((c: any) => c.path).filter(Boolean) as string[];
            if (files.length > 0) {
                fields.files = [...new Set(files)];
            }
        }
        
        if (source === EventSource.GIT) {
            const commit = rawEvent.metadata?.commit;
            if (commit?.files_changed) {
                // Git commit may have file list in different formats
                const files = (commit.files || []) as string[];
                if (files.length > 0) {
                    fields.files = [...new Set(files)];
                }
            }
        }
        
        if (source === EventSource.IDE) {
            const snapshot = rawEvent.metadata;
            const files: string[] = [];
            if (snapshot?.focused_file) files.push(snapshot.focused_file);
            if (snapshot?.open_files) files.push(...snapshot.open_files);
            if (snapshot?.recently_viewed) files.push(...snapshot.recently_viewed);
            if (files.length > 0) {
                fields.files = [...new Set(files)];
            }
        }
        
        // Extract keywords from messages (LIMITES STRICTES)
        const message = rawEvent.metadata?.message || rawEvent.message || '';
        if (message && typeof message === 'string') {
            const stopWords = new Set([
                'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her',
                'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how',
                'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy',
                'did', 'let', 'put', 'say', 'she', 'too', 'use', 'this', 'that', 'with'
            ]);
            
            const words = message
                .toLowerCase()
                .split(/\W+/)
                .filter(w => w.length >= 4 && w.length <= 20)  // 4-20 chars
                .filter(w => !stopWords.has(w))
                .slice(0, 5);  // Max 5 keywords
            
            if (words.length > 0) {
                fields.keywords = words;
            }
        }
        
        // Extract modules/directories from file paths
        if (fields.files) {
            const modules = new Set<string>();
            const directories = new Set<string>();
            
            fields.files.forEach((filePath: string) => {
                // Extract directory
                const dir = filePath.substring(0, filePath.lastIndexOf('/'));
                if (dir) {
                    directories.add(dir);
                }
                
                // Extract module name (heuristic: node_modules, package name, etc.)
                const nodeModulesMatch = filePath.match(/node_modules\/([^/]+)/);
                if (nodeModulesMatch) {
                    modules.add(nodeModulesMatch[1]);
                }
            });
            
            if (modules.size > 0) {
                fields.modules = Array.from(modules);
            }
            if (directories.size > 0) {
                fields.directories = Array.from(directories);
            }
        }
        
        return Object.keys(fields).length > 0 ? fields : undefined;
    }
    
    /**
     * Parse timestamp to number (ms)
     */
    private parseTimestamp(timestamp: string | number | Date): number {
        if (typeof timestamp === 'number') {
            return timestamp;
        }
        
        if (timestamp instanceof Date) {
            return timestamp.getTime();
        }
        
        const parsed = new Date(timestamp);
        if (isNaN(parsed.getTime())) {
            return Date.now();
        }
        
        return parsed.getTime();
    }
}

