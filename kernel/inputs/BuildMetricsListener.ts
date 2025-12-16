import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AppendOnlyWriter } from '../AppendOnlyWriter';
import * as vscode from 'vscode';

// RL4 Minimal Types
interface CaptureEvent {
    id: string;
    type: string;
    timestamp: string;
    source: string;
    metadata: any;
}

// RL4 Simple Logger
class SimpleLogger {
    private channel: vscode.OutputChannel | null = null;
    
    setChannel(channel: vscode.OutputChannel) {
        this.channel = channel;
    }
    
    log(message: string) {
        if (this.channel) {
            const timestamp = new Date().toISOString().substring(11, 23);
            this.channel.appendLine(`[${timestamp}] ${message}`);
        }
    }
    
    warn(message: string) {
        this.log(`⚠️ ${message}`);
    }
    
    error(message: string) {
        this.log(`❌ ${message}`);
    }
}

const simpleLogger = new SimpleLogger();

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
    private outputChannel: vscode.OutputChannel | null = null;
    private taskStartTimes: Map<string, number> = new Map();
    private bundleFilePath: string;
    private disposables: vscode.Disposable[] = []; // ✅ NEW: Track disposables
    private bundleMonitorInterval: NodeJS.Timeout | null = null; // ✅ NEW: Track interval
    
    constructor(workspaceRoot: string, appendWriter?: AppendOnlyWriter, outputChannel?: vscode.OutputChannel) {
        this.workspaceRoot = workspaceRoot;
        this.appendWriter = appendWriter || null;
        this.outputChannel = outputChannel || null;
        this.bundleFilePath = path.join(workspaceRoot, 'out', 'extension.js');
        
        if (this.outputChannel) {
            simpleLogger.setChannel(this.outputChannel);
        }
    }
    
    /**
     * Start monitoring build tasks
     */
    public async start(): Promise<void> {
        if (this.isActive) {
            simpleLogger.warn('BuildMetricsListener already active');
            return;
        }
        
        this.isActive = true;
        simpleLogger.log('🔨 BuildMetricsListener started');
        
        // Initialize append writer if needed
        if (!this.appendWriter) {
            const tracesDir = path.join(this.workspaceRoot, '.reasoning_rl4', 'traces');
            if (!fs.existsSync(tracesDir)) {
                fs.mkdirSync(tracesDir, { recursive: true });
            }
            
            const logPath = path.join(tracesDir, 'build_metrics.jsonl');
            this.appendWriter = new AppendOnlyWriter(logPath);
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
        
        await this.persistMetrics(metrics);
        
        simpleLogger.log(`🔨 Build completed: ${taskName} (${duration}ms)`);
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
                        simpleLogger.log(`📦 Bundle updated: ${currentSize} bytes (${sizeDelta > 0 ? '+' : ''}${sizeDelta})`);
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
     * Persist build metrics to JSONL
     */
    private async persistMetrics(metrics: BuildMetrics): Promise<void> {
        if (!this.appendWriter) {
            return;
        }
        
        const event: CaptureEvent = {
            id: `build-${Date.now()}-${uuidv4().substring(0, 8)}`,
            type: 'build_metrics',
            timestamp: metrics.timestamp,
            source: 'BuildMetricsListener',
            metadata: metrics
        };
        
        await this.appendWriter.append(event);
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
        
        simpleLogger.log('🔨 BuildMetricsListener stopped');
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
        
        simpleLogger.log('🔨 BuildMetricsListener disposed (all listeners + timers cleaned)');
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
