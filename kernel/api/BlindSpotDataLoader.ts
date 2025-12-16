import * as fs from "fs";
import * as path from "path";
import { TimelineEncoder } from "../rl4/TimelineEncoder";
import { RL4Dictionary } from "../legacy/rl4/RL4Dictionary";
import { ActivityReconstructor } from "./ActivityReconstructor";

export interface TimelinePeriod {
    days: number;
}

export interface BlindSpotReport {
    missingExpectedFiles: string[];
    orphanFiles: string[];
    staleFiles: string[];
    timelineGaps: {
        from: string;
        to: string;
        durationMinutes: number;
    }[];
    unexploredHotspots: {
        file: string;
        reason: string;
    }[];
    weakSemanticZones: {
        area: string;
        weakness: string;
    }[];
}

export class BlindSpotDataLoader {
    private workspace: string;
    private encoder: TimelineEncoder;
    private reconstructor: ActivityReconstructor;

    constructor(workspaceRoot: string) {
        this.workspace = workspaceRoot;
        this.encoder = new TimelineEncoder();
        this.reconstructor = new ActivityReconstructor(workspaceRoot);
    }

    /**
     * Main API: produce consolidated blind spot analysis
     */
    async load(): Promise<BlindSpotReport> {
        const expected = this.getExpectedFiles();
        const actual = this.scanWorkspaceFiles();

        const missing = expected.filter(f => !actual.includes(f));
        const orphan = actual.filter(f => !this.isFileReferenced(f));
        const stale = this.detectStaleFiles(actual);

        const timeline = await this.reconstructor.reconstruct();
        const gaps = this.detectTimelineGaps(timeline.events);

        const hotspots = this.detectUnexploredHotspots(actual, timeline);
        const semanticWeakness = this.computeWeakSemanticZones(timeline);

        return {
            missingExpectedFiles: missing,
            orphanFiles: orphan,
            staleFiles: stale,
            timelineGaps: gaps,
            unexploredHotspots: hotspots,
            weakSemanticZones: semanticWeakness
        };
    }

    // ---------------------------------------------------------------------
    // EXPECTED STRUCTURE ANALYSIS
    // ---------------------------------------------------------------------

    private getExpectedFiles(): string[] {
        const mandatory = [
            ".reasoning_rl4/governance",
            ".reasoning_rl4/ledger",
            ".reasoning_rl4/traces",
            ".reasoning_rl4/history",
            ".reasoning_rl4/artifacts",
            ".reasoning_rl4/config"
        ];

        // Expand relative → absolute
        return mandatory.map(f => path.join(this.workspace, f));
    }

    private scanWorkspaceFiles(): string[] {
        const results: string[] = [];

        const walk = (dir: string) => {
            if (!fs.existsSync(dir)) return;

            for (const entry of fs.readdirSync(dir)) {
                const p = path.join(dir, entry);

                try {
                    const stat = fs.statSync(p);
                    if (stat.isDirectory()) walk(p);
                    else results.push(p);
                } catch {
                    // Ignore unreadable entries
                }
            }
        };

        walk(this.workspace);
        return results;
    }

    // ---------------------------------------------------------------------
    // FILE RELATIONSHIPS
    // ---------------------------------------------------------------------

    private isFileReferenced(file: string): boolean {
        // Check whether dictionary or other modules consider this file relevant
        const ext = path.extname(file).replace(".", "").toLowerCase();

        // Use RL4Dictionary to check if file type is recognized
        const category = RL4Dictionary.getPatternCategory(ext);
        return category !== 'maintenance'; // Files in maintenance category are considered non-referenced
    }

    private detectStaleFiles(files: string[]): string[] {
        return files.filter(f => {
            const ext = path.extname(f).slice(1);
            const age = this.getFileAgeMinutes(f);

            // "stale" = relevant but untouched for a long period
            const category = RL4Dictionary.getPatternCategory(ext);
            return category !== 'maintenance' && age > 30 * 24 * 60; // 30 days
        });
    }

    private getFileAgeMinutes(file: string): number {
        try {
            const stat = fs.statSync(file);
            const diff = Date.now() - stat.mtime.getTime();
            return Math.round(diff / 60000);
        } catch {
            return 0;
        }
    }

    // ---------------------------------------------------------------------
    // TIMELINE ANALYSIS
    // ---------------------------------------------------------------------

    private detectTimelineGaps(events: any[]): BlindSpotReport["timelineGaps"] {
        if (!events || events.length < 2) return [];

        const gaps: BlindSpotReport["timelineGaps"] = [];

        for (let i = 1; i < events.length; i++) {
            const prev = events[i - 1];
            const curr = events[i];

            const t1 = new Date(prev.timestamp).getTime();
            const t2 = new Date(curr.timestamp).getTime();

            const diff = (t2 - t1) / 60000;

            if (diff >= 15) {
                gaps.push({
                    from: prev.timestamp,
                    to: curr.timestamp,
                    durationMinutes: Math.round(diff)
                });
            }
        }

        return gaps;
    }

    // ---------------------------------------------------------------------
    // HOTSPOT DETECTION
    // ---------------------------------------------------------------------

    private detectUnexploredHotspots(files: string[], timeline: any): BlindSpotReport["unexploredHotspots"] {
        const hotspots: BlindSpotReport["unexploredHotspots"] = [];

        const activityFiles = new Set(
            timeline.events
                .filter((e: any) => e.file)
                .map((e: any) => e.file)
        );

        for (const file of files) {
            const ext = path.extname(file).slice(1);
            const category = RL4Dictionary.getPatternCategory(ext);

            if (category !== 'maintenance' && !activityFiles.has(file)) {
                hotspots.push({
                    file,
                    reason: "Relevant file but no recorded activity"
                });
            }
        }

        return hotspots;
    }

    // ---------------------------------------------------------------------
    // SEMANTIC WEAKNESS
    // ---------------------------------------------------------------------

    private computeWeakSemanticZones(timeline: any): BlindSpotReport["weakSemanticZones"] {
        const zones: BlindSpotReport["weakSemanticZones"] = [];

        const categories = new Map<string, number>();

        for (const evt of timeline.events) {
            const classification = RL4Dictionary.classifyEvent(evt);
            categories.set(classification.classification, (categories.get(classification.classification) ?? 0) + 1);
        }

        // Weak zone = very low representation
        for (const [zone, count] of categories.entries()) {
            if (count < 3) {
                zones.push({
                    area: zone,
                    weakness: `Low activity: only ${count} events recorded`
                });
            }
        }

        return zones;
    }
}