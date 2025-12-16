/**
 * RL4 Timeline Aggregator
 * 
 * Génère des timelines quotidiennes pré-agrégées pour affichage WebView.
 * Au lieu de forcer la WebView à reparser tous les cycles, on pré-calcule
 * l'état cognitif par heure pour chaque jour.
 * 
 * Fichiers générés: .reasoning_rl4/timelines/YYYY-MM-DD.json
 * 
 * Mise à jour: Toutes les 10 cycles (ou sur demande)
 */

import * as fs from 'fs';
import * as path from 'path';
import { RL4CacheIndexer } from './CacheIndex';

export interface HourlySnapshot {
    hour: number; // 0-23
    timestamp: string; // ISO 8601
    
    // Cognitive state
    pattern: string;
    pattern_confidence: number;
    forecast: string;
    forecast_confidence: number;
    intent: string;
    
    // Activity metrics
    cycles_count: number; // Nombre de cycles dans cette heure
    events_count: number; // Total events (patterns + forecasts)
    cognitive_load: number; // 0.0 - 1.0 (normalized)
    
    // Files context
    files: string[]; // Top 3 files modifiés dans cette heure
}

export interface DailyTimeline {
    date: string; // "YYYY-MM-DD"
    generated_at: string; // ISO timestamp
    total_cycles: number;
    total_events: number;
    cognitive_load_avg: number;
    
    // Hourly snapshots (0-23)
    hours: HourlySnapshot[];
    
    // Daily summary
    top_pattern: string;
    top_forecast: string;
    dominant_intent: string;
    most_active_hour: number;
}

export class TimelineAggregator {
    private workspaceRoot: string;
    private timelinesDir: string;
    private indexer: RL4CacheIndexer;
    
    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.timelinesDir = path.join(workspaceRoot, '.reasoning_rl4', 'timelines');
        this.indexer = new RL4CacheIndexer(workspaceRoot);
        
        // Ensure timelines directory exists
        if (!fs.existsSync(this.timelinesDir)) {
            fs.mkdirSync(this.timelinesDir, { recursive: true });
        }
    }
    
    /**
     * Generate timeline for a specific day
     * À appeler toutes les 10 cycles ou sur demande
     */
    async generateTimeline(date: string): Promise<DailyTimeline> {
        const timeline: DailyTimeline = {
            date,
            generated_at: new Date().toISOString(),
            total_cycles: 0,
            total_events: 0,
            cognitive_load_avg: 0,
            hours: [],
            top_pattern: '',
            top_forecast: '',
            dominant_intent: 'unknown',
            most_active_hour: 0
        };
        
        // Get all cycles for this day from cache index
        const cycleIds = this.indexer.getCyclesForDay(date);
        timeline.total_cycles = cycleIds.length;
        
        if (cycleIds.length === 0) {
            // No cycles for this day, return empty timeline
            this.save(timeline);
            return timeline;
        }
        
        // Load cycles from cycles.jsonl
        const cycles = await this.loadCycles(cycleIds);
        
        // Group cycles by hour
        const cyclesByHour = new Map<number, any[]>();
        for (let hour = 0; hour < 24; hour++) {
            cyclesByHour.set(hour, []);
        }
        
        for (const cycle of cycles) {
            const timestamp = cycle.timestamp || cycle._timestamp;
            const hour = new Date(timestamp).getHours();
            cyclesByHour.get(hour)!.push(cycle);
        }
        
        // Build hourly snapshots
        const patternCounts = new Map<string, number>();
        const forecastCounts = new Map<string, number>();
        const intentCounts = new Map<string, number>();
        let mostActiveHour = 0;
        let maxCyclesInHour = 0;
        
        for (let hour = 0; hour < 24; hour++) {
            const hourCycles = cyclesByHour.get(hour)!;
            
            if (hourCycles.length === 0) {
                timeline.hours.push({
                    hour,
                    timestamp: `${date}T${hour.toString().padStart(2, '0')}:00:00Z`,
                    pattern: '',
                    pattern_confidence: 0,
                    forecast: '',
                    forecast_confidence: 0,
                    intent: 'none',
                    cycles_count: 0,
                    events_count: 0,
                    cognitive_load: 0,
                    files: []
                });
                continue;
            }
            
            // Track most active hour
            if (hourCycles.length > maxCyclesInHour) {
                maxCyclesInHour = hourCycles.length;
                mostActiveHour = hour;
            }
            
            // Aggregate events
            let eventsCount = 0;
            for (const cycle of hourCycles) {
                eventsCount += (cycle.phases?.patterns?.count || 0) + (cycle.phases?.forecasts?.count || 0);
            }
            timeline.total_events += eventsCount;
            
            // Calculate cognitive load (normalized)
            const cognitiveLoad = Math.min(hourCycles.length / 360, 1.0);
            
            // Get latest cycle timestamp for this hour
            const latestCycle = hourCycles[hourCycles.length - 1];
            const latestTimestamp = latestCycle.timestamp || latestCycle._timestamp;
            
            // Load pattern, forecast, intent for this hour
            const pattern = await this.loadPatternAt(latestTimestamp);
            const forecast = await this.loadForecastAt(latestTimestamp);
            const intent = await this.loadIntentAt(latestTimestamp);
            const files = await this.loadFilesAt(latestTimestamp);
            
            // Track patterns/forecasts/intents for daily summary
            if (pattern.text) {
                patternCounts.set(pattern.text, (patternCounts.get(pattern.text) || 0) + 1);
            }
            if (forecast.text) {
                forecastCounts.set(forecast.text, (forecastCounts.get(forecast.text) || 0) + 1);
            }
            if (intent) {
                intentCounts.set(intent, (intentCounts.get(intent) || 0) + 1);
            }
            
            timeline.hours.push({
                hour,
                timestamp: latestTimestamp,
                pattern: pattern.text,
                pattern_confidence: pattern.confidence,
                forecast: forecast.text,
                forecast_confidence: forecast.confidence,
                intent: intent,
                cycles_count: hourCycles.length,
                events_count: eventsCount,
                cognitive_load: cognitiveLoad,
                files: files.slice(0, 3)
            });
        }
        
        // Calculate average cognitive load
        timeline.cognitive_load_avg = timeline.hours.reduce((sum, h) => sum + h.cognitive_load, 0) / 24;
        
        // Determine top pattern, forecast, intent
        timeline.top_pattern = this.getMostFrequent(patternCounts);
        timeline.top_forecast = this.getMostFrequent(forecastCounts);
        timeline.dominant_intent = this.getMostFrequent(intentCounts);
        timeline.most_active_hour = mostActiveHour;
        
        // Save timeline
        this.save(timeline);
        
        return timeline;
    }
    
    /**
     * Generate timeline for today
     */
    async generateToday(): Promise<DailyTimeline> {
        const today = new Date().toISOString().split('T')[0];
        return this.generateTimeline(today);
    }
    
    /**
     * Load cycles from cycles.jsonl
     */
    private async loadCycles(cycleIds: number[]): Promise<any[]> {
        const cyclesPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'ledger', 'cycles.jsonl');
        if (!fs.existsSync(cyclesPath)) {
            return [];
        }
        
        const content = fs.readFileSync(cyclesPath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        const cycles: any[] = [];
        
        for (const line of lines) {
            try {
                const cycle = JSON.parse(line);
                if (cycleIds.includes(cycle.cycleId)) {
                    cycles.push(cycle);
                }
            } catch (e) {
                // Skip invalid lines
            }
        }
        
        // Sort by cycleId
        cycles.sort((a, b) => a.cycleId - b.cycleId);
        
        return cycles;
    }
    
    /**
     * Load pattern at specific timestamp
     */
    private async loadPatternAt(timestamp: string): Promise<{ text: string; confidence: number }> {
        const patternsPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'patterns.json');
        if (!fs.existsSync(patternsPath)) {
            return { text: '', confidence: 0 };
        }
        
        try {
            const content = fs.readFileSync(patternsPath, 'utf-8');
            const data = JSON.parse(content);
            if (data.patterns && Array.isArray(data.patterns) && data.patterns.length > 0) {
                // Get pattern with highest confidence
                const topPattern = data.patterns.reduce((max: any, p: any) => 
                    p.confidence > max.confidence ? p : max
                );
                return { text: topPattern.pattern, confidence: topPattern.confidence || 0 };
            }
        } catch (e) {
            // Ignore errors
        }
        
        return { text: '', confidence: 0 };
    }
    
    /**
     * Load forecast at specific timestamp
     */
    private async loadForecastAt(timestamp: string): Promise<{ text: string; confidence: number }> {
        const forecastsPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'forecasts.json');
        if (!fs.existsSync(forecastsPath)) {
            return { text: '', confidence: 0 };
        }
        
        try {
            const content = fs.readFileSync(forecastsPath, 'utf-8');
            const forecasts = JSON.parse(content);
            if (Array.isArray(forecasts) && forecasts.length > 0) {
                // Get forecast with highest confidence
                const topForecast = forecasts.reduce((max: any, f: any) => 
                    f.confidence > max.confidence ? f : max
                );
                return { text: topForecast.predicted_decision || '', confidence: topForecast.confidence || 0 };
            }
        } catch (e) {
            // Ignore errors
        }
        
        return { text: '', confidence: 0 };
    }
    
    /**
     * Load intent at specific timestamp
     */
    private async loadIntentAt(timestamp: string): Promise<string> {
        const gitCommitsPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'traces', 'git_commits.jsonl');
        if (!fs.existsSync(gitCommitsPath)) {
            return 'unknown';
        }
        
        try {
            const content = fs.readFileSync(gitCommitsPath, 'utf-8');
            const lines = content.split('\n').filter(l => l.trim());
            const targetTime = new Date(timestamp).getTime();
            let closestIntent = 'unknown';
            let minTimeDiff = Infinity;
            
            for (const line of lines) {
                try {
                    const commit = JSON.parse(line);
                    const commitTime = new Date(commit.timestamp || commit._timestamp).getTime();
                    const timeDiff = targetTime - commitTime;
                    
                    if (timeDiff >= 0 && timeDiff < minTimeDiff) {
                        minTimeDiff = timeDiff;
                        closestIntent = commit.metadata?.intent?.type || 'unknown';
                    }
                } catch (e) {
                    // Skip invalid lines
                }
            }
            
            return closestIntent;
        } catch (e) {
            // Ignore errors
        }
        
        return 'unknown';
    }
    
    /**
     * Load files at specific timestamp
     */
    private async loadFilesAt(timestamp: string): Promise<string[]> {
        const fileChangesPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'traces', 'file_changes.jsonl');
        if (!fs.existsSync(fileChangesPath)) {
            return [];
        }
        
        try {
            const content = fs.readFileSync(fileChangesPath, 'utf-8');
            const lines = content.split('\n').filter(l => l.trim());
            const targetTime = new Date(timestamp).getTime();
            const oneHour = 60 * 60 * 1000;
            const files = new Set<string>();
            
            for (const line of lines) {
                try {
                    const change = JSON.parse(line);
                    const changeTime = new Date(change.timestamp || change._timestamp).getTime();
                    
                    if (Math.abs(targetTime - changeTime) < oneHour) {
                        const changes = change.metadata?.changes || [];
                        for (const chg of changes) {
                            if (chg.path) {
                                files.add(chg.path);
                            }
                        }
                    }
                } catch (e) {
                    // Skip invalid lines
                }
            }
            
            return Array.from(files).slice(0, 5);
        } catch (e) {
            // Ignore errors
        }
        
        return [];
    }
    
    /**
     * Get most frequent item from map
     */
    private getMostFrequent(map: Map<string, number>): string {
        if (map.size === 0) {
            return '';
        }
        
        let maxCount = 0;
        let mostFrequent = '';
        
        for (const [item, count] of map.entries()) {
            if (count > maxCount) {
                maxCount = count;
                mostFrequent = item;
            }
        }
        
        return mostFrequent;
    }
    
    /**
     * Save timeline to disk
     */
    private save(timeline: DailyTimeline): void {
        const filePath = path.join(this.timelinesDir, `${timeline.date}.json`);
        fs.writeFileSync(filePath, JSON.stringify(timeline, null, 2));
    }
    
    /**
     * Load timeline from disk
     */
    load(date: string): DailyTimeline | null {
        const filePath = path.join(this.timelinesDir, `${date}.json`);
        if (!fs.existsSync(filePath)) {
            return null;
        }
        
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(content);
        } catch (e) {
            console.error(`Failed to load timeline for ${date}:`, e);
            return null;
        }
    }
    
    /**
     * List all available timelines
     */
    listTimelines(): string[] {
        if (!fs.existsSync(this.timelinesDir)) {
            return [];
        }
        
        return fs.readdirSync(this.timelinesDir)
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''))
            .sort();
    }
}
