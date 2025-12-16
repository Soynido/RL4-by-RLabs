/**
 * Modes System - RL4 Kernel Mode Management
 *
 * Module 9319 - Deviation mode management for adaptive behavior
 *
 * Manages RL4 operational modes:
 * - stable: Standard operation with conservative settings
 * - exploratory: Learning mode with higher experimentation tolerance
 * - recovery: Fault tolerance and error recovery focus
 * - performance: Optimized for speed and efficiency
 * - strict: High validation and safety requirements
 *
 * Modes influence kernel behavior, validation strictness, and adaptive thresholds.
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { StateRegistry } from '../StateRegistry';

export enum RL4Mode {
    STABLE = 'stable',
    EXPLORATORY = 'exploratory',
    RECOVERY = 'recovery',
    PERFORMANCE = 'performance',
    STRICT = 'strict'
}

export interface ModeConfig {
    name: string;
    description: string;
    validationStrictness: number;    // 0-100
    errorTolerance: number;         // 0-100
    autoRecovery: boolean;
    loggingLevel: 'debug' | 'info' | 'warn' | 'error';
    performanceOptimization: boolean;
    safetyChecks: boolean;
    adaptiveThresholds: boolean;
    experimentAllowance: number;     // 0-100
}

export interface ModeTransition {
    from: RL4Mode;
    to: RL4Mode;
    reason: string;
    timestamp: Date;
    automatic: boolean;
}

export interface AutoAdjustmentRule {
    trigger: string;
    condition: any;
    targetMode: RL4Mode;
    priority: number;
    enabled: boolean;
}

/**
 * RL4 Modes System Class
 */
export class ModesSystem extends EventEmitter {
    private workspaceRoot: string;
    private stateRegistry: StateRegistry;
    private currentMode: RL4Mode = RL4Mode.STABLE;
    private modeConfigs: Map<RL4Mode, ModeConfig>;
    private transitionHistory: ModeTransition[] = [];
    private autoAdjustmentRules: AutoAdjustmentRule[] = [];
    private isAutoAdjustmentEnabled = true;
    private configPath: string;

    constructor(workspaceRoot: string, stateRegistry: StateRegistry) {
        super();
        this.workspaceRoot = workspaceRoot;
        this.stateRegistry = stateRegistry;
        this.configPath = path.join(workspaceRoot, '.reasoning_rl4', 'modes.json');

        this.initializeModeConfigs();
        this.initializeAutoAdjustmentRules();
        this.loadModeFromConfig();
    }

    /**
     * Get current mode
     */
    getMode(): RL4Mode {
        return this.currentMode;
    }

    /**
     * Get current mode configuration
     */
    getModeConfig(): ModeConfig {
        return this.modeConfigs.get(this.currentMode)!;
    }

    /**
     * Set mode with optional reason
     */
    async setMode(mode: RL4Mode, reason?: string): Promise<boolean> {
        if (mode === this.currentMode) {
            return true; // No change needed
        }

        try {
            const previousMode = this.currentMode;
            const transition: ModeTransition = {
                from: previousMode,
                to: mode,
                reason: reason || `Manual change from ${previousMode} to ${mode}`,
                timestamp: new Date(),
                automatic: false
            };

            // Validate mode transition
            if (!this.isValidTransition(previousMode, mode)) {
                throw new Error(`Invalid transition from ${previousMode} to ${mode}`);
            }

            // Perform mode change
            this.currentMode = mode;
            this.transitionHistory.push(transition);

            // Save to state registry
            await this.saveCurrentMode();

            // Emit mode change event
            this.emit('modeChanged', transition);

            console.log(`ModesSystem: Changed from ${previousMode} to ${mode}: ${reason}`);

            return true;

        } catch (error) {
            console.log(`ModesSystem: Failed to set mode ${mode}: ${error}`);
            return false;
        }
    }

    /**
     * Load mode from configuration
     */
    async loadModeFromConfig(): Promise<void> {
        try {
            // Try to load from RL4 config file
            if (fs.existsSync(this.configPath)) {
                const configContent = fs.readFileSync(this.configPath, 'utf8');
                const config = JSON.parse(configContent);

                if (config.currentMode && Object.values(RL4Mode).includes(config.currentMode)) {
                    this.currentMode = config.currentMode;
                    console.log(`ModesSystem: Loaded mode ${this.currentMode} from config`);
                }

                if (config.autoAdjustmentRules) {
                    this.autoAdjustmentRules = config.autoAdjustmentRules;
                }

                if (config.isAutoAdjustmentEnabled !== undefined) {
                    this.isAutoAdjustmentEnabled = config.isAutoAdjustmentEnabled;
                }
            }

            // Try to load from state registry as fallback
            const savedMode = await this.stateRegistry.get('rl4.currentMode');
            if (savedMode && Object.values(RL4Mode).includes(savedMode)) {
                this.currentMode = savedMode;
                console.log(`ModesSystem: Loaded mode ${this.currentMode} from state registry`);
            }

        } catch (error) {
            console.log(`ModesSystem: Failed to load mode from config: ${error}`);
            // Default to stable mode
            this.currentMode = RL4Mode.STABLE;
        }
    }

    /**
     * Save current mode to persistent storage
     */
    private async saveCurrentMode(): Promise<void> {
        try {
            // Save to state registry
            await this.stateRegistry.set('rl4.currentMode', this.currentMode);

            // Save to config file
            await this.saveConfig();

        } catch (error) {
            console.log(`ModesSystem: Failed to save mode: ${error}`);
        }
    }

    /**
     * Enable/disable automatic mode adjustment
     */
    setAutoAdjustment(enabled: boolean): void {
        this.isAutoAdjustmentEnabled = enabled;
        console.log(`ModesSystem: Auto-adjustment ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Perform automatic mode adjustment based on current conditions
     */
    async autoAdjust(): Promise<boolean> {
        if (!this.isAutoAdjustmentEnabled) {
            return false;
        }

        try {
            const context = await this.buildAdjustmentContext();

            // Sort rules by priority
            const sortedRules = this.autoAdjustmentRules
                .filter(rule => rule.enabled)
                .sort((a, b) => b.priority - a.priority);

            for (const rule of sortedRules) {
                if (this.evaluateRule(rule, context)) {
                    const success = await this.setMode(
                        rule.targetMode,
                        `Auto-adjustment: ${rule.trigger}`
                    );

                    if (success) {
                        // Mark transition as automatic
                        const lastTransition = this.transitionHistory[this.transitionHistory.length - 1];
                        if (lastTransition) {
                            lastTransition.automatic = true;
                        }

                        console.log(`ModesSystem: Auto-adjusted to ${rule.targetMode} due to ${rule.trigger}`);
                        return true;
                    }
                }
            }

            return false;

        } catch (error) {
            console.log(`ModesSystem: Auto-adjustment failed: ${error}`);
            return false;
        }
    }

    /**
     * Get mode transition history
     */
    getTransitionHistory(limit?: number): ModeTransition[] {
        if (limit) {
            return this.transitionHistory.slice(-limit);
        }
        return [...this.transitionHistory];
    }

    /**
     * Get all available modes with configurations
     */
    getAllModes(): Map<RL4Mode, ModeConfig> {
        return new Map(this.modeConfigs);
    }

    /**
     * Add custom auto-adjustment rule
     */
    addAutoAdjustmentRule(rule: AutoAdjustmentRule): void {
        this.autoAdjustmentRules.push(rule);
        this.sortRulesByPriority();
    }

    /**
     * Remove auto-adjustment rule
     */
    removeAutoAdjustmentRule(trigger: string): boolean {
        const index = this.autoAdjustmentRules.findIndex(rule => rule.trigger === trigger);
        if (index >= 0) {
            this.autoAdjustmentRules.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Enable/disable auto-adjustment rule
     */
    toggleAutoAdjustmentRule(trigger: string, enabled: boolean): boolean {
        const rule = this.autoAdjustmentRules.find(rule => rule.trigger === trigger);
        if (rule) {
            rule.enabled = enabled;
            return true;
        }
        return false;
    }

    /**
     * Get statistics about mode usage
     */
    getModeStatistics(): any {
        const modeCounts = new Map<RL4Mode, number>();
        const totalTransitions = this.transitionHistory.length;

        for (const mode of Object.values(RL4Mode)) {
            modeCounts.set(mode, 0);
        }

        for (const transition of this.transitionHistory) {
            const count = modeCounts.get(transition.to) || 0;
            modeCounts.set(transition.to, count + 1);
        }

        const averageTimeInMode = this.calculateAverageTimeInMode();

        return {
            currentMode: this.currentMode,
            totalTransitions,
            modeDistribution: Object.fromEntries(modeCounts),
            averageTimeInMode,
            autoAdjustmentEnabled: this.isAutoAdjustmentEnabled,
            activeRules: this.autoAdjustmentRules.filter(rule => rule.enabled).length
        };
    }

    /**
     * Initialize default mode configurations
     */
    private initializeModeConfigs(): void {
        this.modeConfigs = new Map();

        this.modeConfigs.set(RL4Mode.STABLE, {
            name: 'Stable',
            description: 'Standard operation with balanced settings',
            validationStrictness: 70,
            errorTolerance: 50,
            autoRecovery: true,
            loggingLevel: 'info',
            performanceOptimization: false,
            safetyChecks: true,
            adaptiveThresholds: true,
            experimentAllowance: 20
        });

        this.modeConfigs.set(RL4Mode.EXPLORATORY, {
            name: 'Exploratory',
            description: 'Learning mode with higher experimentation tolerance',
            validationStrictness: 40,
            errorTolerance: 80,
            autoRecovery: true,
            loggingLevel: 'debug',
            performanceOptimization: false,
            safetyChecks: false,
            adaptiveThresholds: true,
            experimentAllowance: 80
        });

        this.modeConfigs.set(RL4Mode.RECOVERY, {
            name: 'Recovery',
            description: 'Fault tolerance and error recovery focus',
            validationStrictness: 90,
            errorTolerance: 20,
            autoRecovery: true,
            loggingLevel: 'warn',
            performanceOptimization: false,
            safetyChecks: true,
            adaptiveThresholds: false,
            experimentAllowance: 0
        });

        this.modeConfigs.set(RL4Mode.PERFORMANCE, {
            name: 'Performance',
            description: 'Optimized for speed and efficiency',
            validationStrictness: 50,
            errorTolerance: 60,
            autoRecovery: false,
            loggingLevel: 'warn',
            performanceOptimization: true,
            safetyChecks: false,
            adaptiveThresholds: false,
            experimentAllowance: 30
        });

        this.modeConfigs.set(RL4Mode.STRICT, {
            name: 'Strict',
            description: 'High validation and safety requirements',
            validationStrictness: 95,
            errorTolerance: 10,
            autoRecovery: true,
            loggingLevel: 'info',
            performanceOptimization: false,
            safetyChecks: true,
            adaptiveThresholds: false,
            experimentAllowance: 5
        });
    }

    /**
     * Initialize default auto-adjustment rules
     */
    private initializeAutoAdjustmentRules(): void {
        this.autoAdjustmentRules = [
            {
                trigger: 'high_error_rate',
                condition: { errorRate: 0.1 }, // 10% error rate
                targetMode: RL4Mode.RECOVERY,
                priority: 100,
                enabled: true
            },
            {
                trigger: 'performance_degradation',
                condition: { responseTimeMs: 5000 }, // 5 second response time
                targetMode: RL4Mode.PERFORMANCE,
                priority: 80,
                enabled: true
            },
            {
                trigger: 'learning_phase',
                condition: { isNewProject: true, daysActive: 7 },
                targetMode: RL4Mode.EXPLORATORY,
                priority: 60,
                enabled: true
            },
            {
                trigger: 'production_ready',
                condition: { testCoverage: 80, stabilityDays: 30 },
                targetMode: RL4Mode.STRICT,
                priority: 90,
                enabled: true
            },
            {
                trigger: 'low_activity',
                condition: { inactivityHours: 24 },
                targetMode: RL4Mode.PERFORMANCE,
                priority: 40,
                enabled: true
            }
        ];
    }

    /**
     * Validate if mode transition is allowed
     */
    private isValidTransition(from: RL4Mode, to: RL4Mode): boolean {
        // All transitions are allowed for now
        // Could add restrictions based on current state
        return true;
    }

    /**
     * Build context for auto-adjustment evaluation
     */
    private async buildAdjustmentContext(): Promise<any> {
        try {
            // Get current system metrics from state registry
            const errorCount = await this.stateRegistry.get('rl4.metrics.errorCount') || 0;
            const totalOperations = await this.stateRegistry.get('rl4.metrics.totalOperations') || 1;
            const errorRate = errorCount / totalOperations;

            const lastActivity = await this.stateRegistry.get('rl4.lastActivity');
            const hoursSinceActivity = lastActivity ?
                (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60) : 24;

            return {
                errorRate,
                responseTimeMs: 0, // Would get from performance metrics
                isNewProject: false, // Would determine from project age
                daysActive: 0, // Would calculate from first activity
                testCoverage: 0, // Would get from test analysis
                stabilityDays: 0, // Would calculate from last error
                inactivityHours: hoursSinceActivity
            };

        } catch (error) {
            console.log(`ModesSystem: Failed to build adjustment context: ${error}`);
            return {};
        }
    }

    /**
     * Evaluate auto-adjustment rule
     */
    private evaluateRule(rule: AutoAdjustmentRule, context: any): boolean {
        try {
            for (const [key, value] of Object.entries(rule.condition)) {
                if (context[key] === undefined) {
                    return false; // Missing context data
                }

                if (typeof value === 'number') {
                    if (context[key] < value) {
                        return false;
                    }
                } else if (typeof value === 'boolean') {
                    if (context[key] !== value) {
                        return false;
                    }
                }
            }

            return true;

        } catch (error) {
            console.log(`ModesSystem: Failed to evaluate rule ${rule.trigger}: ${error}`);
            return false;
        }
    }

    /**
     * Sort rules by priority
     */
    private sortRulesByPriority(): void {
        this.autoAdjustmentRules.sort((a, b) => b.priority - a.priority);
    }

    /**
     * Calculate average time spent in each mode
     */
    private calculateAverageTimeInMode(): any {
        const modeTimes = new Map<RL4Mode, number[]>();
        const totalTransitions = this.transitionHistory.length;

        if (totalTransitions < 2) {
            return {};
        }

        for (let i = 1; i < totalTransitions; i++) {
            const prevTransition = this.transitionHistory[i - 1];
            const currTransition = this.transitionHistory[i];
            const duration = currTransition.timestamp.getTime() - prevTransition.timestamp.getTime();

            if (!modeTimes.has(prevTransition.to)) {
                modeTimes.set(prevTransition.to, []);
            }
            modeTimes.get(prevTransition.to)!.push(duration);
        }

        const averageTimes: any = {};
        for (const [mode, times] of modeTimes) {
            const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
            averageTimes[mode] = Math.round(avgMs / (1000 * 60)); // Convert to minutes
        }

        return averageTimes;
    }

    /**
     * Save configuration to file
     */
    private async saveConfig(): Promise<void> {
        try {
            const configDir = path.dirname(this.configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            const config = {
                currentMode: this.currentMode,
                autoAdjustmentRules: this.autoAdjustmentRules,
                isAutoAdjustmentEnabled: this.isAutoAdjustmentEnabled,
                lastUpdated: new Date().toISOString()
            };

            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));

        } catch (error) {
            console.log(`ModesSystem: Failed to save config: ${error}`);
        }
    }
}