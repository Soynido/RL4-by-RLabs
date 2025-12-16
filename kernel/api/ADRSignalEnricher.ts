import { ParsedADR } from "./ADRParser";
import { SummarizedHistory } from "./HistorySummarizer";

export interface EnrichedADRSignal {
    adrId: string;
    title: string;
    decision: string;
    consequences: string[];
    invariants: string[];
    relevance: number;              // 0..1 — importance for current intent
    warnings: string[];             // architectural risks
}

export class ADRSignalEnricher {

    /**
     * Enrich a set of ADRs with architectural signals relevant to the current intent.
     *
     * @param intent - developer intent extracted from UnifiedPromptBuilder
     * @param adrs - parsed ADRs from ADRParser
     * @param history - summarized history (optional, can provide context)
     */
    enrich(
        intent: string,
        adrs: ParsedADR[],
        history?: SummarizedHistory
    ): EnrichedADRSignal[] {

        const text = intent.toLowerCase();

        return adrs.map(adr => {
            const relevance = this.computeRelevance(text, adr);
            const invariants = this.extractInvariants(adr);
            const consequences = this.extractConsequences(adr);

            const warnings = this.detectArchitecturalViolations(
                text,
                invariants,
                consequences
            );

            return {
                adrId: adr.id,
                title: adr.title,
                decision: adr.decision,
                consequences,
                invariants,
                relevance,
                warnings
            };
        });
    }

    /****************************************************************************************
     * Compute architectural relevance:
     *  - keyword matching
     *  - category/domain consistency
     *  - structural constraints
     ****************************************************************************************/
    private computeRelevance(intent: string, adr: ParsedADR): number {
        let score = 0;

        // Keyword hits
        for (const kw of adr.tags) {
            if (intent.includes(kw.toLowerCase())) score += 0.2;
        }

        // Architectural domain hints
        if (adr.tags.includes(intent.toLowerCase()) ||
            adr.title.toLowerCase().includes(intent.toLowerCase())) {
            score += 0.3;
        }

        // Decision type alignment (e.g., API, persistence, security)
        if (intent.toLowerCase().includes(adr.status.toLowerCase())) {
            score += 0.3;
        }

        return Math.min(1, score);
    }

    /****************************************************************************************
     * Extract invariants from decisions & context.
     * Example:
     *   - "All writes must pass through the WriteQueue"
     *   - "Append-only model is required"
     ****************************************************************************************/
    private extractInvariants(adr: ParsedADR): string[] {
        const inv: string[] = [];

        const lower = (adr.context + " " + adr.decision).toLowerCase();

        if (lower.includes("must")) inv.push("Contains mandatory requirements");
        if (lower.includes("append-only")) inv.push("Append-only invariant");
        if (lower.includes("single source of truth"))
            inv.push("SSOT invariant");
        if (lower.includes("no mutation"))
            inv.push("Immutability requirement");

        return inv;
    }

    /****************************************************************************************
     * Extract consequences that are meaningful for reasoning.
     * Example:
     *   - "Refactors will require updating the router"
     *   - "Changing this module impacts snapshot rotation"
     ****************************************************************************************/
    private extractConsequences(adr: ParsedADR): string[] {
        return adr.consequences || [];
    }

    /****************************************************************************************
     * Detect risks where the user's intent violates existing ADR constraints.
     ****************************************************************************************/
    private detectArchitecturalViolations(
        intent: string,
        invariants: string[],
        consequences: string[]
    ): string[] {
        const warnings: string[] = [];
        const t = intent.toLowerCase();

        // Breaking append-only model?
        if (invariants.some(i => i.includes("append-only"))) {
            if (t.includes("rewrite") || t.includes("delete") || t.includes("mutation")) {
                warnings.push("Intent violates append-only invariant");
            }
        }

        // Breaking immutability?
        if (invariants.some(i => i.includes("immutability"))) {
            if (t.includes("modify") || t.includes("mutate")) {
                warnings.push("Intent violates immutability requirement");
            }
        }

        // Conflict with declared consequences
        for (const c of consequences) {
            const lc = c.toLowerCase();
            if (lc.includes("requires") && t.includes("skip")) {
                warnings.push("Intent contradicts required architectural steps");
            }
        }

        return warnings;
    }
}