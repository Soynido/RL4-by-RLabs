/**
 * FeedbackEvaluator - Phase E2 Component
 * 
 * Computes real feedback metrics from actual system performance:
 * - Forecast accuracy (predictions vs. reality)
 * - Pattern stability (longevity over cycles)
 * - ADR adoption rate (reuse vs. novel decisions)
 * - Cycle efficiency (latency, throughput)
 */

import * as fs from 'fs';
import * as path from 'path';
import { Forecast } from './types';

interface ADR {
    id: string;
    title: string;
    category?: string;
    createdAt?: string;
    timestamp?: string;
}

interface ForecastExtended {
    id: string;
    category?: string;
    timestamp?: string;
    created_at?: string;
    title?: string;
}

interface CycleEntry {
    cycleId: number;
    timestamp: string;
    phases: {
        patterns: { count: number };
        correlations: { count: number };
        forecasts: { count: number };
        adrs: { count: number };
    };
}

interface FeedbackMetrics {
    forecast_accuracy: number;
    pattern_stability: number;
    adr_adoption_rate: number;
    cycle_efficiency: number;
    total_cycles_analyzed: number;
    last_evaluation: string;
}

export class FeedbackEvaluator {
    private workspaceRoot: string;
    private cyclesPath: string;
    private adrsPath: string;
    private forecastsPath: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.cyclesPath = path.join(workspaceRoot, '.reasoning_rl4', 'ledger', 'cycles.jsonl');
        this.adrsPath = path.join(workspaceRoot, '.reasoning_rl4', 'adrs', 'auto');
        this.forecastsPath = path.join(workspaceRoot, '.reasoning_rl4', 'forecasts.json');
    }

    /**
     * Phase E2: Compute real forecast accuracy
     * 
     * Compares forecasts at cycle N with ADRs generated at cycle N+1 or N+2.
     * If forecast category matches ADR category → true positive
     * 
     * @param windowSize - Number of recent cycles to analyze
     * @returns Accuracy score (0.0 - 1.0)
     */
    public async computeForecastAccuracy(windowSize: number = 100): Promise<number> {
        try {
            // Load recent forecasts
            const forecasts = await this.loadForecasts();
            if (!forecasts || forecasts.length === 0) {
                console.log('⚠️ No forecasts available for accuracy computation');
                return 0.5; // Neutral baseline if no data
            }

            // Load ADRs
            const adrs = await this.loadADRs();
            if (!adrs || adrs.length === 0) {
                console.log('⚠️ No ADRs available for accuracy computation');
                return 0.5; // Neutral baseline if no data
            }

            // Match forecasts with subsequent ADRs
            let matches = 0;
            let total = 0;

            for (const forecast of forecasts.slice(-windowSize)) {
                total++;
                
                // Check if any ADR created after this forecast matches its category
                const forecastAny = forecast as any;
                const forecastTimeStr = forecastAny.timestamp || forecastAny.created_at;
                if (!forecastTimeStr) continue;
                
                const forecastTime = new Date(forecastTimeStr).getTime();
                
                const matchingADR = adrs.find(adr => {
                    const adrTimeStr = adr.createdAt || adr.timestamp;
                    if (!adrTimeStr) return false;
                    
                    const adrTime = new Date(adrTimeStr).getTime();
                    const timeDelta = adrTime - forecastTime;
                    
                    // ADR should be created within 24 hours after forecast
                    if (timeDelta > 0 && timeDelta < 86400000) {
                        // Category match (fuzzy)
                        const forecastCat = (forecastAny.category || forecastAny.title || forecastAny.predicted_decision || '').toLowerCase();
                        const adrCat = (adr.category || adr.title || '').toLowerCase();
                        
                        return adrCat.includes(forecastCat) || forecastCat.includes(adrCat);
                    }
                    return false;
                });

                if (matchingADR) {
                    matches++;
                }
            }

            const accuracy = total > 0 ? matches / total : 0.5;
            console.log(`📊 Forecast Accuracy: ${matches}/${total} = ${(accuracy * 100).toFixed(1)}%`);
            
            return accuracy;
            
        } catch (error) {
            console.error('❌ Failed to compute forecast accuracy:', error);
            return 0.5; // Neutral baseline on error
        }
    }

    /**
     * Phase E2: Compute pattern stability
     * 
     * Measures average longevity of patterns across cycles.
     * Stable patterns should persist for multiple cycles.
     * 
     * @param windowSize - Number of cycles to analyze
     * @returns Stability score (0.0 - 1.0)
     */
    public async computePatternStability(windowSize: number = 500): Promise<number> {
        try {
            const cycles = await this.loadCycles(windowSize);
            if (!cycles || cycles.length < 2) {
                return 0.5; // Neutral if insufficient data
            }

            // Calculate average pattern count
            const avgPatternCount = cycles.reduce((sum, c) => sum + c.phases.patterns.count, 0) / cycles.length;
            
            // Calculate variance
            const variance = cycles.reduce((sum, c) => {
                const diff = c.phases.patterns.count - avgPatternCount;
                return sum + (diff * diff);
            }, 0) / cycles.length;

            const stdDev = Math.sqrt(variance);
            
            // Low variance = high stability
            // Normalize to 0-1 range (assuming stdDev < 5 is stable)
            const stability = Math.max(0, 1 - (stdDev / 5));
            
            console.log(`🧠 Pattern Stability: ${(stability * 100).toFixed(1)}% (σ=${stdDev.toFixed(2)})`);
            
            return stability;
            
        } catch (error) {
            console.error('❌ Failed to compute pattern stability:', error);
            return 0.5;
        }
    }

    /**
     * Phase E2: Compute ADR adoption rate
     * 
     * Measures ratio of novel decisions vs. repeated decisions.
     * High adoption rate = system is not stuck in loops.
     * 
     * @returns Adoption rate (0.0 - 1.0)
     */
    public async computeADRAdoptionRate(): Promise<number> {
        try {
            const adrs = await this.loadADRs();
            if (!adrs || adrs.length < 2) {
                return 0.5; // Neutral if insufficient data
            }

            // Detect duplicate titles (fuzzy match)
            const uniqueTitles = new Set<string>();
            let duplicates = 0;

            for (const adr of adrs) {
                const normalizedTitle = adr.title.toLowerCase().replace(/[^a-z0-9]/g, '');
                
                if (uniqueTitles.has(normalizedTitle)) {
                    duplicates++;
                } else {
                    uniqueTitles.add(normalizedTitle);
                }
            }

            const adoptionRate = (adrs.length - duplicates) / adrs.length;
            console.log(`📝 ADR Adoption Rate: ${uniqueTitles.size}/${adrs.length} unique = ${(adoptionRate * 100).toFixed(1)}%`);
            
            return adoptionRate;
            
        } catch (error) {
            console.error('❌ Failed to compute ADR adoption rate:', error);
            return 0.5;
        }
    }

    /**
     * Phase E2: Compute cycle efficiency
     * 
     * Measures average cycle latency and throughput.
     * Lower latency = higher efficiency.
     * 
     * @param windowSize - Number of cycles to analyze
     * @returns Efficiency score (0.0 - 1.0)
     */
    public async computeCycleEfficiency(windowSize: number = 100): Promise<number> {
        try {
            const cycles = await this.loadCycles(windowSize);
            if (!cycles || cycles.length === 0) {
                return 0.5; // Neutral if no data
            }

            // Calculate average time between cycles
            const timestamps = cycles.map(c => new Date(c.timestamp).getTime());
            const intervals: number[] = [];

            for (let i = 1; i < timestamps.length; i++) {
                intervals.push(timestamps[i] - timestamps[i - 1]);
            }

            const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
            
            // Target: 10s interval = 100% efficiency
            // 20s interval = 50% efficiency
            const targetInterval = 10000; // 10s
            const efficiency = Math.min(1, targetInterval / avgInterval);
            
            console.log(`⚡ Cycle Efficiency: ${(efficiency * 100).toFixed(1)}% (avg ${(avgInterval / 1000).toFixed(1)}s)`);
            
            return efficiency;
            
        } catch (error) {
            console.error('❌ Failed to compute cycle efficiency:', error);
            return 0.5;
        }
    }

    /**
     * Phase E2: Compute comprehensive feedback metrics
     * 
     * Combines all metrics into a single feedback score.
     * 
     * @returns Comprehensive feedback metrics
     */
    public async computeComprehensiveFeedback(): Promise<FeedbackMetrics> {
        console.log('\n📊 Computing comprehensive feedback metrics...');

        const [accuracy, stability, adoption, efficiency] = await Promise.all([
            this.computeForecastAccuracy(100),
            this.computePatternStability(500),
            this.computeADRAdoptionRate(),
            this.computeCycleEfficiency(100)
        ]);

        // Weighted average (can be adjusted)
        const weights = {
            accuracy: 0.4,    // Most important
            stability: 0.2,
            adoption: 0.2,
            efficiency: 0.2
        };

        const composite = 
            (accuracy * weights.accuracy) +
            (stability * weights.stability) +
            (adoption * weights.adoption) +
            (efficiency * weights.efficiency);

        const cycles = await this.loadCycles();
        
        return {
            forecast_accuracy: accuracy,
            pattern_stability: stability,
            adr_adoption_rate: adoption,
            cycle_efficiency: efficiency,
            total_cycles_analyzed: cycles?.length || 0,
            last_evaluation: new Date().toISOString()
        };
    }

    /**
     * Load recent cycles from ledger
     */
    private async loadCycles(limit?: number): Promise<CycleEntry[]> {
        if (!fs.existsSync(this.cyclesPath)) {
            return [];
        }

        // Filter out Git conflict markers
        const isGitConflictMarker = (line: string): boolean => {
            const trimmed = line.trim();
            return trimmed.startsWith('<<<<<<<') || 
                   trimmed.startsWith('=======') || 
                   trimmed.startsWith('>>>>>>>') ||
                   trimmed.includes('<<<<<<< Updated upstream') ||
                   trimmed.includes('>>>>>>> Stashed changes');
        };

        const content = fs.readFileSync(this.cyclesPath, 'utf-8');
        const lines = content.trim().split('\n').filter(l => l.trim());
        
        const cycles = lines
            .filter(line => !isGitConflictMarker(line)) // Remove Git conflict markers
            .map(line => {
                try {
                    return JSON.parse(line) as CycleEntry;
                } catch {
                    return null;
                }
            })
            .filter((c): c is CycleEntry => c !== null);

        return limit ? cycles.slice(-limit) : cycles;
    }

    /**
     * Load forecasts
     */
    private async loadForecasts(): Promise<Forecast[]> {
        if (!fs.existsSync(this.forecastsPath)) {
            return [];
        }

        try {
            const content = fs.readFileSync(this.forecastsPath, 'utf-8');
            return JSON.parse(content) as Forecast[];
        } catch {
            return [];
        }
    }

    /**
     * Load ADRs from auto directory
     */
    private async loadADRs(): Promise<ADR[]> {
        if (!fs.existsSync(this.adrsPath)) {
            return [];
        }

        const files = fs.readdirSync(this.adrsPath)
            .filter(f => f.endsWith('.json'));

        const adrs: ADR[] = [];

        for (const file of files) {
            try {
                const content = fs.readFileSync(path.join(this.adrsPath, file), 'utf-8');
                const adr = JSON.parse(content) as ADR;
                adrs.push(adr);
            } catch {
                // Skip invalid files
            }
        }

        return adrs;
    }
}

