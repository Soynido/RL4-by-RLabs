/**
 * SnapshotReminder — Rappel automatique pour générer des snapshots
 * 
 * Affiche une notification toutes les 30 minutes si aucun snapshot n'a été généré
 * depuis un certain temps, avec pré-sélection intelligente du mode et CTA "Copy"
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { UnifiedPromptBuilder } from './UnifiedPromptBuilder';
import { CognitiveLogger } from '../core/CognitiveLogger';

export interface ReminderContext {
    lastSnapshotTime: number | null;
    tasksCount: number;
    activeTasksCount: number;
    recentActivity: 'high' | 'medium' | 'low';
    recommendedMode: 'strict' | 'flexible' | 'exploratory' | 'free';
}

export class SnapshotReminder {
    private workspaceRoot: string;
    private rl4Path: string;
    private reminderInterval: NodeJS.Timeout | null = null;
    private startupTimeout: NodeJS.Timeout | null = null; // ✅ P0.3 MEMORY FIX: Store setTimeout
    private checkIntervalMs = 30 * 60 * 1000; // 30 minutes
    private lastReminderTime: number = 0;
    private reminderCooldownMs = 30 * 60 * 1000; // Ne pas rappeler avant 30 min
    private cognitiveLogger?: CognitiveLogger;

    constructor(workspaceRoot: string, cognitiveLogger?: CognitiveLogger) {
        this.workspaceRoot = workspaceRoot;
        this.rl4Path = path.join(workspaceRoot, '.reasoning_rl4');
        this.cognitiveLogger = cognitiveLogger;
    }

    /**
     * Démarrer le système de rappel
     * ✅ P0.3 MEMORY FIX: Idempotent start() - prevent double registration
     */
    start(): void {
        // ✅ P0.3: Check if already started
        if (this.reminderInterval || this.startupTimeout) {
            console.warn('[SnapshotReminder] Already started, ignoring duplicate start() call');
            return;
        }
        
        // ✅ P0.3: Store timeout reference for cleanup
        // Vérifier immédiatement au démarrage (après 30s pour laisser l'extension s'initialiser)
        this.startupTimeout = setTimeout(() => {
            this.checkAndRemind();
            this.startupTimeout = null; // Clear reference after execution
        }, 30000);

        // Puis vérifier toutes les 30 minutes
        this.reminderInterval = setInterval(() => {
            this.checkAndRemind();
        }, this.checkIntervalMs);

        if (this.cognitiveLogger) {
            this.cognitiveLogger.system('Snapshot reminder started (checks every 30min)');
        }
    }

    /**
     * Arrêter le système de rappel
     * ✅ P0.3 MEMORY FIX: Also clear startup timeout
     */
    stop(): void {
        // ✅ P0.3: Clear interval
        if (this.reminderInterval) {
            clearInterval(this.reminderInterval);
            this.reminderInterval = null;
        }
        
        // ✅ P0.3: Clear startup timeout if still pending
        if (this.startupTimeout) {
            clearTimeout(this.startupTimeout);
            this.startupTimeout = null;
        }
    }

    /**
     * Enregistrer qu'un snapshot a été généré (appelé depuis extension.ts)
     */
    recordSnapshotGenerated(): void {
        const statePath = path.join(this.rl4Path, 'reminder_state.json');
        const state = {
            lastSnapshotTime: Date.now(),
            lastReminderTime: this.lastReminderTime
        };
        
        try {
            const dir = path.dirname(statePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
        } catch (error) {
            console.warn('[SnapshotReminder] Failed to save state:', error);
        }
    }

    /**
     * Vérifier si un rappel est nécessaire et l'afficher
     */
    private async checkAndRemind(): Promise<void> {
        const context = await this.analyzeContext();
        const shouldRemind = this.shouldShowReminder(context);

        if (shouldRemind) {
            await this.showReminder(context);
        }
    }

    /**
     * Analyser le contexte pour déterminer le mode recommandé
     */
    private async analyzeContext(): Promise<ReminderContext> {
        const statePath = path.join(this.rl4Path, 'reminder_state.json');
        let lastSnapshotTime: number | null = null;

        // Charger le dernier snapshot
        try {
            if (fs.existsSync(statePath)) {
                const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
                lastSnapshotTime = state.lastSnapshotTime || null;
            }
        } catch (error) {
            // Ignore
        }

        // Analyser les tasks
        const tasksPath = path.join(this.rl4Path, 'Tasks.RL4');
        let tasksCount = 0;
        let activeTasksCount = 0;

        try {
            if (fs.existsSync(tasksPath)) {
                const tasksContent = fs.readFileSync(tasksPath, 'utf-8');
                
                // Compter les tasks (lignes avec - [ ] ou - [x])
                const taskMatches = tasksContent.match(/^-\s+\[[ x]\]/gm);
                tasksCount = taskMatches ? taskMatches.length : 0;
                
                // Compter les tasks actives (lignes avec - [ ])
                const activeMatches = tasksContent.match(/^-\s+\[\s\]/gm);
                activeTasksCount = activeMatches ? activeMatches.length : 0;
            }
        } catch (error) {
            // Ignore
        }

        // Déterminer l'activité récente (basé sur les cycles)
        const cyclesPath = path.join(this.rl4Path, 'ledger', 'cycles.jsonl');
        let recentActivity: 'high' | 'medium' | 'low' = 'low';
        
        try {
            if (fs.existsSync(cyclesPath)) {
                const content = fs.readFileSync(cyclesPath, 'utf-8');
                const lines = content.trim().split('\n').filter(l => l.trim());
                
                // Prendre les 10 derniers cycles
                const recentCycles = lines.slice(-10);
                const now = Date.now();
                const twoHoursAgo = now - 2 * 60 * 60 * 1000;
                
                const recentCount = recentCycles.filter(line => {
                    try {
                        const cycle = JSON.parse(line);
                        const cycleTime = new Date(cycle.timestamp || cycle._timestamp || 0).getTime();
                        return cycleTime > twoHoursAgo;
                    } catch {
                        return false;
                    }
                }).length;

                if (recentCount >= 5) {
                    recentActivity = 'high';
                } else if (recentCount >= 2) {
                    recentActivity = 'medium';
                }
            }
        } catch (error) {
            // Ignore
        }

        // Recommander un mode selon le contexte
        let recommendedMode: 'strict' | 'flexible' | 'exploratory' | 'free' = 'flexible';
        
        if (tasksCount > 10 || activeTasksCount > 5) {
            // Beaucoup de tasks → Mode strict pour se concentrer
            recommendedMode = 'strict';
        } else if (tasksCount === 0 || activeTasksCount === 0) {
            // Peu ou pas de tasks → Mode exploratory pour découvrir
            recommendedMode = 'exploratory';
        } else if (recentActivity === 'high') {
            // Activité élevée → Mode flexible pour équilibrer
            recommendedMode = 'flexible';
        } else {
            // Par défaut → Flexible
            recommendedMode = 'flexible';
        }

        return {
            lastSnapshotTime,
            tasksCount,
            activeTasksCount,
            recentActivity,
            recommendedMode
        };
    }

    /**
     * Déterminer si un rappel doit être affiché
     */
    private shouldShowReminder(context: ReminderContext): boolean {
        const now = Date.now();

        // Si jamais de snapshot, toujours rappeler (après cooldown)
        if (!context.lastSnapshotTime) {
            return (now - this.lastReminderTime) > this.reminderCooldownMs;
        }

        // Si dernier snapshot > 2 heures, rappeler
        const timeSinceLastSnapshot = now - context.lastSnapshotTime;
        const twoHoursMs = 2 * 60 * 60 * 1000;

        if (timeSinceLastSnapshot > twoHoursMs) {
            // Vérifier le cooldown
            return (now - this.lastReminderTime) > this.reminderCooldownMs;
        }

        return false;
    }

    /**
     * Afficher la notification de rappel avec actions
     */
    private async showReminder(context: ReminderContext): Promise<void> {
        this.lastReminderTime = Date.now();

        const timeSinceLastSnapshot = context.lastSnapshotTime 
            ? Math.round((Date.now() - context.lastSnapshotTime) / (60 * 60 * 1000))
            : null;

        const modeLabels: Record<string, string> = {
            strict: '🔴 Strict',
            flexible: '🟡 Flexible',
            exploratory: '🟢 Exploratory',
            free: '⚪ Free'
        };

        const modeLabel = modeLabels[context.recommendedMode] || '🟡 Flexible';

        const message = timeSinceLastSnapshot
            ? `🧠 Time to recalibrate your AI agent! Last snapshot was ${timeSinceLastSnapshot}h ago.`
            : `🧠 Generate your first context snapshot to calibrate your AI agent.`;

        const action = await vscode.window.showInformationMessage(
            message,
            `📋 Generate & Copy (${modeLabel})`,
            '⏰ Remind me later'
        );

        if (action && action.includes('Generate')) {
            await this.generateAndCopy(context.recommendedMode);
        } else if (action && action.includes('Remind me later')) {
            // Réinitialiser le cooldown pour rappeler dans 1h
            this.lastReminderTime = Date.now() - (this.reminderCooldownMs - 60 * 60 * 1000);
        }
    }

    /**
     * Générer le snapshot et le copier dans le presse-papier
     */
    private async generateAndCopy(mode: 'strict' | 'flexible' | 'exploratory' | 'free'): Promise<void> {
        try {
            if (this.cognitiveLogger) {
                this.cognitiveLogger.system(`Generating snapshot (reminder, mode: ${mode})...`);
            }

            const promptBuilder = new UnifiedPromptBuilder(this.rl4Path, this.cognitiveLogger);
            const result = await promptBuilder.generate(mode);

            // Copier dans le presse-papier
            await vscode.env.clipboard.writeText(result.prompt);

            // Enregistrer que le snapshot a été généré
            this.recordSnapshotGenerated();

            // Afficher confirmation
            vscode.window.showInformationMessage(
                `✅ Snapshot generated (${mode}) & copied to clipboard! Paste it in your AI agent.`,
                'Open WebView'
            ).then(action => {
                if (action === 'Open WebView') {
                    vscode.commands.executeCommand('rl4.toggleWebview');
                }
            });

            if (this.cognitiveLogger) {
                this.cognitiveLogger.system(`Snapshot generated from reminder (${result.prompt.length} chars, mode: ${mode})`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`❌ Failed to generate snapshot: ${errorMessage}`);
            
            if (this.cognitiveLogger) {
                this.cognitiveLogger.error(`Snapshot reminder failed: ${errorMessage}`);
            }
        }
    }
}

