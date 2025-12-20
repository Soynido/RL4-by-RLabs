/**
 * KernelAPI - Public API for RL4 Kernel
 * 
 * Exposes 4 endpoints: status, reflect, flush, shutdown
 * 
 * RL4 Kernel Component #8
 * 
 * PHASE A: Refactorisé pour utiliser KernelBridge (IPC) au lieu d'accès direct
 */

import { KernelBridge } from './process/KernelBridge';
import { ILogger } from './core/ILogger';
import { RepoDelta } from './types/RepoDelta';
import { WorkspaceState } from './types/WorkspaceState';
import { TaskItem } from './types/TaskItem';
import { CapturedItem } from './types/CapturedItem';
import { TrackedTaskItem } from './types/TrackedTaskItem';
import { TimeMachineResult } from './types/SystemStatus';
import { PlanDrift } from './types/SystemStatus';
import { Blindspots } from './types/SystemStatus';
import { SystemStatus } from './types/SystemStatus';
import { FAQItem } from './types/SystemStatus';
import { RulesInstaller, RuleInstallationResult } from './api/RulesInstaller';

// TODO: CycleResult n'est pas exporté par CognitiveScheduler
interface CycleResult {
    cycleId: number;
    success: boolean;
    phases: any[];
    duration: number;
    error: string | null;
}

export interface KernelStatus {
    running: boolean;
    uptime: number;
    health: any; // HealthMetrics from kernel process
    timers: number;
    queueSize: number;
    version: string;
}

interface QueryResponse {
    success: boolean;
    data?: any;
    error?: string;
}

export class KernelAPI {
    private pendingQueries: Map<number, { resolve: (value: any) => void; reject: (error: any) => void }> = new Map();
    private querySeq: number = 0;
    private extensionPath?: string;

    constructor(
        private bridge: KernelBridge,
        private logger: ILogger,
        private workspaceRoot: string,
        extensionPath?: string
    ) {
        this.extensionPath = extensionPath;
        // Listen to bridge messages for query responses
        this.bridge.on('message', (msg: any) => {
            if (msg.type === 'query_reply' && msg.query_seq !== undefined) {
                const pending = this.pendingQueries.get(msg.query_seq);
                if (pending) {
                    this.pendingQueries.delete(msg.query_seq);
                    if (msg.success) {
                        pending.resolve(msg.data);
                    } else {
                        pending.reject(new Error(msg.error || 'Query failed'));
                    }
                }
            }
        });
    }
    
    /**
     * Send query to kernel process and wait for reply
     */
    public async query(type: string, payload?: any, timeout: number = 5000): Promise<any> {
        if (!this.bridge.isRunning()) {
            throw new Error('Kernel is not running');
        }

        // Wait for kernel to be ready before sending query (max 30s wait)
        const maxWaitTime = 30000;
        const checkInterval = 100;
        const startTime = Date.now();
        
        while (!this.bridge.isReady && (Date.now() - startTime) < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        if (!this.bridge.isReady) {
            throw new Error('Kernel not ready after 30s wait');
        }

        const seq = ++this.querySeq;
        const queryMsg = {
            type: 'query',
            query_type: type,
            query_seq: seq,
            payload: payload || {},
            timestamp: Date.now()
        };

        return new Promise((resolve, reject) => {
            // Timeout handler
            const timeoutId = setTimeout(() => {
                this.pendingQueries.delete(seq);
                reject(new Error(`Query timeout: ${type}`));
            }, timeout);

            // Store promise handlers
            this.pendingQueries.set(seq, {
                resolve: (data) => {
                    clearTimeout(timeoutId);
                    resolve(data);
                },
                reject: (error) => {
                    clearTimeout(timeoutId);
                    reject(error);
                }
            });

            // Send query
            this.bridge.send(queryMsg);
        });
    }

    /**
     * Get kernel status
     */
    async status(): Promise<KernelStatus> {
        try {
            const data = await this.query('status');
            return {
                running: this.bridge.isRunning(),
                uptime: data.uptime || 0,
                health: data.health || {},
                timers: data.timers || 0,
                queueSize: data.queueSize || 0,
                version: data.version || '1.0.0'
            };
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to get status: ${error}`);
            // Fallback to basic status
            return {
                running: this.bridge.isRunning(),
                uptime: 0,
                health: {},
                timers: 0,
                queueSize: 0,
                version: '1.0.0'
            };
        }
    }
    
    /**
     * ✅ P0-CORE-03: Get last cycle health (for kernel status API)
     * @returns Last cycle health information
     */
    async getLastCycleHealth(): Promise<{
        cycleId: number;
        success: boolean;
        phases: any[];
        duration: number;
        error: string | null;
    }> {
        try {
            const data = await this.query('get_last_cycle_health');
            return {
                cycleId: data.cycleId || 0,
                success: data.success || false,
                phases: data.phases || [],
                duration: data.duration || 0,
                error: data.error || null
            };
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to get last cycle health: ${error}`);
            return {
                cycleId: 0,
                success: false,
                phases: [],
                duration: 0,
                error: `Query failed: ${error}`
            };
        }
    }
    
    /**
     * Run cognitive reflection (manual cycle trigger)
     */
    async reflect(): Promise<CycleResult> {
        try {
            const data = await this.query('reflect', {}, 30000); // 30s timeout for cycle
            return {
                cycleId: data.cycleId || 0,
                success: data.success || false,
                phases: data.phases || [],
                duration: data.duration || 0,
                error: data.error || null
            };
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to run reflect: ${error}`);
            return {
                cycleId: 0,
                success: false,
                phases: [],
                duration: 0,
                error: `Query failed: ${error}`
            };
        }
    }
    
    /**
     * Flush all queues (force write)
     */
    async flush(): Promise<void> {
        try {
            await this.query('flush', {}, 10000); // 10s timeout
            this.logger.system('[KernelAPI] Flush completed');
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to flush: ${error}`);
            throw error;
        }
    }
    
    /**
     * Shutdown kernel (cleanup)
     */
    async shutdown(): Promise<void> {
        try {
            await this.query('shutdown', {}, 5000);
            this.logger.system('[KernelAPI] Shutdown command sent');
            // Bridge will handle actual process termination
            this.bridge.stop();
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to shutdown: ${error}`);
            // Force stop bridge even if query fails
            this.bridge.stop();
        }
    }

    /**
     * Get active governance mode (strict/flexible/exploratory/free/firstUse)
     */
    async getMode(): Promise<string> {
        try {
            const data = await this.query('get_mode');
            return data.mode || 'flexible';
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to get mode: ${error}`);
            return 'flexible'; // Fallback
        }
    }

    /**
     * Set governance mode
     */
    async setMode(mode: string): Promise<boolean> {
        try {
            const data = await this.query('set_mode', { mode });
            return data.success || false;
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to set mode: ${error}`);
            return false;
        }
    }

    /**
     * Generate snapshot prompt (UI use, not kernel cycle)
     */
    async generateSnapshot(mode: string): Promise<{prompt: string, metadata: any}> {
        try {
            const data = await this.query('generate_snapshot', { mode }, 60000); // 60s timeout for prompt generation
            return {
                prompt: data.prompt || '',
                metadata: data.metadata || {}
            };
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to generate snapshot: ${error}`);
            throw error;
        }
    }

    /**
     * Get auto tasks count
     */
    async getAutoTasksCount(): Promise<number> {
        try {
            const data = await this.query('get_auto_tasks_count');
            return data.count || 0;
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to get auto tasks count: ${error}`);
            return 0;
        }
    }

    /**
     * Get workspace state
     */
    async getWorkspaceState(): Promise<WorkspaceState> {
        try {
            const data = await this.query('get_workspace_state');
            return data || { mode: 'first_use', step: 0, confidence: 0 };
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to get workspace state: ${error}`);
            return { mode: 'first_use', step: 0, confidence: 0 };
        }
    }

    /**
     * Get local tasks
     */
    async getLocalTasks(): Promise<TaskItem[]> {
        try {
            const data = await this.query('get_local_tasks');
            return data.tasks || [];
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to get local tasks: ${error}`);
            return [];
        }
    }

    /**
     * Add a local task
     */
    async addLocalTask(task: string): Promise<void> {
        try {
            await this.query('add_local_task', { task });
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to add local task: ${error}`);
            throw error;
        }
    }

    /**
     * Toggle a local task completion status
     */
    async toggleLocalTask(id: string): Promise<void> {
        try {
            await this.query('toggle_local_task', { id });
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to toggle local task: ${error}`);
            throw error;
        }
    }

    /**
     * Get captured session items
     */
    async getCapturedSession(): Promise<CapturedItem[]> {
        try {
            const data = await this.query('get_captured_session');
            return data.items || [];
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to get captured session: ${error}`);
            return [];
        }
    }

    /**
     * Promote captured items to RL4
     */
    async promoteToRL4(): Promise<void> {
        try {
            await this.query('promote_to_rl4');
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to promote to RL4: ${error}`);
            throw error;
        }
    }

    /**
     * Get RL4 tasks with filter
     */
    async getRL4Tasks(filter: string): Promise<TrackedTaskItem[]> {
        try {
            const data = await this.query('get_rl4_tasks', { filter });
            return data.tasks || [];
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to get RL4 tasks: ${error}`);
            return [];
        }
    }

    /**
     * Build time machine prompt
     */
    async buildTimeMachinePrompt(startDate: string, endDate?: string): Promise<TimeMachineResult> {
        try {
            const data = await this.query('build_time_machine_prompt', {
                startIso: startDate,
                endIso: endDate
            }, 60000); // 60s timeout for time machine prompt generation
            return data;
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to build time machine prompt: ${error}`);
            throw error;
        }
    }

    /**
     * Get repository delta
     */
    async getRepoDelta(): Promise<RepoDelta> {
        try {
            const data = await this.query('get_repo_delta');
            return data || {
                totalFiles: 0,
                modified: 0,
                untracked: 0,
                staged: 0,
                severity: 'LOW'
            };
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to get repo delta: ${error}`);
            return {
                totalFiles: 0,
                modified: 0,
                untracked: 0,
                staged: 0,
                severity: 'LOW'
            };
        }
    }

    /**
     * Get plan drift
     */
    async getPlanDrift(): Promise<PlanDrift> {
        try {
            const data = await this.query('get_plan_drift');
            return data || {
                lastUpdated: '',
                driftLevel: 'LOW',
                recommendations: [],
                hoursSinceUpdate: 0
            };
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to get plan drift: ${error}`);
            return {
                lastUpdated: '',
                driftLevel: 'LOW',
                recommendations: [],
                hoursSinceUpdate: 0
            };
        }
    }

    /**
     * Get blindspots
     */
    async getBlindspots(): Promise<Blindspots> {
        try {
            const data = await this.query('get_blindspots');
            return data || {
                bursts: 0,
                gaps: 0,
                samples: 0,
                signals: []
            };
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to get blindspots: ${error}`);
            return {
                bursts: 0,
                gaps: 0,
                samples: 0,
                signals: []
            };
        }
    }

    /**
     * Get current phase
     */
    async getCurrentPhase(): Promise<string> {
        try {
            const data = await this.query('get_current_phase');
            return data.phase || 'UNKNOWN';
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to get current phase: ${error}`);
            return 'UNKNOWN';
        }
    }

    /**
     * Reset codec (no-op)
     */
    async resetCodec(): Promise<void> {
        try {
            await this.query('reset_codec');
            this.logger.system('[KernelAPI] Codec reset completed');
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to reset codec: ${error}`);
            throw error;
        }
    }

    /**
     * Export logs
     */
    async exportLogs(): Promise<string> {
        try {
            const data = await this.query('export_logs');
            return data.logs || '';
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to export logs: ${error}`);
            return '';
        }
    }

    /**
     * Get FAQ items
     */
    async getFAQ(): Promise<FAQItem[]> {
        try {
            const data = await this.query('get_faq');
            return data.faq || [];
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to get FAQ: ${error}`);
            return [];
        }
    }

    /**
     * Install RL4 governance rules for LLM calibration
     */
    async installRules(): Promise<RuleInstallationResult> {
        try {
            const rulesInstaller = new RulesInstaller(this.workspaceRoot, this.extensionPath);
            return await rulesInstaller.installRules();
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to install rules: ${error}`);
            return {
                success: false,
                rulesInstalled: [],
                errors: [`Installation error: ${error}`]
            };
        }
    }

    /**
     * Verify RL4 rules installation status
     */
    async verifyRulesInstallation(): Promise<{ installed: string[]; missing: string[] }> {
        try {
            const rulesInstaller = new RulesInstaller(this.workspaceRoot);
            return await rulesInstaller.verifyInstallation();
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to verify rules installation: ${error}`);
            return { installed: [], missing: ['RL4.Agent.System.mdc', 'RL4.Core.mdc'] };
        }
    }

    /**
     * Check if rules need update
     */
    async rulesNeedUpdate(): Promise<boolean> {
        try {
            const rulesInstaller = new RulesInstaller(this.workspaceRoot);
            return await rulesInstaller.needsUpdate();
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to check rules update status: ${error}`);
            return true; // Err on side of caution
        }
    }

    /**
     * Get system status
     */
    async getSystemStatus(): Promise<SystemStatus> {
        try {
            const data = await this.query('get_system_status');
            return data || {
                gitDeltaFixed: false,
                codecReady: false,
                diagnosticsReady: false,
                lastCheck: '',
                version: '1.0.0'
            };
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to get system status: ${error}`);
            return {
                gitDeltaFixed: false,
                codecReady: false,
                diagnosticsReady: false,
                lastCheck: '',
                version: '1.0.0'
            };
        }
    }

    /**
     * Get timeline range (first and last cycle dates)
     */
    async getTimelineRange(): Promise<{ firstCycleIso: string; lastCycleIso: string }> {
        try {
            const data = await this.query('get_timeline_range');
            return data || {
                firstCycleIso: new Date().toISOString(),
                lastCycleIso: new Date().toISOString()
            };
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to get timeline range: ${error}`);
            return {
                firstCycleIso: new Date().toISOString(),
                lastCycleIso: new Date().toISOString()
            };
        }
    }

    /**
     * Mark onboarding as complete
     */
    async markOnboardingComplete(mode: 'new' | 'existing'): Promise<boolean> {
        try {
            const data = await this.query('mark_onboarding_complete', { mode });
            return data.success || false;
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to mark onboarding complete: ${error}`);
            return false;
        }
    }

    /**
     * Reset onboarding (for testing)
     */
    async resetOnboarding(): Promise<boolean> {
        try {
            const data = await this.query('reset_onboarding');
            return data.success || false;
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to reset onboarding: ${error}`);
            return false;
        }
    }

    /**
     * Get onboarding status
     */
    async getOnboardingStatus(): Promise<{ complete: boolean; mode?: string; firstUseMode?: string }> {
        try {
            const data = await this.query('get_onboarding_status');
            return data || { complete: false };
        } catch (error) {
            this.logger.error(`[KernelAPI] Failed to get onboarding status: ${error}`);
            return { complete: false };
        }
    }
}

