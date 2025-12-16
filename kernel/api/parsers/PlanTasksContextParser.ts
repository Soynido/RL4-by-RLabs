/******************************************************************************************
 * PlanTasksContextParser (RL6)
 *
 * Purpose:
 * --------
 * Extracts structured planning-relevant slices from a CycleContextV1.
 *
 * This module performs ZERO reasoning.
 * It does NOT infer intent.
 * It does NOT generate tasks.
 *
 * It ONLY:
 *   - identifies coherent blocks of activity
 *   - groups file changes
 *   - extracts commit info
 *   - prepares LLM-ready slices for UnifiedPromptBuilder
 *
 * Inspiration: RL4 DUMP modules 8342, 8490, 9609 (governance parsing + activity structuring)
 *
 * Produced structure is used by:
 *   - UnifiedPromptBuilder
 *   - PromptOptimizer
 *
 ******************************************************************************************/

import { RL4Messages } from "../../legacy/rl4/RL4Messages";
type BaseMessage = RL4Messages.BaseMessage;
import { CycleContextV1 } from "../../core/CycleContextV1";

export interface PlanningSlice {
    id: string;
    start: string;
    end: string | null;

    filesTouched: Set<string>;
    gitCommits: {
        hash: string;
        message: string;
        timestamp: string;
    }[];

    messages: BaseMessage[];

    // For future LLM enrichment
    notes?: string;
    summary?: string;
}

export interface ParsedPlanningContext {
    cycleId: number;
    slices: PlanningSlice[];
}

export class PlanTasksContextParser {

    /******************************************************************************************
     * PUBLIC API
     ******************************************************************************************/
    parse(context: CycleContextV1): ParsedPlanningContext {
        const events = context.getEvents();

        const slices: PlanningSlice[] = [];
        let current = this.createEmptySlice();

        for (const evt of events) {
            this.ingestEventIntoSlice(current, evt);

            // Heuristic (STRUCTURAL, NOT COGNITIVE):
            // Whenever we encounter a "cycle boundary" or "burst boundary" event, we close the slice.
            if (this.isSliceBoundary(evt)) {
                current.end = evt.timestamp.toISOString();
                slices.push(current);
                current = this.createEmptySlice();
            }
        }

        // Close last slice if non-empty
        if (current.messages.length > 0) {
            current.end = current.messages[current.messages.length - 1].timestamp.toISOString();
            slices.push(current);
        }

        return {
            cycleId: context.getCycleId(),
            slices
        };
    }

    /******************************************************************************************
     * SLICE CREATION
     ******************************************************************************************/
    private createEmptySlice(): PlanningSlice {
        const now = new Date().toISOString();
        return {
            id: `slice_${now}_${Math.random().toString(36).slice(2)}`,
            start: now,
            end: null,
            filesTouched: new Set<string>(),
            gitCommits: [],
            messages: []
        };
    }

    /******************************************************************************************
     * EVENT INGEST
     ******************************************************************************************/
    private ingestEventIntoSlice(slice: PlanningSlice, evt: BaseMessage) {
        slice.messages.push(evt);

        switch (evt.type) {

            case RL4Messages.MessageType.FILE_EVENT:
                if (evt.payload?.filePath) {
                    slice.filesTouched.add(evt.payload.filePath);
                }
                break;

            case RL4Messages.MessageType.GIT_EVENT:
                slice.gitCommits.push({
                    hash: evt.payload?.commitHash ?? "unknown",
                    message: evt.payload?.message ?? "",
                    timestamp: evt.timestamp.toISOString()
                });
                break;

            default:
                // other messages are stored but not interpreted
                break;
        }
    }

    /******************************************************************************************
     * SLICE BOUNDARY DETECTION
     *
     * These are PURELY technical boundaries.
     * NO cognitive meaning is inferred.
     ******************************************************************************************/
    private isSliceBoundary(evt: BaseMessage): boolean {
        return (
            evt.type === RL4Messages.MessageType.CYCLE_START ||
            evt.type === RL4Messages.MessageType.CYCLE_END ||
            evt.type === RL4Messages.MessageType.BURST_EVENT ||
            evt.type === RL4Messages.MessageType.SESSION_START ||
            evt.type === RL4Messages.MessageType.SESSION_END
        );
    }
}