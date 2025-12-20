import * as path from "path";
import { CognitiveLogger } from "./core/CognitiveLogger";
import { GlobalClock } from "./GlobalClock";
import { FileChangeWatcher } from "./inputs/FileChangeWatcher";
import { GitCommitListener } from "./inputs/GitCommitListener";
import { AppendOnlyWriter } from "./AppendOnlyWriter";
import { SnapshotRotation } from "./indexer/SnapshotRotation";
import { RL4CacheIndexer } from "./indexer/CacheIndex";
import { RBOMLedger } from "./rbom/RBOMLedger";
import { WriteAheadLog } from "./persistence/WriteAheadLog";
import { StateRegistry } from "./StateRegistry";
import { ActivityReconstructor } from "./api/ActivityReconstructor";
import { WriteTracker } from "./WriteTracker";
import { HealthMonitor } from "./HealthMonitor";
import { GroundTruthSystem } from "./ground_truth/GroundTruthSystem";
import { CrossFileConsistencyValidator } from "./validation/CrossFileConsistencyValidator";
import { TimelineAggregator } from "./indexer/TimelineAggregator";

interface SchedulerOptions {
    tickIntervalSec?: number;         // Default: 10s
    hourlySummaryIntervalMs?: number; // Default: 1h
    gapThresholdMs?: number;          // Default: 15 minutes
    cyclesWriter?: AppendOnlyWriter;
    snapshotRotation?: SnapshotRotation;
    cacheIndexer?: RL4CacheIndexer;
    rbomLedger?: RBOMLedger;
    wal?: WriteAheadLog;
    stateRegistry?: StateRegistry;
    activityReconstructor?: ActivityReconstructor;
    healthMonitor?: HealthMonitor;
    groundTruthSystem?: GroundTruthSystem;
    consistencyValidator?: CrossFileConsistencyValidator;
    timelineAggregator?: TimelineAggregator;
    rotationIntervalCycles?: number;  // Default: 100
    workspaceRoot?: string;
}

export interface CycleResult {
    cycleId: number;
    success: boolean;
    phases: string[];
    duration: number;
    errors: string[];
}

export class CognitiveScheduler {
    private logger: CognitiveLogger;
    private clock: GlobalClock;
    private fsWatcher: FileChangeWatcher;
    private gitListener: GitCommitListener;
    private writer: AppendOnlyWriter;
    private cyclesWriter: AppendOnlyWriter | null = null;
    private snapshotRotation: SnapshotRotation | null = null;
    private cacheIndexer: RL4CacheIndexer | null = null;
    private rbomLedger: RBOMLedger | null = null;
    private wal: WriteAheadLog | null = null;
    private stateRegistry: StateRegistry | null = null;
    private activityReconstructor: ActivityReconstructor | null = null;
    private writeTracker: WriteTracker | null = null;
    private healthMonitor: HealthMonitor | null = null;
    private groundTruthSystem: GroundTruthSystem | null = null;
    private consistencyValidator: CrossFileConsistencyValidator | null = null;
    private timelineAggregator: TimelineAggregator | null = null;
    private workspaceRoot: string;

    private options: SchedulerOptions;
    private timer: NodeJS.Timeout | null = null;
    private cycleId = 0;
    private cycleIdInitialized = false;

    private lastActivityTimestamp = Date.now();
    private lastHourlySummaryTime = Date.now();
    private lastGapLoggedMinutes = 0; // Déduplication des logs de gap
    private readonly GAP_LOG_INTERVAL_MINUTES = 5; // ✅ OPTIMISATION: Logger seulement toutes les 5 minutes
    private lastCycleResult: CycleResult | null = null;

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
        this.cyclesWriter = options.cyclesWriter || null;
        this.snapshotRotation = options.snapshotRotation || null;
        this.cacheIndexer = options.cacheIndexer || null;
        this.rbomLedger = options.rbomLedger || null;
        this.wal = options.wal || null;
        this.stateRegistry = options.stateRegistry || null;
        this.activityReconstructor = options.activityReconstructor || null;
        this.healthMonitor = options.healthMonitor || null;
        this.groundTruthSystem = options.groundTruthSystem || null;
        this.consistencyValidator = options.consistencyValidator || null;
        this.timelineAggregator = options.timelineAggregator || null;
        this.writeTracker = WriteTracker.getInstance();
        this.workspaceRoot = options.workspaceRoot || process.cwd();

        this.options = {
            tickIntervalSec: options.tickIntervalSec ?? 10,
            hourlySummaryIntervalMs: options.hourlySummaryIntervalMs ?? 3600000, // 1h
            gapThresholdMs: options.gapThresholdMs ?? 15 * 60 * 1000, // 15min
            rotationIntervalCycles: options.rotationIntervalCycles ?? 100,
        };

        // Initialize cycleId from last persisted cycle
        this.initializeCycleIdFromLedger();
    }

    /**
     * Initialize cycleId from the last entry in cycles.jsonl
     * Ensures monotonic cycleId across restarts
     */
    private initializeCycleIdFromLedger(): void {
        if (this.cycleIdInitialized) return;

        const cyclesPath = path.join(this.workspaceRoot, ".reasoning_rl4", "ledger", "cycles.jsonl");
        
        try {
            const fs = require('fs');
            if (!fs.existsSync(cyclesPath)) {
                this.logger.system("[CycleId] No cycles.jsonl found, starting from 0");
                this.cycleIdInitialized = true;
                return;
            }

            const content = fs.readFileSync(cyclesPath, 'utf-8');
            const lines = content.trim().split('\n').filter((l: string) => l.trim());
            
            if (lines.length === 0) {
                this.logger.system("[CycleId] cycles.jsonl is empty, starting from 0");
                this.cycleIdInitialized = true;
                return;
            }

            // Read last line to get last cycleId
            const lastLine = lines[lines.length - 1];
            const lastCycle = JSON.parse(lastLine);
            
            if (lastCycle && typeof lastCycle.cycleId === 'number') {
                this.cycleId = lastCycle.cycleId;
                this.logger.system(`[CycleId] Restored from ledger: continuing from cycleId=${this.cycleId}`);
            }
        } catch (error) {
            this.logger.system(`[CycleId] Failed to read cycles.jsonl: ${error}. Starting from 0`);
        }

        this.cycleIdInitialized = true;
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

        // 2) RUN CYCLE (KMS)
        await this.runCycle();

        // 3) HOURLY SUMMARY
        if (now - this.lastHourlySummaryTime >= this.options.hourlySummaryIntervalMs!) {
            this.handleHourlySummary();
            this.lastHourlySummaryTime = now;
        }

        // 4) WRITE SYSTEM METRICS
        this.handleSystemMetrics();

        // 5) Persist scheduler tick
        await this.writer.append({ event: "scheduler_tick", timestamp: new Date().toISOString() });
    }

    /**
     * MAIN CYCLE — phases séquentielles (ingest → persist → snapshot → index → health/status)
     */
    private async runCycle(): Promise<CycleResult> {
        this.cycleId++;
        const cycleStart = Date.now();
        const timestamp = new Date().toISOString();
        let success = true;
        const errors: string[] = [];
        const phases: string[] = [];

        this.logger.system(`[Cycle ${this.cycleId}] Starting...`);

        // StateRegistry: début de cycle
        if (this.stateRegistry) {
            await this.stateRegistry.updateCycle({
                cycleId: this.cycleId,
                startTime: timestamp,
                phase: "implementation",
                eventsCount: 0,
                success: true,
                errors: []
            });
        }

        try {
            // PHASE 2: PERSIST
            phases.push("persist");
            await this.phasePersistCycle(timestamp, cycleStart);

            // PHASE 3: SNAPSHOT
            phases.push("snapshot");
            await this.phaseSnapshot();

            // PHASE 4: INDEX
            phases.push("index");
            await this.phaseIndex(timestamp);

            // PHASE 4bis: ACTIVITY RECONSTRUCTION (optionnel, périodique)
            if (this.activityReconstructor && this.cycleId % 10 === 0) {
                try {
                    phases.push("activity_reconstruction");
                    await this.activityReconstructor.reconstruct();
                } catch (err) {
                    this.logger.system(`[Cycle ${this.cycleId}] ActivityReconstructor error: ${err}`);
                }
            }

            // PHASE 5: HEALTH/STATUS
            phases.push("health_status");
            await this.phaseHealthStatus();

            const duration = Date.now() - cycleStart;
            this.logger.system(`[Cycle ${this.cycleId}] Complete in ${duration}ms`);
            this.lastCycleResult = {
                cycleId: this.cycleId,
                success,
                phases,
                duration,
                errors,
            };
            return this.lastCycleResult;
        } catch (error: any) {
            success = false;
            errors.push(error?.message || String(error));
            this.logger.system(`[Cycle ${this.cycleId}] ERROR: ${error}`);
        } finally {
            if (this.stateRegistry) {
                await this.stateRegistry.completeCycle(success, errors);
            }
        }

        this.lastCycleResult = {
            cycleId: this.cycleId,
            success,
            phases,
            duration: Date.now() - cycleStart,
            errors,
        };
        return this.lastCycleResult;
    }

    /**
     * PHASE 2: Persist cycle summary to cycles.jsonl
     */
    private async phasePersistCycle(timestamp: string, cycleStart: number): Promise<void> {
        if (!this.cyclesWriter) return;

        const cycleData = {
            cycleId: this.cycleId,
            timestamp,
            startedAt: cycleStart,
            duration: Date.now() - cycleStart,
            phases: {
                ingest: {},
                persist: { success: true }
            },
            metadata: {
                heapUsed: process.memoryUsage().heapUsed
            }
        };

        const cyclesFilePath = path.join(this.workspaceRoot, ".reasoning_rl4", "ledger", "cycles.jsonl");

        // WAL avant écriture
        if (this.wal) {
            this.wal.logSync("cycles.jsonl", JSON.stringify(cycleData));
        }

        // WriteTracker
        this.writeTracker?.markInternalWrite(cyclesFilePath);

        // Append cycles.jsonl
        await this.cyclesWriter.append(cycleData);

        // RBOM ledger
        if (this.rbomLedger) {
            await this.rbomLedger.append("cycle", { cycleId: this.cycleId });
        }
    }

    /**
     * PHASE 3: Save lightweight snapshot
     */
    private async phaseSnapshot(): Promise<void> {
        if (!this.snapshotRotation) return;

        await this.snapshotRotation.saveSnapshot(this.cycleId, {
            patterns: [],
            correlations: [],
            forecasts: [],
            cognitive_load: 0,
            git_context: {},
            files_active: []
        });

        const snapshotPath = path.join(this.workspaceRoot, ".reasoning_rl4", "snapshots", `snapshot-${this.cycleId}.json`);
        this.writeTracker?.markInternalWrite(snapshotPath);

        // Rotation périodique
        const rotationInterval = this.options.rotationIntervalCycles || 100;
        if (this.cycleId % rotationInterval === 0) {
            await this.snapshotRotation.rotateIfNeeded();
        }
    }

    /**
     * PHASE 4: Update cache index
     */
    private async phaseIndex(timestamp: string): Promise<void> {
        if (!this.cacheIndexer) return;

        await this.cacheIndexer.updateIncremental(
            {
                cycleId: this.cycleId,
                timestamp,
                phases: {}
            },
            []
        );
    }

    /**
     * PHASE 5: Health and status
     */
    private async phaseHealthStatus(): Promise<void> {
        const rotationInterval = this.options.rotationIntervalCycles || 100;

        // Ground truth verification périodique
        if (this.groundTruthSystem && this.cycleId % rotationInterval === 0 && this.groundTruthSystem.isEstablished()) {
            const result = this.groundTruthSystem.verifyIntegrity();
            if (!result.valid) {
                this.logger.system(`[GroundTruth] Integrity check failed: ${result.error}`);
            }
        }

        // Timeline aggregator périodique
        if (this.timelineAggregator && this.cycleId % rotationInterval === 0) {
            const today = new Date().toISOString().split("T")[0];
            try {
                await this.timelineAggregator.generateTimeline(today);
            } catch (err) {
                this.logger.system(`[TimelineAggregator] Error: ${err}`);
            }
        }

        // Cross-file consistency périodique (faible fréquence)
        if (this.consistencyValidator && this.cycleId % 1000 === 0) {
            try {
                const result = await this.consistencyValidator.validate();
                if (!result.valid) {
                    this.logger.system(`[ConsistencyValidator] Issues: ${result.statistics.errorCount} errors, ${result.statistics.warningCount} warnings`);
                }
            } catch (err) {
                this.logger.system(`[ConsistencyValidator] Error: ${err}`);
            }
        }
    }

    /**
     * Called when no activity has been detected for a long time.
     */
    private handleGap(deltaMs: number) {
        const mins = Math.round(deltaMs / 60000);

        // ✅ OPTIMISATION: Logger seulement toutes les 5 minutes (au lieu de chaque minute)
        // Calculer le "seuil" de minutes pour lequel on doit logger (multiples de 5)
        const logThreshold = Math.floor(mins / this.GAP_LOG_INTERVAL_MINUTES) * this.GAP_LOG_INTERVAL_MINUTES;
        const lastLoggedThreshold = Math.floor(this.lastGapLoggedMinutes / this.GAP_LOG_INTERVAL_MINUTES) * this.GAP_LOG_INTERVAL_MINUTES;
        
        if (logThreshold > lastLoggedThreshold && logThreshold >= this.GAP_LOG_INTERVAL_MINUTES) {
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

    /**
     * Expose last cycle health snapshot.
     */
    getLastCycleHealth(): CycleResult | null {
        return this.lastCycleResult;
    }

    /**
     * Run an immediate cycle (manual trigger).
     */
    async runOnce(): Promise<CycleResult> {
        return this.runCycle();
    }
}