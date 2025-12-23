import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AppendOnlyWriter, OverflowStrategy } from '../AppendOnlyWriter';
import * as vscode from 'vscode';
import { ILogger } from '../core/ILogger';

// RL4 Minimal Types
interface CaptureEvent {
    id: string;
    type: string;
    timestamp: string;
    source: string;
    metadata: any;
}

// ✅ REMOVED: SimpleLogger - BuildMetricsListener now uses ILogger directly
// No separate output channel needed

/**
 * BuildMetricsListener - Input Layer Component
 * 
 * Captures build/compilation metrics to detect performance regressions.
 * Answers questions like:
 * - "Did my refactor slow down the build?" (Test 7)
 * - "Build time trend over last 7 days?"
 * - "Correlation between bundle size and features added?"
 * 
 * Features:
 * - VS Code tasks API monitoring
 * - Bundle file size tracking
 * - Build success/failure detection
 * - Duration metrics
 */
export class BuildMetricsListener {
    private workspaceRoot: string;
    private isActive: boolean = false;
    private appendWriter: AppendOnlyWriter | null = null;
    private logger: ILogger | null = null; // ✅ Use ILogger instead of OutputChannel
    private taskStartTimes: Map<string, number> = new Map();
    private bundleFilePath: string;
    private disposables: vscode.Disposable[] = []; // ✅ NEW: Track disposables
    private bundleMonitorInterval: NodeJS.Timeout | null = null; // ✅ NEW: Track interval
    private readonly MAX_PENDING_METRICS = 100;  // NEW: Maximum queue size
    private pendingMetrics: BuildMetrics[] = [];
    private metricsFlushTimer: NodeJS.Timeout | null = null;
    private readonly aggregationWindowMs = 5000;
    
    constructor(workspaceRoot: string, appendWriter?: AppendOnlyWriter, logger?: ILogger) {
        this.workspaceRoot = workspaceRoot;
        this.appendWriter = appendWriter || null;
        this.logger = logger || null; // ✅ Use ILogger instead of OutputChannel
        this.bundleFilePath = path.join(workspaceRoot, 'out', 'extension.js');
    }
    
    /**
     * Start monitoring build tasks
     */
    public async start(): Promise<void> {
        if (this.isActive) {
            this.logger?.warning('BuildMetricsListener already active');
            return;
        }
        
        this.isActive = true;
        this.logger?.system('🔨 BuildMetricsListener started');
        
        // Initialize append writer if needed
        if (!this.appendWriter) {
            const tracesDir = path.join(this.workspaceRoot, '.reasoning_rl4', 'traces');
            if (!fs.existsSync(tracesDir)) {
                fs.mkdirSync(tracesDir, { recursive: true });
            }
            
            const logPath = path.join(tracesDir, 'build_metrics.jsonl');
            // DROP_OLDEST strategy for non-critical data (metrics)
            this.appendWriter = new AppendOnlyWriter(logPath, {
              overflowStrategy: OverflowStrategy.DROP_OLDEST
            });
        }
        
        // ✅ FIXED: Store disposables
        // Monitor VS Code task execution
        this.disposables.push(
            vscode.tasks.onDidStartTask(e => {
                const taskName = e.execution.task.name;
                this.taskStartTimes.set(taskName, Date.now());
            })
        );
        
        this.disposables.push(
            vscode.tasks.onDidEndTask(async e => {
                await this.handleTaskEnd(e);
            })
        );
        
        // Also monitor bundle file changes (fallback for non-task builds)
        this.monitorBundleFile();
    }
    
    /**
     * Handle task completion
     */
    private async handleTaskEnd(e: vscode.TaskEndEvent): Promise<void> {
        const taskName = e.execution.task.name;
        const startTime = this.taskStartTimes.get(taskName);
        
        if (!startTime) {
            return; // Task wasn't tracked
        }
        
        const duration = Date.now() - startTime;
        this.taskStartTimes.delete(taskName);
        
        // Detect if it's a build/compile task
        const isBuildTask = /compile|build|webpack|tsc/i.test(taskName);
        
        if (!isBuildTask) {
            return; // Only track build-related tasks
        }
        
        const metrics: BuildMetrics = {
            timestamp: new Date().toISOString(),
            trigger: this.detectTrigger(taskName),
            duration_ms: duration,
            success: true, // VS Code doesn't provide exit code in onDidEndTask
            errors_count: 0, // Would need terminal output parsing
            warnings_count: 0,
            bundle_size_bytes: this.getBundleSize()
        };
        
        await this.queueMetrics(metrics);
        
        this.logger?.system(`🔨 Build completed: ${taskName} (${duration}ms)`);
    }
    
    /**
     * Detect build trigger type
     */
    private detectTrigger(taskName: string): 'manual' | 'watch' | 'extension_reload' {
        if (/watch/i.test(taskName)) {
            return 'watch';
        }
        if (/extension|reload/i.test(taskName)) {
            return 'extension_reload';
        }
        return 'manual';
    }
    
    /**
     * Get bundle file size
     */
    private getBundleSize(): number | undefined {
        try {
            if (fs.existsSync(this.bundleFilePath)) {
                const stats = fs.statSync(this.bundleFilePath);
                return stats.size;
            }
        } catch (e) {
            // Ignore errors
        }
        return undefined;
    }
    
    /**
     * Monitor bundle file for changes (fallback detection)
     */
    private monitorBundleFile(): void {
        if (!fs.existsSync(this.bundleFilePath)) {
            return;
        }
        
        let lastSize = this.getBundleSize();
        let lastMtime = fs.statSync(this.bundleFilePath).mtimeMs;
        
        // ✅ FIXED: Store interval for cleanup
        // Check every 30 seconds
        this.bundleMonitorInterval = setInterval(() => {
            try {
                if (!fs.existsSync(this.bundleFilePath)) {
                    return;
                }
                
                const stats = fs.statSync(this.bundleFilePath);
                
                // Detect change
                if (stats.mtimeMs !== lastMtime) {
                    const currentSize = stats.size;
                    const sizeDelta = lastSize ? currentSize - lastSize : 0;
                    
                    // Log bundle change
                    if (sizeDelta !== 0) {
                        this.logger?.system(`📦 Bundle updated: ${currentSize} bytes (${sizeDelta > 0 ? '+' : ''}${sizeDelta})`);
                    }
                    
                    lastSize = currentSize;
                    lastMtime = stats.mtimeMs;
                }
            } catch (e) {
                // Ignore errors
            }
        }, 30000);
    }
    
    /**
     * Queue metrics for batched flush
     * 
     * NEW: Drop oldest if queue is full (FIFO)
     */
    private async queueMetrics(metrics: BuildMetrics): Promise<void> {
        // NEW: Drop oldest if full
        if (this.pendingMetrics.length >= this.MAX_PENDING_METRICS) {
            this.pendingMetrics.shift(); // Drop oldest (FIFO)
            this.logger?.warning(`[BuildMetricsListener] Queue full, dropping oldest metric`);
        }
        
        this.pendingMetrics.push(metrics);
        if (!this.metricsFlushTimer) {
            this.metricsFlushTimer = setTimeout(() => {
                this.flushMetrics().catch(err => this.logger?.warning(`BuildMetrics flush error: ${err}`));
            }, this.aggregationWindowMs);
        }
    }

    /**
     * Persist build metrics to JSONL (batched)
     */
    private async flushMetrics(): Promise<void> {
        if (!this.appendWriter || this.pendingMetrics.length === 0) {
            this.metricsFlushTimer = null;
            return;
        }

        const toFlush = [...this.pendingMetrics];
        this.pendingMetrics = [];
        this.metricsFlushTimer = null;

        for (const metrics of toFlush) {
            const event: CaptureEvent = {
                id: `build-${Date.now()}-${uuidv4().substring(0, 8)}`,
                type: 'build_metrics',
                timestamp: metrics.timestamp,
                source: 'BuildMetricsListener',
                metadata: metrics
            };
            await this.appendWriter.append(event);
        }

        await this.appendWriter.flush();
    }
    
    /**
     * Stop monitoring
     */
    public async stop(): Promise<void> {
        if (!this.isActive) {
            return;
        }
        
        this.isActive = false;
        
        // ✅ FIXED: Dispose all event listeners
        this.dispose();
        
        if (this.appendWriter) {
            await this.appendWriter.flush();
        }
        // Flush any pending metrics
        if (this.pendingMetrics.length > 0) {
            await this.flushMetrics();
        }
        
        this.logger?.system('🔨 BuildMetricsListener stopped');
    }
    
    /**
     * ✅ NEW: Dispose all VS Code event listeners
     */
    public dispose(): void {
        // Clear interval if exists
        if (this.bundleMonitorInterval) {
            clearInterval(this.bundleMonitorInterval);
            this.bundleMonitorInterval = null;
        }
        
        // Dispose all event listeners
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        
        this.logger?.system('🔨 BuildMetricsListener disposed (all listeners + timers cleaned)');
    }
    
    /**
     * Get current status
     */
    public getStatus(): { active: boolean; tracked_tasks: number } {
        return {
            active: this.isActive,
            tracked_tasks: this.taskStartTimes.size
        };
    }
}

/**
 * Build Metrics Interface
 */
export interface BuildMetrics {
    timestamp: string;
    trigger: 'manual' | 'watch' | 'extension_reload';
    duration_ms: number;
    success: boolean;
    errors_count: number;
    warnings_count: number;
    bundle_size_bytes?: number;
}
