import { CognitiveLogger } from "./core/CognitiveLogger";
import { GlobalClock } from "./GlobalClock";
import { FileChangeWatcher } from "./inputs/FileChangeWatcher";
import { GitCommitListener } from "./inputs/GitCommitListener";
import { AppendOnlyWriter } from "./AppendOnlyWriter";

interface SchedulerOptions {
    tickIntervalSec?: number;         // Default: 10s
    hourlySummaryIntervalMs?: number; // Default: 1h
    gapThresholdMs?: number;          // Default: 15 minutes
}

export class CognitiveScheduler {
    private logger: CognitiveLogger;
    private clock: GlobalClock;
    private fsWatcher: FileChangeWatcher;
    private gitListener: GitCommitListener;
    private writer: AppendOnlyWriter;

    private options: SchedulerOptions;
    private timer: NodeJS.Timeout | null = null;

    private lastActivityTimestamp = Date.now();
    private lastHourlySummaryTime = Date.now();
    private lastGapLoggedMinutes = 0; // Déduplication des logs de gap

    constructor(
        logger: CognitiveLogger,
        clock: GlobalClock,
        fsWatcher: FileChangeWatcher,
        gitListener: GitCommitListener,
        writer: AppendOnlyWriter,
        options: SchedulerOptions = {}
    ) {
        this.logger = logger;
        this.clock = clock;
        this.fsWatcher = fsWatcher;
        this.gitListener = gitListener;
        this.writer = writer;

        this.options = {
            tickIntervalSec: options.tickIntervalSec ?? 10,
            hourlySummaryIntervalMs: options.hourlySummaryIntervalMs ?? 3600000, // 1h
            gapThresholdMs: options.gapThresholdMs ?? 15 * 60 * 1000, // 15min
        };
    }

    /**
     * Starts the periodic scheduler.
     */
    start() {
        if (this.timer) return;

        this.logger.system("CognitiveScheduler: started");
        this.timer = setInterval(() => this.tick(), this.options.tickIntervalSec! * 1000);
    }

    /**
     * Stops scheduler.
     */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.logger.system("CognitiveScheduler: stopped");
    }

    /**
     * MAIN LOOP — executed every tickIntervalSec.
     */
    private async tick() {
        const now = Date.now();

        // Update last activity if FS or Git has changed recently
        const delta = now - this.lastActivityTimestamp;

        // 1) GAP DETECTION
        if (delta > this.options.gapThresholdMs!) {
            this.handleGap(delta);
        }

        // 2) HOURLY SUMMARY
        if (now - this.lastHourlySummaryTime >= this.options.hourlySummaryIntervalMs!) {
            this.handleHourlySummary();
            this.lastHourlySummaryTime = now;
        }

        // 3) WRITE SYSTEM METRICS
        this.handleSystemMetrics();

        // 4) Persist scheduler tick
        await this.writer.append({ event: "scheduler_tick", timestamp: new Date().toISOString() });
    }

    /**
     * Called when no activity has been detected for a long time.
     */
    private handleGap(deltaMs: number) {
        const mins = Math.round(deltaMs / 60000);

        // ✅ DÉDUPLICATION: Ne logger qu'une fois par minute
        if (mins !== this.lastGapLoggedMinutes) {
            this.logger.system(`⏸️ Gap detected: no activity for ${mins} minutes`);
            this.writer.append({ event: "gap_detected", minutes: mins });
            this.lastGapLoggedMinutes = mins;
        }
    }

    /**
     * Generates hourly summary using logger data + file watchers.
     */
    private handleHourlySummary() {
        const summary = {
            cycles_captured: 0, // TODO: this.clock.getCycleCount() - méthode non implémentée
            file_changes: 0, // TODO: this.fsWatcher.getAggregatedChanges() - méthode non implémentée
            git_commits: 0, // TODO: this.gitListener.getCommitCount() - méthode non implémentée
            health_checks: 0, // TODO: this.clock.getHealthCheckCount() - méthode non implémentée
            gaps_detected: 0, // TODO: this.clock.getGapsCount() - méthode non implémentée
            health_status: "unknown", // TODO: this.clock.getHealthStatus() - méthode non implémentée
            data_integrity: "valid",
        };

        this.logger.log("SYSTEM", "Hourly summary generated");

        // If logger is in debug mode → visual block
        // this.logger.logHourlySummary?.(summary); // TODO: méthode non implémentée

        this.writer.append({
            event: "hourly_summary",
            summary,
        });

        // Reset aggregates where needed
        // this.fsWatcher.resetChanges(); // TODO: méthode non implémentée
        // this.gitListener.resetCommits(); // TODO: méthode non implémentée
    }

    /**
     * Write low-level metrics once per tick.
     */
    private handleSystemMetrics() {
        const metrics = {
            heapUsed: process.memoryUsage().heapUsed,
            eventLoopDelay: 0, // TODO: this.clock.getEventLoopLag() - méthode non implémentée
            queueDepth: this.writerQueueSize(),
        };

        // this.logger.logSystemMetrics?.(metrics); // TODO: méthode non implémentée
        this.writer.append({ event: "system_metrics", metrics });
    }

    private writerQueueSize(): number {
        // @ts-ignore internal property
        return this.writer.queue?.length ?? 0;
    }

    /**
     * Must be called whenever the system receives:
     * - FS change
     * - Git commit
     * - Kernel command
     */
    notifyActivity() {
        this.lastActivityTimestamp = Date.now();
    }
}