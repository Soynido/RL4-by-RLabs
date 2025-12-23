/******************************************************************************************
 * CycleContextV1 (RL6 Modernized Version)
 *
 * Purpose:
 * --------
 * A clean, strongly-typed, compact representation of a cognitive cycle.
 *
 * This module contains ZERO intelligence.
 * It only aggregates structured data produced by:
 *   - RL4Messages
 *   - ProjectAnalyzer
 *   - FileChangeWatcher
 *   - GitCommitListener
 *   - KernelAPI
 *
 * UnifiedPromptBuilder consumes this structure directly and enriches it via LLM.
 *
 * Invariants:
 *  - All timestamps ISO-8601
 *  - Events strictly typed (RL4Messages)
 *  - No inference, no scoring, no heuristics inside this module
 ******************************************************************************************/

import { RL4Messages } from "../legacy/rl4/RL4Messages";

type BaseMessage = RL4Messages.BaseMessage;

// Forward declarations for type compatibility
export interface ProjectAnalysisResult {
    workspaceRoot: string;
    metadata: any;
    quality: any;
    changes: any;
    risks: any;
    recommendations: any[];
    summary: {
        overallScore: number;
        strengths: string[];
        weaknesses: string[];
        priority: 'low' | 'medium' | 'high';
    };
    analysisTimestamp: Date;
}

export interface ModeState {
    currentMode: string;
    confidence: number;
    lastChanged: Date;
    history: Array<{
        mode: string;
        timestamp: Date;
        reason?: string;
    }>;
}

export interface CycleMetrics {
    fileChanges: number;
    gitCommits: number;
    events: number;
    durationMs: number | null;
}

export interface CycleSummary {
    description: string | null; // High-level summary (LLM-generated, not kernel-generated)
    patterns: string[];         // RL4Dictionary categories used later
    warnings: string[];         // Structural red flags but NOT analysis
}

export interface CycleContextV1JSON {
    cycleId: number;
    timestamps: { start: string; end?: string };
    events: BaseMessage[];
    project: ProjectAnalysisResult | null;
    modes: ModeState | null;
    metrics: CycleMetrics;
    summary: CycleSummary | null;
}

export class CycleContextV1 {
    private cycleId: number;
    private timestamps = {
        start: new Date().toISOString(),
        end: undefined as string | undefined,
    };

    private events: BaseMessage[] = [];
    private project: ProjectAnalysisResult | null = null;
    private modes: ModeState | null = null;

    private metrics: CycleMetrics = {
        fileChanges: 0,
        gitCommits: 0,
        events: 0,
        durationMs: null,
    };

    private summary: CycleSummary | null = null;

    constructor(cycleId: number) {
        this.cycleId = cycleId;
    }

    /******************************************************************************************
     * EVENT INGESTION
     ******************************************************************************************/
    addEvent(evt: BaseMessage) {
        this.events.push(evt);
        this.metrics.events++;

        if (evt.type === RL4Messages.MessageType.FILE_EVENT) this.metrics.fileChanges++;
        if (evt.type === RL4Messages.MessageType.GIT_EVENT) this.metrics.gitCommits++;
    }

    /******************************************************************************************
     * PROJECT / MODES SNAPSHOTS
     ******************************************************************************************/
    setProjectSnapshot(snapshot: ProjectAnalysisResult) {
        this.project = snapshot;
    }

    setModesState(state: ModeState) {
        this.modes = state;
    }

    /******************************************************************************************
     * CYCLE FINALIZATION
     ******************************************************************************************/
    endCycle() {
        this.timestamps.end = new Date().toISOString();
        const start = new Date(this.timestamps.start).getTime();
        const end = new Date(this.timestamps.end).getTime();
        this.metrics.durationMs = end - start;
    }

    /******************************************************************************************
     * SUMMARY (LLM INTEGRATION POINT)
     ******************************************************************************************/
    setSummary(summary: CycleSummary) {
        // Kernel NEVER generates this.
        // Only UnifiedPromptBuilder + LLM produce summaries.
        this.summary = summary;
    }

    /******************************************************************************************
     * SERIALIZATION
     ******************************************************************************************/
    toJSON(): CycleContextV1JSON {
        return {
            cycleId: this.cycleId,
            timestamps: this.timestamps,
            events: this.events,
            project: this.project,
            modes: this.modes,
            metrics: this.metrics,
            summary: this.summary,
        };
    }

    /******************************************************************************************
     * UTILITIES
     ******************************************************************************************/
    getCycleId(): number {
        return this.cycleId;
    }

    getEvents(): BaseMessage[] {
        return [...this.events];
    }

    getMetrics(): CycleMetrics {
        return { ...this.metrics };
    }

    hasEnded(): boolean {
        return !!this.timestamps.end;
    }

    getDuration(): number | null {
        return this.metrics.durationMs;
    }
}