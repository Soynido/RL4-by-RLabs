/******************************************************************************************
 * ADRParser - RL6 Architecture Decision Record Parser
 *
 * Purpose:
 *   Extract structured, machine-usable architectural knowledge from ADR files,
 *   enabling RL4 to:
 *   - Detect inconsistent architectural decisions
 *   - Build a dependency graph of decisions
 *   - Provide relevant ADR context to UnifiedPromptBuilder
 *   - Track evolution and obsolescence of decisions across time
 *
 * NOTE:
 *   This module contains ZERO intelligence.
 *   It only parses, validates and organizes ADR information.
 ******************************************************************************************/

import * as fs from "fs";
import * as path from "path";

export interface ADRRecord {
    id: string;
    filePath: string;
    title: string;
    status: string;
    context: string;
    decision: string;
    consequences: string;
    tags: string[];
    links: string[];
    createdAt?: string;
}

export type ParsedADR = ADRRecord;

export interface ADRConflict {
    from: string;
    to: string;
    reason: string;
}

export interface DecisionEdge {
    from: string;
    to: string;
    type: "depends_on" | "supersedes" | "relates_to";
}

export interface ADRRelevanceScore {
    id: string;
    score: number;
    reasons: string[];
}

export class ADRParser {
    constructor(private workspaceRoot: string) {}

    /******************************************************************************************
     * PUBLIC API
     ******************************************************************************************/

    /**
     * Scan all ADR files inside `.reasoning_rl4/adrs` or `/docs/adr`
     */
    async loadAll(): Promise<ADRRecord[]> {
        const adrDirs = [
            path.join(this.workspaceRoot, ".reasoning_rl4", "adrs"),
            path.join(this.workspaceRoot, "docs", "adr"),
            path.join(this.workspaceRoot, "adr")
        ];

        const records: ADRRecord[] = [];

        for (const dir of adrDirs) {
            if (!fs.existsSync(dir)) continue;

            const files = fs.readdirSync(dir).filter(f => f.endsWith(".md") || f.endsWith(".adr"));

            for (const file of files) {
                const full = path.join(dir, file);
                const parsed = this.parseADRFile(full);
                if (parsed) records.push(parsed);
            }
        }

        return records;
    }

    /******************************************************************************************
     * FILE PARSING
     ******************************************************************************************/

    /**
     * Parses a single ADR markdown file into a structured ADRRecord
     */
    parseADRFile(filePath: string): ADRRecord | null {
        try {
            const raw = fs.readFileSync(filePath, "utf-8");

            const title = this.extractSection(raw, "# ") ?? "Untitled ADR";
            const status = this.extractSection(raw, "Status:") ?? "Unknown";
            const context = this.extractSection(raw, "## Context") ?? "";
            const decision = this.extractSection(raw, "## Decision") ?? "";
            const consequences = this.extractSection(raw, "## Consequences") ?? "";
            const tags = this.extractTags(raw);
            const links = this.extractLinks(raw);

            return {
                id: path.basename(filePath).replace(/\..+$/, ""),
                filePath,
                title,
                status,
                context,
                decision,
                consequences,
                tags,
                links,
                createdAt: this.extractDate(raw)
            };
        } catch {
            return null;
        }
    }

    /******************************************************************************************
     * SECTION EXTRACTION HELPERS
     ******************************************************************************************/

    private extractSection(raw: string, marker: string): string | null {
        const idx = raw.indexOf(marker);
        if (idx === -1) return null;

        const after = raw.substring(idx + marker.length);
        const nextHeader = after.search(/^#/m);

        if (nextHeader !== -1) {
            return after.substring(0, nextHeader).trim();
        }

        return after.trim();
    }

    private extractTags(raw: string): string[] {
        const match = raw.match(/Tags?: (.*)/i);
        if (!match) return [];
        return match[1].split(",").map(t => t.trim());
    }

    private extractLinks(raw: string): string[] {
        const links: string[] = [];
        const regex = /\[(.+?)\]\((.+?)\)/g;

        let m;
        while ((m = regex.exec(raw))) {
            links.push(m[2]);
        }

        return links;
    }

    private extractDate(raw: string): string | undefined {
        const match = raw.match(/Date:\s*(.*)/i);
        return match ? match[1] : undefined;
    }

    /******************************************************************************************
     * DEPENDENCY & CONFLICT ANALYSIS
     ******************************************************************************************/

    /**
     * Builds a dependency graph from ADR links
     */
    buildDecisionGraph(records: ADRRecord[]): DecisionEdge[] {
        const edges: DecisionEdge[] = [];

        for (const adr of records) {
            adr.links.forEach(link => {
                const target = records.find(r => link.includes(r.id));
                if (!target) return;

                const type =
                    link.includes("supersede") ? "supersedes" :
                    link.includes("relate") ? "relates_to" :
                    "depends_on";

                edges.push({
                    from: adr.id,
                    to: target.id,
                    type
                });
            });
        }

        return edges;
    }

    /**
     * Detect textual contradictions such as:
     * - Two ADRs with conflicting decisions
     * - Obsolete ADR still marked "Accepted"
     */
    detectConflicts(records: ADRRecord[]): ADRConflict[] {
        const conflicts: ADRConflict[] = [];

        for (const a of records) {
            for (const b of records) {
                if (a.id === b.id) continue;

                // Simple textual contradiction heuristic
                if (a.decision && b.decision && this.isContradictory(a.decision, b.decision)) {
                    conflicts.push({
                        from: a.id,
                        to: b.id,
                        reason: "Conflicting architectural statements detected"
                    });
                }

                // Obsolete ADR still marked as Accepted
                if (a.status.toLowerCase() === "accepted" && a.title.toLowerCase().includes("deprecated")) {
                    conflicts.push({
                        from: a.id,
                        to: a.id,
                        reason: "ADR marked as Accepted but refers to deprecated concepts"
                    });
                }
            }
        }

        return conflicts;
    }

    /**
     * Compute relevance score for UnifiedPromptBuilder
     */
    computeRelevance(records: ADRRecord[], ctx: { file?: string; task?: string }): ADRRelevanceScore[] {
        return records.map(r => {
            const reasons: string[] = [];
            let score = 0;

            if (ctx.file && r.context.includes(path.basename(ctx.file))) {
                score += 3;
                reasons.push("Mentions the current file");
            }

            if (ctx.task && r.decision.toLowerCase().includes(ctx.task.toLowerCase())) {
                score += 4;
                reasons.push("Mentions the active task");
            }

            if (r.status.toLowerCase() === "accepted") {
                score += 2;
                reasons.push("ADR is accepted");
            }

            return { id: r.id, score, reasons };
        }).sort((a, b) => b.score - a.score);
    }

    /******************************************************************************************
     * INTERNAL CONTRADICTION DETECTOR
     ******************************************************************************************/
    private isContradictory(a: string, b: string): boolean {
        const pairs = [
            ["must", "must not"],
            ["forbidden", "allowed"],
            ["never", "always"]
        ];

        return pairs.some(([x, y]) => a.includes(x) && b.includes(y));
    }
}