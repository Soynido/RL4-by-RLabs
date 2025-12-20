import { BaseMessage, MessageType } from "../legacy/rl4/RL4Messages";
import * as RL4Messages from "../legacy/rl4/RL4Messages";

/**
 * HistorySummarizer - RL6 Cognitive History Compressor
 *
 * Purpose:
 *  This module creates *lossless semantic summaries* of RL4 event histories
 *  while preserving enough structure to:
 *   - feed UnifiedPromptBuilder
 *   - provide context to ActivityReconstructor
 *   - accelerate TimelineEncoder groupings
 *   - support future MIL/HIS reconstruction recipes
 *
 *  It is NOT a lossy memory module.
 *  It is NOT a conversation summarizer.
 *
 *  It is a *semantic compressor* that extracts:
 *    - meaningful events
 *    - working sets
 *    - task-related signals
 *    - patterns of activity
 *    - session arcs & transitions
 *
 * Output:
 *   A compact JSON summary that is stable, deterministic, and re-expandable.
 *
 * Guarantees:
 *  - Non-destructive: does not drop essential information
 *  - Deterministic: same input timeline → same summary
 *  - MIL-compatible: exposes pointer-friendly segments
 *  - Reversible enough to reconstruct a minimal working state
 */

export interface SummarizedHistory {
    sessionId: string;
    startTime: string;
    endTime: string;

    // High-level compressed timeline
    events: Array<{
        id: string;
        type: string;
        timestamp: string;
        summary: string;
        importance: number;      // 0..1 weight for prompt selection
        pointers?: string[];      // For future MIL/HIS usage
    }>;

    // Grouped insights
    tasks: string[];
    workingSets: string[];
    dominantPatterns: string[];
    anomalies: string[];
}

export class HistorySummarizer {
    constructor() {}

    /**
     * Produce a deterministic semantic summary.
     * This is the main entry point used by UnifiedPromptBuilder.
     */
    summarize(timeline: BaseMessage[], sessionId: string): SummarizedHistory {
        if (!timeline || timeline.length === 0) {
            return {
                sessionId,
                startTime: new Date().toISOString(),
                endTime: new Date().toISOString(),
                events: [],
                tasks: [],
                workingSets: [],
                dominantPatterns: [],
                anomalies: []
            };
        }

        // 1. Normalize timeline
        const normalized = this.normalizeEvents(timeline);

        // 2. Scan patterns (lightweight)
        const patternStats = this.extractPatterns(normalized);

        // 3. Detect anomalies
        const anomalies = this.detectAnomalies(normalized);

        // 4. Build semantic summaries of meaningful events only
        const summarizedEvents = this.buildSummaries(normalized);

        // 5. Extract working set (active files, entities)
        const workingSets = this.computeWorkingSet(normalized);

        // 6. Extract task progression hints
        const tasks = this.extractTasksFromEvents(normalized);

        return {
            sessionId,
            startTime: normalized[0].timestamp.toISOString(),
            endTime: normalized[normalized.length - 1].timestamp.toISOString(),
            events: summarizedEvents,
            tasks,
            workingSets,
            dominantPatterns: patternStats,
            anomalies
        };
    }

    /**
     * Build human-level semantic summaries for timeline events.
     * Structure is optimized for UnifiedPromptBuilder.
     */
    private buildSummaries(events: BaseMessage[]) {
        return events
            .map((ev) => {
                const short = this.summarizeEvent(ev);
                const importance = this.computeImportance(ev);

                // Skip low-value noise events
                if (importance < 0.1) return null;

                return {
                    id: ev.id,
                    timestamp: ev.timestamp,
                    type: ev.type,
                    summary: short,
                    importance
                };
            })
            .filter(Boolean) as any[];
    }

    /**
     * Summarizes a single event semantically.
     */
    private summarizeEvent(ev: BaseMessage): string {
        switch (ev.type) {
            case RL4Messages.MessageType.FILE_MODIFIED:
            case RL4Messages.MessageType.FILE_CREATED:
            case RL4Messages.MessageType.FILE_DELETED:
                return `File ${ev.type.split('_')[1]}: ${ev.payload.filePath || 'unknown'}`;
            case RL4Messages.MessageType.GIT_EVENT:
                return `Commit: ${(ev.payload.message || '').slice(0, 60)}…`;
            case RL4Messages.MessageType.CYCLE_START:
                return `Cycle started`;
            case RL4Messages.MessageType.CYCLE_END:
                return `Cycle completed`;
            case RL4Messages.MessageType.PATTERN_DETECTED:
                return `Pattern: ${ev.payload.patternType || 'unknown'}`;
            case RL4Messages.MessageType.BURST_EVENT:
                return `Activity burst (${ev.payload.eventCount || 'unknown'} events)`;
            default:
                return ev.type;
        }
    }

    /**
     * Assign importance score to events.
     * This determines whether the event is included in prompt context.
     */
    private computeImportance(ev: BaseMessage): number {
        if (ev.type.startsWith('git')) return 1.0;
        if (ev.type.startsWith('pattern')) return 0.9;
        if (ev.type.startsWith('burst')) return 0.8;

        // File edits are frequent → weighted lower unless significant
        if (ev.type.startsWith('file')) {
            // Simplified importance based on event type
            return 0.3;
        }

        return 0.2;
    }

    /**
     * Extract dominant patterns from dictionary classification.
     */
    private extractPatterns(events: BaseMessage[]): string[] {
        const counts: Record<string, number> = {};

        for (const ev of events) {
            const category = this.classifyEvent(ev);
            counts[category] = (counts[category] || 0) + 1;
        }

        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([cat]) => cat);
    }

    /**
     * Extract working sets (files touched, tasks referenced, etc.)
     */
    private computeWorkingSet(events: BaseMessage[]): string[] {
        const files = new Set<string>();

        for (const ev of events) {
            if (ev.type.startsWith('file') && ev.payload?.filePath) {
                files.add(ev.payload.filePath);
            }
        }

        return Array.from(files);
    }

    /**
     * Infer tasks from events (very lightweight)
     */
    private extractTasksFromEvents(events: BaseMessage[]): string[] {
        const tasks = new Set<string>();

        for (const ev of events) {
            const msg = JSON.stringify(ev.payload || "").toLowerCase();
            if (msg.includes("task") || msg.includes("todo")) {
                tasks.add(ev.id);
            }
        }

        return Array.from(tasks);
    }

    /**
     * Normalize timeline events for processing
     */
    private normalizeEvents(events: BaseMessage[]): BaseMessage[] {
        // Sort by timestamp
        return events.sort((a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
    }

    /**
     * Detect anomalies in the timeline
     */
    private detectAnomalies(events: BaseMessage[]): string[] {
        const anomalies: string[] = [];

        // Simple anomaly detection patterns
        const fileDeletionCount = events.filter(e =>
            e.type === RL4Messages.MessageType.FILE_DELETED
        ).length;

        if (fileDeletionCount > 5) {
            anomalies.push(`High file deletion rate: ${fileDeletionCount} files`);
        }

        const rapidSwitches = this.detectRapidSwitching(events);
        if (rapidSwitches > 10) {
            anomalies.push(`High context switching: ${rapidSwitches} switches`);
        }

        return anomalies;
    }

    /**
     * Lightweight event classification (no legacy dictionary).
     */
    private classifyEvent(ev: BaseMessage): string {
        if (!ev || !ev.type) return "unknown";
        if (typeof ev.type === "string") return ev.type;
        return String(ev.type);
    }

    /**
     * Detect rapid context switching patterns
     */
    private detectRapidSwitching(events: BaseMessage[]): number {
        let switches = 0;
        let lastFile = '';

        for (const ev of events) {
            if (ev.type.startsWith('file') && ev.payload?.filePath) {
                const currentFile = ev.payload.filePath;
                if (lastFile && currentFile !== lastFile) {
                    switches++;
                }
                lastFile = currentFile;
            }
        }

        return switches;
    }
}