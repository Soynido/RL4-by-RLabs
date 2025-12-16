import * as fs from "fs";
import * as path from "path";
import { RL4Event } from "../legacy/rl4/RL4Messages";
import { RL4Dictionary } from "../legacy/rl4/RL4Dictionary";

/**
 * CodeStateAnalyzer - RL6 Deterministic Codebase State Engine
 *
 * Purpose:
 *   Produce a structured, measurable snapshot of the current codebase:
 *    - file metrics
 *    - hotspots
 *    - technical debt hints
 *    - churn analysis
 *    - instability indicators
 *    - dependency graph anomalies
 *
 * It NEVER uses LLM logic.
 * It is fully deterministic.
 *
 * This module provides:
 *   1. UnifiedPromptBuilder → a concise, objective "workspace state block"
 *   2. HistorySummarizer → context about churn / hotspots
 *   3. ActivityReconstructor → file impact analysis
 *   4. PromptOptimizer → code-density weighting
 *   5. Future MIL/HIS → stable pointers describing structural code sections
 */

export interface FileMetrics {
    path: string;
    size: number;
    lines: number;
    imports: string[];
    lastModified: string | null;
    churn: number;                   // number of modify events in timeline
    stability: number;               // inverse of churn density
}

export interface CodebaseSnapshot {
    root: string;
    totalFiles: number;
    totalLines: number;

    // structural
    dependencyGraph: Record<string, string[]>;
    hotspots: string[];
    unstableFiles: string[];

    // summary
    score: number;                   // 0..1 overall code quality heuristic
    pointers: string[];              // used by MIL/HIS and PromptOptimizer

    files: FileMetrics[];
}

export class CodeStateAnalyzer {
    constructor() {}

    /**
     * Main entry point.
     * Compute a deterministic CodebaseSnapshot from:
     *  - actual files on disk
     *  - RL4 timeline events (optional)
     */
    analyze(workspaceRoot: string, events: RL4Event[] = []): CodebaseSnapshot {
        const files = this.scanFiles(workspaceRoot);
        const churn = this.computeChurn(events);
        const metrics = this.computeFileMetrics(files, churn);
        const dependencyGraph = this.computeDependencyGraph(metrics);

        const hotspots = this.detectHotspots(metrics);
        const unstableFiles = this.detectInstability(metrics);

        return {
            root: workspaceRoot,
            totalFiles: metrics.length,
            totalLines: metrics.reduce((a, f) => a + f.lines, 0),

            dependencyGraph,
            hotspots,
            unstableFiles,

            score: this.computeQualityScore(metrics),
            pointers: [
                ...hotspots.map(f => `file:${f}`),
                ...unstableFiles.map(f => `unstable:${f}`)
            ],

            files: metrics
        };
    }

    /***********************************************************************************************
     * STEP 1 — File scanning (deterministic, recursive, TS/JS only)
     ***********************************************************************************************/
    private scanFiles(root: string): string[] {
        const result: string[] = [];

        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(dir)) {
                const full = path.join(dir, entry);
                const stat = fs.statSync(full);

                if (stat.isDirectory()) {
                    walk(full);
                    continue;
                }

                if (full.endsWith(".ts") || full.endsWith(".js")) {
                    result.push(full);
                }
            }
        };

        walk(root);
        return result;
    }

    /***********************************************************************************************
     * STEP 2 — Map churn per file using timeline events
     ***********************************************************************************************/
    private computeChurn(events: RL4Event[]): Record<string, number> {
        const churn: Record<string, number> = {};

        for (const ev of events) {
            if (ev.type === "file.modify" && ev.payload?.path) {
                churn[ev.payload.path] = (churn[ev.payload.path] || 0) + 1;
            }
        }

        return churn;
    }

    /***********************************************************************************************
     * STEP 3 — Compute deterministic file metrics
     ***********************************************************************************************/
    private computeFileMetrics(
        files: string[],
        churn: Record<string, number>
    ): FileMetrics[] {
        const metrics: FileMetrics[] = [];

        for (const f of files) {
            const content = fs.readFileSync(f, "utf-8");
            const lines = content.split("\n").length;

            metrics.push({
                path: f,
                size: content.length,
                lines,
                imports: this.extractImports(content),
                lastModified: this.getLastModified(f),
                churn: churn[f] || 0,
                stability: 1 - Math.min(1, (churn[f] || 0) / 20)
            });
        }

        return metrics;
    }

    private extractImports(content: string): string[] {
        const imports: string[] = [];
        const regex = /import\s+.*?from\s+["'](.+?)["']/g;
        let match;

        while ((match = regex.exec(content)) !== null) {
            imports.push(match[1]);
        }

        return imports;
    }

    private getLastModified(file: string): string | null {
        try {
            const stat = fs.statSync(file);
            return stat.mtime.toISOString();
        } catch {
            return null;
        }
    }

    /***********************************************************************************************
     * STEP 4 — Build dependency graph
     ***********************************************************************************************/
    private computeDependencyGraph(files: FileMetrics[]): Record<string, string[]> {
        const graph: Record<string, string[]> = {};

        for (const f of files) {
            graph[f.path] = f.imports.map(i => i);
        }

        return graph;
    }

    /***********************************************************************************************
     * STEP 5 — Detect hotspots (high churn and high size)
     ***********************************************************************************************/
    private detectHotspots(files: FileMetrics[]): string[] {
        return files
            .filter(f => f.churn > 10 || f.lines > 500)
            .map(f => f.path);
    }

    /***********************************************************************************************
     * STEP 6 — Detect unstable files (low stability score)
     ***********************************************************************************************/
    private detectInstability(files: FileMetrics[]): string[] {
        return files
            .filter(f => f.stability < 0.5)
            .map(f => f.path);
    }

    /***********************************************************************************************
     * STEP 7 — Compute global code quality score (deterministic heuristic)
     ***********************************************************************************************/
    private computeQualityScore(files: FileMetrics[]): number {
        if (files.length === 0) return 1;

        const avgStability = files.reduce((acc, f) => acc + f.stability, 0) / files.length;
        const avgSizePenalty =
            files.filter(f => f.lines > 800).length / files.length;

        return Math.max(0, Math.min(1, avgStability - avgSizePenalty * 0.3));
    }
}