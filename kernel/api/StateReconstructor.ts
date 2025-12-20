import * as fs from 'fs';
import * as path from 'path';
import { SnapshotRotation, CognitiveSnapshot } from '../indexer/SnapshotRotation';
import { RL4CacheIndexer } from '../indexer/CacheIndex';

export interface FullContextSnapshot {
    generatedAt: string;
    plan: string | null;
    tasks: string | null;
    context: string | null;
    adrs: any[];
    traces: {
        fileChanges: any[];
        gitCommits: any[];
        terminalEvents: any[];
        ideActivity: any[];
        buildMetrics: any[];
    };
    ledger: {
        cycles: Array<{ cycleId?: number; mode?: string }>;
        totalCycles: number;
        lastCycleId: number;
    };
    stats: {
        fileChanges: number;
        gitCommits: number;
        terminalEvents: number;
        ideActivity: number;
        buildMetrics: number;
    };
    diagnostics: {
        durationMs: number;
        approxBytes?: number;
    };
    metadata: {
        workspaceRoot: string;
        rl4Path?: string;
    };
    llmFeedback?: any;
}

export interface CognitiveState {
    timestamp: string;
    cycle: number;
    mode: 'approximate' | 'precise';
    
    // Cognitive data
    patterns: any[];
    forecasts: any[];
    correlations: any[];
    cognitive_load: number;
    
    // Context
    git_context: {
        last_commit: string;
        time_since_commit_sec: number;
        commits_since_snapshot: number;
    };
    files_active: string[];
    
    // Metadata
    reconstructed_from: 'snapshot' | 'interpolation';
    confidence: number; // How accurate is this reconstruction
}

export interface TimeSeriesData {
    metric: string;
    from: string;
    to: string;
    data_points: Array<{ timestamp: string; value: number }>;
}

export class StateReconstructor {
    private workspaceRoot: string;
    private snapshotRotation: SnapshotRotation;
    private cacheIndexer: RL4CacheIndexer;
    
    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.snapshotRotation = new SnapshotRotation(workspaceRoot);
        this.cacheIndexer = new RL4CacheIndexer(workspaceRoot);
    }
    
    /**
     * Reconstruct cognitive state at specific timestamp
     * 
     * @param timestamp - ISO timestamp to reconstruct
     * @param mode - 'approximate' (fast, use closest snapshot) or 'precise' (slow, interpolate)
     */
    public async reconstructAt(
        timestamp: string, 
        mode: 'approximate' | 'precise' = 'approximate'
    ): Promise<CognitiveState> {
        
        if (mode === 'approximate') {
            return this.reconstructApproximate(timestamp);
        } else {
            return this.reconstructPrecise(timestamp);
        }
    }
    
    /**
     * Approximate reconstruction: Use closest snapshot
     */
    private async reconstructApproximate(timestamp: string): Promise<CognitiveState> {
        // Find closest snapshot
        const closestCycle = this.snapshotRotation.findClosestSnapshot(timestamp);
        
        if (!closestCycle) {
            // No snapshots yet, reconstruct from scratch
            return this.reconstructFromScratch(timestamp);
        }
        
        // Load snapshot
        const snapshot = await this.snapshotRotation.loadSnapshot(closestCycle);
        
        if (!snapshot) {
            return this.reconstructFromScratch(timestamp);
        }
        
        // Convert snapshot to CognitiveState
        return {
            timestamp: snapshot.timestamp,
            cycle: snapshot.snapshot_id,
            mode: 'approximate',
            patterns: snapshot.patterns,
            forecasts: snapshot.forecasts,
            correlations: snapshot.correlations,
            cognitive_load: snapshot.cognitive_load,
            git_context: {
                ...snapshot.git_context,
                commits_since_snapshot: 0 // Unknown in approximate mode
            },
            files_active: snapshot.files_active,
            reconstructed_from: 'snapshot',
            confidence: 0.95 // High confidence (direct snapshot)
        };
    }
    
    /**
     * Precise reconstruction: Interpolate from multiple sources
     */
    private async reconstructPrecise(timestamp: string): Promise<CognitiveState> {
        // 1. Find closest cycle
        const cycle = await this.findClosestCycle(timestamp);
        
        if (!cycle) {
            return this.reconstructFromScratch(timestamp);
        }
        
        // 2. Load snapshot (base state)
        const closestSnapshotCycle = Math.floor(cycle / 100) * 100;
        const snapshot = await this.snapshotRotation.loadSnapshot(closestSnapshotCycle);
        
        // 3. Load patterns evolution to interpolate
        const patternsAtTime = await this.getPatternsAt(timestamp);
        
        // 4. Load git context
        const gitContext = await this.getGitContextAt(timestamp);
        
        // 5. Load cognitive load from timeline
        const cognitiveLoad = await this.getCognitiveLoadAt(timestamp);
        
        // 6. Load active files
        const filesActive = await this.getFilesAt(timestamp);
        
        return {
            timestamp,
            cycle,
            mode: 'precise',
            patterns: patternsAtTime,
            forecasts: snapshot?.forecasts || [],
            correlations: snapshot?.correlations || [],
            cognitive_load: cognitiveLoad,
            git_context: {
                ...gitContext,
                commits_since_snapshot: await this.countCommitsSince(closestSnapshotCycle, cycle)
            },
            files_active: filesActive,
            reconstructed_from: 'interpolation',
            confidence: 0.80 // Good confidence (interpolated)
        };
    }
    
    /**
     * Reconstruct from scratch (no snapshots available)
     */
    private async reconstructFromScratch(timestamp: string): Promise<CognitiveState> {
        const cycle = await this.findClosestCycle(timestamp) || 0;
        
        return {
            timestamp,
            cycle,
            mode: 'approximate',
            patterns: [],
            forecasts: [],
            correlations: [],
            cognitive_load: 0,
            git_context: {
                last_commit: '',
                time_since_commit_sec: 0,
                commits_since_snapshot: 0
            },
            files_active: [],
            reconstructed_from: 'interpolation',
            confidence: 0.30 // Low confidence (no data)
        };
    }
    
    /**
     * Get metric evolution over time range
     */
    public async getMetricEvolution(
        metric: 'cognitive_load' | 'pattern_confidence' | 'forecast_count',
        from: string,
        to: string
    ): Promise<TimeSeriesData> {
        
        const dataPoints: Array<{ timestamp: string; value: number }> = [];
        
        if (metric === 'cognitive_load') {
            dataPoints.push(...await this.getCognitiveLoadSeries(from, to));
        } else if (metric === 'pattern_confidence') {
            dataPoints.push(...await this.getPatternConfidenceSeries(from, to));
        } else if (metric === 'forecast_count') {
            dataPoints.push(...await this.getForecastCountSeries(from, to));
        }
        
        return {
            metric,
            from,
            to,
            data_points: dataPoints
        };
    }
    
    /**
     * Find closest snapshot to timestamp
     */
    public async findClosestSnapshot(timestamp: string): Promise<CognitiveSnapshot | null> {
        const closestCycle = this.snapshotRotation.findClosestSnapshot(timestamp);
        
        if (!closestCycle) {
            return null;
        }
        
        return this.snapshotRotation.loadSnapshot(closestCycle);
    }
    
    // Private helpers
    
    private async findClosestCycle(timestamp: string): Promise<number | null> {
        const cyclesPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'ledger', 'cycles.jsonl');
        
        if (!fs.existsSync(cyclesPath)) {
            return null;
        }
        
        const lines = fs.readFileSync(cyclesPath, 'utf-8').split('\n').filter(Boolean);
        const targetTime = new Date(timestamp).getTime();
        
        let closestCycle: number | null = null;
        let minDiff = Infinity;
        
        for (const line of lines) {
            try {
                const cycle = JSON.parse(line);
                const cycleTime = new Date(cycle.timestamp).getTime();
                const diff = Math.abs(targetTime - cycleTime);
                
                if (diff < minDiff) {
                    minDiff = diff;
                    closestCycle = cycle.cycleId;
                }
            } catch (e) {
                // Skip invalid lines
            }
        }
        
        return closestCycle;
    }
    
    private async getPatternsAt(timestamp: string): Promise<any[]> {
        // For precise mode, would load patterns_evolution.jsonl and find state at timestamp
        // For now, return current patterns (optimization: implement interpolation later)
        const patternsPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'patterns.json');
        
        if (!fs.existsSync(patternsPath)) {
            return [];
        }
        
        try {
            const data = JSON.parse(fs.readFileSync(patternsPath, 'utf-8'));
            return data.patterns || [];
        } catch (e) {
            return [];
        }
    }
    
    private async getGitContextAt(timestamp: string): Promise<{ last_commit: string; time_since_commit_sec: number }> {
        const commitsPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'traces', 'git_commits.jsonl');
        
        if (!fs.existsSync(commitsPath)) {
            return { last_commit: '', time_since_commit_sec: 0 };
        }
        
        const lines = fs.readFileSync(commitsPath, 'utf-8').split('\n').filter(Boolean);
        const targetTime = new Date(timestamp).getTime();
        
        // Find last commit before timestamp
        let lastCommit: any = null;
        
        for (const line of lines) {
            try {
                const commit = JSON.parse(line);
                const commitTime = new Date(commit.timestamp).getTime();
                
                if (commitTime <= targetTime) {
                    if (!lastCommit || commitTime > new Date(lastCommit.timestamp).getTime()) {
                        lastCommit = commit;
                    }
                }
            } catch (e) {
                // Skip
            }
        }
        
        if (!lastCommit) {
            return { last_commit: '', time_since_commit_sec: 0 };
        }
        
        const timeSince = Math.floor((targetTime - new Date(lastCommit.timestamp).getTime()) / 1000);
        
        return {
            last_commit: lastCommit.hash || lastCommit.metadata?.hash || '',
            time_since_commit_sec: timeSince
        };
    }
    
    private async getCognitiveLoadAt(timestamp: string): Promise<number> {
        const date = timestamp.split('T')[0];
        const hour = parseInt(timestamp.split('T')[1].substring(0, 2));
        
        const timelinePath = path.join(this.workspaceRoot, '.reasoning_rl4', 'timelines', `${date}.json`);
        
        if (!fs.existsSync(timelinePath)) {
            return 0;
        }
        
        try {
            const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf-8'));
            const hourData = timeline.hours.find((h: any) => h.hour === hour);
            
            return hourData?.cognitive_load || 0;
        } catch (e) {
            return 0;
        }
    }
    
    private async getFilesAt(timestamp: string): Promise<string[]> {
        const changesPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'traces', 'file_changes.jsonl');
        
        if (!fs.existsSync(changesPath)) {
            return [];
        }
        
        const lines = fs.readFileSync(changesPath, 'utf-8').split('\n').filter(Boolean);
        const targetTime = new Date(timestamp).getTime();
        const windowMs = 3600000; // 1 hour window
        
        const filesSet = new Set<string>();
        
        for (const line of lines) {
            try {
                const change = JSON.parse(line);
                const changeTime = new Date(change.timestamp).getTime();
                const diff = Math.abs(targetTime - changeTime);
                
                if (diff < windowMs) {
                    for (const c of change.metadata?.changes || []) {
                        filesSet.add(c.path);
                    }
                }
            } catch (e) {
                // Skip
            }
        }
        
        return Array.from(filesSet).slice(0, 5);
    }
    
    private async countCommitsSince(fromCycle: number, toCycle: number): Promise<number> {
        const commitsPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'traces', 'git_commits.jsonl');
        
        if (!fs.existsSync(commitsPath)) {
            return 0;
        }
        
        // Approximate: count all commits (would need cycle timestamps for precise)
        const lines = fs.readFileSync(commitsPath, 'utf-8').split('\n').filter(Boolean);
        return Math.min(lines.length, toCycle - fromCycle);
    }
    
    private async getCognitiveLoadSeries(from: string, to: string): Promise<Array<{ timestamp: string; value: number }>> {
        const dataPoints: Array<{ timestamp: string; value: number }> = [];
        
        // Load all timelines in range
        const fromDate = new Date(from);
        const toDate = new Date(to);
        
        const timelinesDir = path.join(this.workspaceRoot, '.reasoning_rl4', 'timelines');
        
        if (!fs.existsSync(timelinesDir)) {
            return [];
        }
        
        const files = fs.readdirSync(timelinesDir).filter(f => f.endsWith('.json'));
        
        for (const file of files) {
            const date = file.replace('.json', '');
            const fileDate = new Date(date);
            
            if (fileDate >= fromDate && fileDate <= toDate) {
                const timeline = JSON.parse(fs.readFileSync(path.join(timelinesDir, file), 'utf-8'));
                
                for (const hour of timeline.hours) {
                    if (hour.cognitive_load > 0) {
                        dataPoints.push({
                            timestamp: hour.timestamp,
                            value: hour.cognitive_load
                        });
                    }
                }
            }
        }
        
        return dataPoints.sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
    }
    
    private async getPatternConfidenceSeries(from: string, to: string): Promise<Array<{ timestamp: string; value: number }>> {
        const evolutionPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'history', 'patterns_evolution.jsonl');
        
        if (!fs.existsSync(evolutionPath)) {
            return [];
        }
        
        const lines = fs.readFileSync(evolutionPath, 'utf-8').split('\n').filter(Boolean);
        const fromTime = new Date(from).getTime();
        const toTime = new Date(to).getTime();
        
        const dataPoints: Array<{ timestamp: string; value: number }> = [];
        
        for (const line of lines) {
            try {
                const evolution = JSON.parse(line);
                const entryData = evolution.metadata || evolution;
                const entryTime = new Date(entryData.timestamp).getTime();
                
                if (entryTime >= fromTime && entryTime <= toTime) {
                    dataPoints.push({
                        timestamp: entryData.timestamp,
                        value: entryData.confidence
                    });
                }
            } catch (e) {
                // Skip invalid
            }
        }
        
        return dataPoints;
    }
    
    private async getForecastCountSeries(_from: string, _to: string): Promise<Array<{ timestamp: string; value: number }>> {
        // Would need forecasts_evolution.jsonl (similar to patterns)
        // For now, return empty (optimization: implement later)
        return [];
    }
}


