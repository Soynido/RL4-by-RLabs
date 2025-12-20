/**
 * RL4 Context Snapshot
 *
 * Génère et maintient un snapshot synthétique du contexte cognitif actuel.
 * Permet à la WebView (feature "Where Am I?") de charger instantanément
 * le contexte sans reparser les logs.
 *
 * Fichier généré: .reasoning_rl4/context.json
 *
 * Mise à jour: À chaque cycle (ou sur demande)
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ContextSnapshot {
    // Metadata
    last_updated: string; // ISO timestamp
    current_cycle: number;
    
    // Cognitive state
    pattern: string;          // Top pattern actif
    pattern_confidence: number;
    forecast: string;         // Top forecast actif
    forecast_confidence: number;
    intent: string;           // Dernier intent détecté (feat/fix/refactor/etc.)
    adr: string | null;       // ADR active (si existante)
    
    // Files context
    files: string[];          // Top 5 fichiers récemment modifiés
    
    // Quick stats
    stats: {
        total_cycles: number;
        total_patterns: number;
        total_forecasts: number;
        total_adrs: number;
    };
}

export class ContextSnapshotGenerator {
    private workspaceRoot: string;
    private snapshotPath: string;
    
    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.snapshotPath = path.join(workspaceRoot, '.reasoning_rl4', 'context.json');
    }
    
    /**
     * Generate and save context snapshot
     * À appeler à chaque cycle ou sur demande
     */
    async generate(cycleId: number): Promise<ContextSnapshot> {
        const snapshot: ContextSnapshot = {
            last_updated: new Date().toISOString(),
            current_cycle: cycleId,
            pattern: '',
            pattern_confidence: 0,
            forecast: '',
            forecast_confidence: 0,
            intent: 'unknown',
            adr: null,
            files: [],
            stats: {
                total_cycles: cycleId,
                total_patterns: 0,
                total_forecasts: 0,
                total_adrs: 0
            }
        };
        
        try {
            // 1. Load top pattern
            const patternsPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'patterns.json');
            if (fs.existsSync(patternsPath)) {
                const patternsData = JSON.parse(fs.readFileSync(patternsPath, 'utf-8'));
                if (patternsData.patterns && patternsData.patterns.length > 0) {
                    const topPattern = patternsData.patterns.reduce((max: any, p: any) => 
                        p.confidence > max.confidence ? p : max
                    , patternsData.patterns[0]);
                    
                    snapshot.pattern = topPattern.pattern;
                    snapshot.pattern_confidence = topPattern.confidence;
                    snapshot.stats.total_patterns = patternsData.patterns.length;
                }
            }
            
            // 2. Load top forecast
            const forecastsPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'forecasts.json');
            if (fs.existsSync(forecastsPath)) {
                const forecasts = JSON.parse(fs.readFileSync(forecastsPath, 'utf-8'));
                if (Array.isArray(forecasts) && forecasts.length > 0) {
                    const topForecast = forecasts.reduce((max: any, f: any) => 
                        f.confidence > max.confidence ? f : max
                    , forecasts[0]);
                    
                    snapshot.forecast = topForecast.predicted_decision;
                    snapshot.forecast_confidence = topForecast.confidence;
                    snapshot.stats.total_forecasts = forecasts.length;
                }
            }
            
            // 3. Detect latest intent from git commits
            const commitsPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'traces', 'git_commits.jsonl');
            if (fs.existsSync(commitsPath)) {
                const lines = fs.readFileSync(commitsPath, 'utf-8').split('\n').filter(Boolean);
                if (lines.length > 0) {
                    const lastCommit = JSON.parse(lines[lines.length - 1]);
                    snapshot.intent = lastCommit.metadata?.intent?.type || 'unknown';
                }
            }
            
            // 4. Load active ADR (if any)
            const adrsPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'adrs', 'auto');
            if (fs.existsSync(adrsPath)) {
                const adrFiles = fs.readdirSync(adrsPath).filter(f => f.startsWith('adr-'));
                snapshot.stats.total_adrs = adrFiles.length;
                
                // Find most recent accepted ADR
                let latestADR: any = null;
                let latestTime = 0;
                
                for (const file of adrFiles) {
                    try {
                        const adr = JSON.parse(fs.readFileSync(path.join(adrsPath, file), 'utf-8'));
                        const modTime = new Date(adr.modifiedAt || adr.createdAt).getTime();
                        
                        if (adr.status === 'accepted' && modTime > latestTime) {
                            latestADR = adr;
                            latestTime = modTime;
                        }
                    } catch (e) {
                        // Skip invalid ADRs
                    }
                }
                
                if (latestADR) {
                    snapshot.adr = latestADR.title;
                }
            }
            
            // 5. Load recent files from file_changes
            const changesPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'traces', 'file_changes.jsonl');
            if (fs.existsSync(changesPath)) {
                const lines = fs.readFileSync(changesPath, 'utf-8').split('\n').filter(Boolean);
                const recentChanges = lines.slice(-10); // Last 10 changes
                
                const filesSet = new Set<string>();
                for (const line of recentChanges) {
                    try {
                        const change = JSON.parse(line);
                        for (const c of change.metadata?.changes || []) {
                            filesSet.add(c.path);
                        }
                    } catch (e) {
                        // Skip invalid lines
                    }
                }
                
                snapshot.files = Array.from(filesSet).slice(0, 5); // Top 5
            }
            
        } catch (error) {
            console.warn('⚠️  Failed to generate complete context snapshot:', error);
            // Return partial snapshot (better than nothing)
        }
        
        // Save snapshot
        this.save(snapshot);
        
        return snapshot;
    }
    
    /**
     * Load existing snapshot
     */
    load(): ContextSnapshot | null {
        if (!fs.existsSync(this.snapshotPath)) {
            return null;
        }
        
        try {
            return JSON.parse(fs.readFileSync(this.snapshotPath, 'utf-8'));
        } catch (e) {
            console.error('❌ Failed to load context snapshot:', e);
            return null;
        }
    }
    
    /**
     * Save snapshot to disk
     */
    private save(snapshot: ContextSnapshot): void {
        const dir = path.dirname(this.snapshotPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(this.snapshotPath, JSON.stringify(snapshot, null, 2));
    }
    
    /**
     * Generate prompt for "Where Am I?" feature
     * Utilisé par la WebView pour contextualiser l'agent IA
     */
    generatePrompt(snapshot?: ContextSnapshot): string {
        const ctx = snapshot || this.load();
        
        if (!ctx) {
            return 'No cognitive context available yet. System is initializing.';
        }
        
        // Get project name dynamically
        const projectName = path.basename(this.workspaceRoot);
        
        const files = ctx.files.length > 0 
            ? ctx.files.map(f => `\n  • ${f}`).join('')
            : '\n  (no recent file changes)';
        
        return `You are the development assistant for the **${projectName}** project.

Context snapshot (${new Date(ctx.last_updated).toLocaleString()}):

- Focus files: ${files}

- Active pattern: ${ctx.pattern}
  Impact: ${ctx.pattern ? 'Detected' : 'N/A'} | Confidence: ${(ctx.pattern_confidence * 100).toFixed(0)}%

- Forecast: "${ctx.forecast}"
  Confidence: ${(ctx.forecast_confidence * 100).toFixed(0)}%${ctx.forecast ? ' | Suggested timeframe: Soon' : ''}

- Recent activity type: ${ctx.intent}${ctx.adr ? `\n\n- Decision documented: "${ctx.adr}" (accepted)` : ''}

Your mission:
1. Analyze the focus files in the context of **${projectName}** architecture.
2. ${ctx.pattern ? `Explain why this development pattern emerged (${(ctx.pattern_confidence * 100).toFixed(0)}% confidence).` : 'Help understand the current development context.'}
3. ${ctx.forecast ? `Suggest next steps for **${projectName}** aligned with: "${ctx.forecast}".` : 'Provide guidance on next development steps for this project.'}`;
    }
}


