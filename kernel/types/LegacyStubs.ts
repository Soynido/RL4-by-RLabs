/**
 * Legacy Stubs - Temporary compatibility stubs for legacy components
 *
 * These stubs provide minimal implementations to satisfy compilation
 * requirements for legacy components not yet migrated.
 */

// Logger stubs
declare module '../core/ILogger' {
    export interface ILogger {
        system(msg: string): void;
        error(msg: string): void;
        warning(msg: string): void;
        debug(msg: string): void;
        // Stub missing methods
        info?(msg: string): void;
    }
}

// Prompt validation stubs
export interface PromptValidationResult {
    isValid: boolean;
    errors: string[];
    // Stub missing properties
    valid?: boolean;
    issues?: string[];
    warnings?: string[];
}

// Snapshot stubs
export interface SnapshotDataSummary {
    totalFiles: number;
    totalLines: number;
    languages: string[];
}

// Cycle context extensions
declare module '../core/CycleContextV1' {
    export interface CycleContextV1 {
        // Stub missing properties
        deviation_mode?: string;
    }
}

// Task summary stubs
export interface TaskSummary {
    total: number;
    completed: number;
    pending: number;
}

// Planning slice stubs
export interface PlanningSlice {
    id: string;
    start: Date;
    end: Date;
    // Stub missing properties
    summary?: string;
    tasks?: TaskSummary;
}

// Timeline encoder stubs
export class TimelineEncoder {
    constructor() {}
    encode(events: any[]): any[] { return []; }
    decode(data: any): any[] { return []; }
}

// Legacy types that might be missing
export type BaseMessage = {
    id: string;
    timestamp: Date;
    type: string;
    source: string;
    payload?: any;
};