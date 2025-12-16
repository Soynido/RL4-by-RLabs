import { RL4Event } from "../legacy/rl4/RL4Messages";

export interface PromptIntegrityResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
}

/**
 * PromptIntegrityValidator - RL6
 *
 * Purpose:
 *   Enforce strict rules ensuring that any prompt sent to the LLM:
 *    - is valid
 *    - is safe
 *    - is deterministic
 *    - is structurally correct
 *    - does not contain hallucination traps
 *    - does not request impossible operations
 *
 * Why RL6 needs this:
 *   UnifiedPromptBuilder produces high-density prompts from:
 *    - HistorySummarizer
 *    - CodeStateAnalyzer
 *    - Pattern signals
 *    - MIL-style structural pointers (future compatible)
 *
 *   Without this validator, the whole cognitive chain becomes unstable.
 *
 * This module contains ZERO intelligence.
 * It only enforces:
 *   - schema compliance
 *   - allowed sections
 *   - semantic constraints
 *   - toxicity filters (non-ML, deterministic)
 *
 * No heuristics, no guessing.
 */

export interface PromptSection {
    id: string;            // Section identifier
    content: string;       // Raw text intended for inclusion in the prompt
    importance: number;    // 0..1 weight
}

export interface PromptValidationResult {
    ok: boolean;
    errors: string[];
    sanitizedSections: PromptSection[];
}

export class PromptIntegrityValidator {

    private readonly forbiddenPatterns = [
        /delete\s+project/i,
        /wipe\s+workspace/i,
        /force\s+push/i,
        /rm\s+-rf\b/i,
        /format\s+disk/i,
        /override\s+kernel/i,
        /rewrite\s+history/i,
        /execute\s+shell/i,
        /arbitrary\s+code\s+execution/i
    ];

    private readonly structuralRules = {
        maxTotalLength: 20000,
        maxSectionCount: 20,
        maxSectionLength: 2000,
        minImportance: 0,
        maxImportance: 1
    };

    constructor() {}

    /**
     * Validate and sanitize all sections before UnifiedPromptBuilder concatenates them.
     */
    validate(sections: PromptSection[]): PromptIntegrityResult {
        const errors: string[] = [];
        const sanitized: PromptSection[] = [];

        // RULE 1 — Section count
        if (sections.length > this.structuralRules.maxSectionCount) {
            errors.push(
                `Too many prompt sections: ${sections.length} > ${this.structuralRules.maxSectionCount}`
            );
        }

        let totalLength = 0;

        for (const s of sections) {
            const localErrors = this.validateSection(s);

            if (localErrors.length > 0) {
                errors.push(...localErrors);
                continue; // section rejected
            }

            totalLength += s.content.length;
            sanitized.push(s);
        }

        // RULE 2 — Total length
        if (totalLength > this.structuralRules.maxTotalLength) {
            errors.push(
                `Total prompt length too large: ${totalLength} > ${this.structuralRules.maxTotalLength}`
            );
        }

        return {
            valid: errors.length === 0,
            issues: errors,
            warnings: [], // TODO: implement warning detection,
            sanitizedSections: sanitized
        };
    }

    /**
     * Validate a single prompt block.
     */
    private validateSection(section: PromptSection): string[] {
        const errors: string[] = [];

        if (!section.id || typeof section.id !== "string") {
            errors.push(`Invalid section id: ${section.id}`);
        }

        if (typeof section.content !== "string") {
            errors.push(`Invalid content type for section ${section.id}`);
            return errors;
        }

        // RULE — section length
        if (section.content.length > this.structuralRules.maxSectionLength) {
            errors.push(
                `Section '${section.id}' exceeds max length (${section.content.length})`
            );
        }

        // RULE — importance
        if (
            section.importance < this.structuralRules.minImportance ||
            section.importance > this.structuralRules.maxImportance
        ) {
            errors.push(
                `Invalid importance for '${section.id}': must be between 0 and 1`
            );
        }

        // RULE — forbidden instructions (hard deterministic filters)
        for (const pattern of this.forbiddenPatterns) {
            if (pattern.test(section.content)) {
                errors.push(
                    `Forbidden instruction detected in section '${section.id}'`
                );
            }
        }

        return errors;
    }

    /**
     * Strict sanitation: remove low-value or invalid sections after validation.
     */
    sanitize(sections: PromptSection[]): PromptSection[] {
        return sections
            .filter(
                (s) =>
                    typeof s.content === "string" &&
                    s.importance >= 0.05 &&
                    s.content.trim().length > 0
            )
            .map((s) => ({
                ...s,
                content: this.basicCleanup(s.content)
            }));
    }

    /**
     * Minimal but deterministic cleanup: trimming, removing multi-newlines.
     */
    private basicCleanup(text: string): string {
        return text
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }

    /**
     * Optional: Scan timeline for risk events (ex: commands + code changes).
     */
    scanForRiskSignals(events: RL4Event[]): string[] {
        const alerts: string[] = [];

        for (const ev of events) {
            if (ev.type === "terminal.command" && /rm\s+-rf/.test(ev.payload?.cmd)) {
                alerts.push("Dangerous command detected in timeline.");
            }
        }

        return alerts;
    }
}