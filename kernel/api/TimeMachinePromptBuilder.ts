import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { TimelineAggregator, DailyTimeline } from '../indexer/TimelineAggregator';
import { CognitiveLogger } from '../core/CognitiveLogger';

export interface TimeMachinePromptResult {
    prompt: string;
    metrics: {
        range: { start: string; end: string };
        cyclesObserved: number;
        safeModeEvents: number;
        avgCognitiveLoad?: number;
        finalBytes: number;
    };
}

const MAX_SECTION_ITEMS = 20;
const MAX_WAL_ENTRIES = 50;
const MAX_FILE_RESULTS = 50;

interface GitActivityData {
    log: string;
    count: number;
}

interface WalData {
    entries: string[];
    counts: Record<string, number>;
    derived: {
        updateFile: number;
        ledgerUpdates: number;
        engineWrites: number;
    };
}

interface ActivationRunSummary {
    label: string;
    startedAt: string;
    cycles: number;
    llmCalls: number;
    successRate: string;
    degradationMax: number;
    latencyP95: number;
}

type ActivationCycle = {
    llmCallCount?: number;
    llmSuccessCount?: number;
    degradationScore?: number;
    latencyP95Ms?: number;
};

interface DiagnosticRunData {
    files: string[];
    runs: ActivationRunSummary[];
}

interface AdrSummary {
    id: string;
    createdAt: string;
    title: string;
    pattern?: string;
}

interface ContextSnapshotData {
    updated?: string;
    state?: string;
    recentActivity: string[];
}

interface LedgerStateSummary {
    safeMode: boolean;
    corruptionReason?: string | null;
    lastCycleMerkleRoot?: string;
    updated?: string;
}

interface TimeMachinePromptData {
    start: Date;
    end: Date;
    cyclesObserved: number;
    safeModeEvents: number;
    avgCognitiveLoad?: number;
    gitActivity: GitActivityData;
    walData: WalData;
    diagnostics: {
        shadow: DiagnosticRunData;
        live: DiagnosticRunData;
    };
    adrSummaries: AdrSummary[];
    contextSummary: ContextSnapshotData;
    ledgerState?: LedgerStateSummary;
    modifiedFiles: string[];
}

export class TimeMachinePromptBuilder {
    private timelineAggregator: TimelineAggregator;
    private diagnosticsPath: string;

    constructor(private workspaceRoot: string, private logger?: CognitiveLogger) {
        this.timelineAggregator = new TimelineAggregator(workspaceRoot);
        this.diagnosticsPath = path.join(workspaceRoot, '.reasoning_rl4', 'diagnostics', 'history-prompts');
        if (!fs.existsSync(this.diagnosticsPath)) {
            fs.mkdirSync(this.diagnosticsPath, { recursive: true });
        }
    }

    async build(range: { startIso: string; endIso?: string }): Promise<TimeMachinePromptResult> {
        const startDate = new Date(range.startIso);
        if (Number.isNaN(startDate.getTime())) {
            throw new Error('Invalid start date');
        }
        const endDate = range.endIso ? new Date(range.endIso) : startDate;
        if (Number.isNaN(endDate.getTime())) {
            throw new Error('Invalid end date');
        }
        if (endDate.getTime() < startDate.getTime()) {
            throw new Error('End date cannot be before start date');
        }

        const timelineSummaries = await this.loadTimelines(startDate, endDate);
        const cyclesObserved = this.countCycles(startDate, endDate);
        const safeModeEvents = this.countSafeModeEvents(startDate, endDate);
        const avgCognitiveLoad = this.computeAverageCognitiveLoad(timelineSummaries);

        const gitActivity = this.collectGitActivity(startDate, endDate);
        const walData = this.collectWalData(startDate, endDate);
        const diagnosticsShadow = this.collectDiagnosticRuns('shadow', startDate, endDate);
        const diagnosticsLive = this.collectDiagnosticRuns('live', startDate, endDate);
        const adrSummaries = this.collectAdrSummaries(startDate, endDate);
        const contextSummary = this.collectContextSnapshot();
        const ledgerState = this.collectLedgerState();
        const modifiedFiles = this.collectModifiedFiles(startDate, endDate);

        const prompt = this.composePrompt({
            start: startDate,
            end: endDate,
            cyclesObserved,
            safeModeEvents,
            avgCognitiveLoad,
            gitActivity,
            walData,
            diagnostics: {
                shadow: diagnosticsShadow,
                live: diagnosticsLive
            },
            adrSummaries,
            contextSummary,
            ledgerState,
            modifiedFiles
        });

        const finalBytes = Buffer.byteLength(prompt, 'utf-8');
        this.writeDiagnostics({
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            cyclesObserved,
            safeModeEvents,
            avgCognitiveLoad,
            finalBytes
        });

        return {
            prompt,
            metrics: {
                range: { start: startDate.toISOString(), end: endDate.toISOString() },
                cyclesObserved,
                safeModeEvents,
                avgCognitiveLoad,
                finalBytes
            }
        };
    }

    private composePrompt(data: TimeMachinePromptData): string {
        const singleDay = data.start.toISOString().split('T')[0] === data.end.toISOString().split('T')[0];
        const rangeLabel = singleDay
            ? data.start.toISOString().split('T')[0]
            : `${data.start.toISOString().split('T')[0]} → ${data.end.toISOString().split('T')[0]}`;
        const periodLabel = `${data.start.toDateString()} → ${data.end.toDateString()}`;
        const generatedAt = new Date().toISOString();

        const sections: string[] = [];
        sections.push('# RL4_AGENT_INTENT: TIMEMACHINE');
        sections.push('');
        sections.push(`# RL4 TIME MACHINE PROMPT V2 — ${rangeLabel}`);
        sections.push('');
        sections.push(`Generated: ${generatedAt}`);
        sections.push(`Period: ${periodLabel}`);
        sections.push('');
        sections.push('---');
        sections.push('');
        sections.push('## 1. Git Activity (Source of Truth for Code Changes)');
        sections.push('```');
        sections.push(data.gitActivity.log || 'No git commits recorded in this range.');
        sections.push('```');
        sections.push(`Commits count: ${data.gitActivity.count}`);
        sections.push('');
        sections.push('---');
        sections.push('');
        sections.push('## 2. WAL Journal Entries (Kernel Operations)');
        sections.push('First 50 entries from wal.jsonl matching date range:');
        sections.push('```json');
        sections.push(data.walData.entries.length > 0 ? data.walData.entries.join('\n') : '[]');
        sections.push('```');
        sections.push('Operations breakdown:');
        sections.push(`- update_file: ${data.walData.derived.updateFile}`);
        sections.push(`- ledger updates: ${data.walData.derived.ledgerUpdates}`);
        sections.push(`- pattern/correlation/forecast writes: ${data.walData.derived.engineWrites}`);
        sections.push('');
        sections.push('---');
        sections.push('');
        sections.push('## 3. Diagnostic Runs (Shadow/Live Activation)');
        sections.push('### Shadow Runs');
        sections.push(...this.buildDiagnosticFilesList(data.diagnostics.shadow.files));
        sections.push(...this.buildDiagnosticTable(data.diagnostics.shadow.runs));
        sections.push('');
        sections.push('### Live Runs');
        sections.push(...this.buildDiagnosticFilesList(data.diagnostics.live.files));
        sections.push(...this.buildDiagnosticTable(data.diagnostics.live.runs));
        sections.push('');
        sections.push('---');
        sections.push('');
        sections.push('## 4. ADRs Created/Modified');
        if (data.adrSummaries.length === 0) {
            sections.push('No ADR proposals recorded in this range.');
        } else {
            sections.push(...data.adrSummaries.map(adr => `- ${adr.createdAt} • ${adr.id} — ${adr.title}${adr.pattern ? ` (pattern: ${adr.pattern})` : ''}`));
        }
        sections.push(`Count: ${data.adrSummaries.length}`);
        const uniquePatterns = Array.from(new Set(data.adrSummaries.map(adr => adr.pattern).filter(Boolean)));
        sections.push(`Patterns referenced: ${uniquePatterns.length > 0 ? uniquePatterns.join(', ') : 'none'}`);
        sections.push('');
        sections.push('---');
        sections.push('');
        sections.push('## 5. Context.RL4 State (If Modified in Range)');
        sections.push(`Last modified: ${data.contextSummary.updated || 'unknown'}`);
        sections.push(`State field: ${data.contextSummary.state || 'unknown'}`);
        sections.push('Recent Activity section (verbatim):');
        sections.push('```');
        sections.push(...(data.contextSummary.recentActivity.length > 0
            ? data.contextSummary.recentActivity
            : ['(No recent activity entries captured.)']));
        sections.push('```');
        sections.push('');
        sections.push('---');
        sections.push('');
        sections.push('## 6. Ledger State');
        if (data.ledgerState) {
            sections.push(`- safeMode: ${data.ledgerState.safeMode}`);
            sections.push(`- corruptionReason: ${data.ledgerState.corruptionReason ?? 'none'}`);
            sections.push(`- lastCycleMerkleRoot: ${data.ledgerState.lastCycleMerkleRoot ?? 'n/a'}`);
            sections.push(`- updated: ${data.ledgerState.updated ?? 'unknown'}`);
        } else {
            sections.push('No ledger state available.');
        }
        sections.push('');
        sections.push('---');
        sections.push('');
        sections.push('## 7. Files Modified (Filesystem Level)');
        sections.push('Files in .reasoning_rl4/ modified in date range:');
        sections.push('```');
        sections.push(data.modifiedFiles.length > 0 ? data.modifiedFiles.join('\n') : 'No files touched under .reasoning_rl4 in this range.');
        sections.push('```');
        sections.push('');
        sections.push('---');
        sections.push('');
        sections.push('## Question');
        sections.push(`What did we achieve between ${data.start.toISOString()} and ${data.end.toISOString()} and why?`);
        sections.push('');
        sections.push('Identify:');
        sections.push('1. **Accomplishments** — What was delivered/validated?');
        sections.push('2. **Risks detected** — Any degradation, SAFE MODE, failures?');
        sections.push('3. **Next priority action** — Based on Context.RL4 state and diagnostics.');

        const prompt = sections
            .filter(line => line !== null && line !== undefined)
            .map(line => line.trimEnd())
            .join('\n')
            .replace(/\n{3,}/g, '\n\n');

        const bytes = Buffer.byteLength(prompt, 'utf-8');
        if (bytes > 3500) {
            return `${prompt}\n\n> Note: prompt trimmed to stay within RL4 time-machine budget (${bytes} bytes).`;
        }
        return prompt;
    }

    private async loadTimelines(start: Date, end: Date): Promise<DailyTimeline[]> {
        const days: DailyTimeline[] = [];
        const cursor = new Date(start);
        while (cursor.getTime() <= end.getTime()) {
            const dateLabel = cursor.toISOString().split('T')[0];
            let timeline = this.timelineAggregator.load(dateLabel);
            if (!timeline) {
                try {
                    timeline = await this.timelineAggregator.generateTimeline(dateLabel);
                } catch (error) {
                    this.logger?.warning(`[TimeMachine] Failed to generate timeline ${dateLabel}: ${error instanceof Error ? error.message : error}`);
                }
            }
            if (timeline) {
                days.push(timeline);
            }
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        return days.slice(-MAX_SECTION_ITEMS);
    }

    private countCycles(start: Date, end: Date): number {
        const cyclesPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'ledger', 'cycles.jsonl');
        if (!fs.existsSync(cyclesPath)) {
            return 0;
        }
        const lines = fs.readFileSync(cyclesPath, 'utf-8').split('\n').filter(Boolean);
        let count = 0;
        for (const line of lines) {
            try {
                const cycle = JSON.parse(line);
                const ts = new Date(cycle.timestamp).getTime();
                if (ts >= start.getTime() && ts <= end.getTime()) {
                    count += 1;
                }
            } catch {
                continue;
            }
        }
        return count;
    }

    private countSafeModeEvents(start: Date, end: Date): number {
        const diagnosticsPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'diagnostics', 'ledger', 'safe-mode.jsonl');
        if (!fs.existsSync(diagnosticsPath)) {
            return 0;
        }
        const lines = fs.readFileSync(diagnosticsPath, 'utf-8').split('\n').filter(Boolean);
        let count = 0;
        for (const line of lines) {
            try {
                const event = JSON.parse(line);
                const ts = new Date(event.timestamp).getTime();
                if (ts >= start.getTime() && ts <= end.getTime()) {
                    count += 1;
                }
            } catch {
                continue;
            }
        }
        return count;
    }

    private computeAverageCognitiveLoad(timelines: DailyTimeline[]): number | undefined {
        if (timelines.length === 0) {
            return undefined;
        }
        const total = timelines.reduce((sum, tl) => sum + (tl.cognitive_load_avg || 0), 0);
        return total / timelines.length;
    }

    private collectGitActivity(start: Date, end: Date): GitActivityData {
        try {
            const startIso = this.getStartOfDay(start).toISOString();
            const untilIso = this.addDays(this.getEndOfDay(end), 1).toISOString();
            const output = execFileSync(
                'git',
                ['log', `--since=${startIso}`, `--until=${untilIso}`, '--format=%h %ad %s', '--date=short'],
                { cwd: this.workspaceRoot, encoding: 'utf8' }
            ).trim();
            const lines = output ? output.split('\n').filter(Boolean) : [];
            return {
                log: output || 'No git commits recorded in this range.',
                count: lines.length
            };
        } catch {
            // Git not available or not a repo — silently fallback
            return {
                log: '(No git repository detected — skipping git activity.)',
                count: 0
            };
        }
    }

    private collectWalData(start: Date, end: Date): WalData {
        const walPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'wal.jsonl');
        if (!fs.existsSync(walPath)) {
            return {
                entries: [],
                counts: {},
                derived: {
                    updateFile: 0,
                    ledgerUpdates: 0,
                    engineWrites: 0
                }
            };
        }
        const startMs = this.getStartOfDay(start).getTime();
        const endMs = this.getEndOfDay(end).getTime();
        const lines = fs.readFileSync(walPath, 'utf-8').split('\n').filter(Boolean);
        const selected: string[] = [];
        const counts: Record<string, number> = {};
        let ledgerUpdates = 0;
        let engineWrites = 0;
        let updateFile = 0;

        for (let i = lines.length - 1; i >= 0; i--) {
            if (selected.length >= MAX_WAL_ENTRIES) break;
            try {
                const entry = JSON.parse(lines[i]);
                const ts = new Date(entry.timestamp).getTime();
                if (Number.isNaN(ts) || ts < startMs || ts > endMs) {
                    continue;
                }
                selected.push(JSON.stringify(entry));
                const typeKey: string = entry.type || 'unknown';
                counts[typeKey] = (counts[typeKey] || 0) + 1;
                if (typeKey === 'update_file') {
                    updateFile += 1;
                    const filePath: string | undefined = entry.file || entry.data?.file;
                    if (filePath?.includes('/ledger/')) {
                        ledgerUpdates += 1;
                    }
                    if (filePath && /(patterns|correlations|forecasts)\.json$/i.test(filePath)) {
                        engineWrites += 1;
                    }
                }
            } catch {
                continue;
            }
        }

        return {
            entries: selected.reverse(),
            counts,
            derived: {
                updateFile,
                ledgerUpdates,
                engineWrites
            }
        };
    }

    private collectDiagnosticRuns(type: 'shadow' | 'live', start: Date, end: Date): DiagnosticRunData {
        const dir = path.join(this.workspaceRoot, '.reasoning_rl4', 'diagnostics', 'live-activation', type);
        if (!fs.existsSync(dir)) {
            return { files: [], runs: [] };
        }
        const startMs = this.getStartOfDay(start).getTime();
        const endMs = this.getEndOfDay(end).getTime();
        const files: string[] = [];
        const runs: ActivationRunSummary[] = [];

        for (const fileName of fs.readdirSync(dir)) {
            if (!fileName.endsWith('.json')) continue;
            const fullPath = path.join(dir, fileName);
            try {
                const contents = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
                const startedAt = contents.startedAt || contents.started_at;
                const ts = new Date(startedAt).getTime();
                if (Number.isNaN(ts) || ts < startMs || ts > endMs) {
                    continue;
                }
                files.push(path.relative(this.workspaceRoot, fullPath));
                runs.push(this.summarizeActivationRun(fileName, contents));
            } catch (error) {
                this.logger?.warning(`[TimeMachine] Failed to parse ${type} diagnostic ${fileName}: ${error instanceof Error ? error.message : error}`);
            }
        }

        runs.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
        files.sort();

        return { files, runs };
    }

    private summarizeActivationRun(label: string, run: any): ActivationRunSummary {
        const cycles: ActivationCycle[] = Array.isArray(run.cycles) ? (run.cycles as ActivationCycle[]) : [];
        const totalCycles = cycles.length;
        const llmCalls = cycles.reduce((sum, cycle) => sum + (cycle.llmCallCount || 0), 0);
        const successCount = cycles.reduce((sum, cycle) => sum + (cycle.llmSuccessCount || 0), 0);
        const successRate = llmCalls > 0 ? `${Math.round((successCount / llmCalls) * 100)}%` : 'n/a';
        const degradationFromRun = typeof run.degradationScoreMax === 'number' ? run.degradationScoreMax : undefined;
        const degradationMax = typeof degradationFromRun === 'number'
            ? degradationFromRun
            : cycles.reduce((max, cycle) => Math.max(max, typeof cycle.degradationScore === 'number' ? cycle.degradationScore : 0), 0);
        const latencyFromRun = typeof run.latencyP95Max === 'number' ? run.latencyP95Max : undefined;
        const latencyP95 = typeof latencyFromRun === 'number'
            ? latencyFromRun
            : cycles.reduce((max, cycle) => Math.max(max, typeof cycle.latencyP95Ms === 'number' ? cycle.latencyP95Ms : 0), 0);

        return {
            label,
            startedAt: run.startedAt || run.started_at || 'unknown',
            cycles: totalCycles,
            llmCalls,
            successRate,
            degradationMax: Number.isFinite(degradationMax) ? degradationMax : 0,
            latencyP95: Number.isFinite(latencyP95) ? latencyP95 : 0
        };
    }

    private collectAdrSummaries(start: Date, end: Date): AdrSummary[] {
        const dir = path.join(this.workspaceRoot, '.reasoning_rl4', 'adrs', 'auto');
        if (!fs.existsSync(dir)) {
            return [];
        }
        const startMs = this.getStartOfDay(start).getTime();
        const endMs = this.getEndOfDay(end).getTime();
        const summaries: AdrSummary[] = [];

        for (const fileName of fs.readdirSync(dir)) {
            if (!fileName.endsWith('.json')) continue;
            const fullPath = path.join(dir, fileName);
            try {
                const adr = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
                const createdAt = adr.createdAt || adr.proposedAt;
                const ts = new Date(createdAt).getTime();
                if (Number.isNaN(ts) || ts < startMs || ts > endMs) continue;
                summaries.push({
                    id: adr.id || fileName.replace('.json', ''),
                    createdAt,
                    title: adr.title || 'ADR',
                    pattern: Array.isArray(adr.tags) ? adr.tags[0] : undefined
                });
            } catch (error) {
                this.logger?.warning(`[TimeMachine] Failed to parse ADR ${fileName}: ${error instanceof Error ? error.message : error}`);
            }
        }

        return summaries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    private collectContextSnapshot(): ContextSnapshotData {
        const contextPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'governance', 'Context.RL4');
        if (!fs.existsSync(contextPath)) {
            return { recentActivity: [] };
        }
        const content = fs.readFileSync(contextPath, 'utf-8');
        const updatedMatch = content.match(/updated:\s*'([^']+)'/);
        const stateMatch = content.match(/state:\s*"([^"]+)"/);
        const recentActivity = this.extractSectionLines(content, '## Recent Activity');
        return {
            updated: updatedMatch ? updatedMatch[1] : undefined,
            state: stateMatch ? stateMatch[1] : undefined,
            recentActivity
        };
    }

    private collectLedgerState(): LedgerStateSummary | undefined {
        const statePath = path.join(this.workspaceRoot, '.reasoning_rl4', 'ledger', 'state.json');
        if (!fs.existsSync(statePath)) {
            return undefined;
        }
        try {
            const data = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
            return {
                safeMode: Boolean(data.safeMode),
                corruptionReason: data.corruptionReason ?? null,
                lastCycleMerkleRoot: data.lastCycleMerkleRoot,
                updated: data.updated
            };
        } catch (error) {
            this.logger?.warning(`[TimeMachine] Failed to read ledger state: ${error instanceof Error ? error.message : error}`);
            return undefined;
        }
    }

    private collectModifiedFiles(start: Date, end: Date): string[] {
        const root = path.join(this.workspaceRoot, '.reasoning_rl4');
        if (!fs.existsSync(root)) {
            return [];
        }
        const startMs = this.getStartOfDay(start).getTime();
        const endMs = this.getEndOfDay(end).getTime();
        const results: string[] = [];

        const walk = (dir: string) => {
            if (results.length >= MAX_FILE_RESULTS) {
                return;
            }
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(fullPath);
                } else if (entry.isFile()) {
                    try {
                        const stats = fs.statSync(fullPath);
                        const mtime = stats.mtime.getTime();
                        if (mtime >= startMs && mtime <= endMs) {
                            results.push(path.relative(this.workspaceRoot, fullPath));
                            if (results.length >= MAX_FILE_RESULTS) {
                                return;
                            }
                        }
                    } catch {
                        continue;
                    }
                }
            }
        };

        walk(root);
        return results.sort();
    }

    private buildDiagnosticFilesList(files: string[]): string[] {
        if (files.length === 0) {
            return ['No runs found in this range.'];
        }
        return files.map(file => `- ${file}`);
    }

    private buildDiagnosticTable(runs: ActivationRunSummary[]): string[] {
        if (runs.length === 0) {
            return ['No diagnostic runs recorded in this range.'];
        }
        const lines = [
            '| Run | Started | Cycles | LLM Calls | Success Rate | Degradation Max | Latency P95 |',
            '|-----|---------|--------|-----------|--------------|-----------------|-------------|'
        ];
        for (const run of runs) {
            lines.push(
                `| ${run.label} | ${run.startedAt} | ${run.cycles} | ${run.llmCalls} | ${run.successRate} | ${run.degradationMax.toFixed(3)} | ${run.latencyP95} |`
            );
        }
        return lines;
    }

    private extractSectionLines(content: string, header: string): string[] {
        const startIndex = content.indexOf(header);
        if (startIndex === -1) {
            return [];
        }
        const fromHeader = content.slice(startIndex + header.length);
        const nextHeaderIndex = fromHeader.indexOf('\n## ');
        const section = nextHeaderIndex >= 0 ? fromHeader.slice(0, nextHeaderIndex) : fromHeader;
        return section
            .split('\n')
            .map(line => line.trimEnd())
            .filter(line => line.trim().length > 0);
    }

    private getStartOfDay(date: Date): Date {
        const copy = new Date(date);
        copy.setUTCHours(0, 0, 0, 0);
        return copy;
    }

    private getEndOfDay(date: Date): Date {
        const copy = new Date(date);
        copy.setUTCHours(23, 59, 59, 999);
        return copy;
    }

    private addDays(date: Date, days: number): Date {
        const copy = new Date(date);
        copy.setUTCDate(copy.getUTCDate() + days);
        return copy;
    }

    private writeDiagnostics(data: {
        start: string;
        end: string;
        cyclesObserved: number;
        safeModeEvents: number;
        avgCognitiveLoad?: number;
        finalBytes: number;
    }) {
        try {
            const payload = {
                generated_at: new Date().toISOString(),
                format_version: 'v2',
                ...data
            };
            fs.writeFileSync(path.join(this.diagnosticsPath, 'latest.json'), JSON.stringify(payload, null, 2));
        } catch (error) {
            this.logger?.warning(`[TimeMachine] Failed to write diagnostics: ${error instanceof Error ? error.message : error}`);
        }
    }
}


