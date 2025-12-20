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
import { z } from "zod";
import { RBOMLedger } from "../rbom/RBOMLedger";
import { ActivityReconstructor } from "./ActivityReconstructor";
import { WriteTracker } from "../WriteTracker";

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

// Zod Schema for ADR (from legacy)
const ADRSchema = z.object({
  id: z.string().regex(/^adr-\d{3,}-/), // e.g. adr-005-single-context
  title: z.string().min(5),
  status: z.enum(['proposed', 'accepted', 'rejected', 'deprecated', 'superseded']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  author: z.string(),
  context: z.string().min(50),
  decision: z.string().min(50),
  consequences: z.object({
    positive: z.array(z.string()),
    negative: z.array(z.string()),
    risks: z.array(z.string()).optional(),
    alternatives: z.array(z.string()).optional()
  })
});

export type ADRFromFile = z.infer<typeof ADRSchema>;

export class ADRParser {
    constructor(
        private workspaceRoot: string,
        private rbomLedger?: RBOMLedger,
        private activityReconstructor?: ActivityReconstructor
    ) {}
    
    // NEW: Path to ADRs.RL4 file
    private get adrsFilePath(): string {
        return path.join(this.workspaceRoot, '.reasoning_rl4', 'governance', 'ADRs.RL4');
    }
    
    // NEW: Path to ledger
    private get ledgerPath(): string {
        return path.join(this.workspaceRoot, '.reasoning_rl4', 'ledger', 'adrs.jsonl');
    }

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

    /******************************************************************************************
     * ADRs.RL4 PARSING (from governance file)
     ******************************************************************************************/

    /**
     * Parse ADRs.RL4 file (Markdown format)
     * Returns array of parsed ADRs
     */
    parseADRsFile(): ADRFromFile[] {
        if (!fs.existsSync(this.adrsFilePath)) {
            return [];
        }

        try {
            const content = fs.readFileSync(this.adrsFilePath, 'utf8');
            const adrBlocks = this.extractADRBlocks(content);
            const adrs: ADRFromFile[] = [];
            
            for (const block of adrBlocks) {
                try {
                    const adr = this.parseADRBlock(block);
                    ADRSchema.parse(adr); // Validate
                    adrs.push(adr);
                } catch (error) {
                    console.error(`[ADRParser] Failed to parse ADR block:`, error);
                }
            }
            
            return adrs;
        } catch (error) {
            console.error('[ADRParser] Failed to read ADRs.RL4:', error);
            return [];
        }
    }

    /**
     * Extract ADR blocks from Markdown (## ADR-XXX: Title)
     */
    private extractADRBlocks(content: string): string[] {
        const blocks: string[] = [];
        const lines = content.split('\n');
        let currentBlock = '';
        let inADR = false;

        for (const line of lines) {
            if (line.match(/^## ADR-\d{3,}:/)) {
                if (inADR && currentBlock) {
                    blocks.push(currentBlock);
                }
                currentBlock = line + '\n';
                inADR = true;
            } else if (inADR) {
                currentBlock += line + '\n';
            }
        }

        if (inADR && currentBlock) {
            blocks.push(currentBlock);
        }

        return blocks;
    }

    /**
     * Parse single ADR block
     */
    private parseADRBlock(block: string): ADRFromFile {
        const lines = block.split('\n');
        const headerMatch = lines[0].match(/^## (ADR-\d{3,}):\s*(.+)$/);
        if (!headerMatch) {
            throw new Error('Invalid ADR header format');
        }

        const id = headerMatch[1].toLowerCase(); // e.g. "adr-005"
        const title = headerMatch[2].trim();
        const status = this.extractField(block, '**Status**:', 'proposed') as ADRFromFile['status'];
        const date = this.extractField(block, '**Date**:', new Date().toISOString().split('T')[0]);
        const author = this.extractField(block, '**Author**:', 'Unknown');
        const context = this.extractSectionFromBlock(block, '### Context');
        const decision = this.extractSectionFromBlock(block, '### Decision');
        const consequencesSection = this.extractSectionFromBlock(block, '### Consequences');
        const consequences = this.parseConsequences(consequencesSection);

        return {
            id,
            title,
            status,
            date,
            author,
            context,
            decision,
            consequences
        };
    }

    /**
     * Extract section content from ADR block (for ### headers)
     */
    private extractSectionFromBlock(content: string, sectionTitle: string): string {
        const regex = new RegExp(`${sectionTitle}([\\s\\S]*?)(?=###|##|$)`, 'm');
        const match = content.match(regex);
        return match ? match[1].trim() : '';
    }

    /**
     * Extract field value from Markdown
     */
    private extractField(content: string, fieldName: string, defaultValue: string): string {
        const regex = new RegExp(`${fieldName}\\s*(.+)$`, 'm');
        const match = content.match(regex);
        return match ? match[1].trim() : defaultValue;
    }

    /**
     * Parse consequences section
     */
    private parseConsequences(section: string): ADRFromFile['consequences'] {
        const positive: string[] = [];
        const negative: string[] = [];
        const risks: string[] = [];
        const alternatives: string[] = [];

        const positiveMatch = section.match(/\*\*Positive:\*\*([^\*]+)/s);
        const negativeMatch = section.match(/\*\*Negative:\*\*([^\*]+)/s);
        const risksMatch = section.match(/\*\*Risks:\*\*([^\*]+)/s);
        const alternativesMatch = section.match(/\*\*Alternatives Considered:\*\*([^\*]+)/s);

        if (positiveMatch) {
            positive.push(...this.extractListItems(positiveMatch[1]));
        }
        if (negativeMatch) {
            negative.push(...this.extractListItems(negativeMatch[1]));
        }
        if (risksMatch) {
            risks.push(...this.extractListItems(risksMatch[1]));
        }
        if (alternativesMatch) {
            alternatives.push(...this.extractListItems(alternativesMatch[1]));
        }

        return { positive, negative, risks, alternatives };
    }

    /**
     * Extract list items from Markdown
     */
    private extractListItems(content: string): string[] {
        return content
            .split('\n')
            .filter(line => line.trim().startsWith('-'))
            .map(line => line.replace(/^-\s*/, '').trim())
            .filter(Boolean);
    }

    /**
     * Check if ADR already exists in ledger
     */
    private adrExists(adrId: string): boolean {
        if (!fs.existsSync(this.ledgerPath)) {
            return false;
        }
        try {
            const content = fs.readFileSync(this.ledgerPath, 'utf8');
            return content.includes(`"id":"${adrId}"`);
        } catch {
            return false;
        }
    }

    /**
     * Append ADR to ledger/adrs.jsonl
     * CRITICAL: Also registers in RBOMLedger and ActivityReconstructor
     */
    async appendToLedger(adr: ADRFromFile): Promise<boolean> {
        try {
            if (this.adrExists(adr.id)) {
                console.log(`[ADRParser] ADR ${adr.id} already exists, skipping`);
                return false;
            }

            const ledgerDir = path.dirname(this.ledgerPath);
            if (!fs.existsSync(ledgerDir)) {
                fs.mkdirSync(ledgerDir, { recursive: true });
            }

            // ✅ INVARIANT RL6: WriteTracker to prevent false positives
            const writeTracker = WriteTracker.getInstance();
            writeTracker.markInternalWrite(this.ledgerPath);

            const jsonlEntry = JSON.stringify({
                id: adr.id,
                title: adr.title,
                status: adr.status,
                date: adr.date,
                author: adr.author,
                context: adr.context,
                decision: adr.decision,
                consequences: adr.consequences,
                timestamp: new Date().toISOString()
            });

            fs.appendFileSync(this.ledgerPath, jsonlEntry + '\n', 'utf8');
            console.log(`[ADRParser] ✅ Added ADR ${adr.id} to ledger`);

            // ✅ INVARIANT RL6: Register in RBOMLedger (governance event)
            if (this.rbomLedger) {
                await this.rbomLedger.append('adr_added', {
                    id: adr.id,
                    title: adr.title,
                    status: adr.status,
                    source: 'ADRs.RL4'
                });
            }

            // ✅ INVARIANT RL6: Register in ActivityReconstructor
            if (this.activityReconstructor) {
                const { EventType, EventSource } = require('./ActivityReconstructor');
                this.activityReconstructor.addEvent({
                    type: EventType.ADR_ADDED,
                    timestamp: new Date(),
                    source: EventSource.ADR_PARSER,
                    data: {
                        adrId: adr.id,
                        adrTitle: adr.title,
                        status: adr.status
                    }
                });
            }

            return true;
        } catch (error) {
            console.error(`[ADRParser] Failed to append ADR to ledger:`, error);
            return false;
        }
    }

    /**
     * Process ADRs.RL4 and append new ADRs to ledger
     * Returns: { added, skipped, errors, structuralADRs }
     */
    async processADRsFile(): Promise<{ added: number; skipped: number; errors: number; structuralADRs: ADRFromFile[] }> {
        const adrs = this.parseADRsFile();
        let added = 0;
        let skipped = 0;
        let errors = 0;
        const structuralADRs: ADRFromFile[] = [];

        for (const adr of adrs) {
            try {
                const success = await this.appendToLedger(adr);
                if (success) {
                    added++;
                    
                    // ✅ INVARIANT RL6: Check if structural ADR (status="accepted" + tag="structural")
                    if (adr.status === 'accepted' && this.isStructuralADR(adr)) {
                        structuralADRs.push(adr);
                    }
                } else {
                    skipped++;
                }
            } catch (error) {
                console.error(`[ADRParser] Error appending ADR ${adr.id}:`, error);
                errors++;
            }
        }

        console.log(`[ADRParser] Processed ${adrs.length} ADRs: ${added} added, ${skipped} skipped, ${errors} errors`);
        return { added, skipped, errors, structuralADRs };
    }

    /**
     * Check if ADR is structural (should be in ground_truth)
     */
    private isStructuralADR(adr: ADRFromFile): boolean {
        // Check if ADR has "structural" tag in consequences or context
        const hasStructuralTag = 
            adr.consequences.alternatives?.some(alt => alt.toLowerCase().includes('structural')) ||
            adr.context.toLowerCase().includes('structural') ||
            adr.decision.toLowerCase().includes('structural');
        
        return hasStructuralTag || false;
    }

    /**
     * Get all ADRs from ledger (for display in prompts)
     */
    getAllADRsFromLedger(limit?: number): ADRFromFile[] {
        if (!fs.existsSync(this.ledgerPath)) {
            return [];
        }

        try {
            const content = fs.readFileSync(this.ledgerPath, 'utf8');
            const lines = content.trim().split('\n').filter(Boolean);
            const adrs = lines.map(line => {
                const parsed = JSON.parse(line);
                // Convert to ADRFromFile format (remove timestamp if present)
                return {
                    id: parsed.id,
                    title: parsed.title,
                    status: parsed.status,
                    date: parsed.date,
                    author: parsed.author,
                    context: parsed.context,
                    decision: parsed.decision,
                    consequences: parsed.consequences
                } as ADRFromFile;
            });
            
            if (limit) {
                return adrs.slice(-limit).reverse();
            }
            return adrs.reverse();
        } catch (error) {
            console.error('[ADRParser] Failed to read ADRs from ledger:', error);
            return [];
        }
    }
}