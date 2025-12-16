/**
 * HealthMonitor - System Health Tracking
 *
 * Monitors memory, timers, queue size, event loop lag
 * Generates alerts if thresholds exceeded
 *
 * RL4 Kernel Component #5
 */

import { TimerRegistry } from './TimerRegistry';
import { AppendOnlyWriter } from './AppendOnlyWriter';

export interface HealthMetrics {
    memoryMB: number;
    activeTimers: number;
    queueSize: number;
    eventLoopLag: {
        p50: number;
        p90: number;
        p95: number;
        p99: number;
    };
    uptime: number;
    lastCheck: string;
}

export interface HealthAlert {
    severity: 'warning' | 'critical';
    type: string;
    message: string;
    threshold: number;
    actual: number;
}

export class HealthMonitor {
    private timerRegistry: TimerRegistry;
    private writer: AppendOnlyWriter;
    private checkInterval: number = 10000; // 10s
    private lagSamples: number[] = [];
    private startTime: number;

    // Thresholds
    private readonly MEMORY_CRITICAL_MB = 500;
    private readonly TIMERS_WARNING = 20;
    private readonly QUEUE_WARNING = 1000;

    constructor(
        workspaceRoot: string,
        timerRegistry: TimerRegistry
    ) {
        this.timerRegistry = timerRegistry;
        this.writer = new AppendOnlyWriter(
            `${workspaceRoot}/.reasoning_rl4/diagnostics/health.jsonl`
        );
        this.startTime = Date.now();
    }

    /**
     * Start health monitoring
     */
    start(timerRegistry: TimerRegistry): void {
        timerRegistry.registerInterval(
            'kernel:health-monitor',
            () => this.checkHealth(),
            this.checkInterval
        );

        // Start lag monitoring
        this.startLagMonitoring(timerRegistry);
    }

    /**
     * Stop health monitoring
     */
    async stop(): Promise<void> {
        await this.writer.flush(); // fsync - TODO: AppendOnlyWriter.flush() ne prend pas d'argument
    }

    /**
     * Check system health
     */
    private async checkHealth(): Promise<void> {
        const metrics = this.collectMetrics();
        const alerts = this.checkThresholds(metrics);

        // Log metrics
        await this.writer.append({
            type: 'health_check',
            metrics,
            alerts
        });

        // Log alerts to console
        if (alerts.length > 0) {
            for (const alert of alerts) {
                const icon = alert.severity === 'critical' ? '🔥' : '⚠️';
                console.warn(`${icon} Health Alert [${alert.type}]: ${alert.message}`);
            }
        }
    }

    /**
     * Collect current metrics
     */
    private collectMetrics(): HealthMetrics {
        const memUsage = process.memoryUsage();
        const timerCount = this.timerRegistry.getActiveCount();

        return {
            memoryMB: memUsage.heapUsed / 1024 / 1024,
            activeTimers: timerCount.total,
            queueSize: 0, // TODO: get from AsyncIOQueue
            eventLoopLag: this.calculateLagPercentiles(),
            uptime: Date.now() - this.startTime,
            lastCheck: new Date().toISOString()
        };
    }

    /**
     * Check thresholds and generate alerts
     */
    private checkThresholds(metrics: HealthMetrics): HealthAlert[] {
        const alerts: HealthAlert[] = [];

        // Memory check
        if (metrics.memoryMB > this.MEMORY_CRITICAL_MB) {
            alerts.push({
                severity: 'critical',
                type: 'memory_leak',
                message: `Memory usage: ${metrics.memoryMB.toFixed(0)}MB`,
                threshold: this.MEMORY_CRITICAL_MB,
                actual: metrics.memoryMB
            });
        }

        // Timer check
        if (metrics.activeTimers > this.TIMERS_WARNING) {
            alerts.push({
                severity: 'warning',
                type: 'timer_leak',
                message: `Active timers: ${metrics.activeTimers}`,
                threshold: this.TIMERS_WARNING,
                actual: metrics.activeTimers
            });
        }

        // Queue check
        if (metrics.queueSize > this.QUEUE_WARNING) {
            alerts.push({
                severity: 'warning',
                type: 'queue_backlog',
                message: `Queue size: ${metrics.queueSize}`,
                threshold: this.QUEUE_WARNING,
                actual: metrics.queueSize
            });
        }

        // Event loop lag check
        if (metrics.eventLoopLag.p99 > 100) {
            alerts.push({
                severity: 'warning',
                type: 'event_loop_lag',
                message: `Event loop lag p99: ${metrics.eventLoopLag.p99.toFixed(0)}ms`,
                threshold: 100,
                actual: metrics.eventLoopLag.p99
            });
        }

        return alerts;
    }

    /**
     * Start event loop lag monitoring
     */
    private startLagMonitoring(timerRegistry: TimerRegistry): void {
        timerRegistry.registerInterval(
            'kernel:lag-monitor',
            () => this.measureLag(),
            1000 // Every second
        );
    }

    /**
     * Measure event loop lag
     */
    private measureLag(): void {
        const start = process.hrtime.bigint();

        setImmediate(() => {
            const lag = Number(process.hrtime.bigint() - start) / 1e6; // ms
            this.lagSamples.push(lag);

            // Keep only last 1000 samples
            if (this.lagSamples.length > 1000) {
                this.lagSamples.shift();
            }
        });
    }

    /**
     * Calculate lag percentiles
     */
    private calculateLagPercentiles(): { p50: number; p90: number; p95: number; p99: number } {
        if (this.lagSamples.length === 0) {
            return { p50: 0, p90: 0, p95: 0, p99: 0 };
        }

        const sorted = [...this.lagSamples].sort((a, b) => a - b);

        return {
            p50: sorted[Math.floor(sorted.length * 0.50)] || 0,
            p90: sorted[Math.floor(sorted.length * 0.90)] || 0,
            p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
            p99: sorted[Math.floor(sorted.length * 0.99)] || 0
        };
    }

    /**
     * Get current metrics (sync)
     */
    getMetrics(): HealthMetrics {
        return this.collectMetrics();
    }
}

