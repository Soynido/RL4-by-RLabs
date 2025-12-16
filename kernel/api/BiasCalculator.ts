import { BaseMessage } from "../legacy/rl4/RL4Messages";
import { RL4Dictionary } from "../legacy/rl4/RL4Dictionary";

export interface CodeStateSnapshot {
    files: Array<{
        name: string;
        path: string;
        lastModified: string;
        size: number;
    }>;
}

export interface SummarizedHistory {
    sessionId: string;
    startTime: string;
    endTime: string;
    events: Array<{
        id: string;
        type: string;
        timestamp: string;
        summary: string;
        importance: number;
    }>;
    tasks: string[];
    workingSets: string[];
    dominantPatterns: string[];
    anomalies: string[];
}

export interface BiasReport {
    biasScore: number;                // 0..1 drift score
    planAlignment: number;            // 0..1
    timelineAlignment: number;        // 0..1
    patternAlignment: number;         // 0..1
    codeAlignment: number;            // 0..1
    signals: string[];                // human-readable signals for prompt
}

/**
 * BiasCalculator - RL6 Cognitive Drift Estimator
 *
 * Purpose:
 *   Quantifies how much the current LLM intent diverges from:
 *     - the plan (Plan.RL4)
 *     - the recent history (SummarizedHistory)
 *     - dominant patterns (dictionary)
 *     - current code state (CodeStateAnalyzer)
 *
 * This is NOT an ML module.
 * All scores are deterministic, rule-based, explainable.
 *
 * Output is used by UnifiedPromptBuilder to:
 *   - strengthen missing context
 *   - correct LLM drift
 *   - trigger recovery modes
 *   - provide feedback in prompts
 */
export class BiasCalculator {

    /**
     * Main entry point.
     */
    computeBias(
        intent: string,
        history: SummarizedHistory,
        code: CodeStateSnapshot,
        planKeywords: string[]
    ): BiasReport {

        const planAlignment = this.computePlanAlignment(intent, planKeywords);
        const timelineAlignment = this.computeTimelineAlignment(intent, history);
        const patternAlignment = this.computePatternAlignment(intent, history);
        const codeAlignment = this.computeCodeAlignment(intent, code);

        // Weighted average
        const biasScore = 1 - (
            0.35 * planAlignment +
            0.25 * timelineAlignment +
            0.25 * patternAlignment +
            0.15 * codeAlignment
        );

        const signals = this.collectSignals(
            planAlignment,
            timelineAlignment,
            patternAlignment,
            codeAlignment
        );

        return {
            biasScore,
            planAlignment,
            timelineAlignment,
            patternAlignment,
            codeAlignment,
            signals
        };
    }

    /****************************************************************************************
     * 1 — PLAN ALIGNMENT
     * Match between intent & plan keywords.
     ****************************************************************************************/
    private computePlanAlignment(intent: string, keywords: string[]): number {
        if (!keywords || keywords.length === 0) return 0.5;

        const text = intent.toLowerCase();
        const hits = keywords.filter(k => text.includes(k.toLowerCase()));

        const score = hits.length / keywords.length;
        return Math.min(1, Math.max(0, score));
    }

    /****************************************************************************************
     * 2 — TIMELINE ALIGNMENT
     * Match between intent & meaningful past events.
     ****************************************************************************************/
    private computeTimelineAlignment(intent: string, history: SummarizedHistory): number {
        if (!history || history.events.length === 0) return 0.5;

        const text = intent.toLowerCase();
        let matches = 0;

        for (const e of history.events) {
            if (e.summary.toLowerCase().includes(text)) matches++;
        }

        return Math.min(1, matches / (history.events.length || 1));
    }

    /****************************************************************************************
     * 3 — PATTERN ALIGNMENT
     * Checks if the intent fits a known cognitive pattern.
     ****************************************************************************************/
    private computePatternAlignment(intent: string, history: SummarizedHistory): number {
        const classification = RL4Dictionary.classifyEvent({
            type: BaseMessage.MessageType.FILE_EVENT,
            payload: { text: intent }
        } as any);

        // If no classification, return neutral
        if (classification.classification === 'maintenance') return 0.3;

        // If the pattern is dominant in the session → stronger score
        const dominant = history.dominantPatterns || [];
        return dominant.includes(classification.classification) ? 1 : 0.6;
    }

    /****************************************************************************************
     * 4 — CODE ALIGNMENT
     * Ensures the intent is coherent with current code structure.
     ****************************************************************************************/
    private computeCodeAlignment(intent: string, code: CodeStateSnapshot): number {
        const text = intent.toLowerCase();

        // Heuristic: If intent mentions files/functions that exist → stronger alignment
        let hits = 0;
        let total = 0;

        if (!code || !code.files || code.files.length === 0) return 0.5;

        for (const file of code.files) {
            total++;
            if (text.includes(file.name.toLowerCase())) hits++;
        }

        if (total === 0) return 0.5;
        return hits / total;
    }

    /****************************************************************************************
     * SIGNAL GENERATOR
     * Human-readable hints for UnifiedPromptBuilder.
     ****************************************************************************************/
    private collectSignals(
        plan: number, timeline: number, pattern: number, code: number
    ): string[] {
        const s: string[] = [];

        if (plan < 0.4) s.push("⚠️ Intent diverges from plan");
        if (timeline < 0.3) s.push("⏰️ Intent not reflected in recent activity");
        if (pattern < 0.5) s.push("🧩 Intent does not match dominant patterns");
        if (code < 0.3) s.push("📁 Intent mismatches code structure");

        return s;
    }

    /**
     * Simple text similarity calculation for intent comparison
     */
    private computeTextSimilarity(text1: string, text2: string): number {
        const words1 = new Set(text1.toLowerCase().split(/\s+/));
        const words2 = new Set(text2.toLowerCase().split(/\s+/));

        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);

        return union.size === 0 ? 0 : intersection.size / union.size;
    }
}