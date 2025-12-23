/**
 * MIL (Memory Index Layer) - Types
 * 
 * Unified event schema for all RL4 event sources.
 * ZERO-INTELLIGENCE: Structure uniquement, pas d'inférence.
 */

/**
 * Source of the event (which listener captured it)
 */
export enum EventSource {
    FILE_SYSTEM = 'file_system',
    GIT = 'git',
    IDE = 'ide',
    CURSOR_CHAT = 'cursor_chat',
    SYSTEM = 'system'
}

/**
 * Normalized event type (independent of source)
 */
export enum EventType {
    // File system events
    FILE_CREATE = 'file_create',
    FILE_MODIFY = 'file_modify',
    FILE_DELETE = 'file_delete',
    FILE_RENAME = 'file_rename',
    
    // Git events
    GIT_COMMIT = 'git_commit',
    GIT_BRANCH = 'git_branch',
    GIT_MERGE = 'git_merge',
    
    // IDE events
    IDE_EDIT = 'ide_edit',
    IDE_FOCUS = 'ide_focus',
    IDE_LINTER = 'ide_linter',
    IDE_SAVE = 'ide_save',
    
    // Communication events
    CHAT_MESSAGE = 'chat_message',
    CHAT_QUERY = 'chat_query',
    CHAT_RESPONSE = 'chat_response',
    
    // System events
    SYSTEM_START = 'system_start',
    SYSTEM_STOP = 'system_stop',
    SYSTEM_ERROR = 'system_error',
    MEMORY_RETENTION = 'memory_retention'  // NEW: Memory retention events
}

/**
 * Event category (high-level grouping)
 * NOTE: DECISION removed - never produced structurally
 */
export enum EventCategory {
    CODE_CHANGE = 'code_change',
    COMMUNICATION = 'communication',
    SYSTEM = 'system',
    METADATA = 'metadata'
}

/**
 * Unified event schema - normalized representation of all events
 */
export interface UnifiedEvent {
    // Identity
    id: string;                    // UUID v4
    seq: number;                   // Monotonic sequence (from GlobalClock or derived)
    timestamp: number;             // Unix timestamp (ms)
    
    // Classification
    type: EventType;
    source: EventSource;
    category: EventCategory;
    
    // Original data (preserved for debugging/audit)
    source_format: string;         // Original event type from source
    payload: any;                  // Original event data (normalized but preserved)
    
    // Indexed fields (for fast queries)
    indexed_fields?: {
        files?: string[];          // File paths affected
        keywords?: string[];        // Extracted keywords (4-20 chars, max 5, stop words filtered)
        modules?: string[];        // Module/package names
        directories?: string[];     // Directory paths
    };
    
    // Metadata
    metadata?: {
        [key: string]: any;        // Source-specific metadata
    };
}

/**
 * Context for LLM prompt generation
 */
export interface LLMContext {
    // Temporal window
    window: {
        start: number;
        end: number;
        duration_ms: number;
    };
    
    // Events in window
    events: UnifiedEvent[];
    
    // Spatial context (if available)
    spatial_context?: {
        files: string[];
        modules: string[];
        directories: string[];
    };
    
    // Previous intelligence (if available - MVP: empty)
    previous_intelligence?: any;
    
    // Suggested queries for LLM
    suggested_queries?: string[];
}

/**
 * Event filter for queries
 */
export interface EventFilter {
    type?: EventType;
    category?: EventCategory;
    source?: EventSource;
    files?: string[];
}

