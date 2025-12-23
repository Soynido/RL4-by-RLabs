#!/usr/bin/env node

/**
 * RL4 Kernel Process Entrypoint
 * 
 * This is the main entry point for the RL4 kernel process.
 * It initializes all core components and starts the scheduler.
 * 
 * Usage: node entrypoint.js <workspaceRoot>
 */

import * as path from 'path';
import * as fs from 'fs';
import { GlobalClock } from '../GlobalClock';
import { TimerRegistry } from '../TimerRegistry';
import { StateRegistry } from '../StateRegistry';
import { AppendOnlyWriter } from '../AppendOnlyWriter';
import { CognitiveLogger } from '../core/CognitiveLogger';
import { FileChangeWatcher } from '../inputs/FileChangeWatcher';
import { GitCommitListener } from '../inputs/GitCommitListener';
import { CognitiveScheduler } from '../CognitiveScheduler';
import { ExecPool } from '../ExecPool';
import { HealthMonitor } from '../HealthMonitor';
import { GovernanceModeManager } from '../api/GovernanceModeManager';
import { UnifiedPromptBuilder } from '../api/UnifiedPromptBuilder';
import { PlanTasksContextParser } from '../api/PlanTasksContextParser';
import { detectWorkspaceState } from '../onboarding/OnboardingDetector';
import { DeltaCalculator } from '../api/DeltaCalculator';
import { SessionCaptureManager } from '../api/SessionCaptureManager';
import { TaskManager } from '../api/TaskManager';
import { PhaseDetector } from '../api/PhaseDetector';
import { SystemStatusProvider } from '../api/SystemStatusProvider';
import { TimeMachinePromptBuilder } from '../api/TimeMachinePromptBuilder';
import { IntentionResolver } from '../core/IntentionResolver';
import { SnapshotRotation } from '../indexer/SnapshotRotation';
import { RL4CacheIndexer } from '../indexer/CacheIndex';
import { RBOMLedger } from '../rbom/RBOMLedger';
import { WriteAheadLog } from '../persistence/WriteAheadLog';
import { GroundTruthSystem } from '../ground_truth/GroundTruthSystem';
import { CrossFileConsistencyValidator } from '../validation/CrossFileConsistencyValidator';
import { ActivityReconstructor } from '../api/ActivityReconstructor';
import { TimelineAggregator } from '../indexer/TimelineAggregator';
import { MIL } from '../memory/MIL';
import { CursorChatListener } from '../inputs/CursorChatListener';
import { DecisionStore } from '../cognitive/DecisionStore';
import { DecisionExtractor } from '../cognitive/DecisionExtractor';
import { DecisionInvalidator } from '../cognitive/DecisionInvalidator';
import { RCEPStore } from '../storage/RCEPStore';
import { SCFCompressor } from '../scf/SCFCompressor';
import { ReplayEngine } from '../replay/ReplayEngine';
import { PromptCodecRL4 } from '../rl4/PromptCodecRL4';

// Global kernel components (accessible to IPC handlers)
let kernelComponents: {
    workspaceRoot: string;
    clock: GlobalClock;
    timerRegistry: TimerRegistry;
    stateRegistry: StateRegistry;
    appendWriter: AppendOnlyWriter;
    logger: CognitiveLogger;
    execPool: ExecPool;
    fsWatcher: FileChangeWatcher;
    gitListener: GitCommitListener;
    scheduler: CognitiveScheduler;
    healthMonitor: HealthMonitor | null;
    rbomLedger?: RBOMLedger;
    wal?: WriteAheadLog;
    snapshotRotation?: SnapshotRotation;
    cacheIndexer?: RL4CacheIndexer;
    activityReconstructor?: ActivityReconstructor;
    groundTruthSystem?: GroundTruthSystem;
    consistencyValidator?: CrossFileConsistencyValidator;
    timelineAggregator?: TimelineAggregator;
    cyclesWriter?: AppendOnlyWriter;
    // onboardingDetector is a function, not an instance
    deltaCalculator: DeltaCalculator;
    sessionCaptureManager: SessionCaptureManager;
    taskManager: TaskManager;
    phaseDetector: PhaseDetector;
    systemStatusProvider: SystemStatusProvider;
    timeMachinePromptBuilder: TimeMachinePromptBuilder;
    intentionResolver: IntentionResolver;
    mil?: MIL;
    decisionStore?: DecisionStore;
    rcepStore?: RCEPStore;
    scfCompressor?: SCFCompressor;
    replayEngine?: ReplayEngine;
    decisionInvalidator?: DecisionInvalidator;
    decisionExtractor?: DecisionExtractor;
} | null = null;

/**
 * Handle IPC queries from extension
 */
async function handleQuery(msg: any): Promise<void> {
    if (!kernelComponents) {
        process.send?.({ 
            type: 'query_reply', 
            query_seq: msg.query_seq, 
            success: false, 
            error: 'Kernel not initialized' 
        });
        return;
    }

    const { query_type, query_seq, payload } = msg;

    try {
        let data: any = {};

        switch (query_type) {
            case 'status': {
                const health = kernelComponents.healthMonitor?.getMetrics() || {
                    memoryMB: 0,
                    activeTimers: 0,
                    queueSize: 0,
                    eventLoopLag: { p50: 0, p90: 0, p95: 0, p99: 0 },
                    uptime: Math.floor((Date.now() - (kernelComponents.clock as any).startTime) / 1000),
                    lastCheck: new Date().toISOString()
                };
                const timerCount = kernelComponents.timerRegistry.getActiveCount();
                const state = kernelComponents.stateRegistry.getState();
                
                data = {
                    uptime: health.uptime,
                    health,
                    timers: timerCount.total,
                    queueSize: health.queueSize,
                    version: state.version || '1.0.0'
                };
                break;
            }

            case 'get_last_cycle_health': {
                const last = kernelComponents.scheduler.getLastCycleHealth();
                if (!last) {
                    data = {
                        cycleId: 0,
                        success: false,
                        phases: [],
                        duration: 0,
                        error: 'No cycle run yet'
                    };
                } else {
                    data = last;
                }
                break;
            }

            case 'reflect': {
                const result = await kernelComponents.scheduler.runOnce();
                data = result;
                break;
            }

            case 'flush': {
                await kernelComponents.appendWriter.flush();
                data = { success: true };
                break;
            }

            case 'shutdown': {
                kernelComponents.scheduler.stop();
                kernelComponents.fsWatcher.stopWatching();
                kernelComponents.gitListener.stopWatching();
                kernelComponents.timerRegistry.clearAll();
                await kernelComponents.appendWriter.flush();
                data = { success: true };
                break;
            }

            case 'get_mode': {
                const modeManager = (kernelComponents as any).governanceModeManager;
                if (!modeManager) {
                    throw new Error('GovernanceModeManager not initialized');
                }
                data = { mode: modeManager.getActiveMode() };
                break;
            }

            case 'set_mode': {
                const modeManager = (kernelComponents as any).governanceModeManager;
                if (!modeManager) {
                    throw new Error('GovernanceModeManager not initialized');
                }
                const { mode } = payload;
                if (!mode || !['strict', 'flexible', 'exploratory', 'free', 'firstUse'].includes(mode)) {
                    throw new Error(`Invalid mode: ${mode}`);
                }
                const success = modeManager.setMode(mode);
                data = { success, mode };
                break;
            }

            case 'generate_snapshot': {
                const promptBuilder = (kernelComponents as any).promptBuilder;
                if (!promptBuilder) {
                    throw new Error('UnifiedPromptBuilder not initialized');
                }
                const { mode } = payload;
                if (!mode || !['strict', 'flexible', 'exploratory', 'free', 'firstUse'].includes(mode)) {
                    throw new Error(`Invalid mode: ${mode}`);
                }

                // Resolve intention (Phase 0)
                const intentionResolver = (kernelComponents as any).intentionResolver;
                let result;
                if (intentionResolver) {
                    const intent = intentionResolver.resolve({
                        command: 'generate_snapshot',
                        mode,
                        cycleContext: payload.cycleContext,
                        projectState: payload.projectState
                    });
                    kernelComponents.logger?.info?.(`[Kernel] Resolved intent: kind=${intent.kind}, mode=${intent.mode}, confidence=${intent.source.confidence}`);
                    // Pass intent to builder (backward-compat: builder accepts it but may ignore it)
                    result = await promptBuilder.generate(mode, payload.cycleContext, intent);
                } else {
                    // Fallback if resolver not initialized (backward-compat)
                    result = await promptBuilder.generate(mode, payload.cycleContext);
                }
                data = {
                    prompt: result.prompt,
                    metadata: result.metadata
                };
                break;
            }

            case 'get_auto_tasks_count': {
                const count = await (kernelComponents as any).planTasksContextParser.getActiveTaskCount();
                data = { count };
                break;
            }

            case 'get_workspace_state': {
                const state = await detectWorkspaceState(kernelComponents.workspaceRoot);
                data = state;
                break;
            }

            case 'get_onboarding_status': {
                const markerPath = path.join(kernelComponents.workspaceRoot, '.reasoning_rl4', '.onboarding_complete');
                if (!fs.existsSync(markerPath)) {
                    data = { complete: false };
                } else {
                    const raw = fs.readFileSync(markerPath, 'utf8');
                    const parsed = JSON.parse(raw || '{}');
                    data = {
                        complete: true,
                        mode: parsed.mode,
                        firstUseMode: parsed.firstUseMode
                    };
                }
                break;
            }

            case 'mark_onboarding_complete': {
                const markerDir = path.join(kernelComponents.workspaceRoot, '.reasoning_rl4');
                fs.mkdirSync(markerDir, { recursive: true });
                const markerPath = path.join(markerDir, '.onboarding_complete');
                const marker = {
                    completed_at: new Date().toISOString(),
                    mode: payload?.mode || 'unknown',
                    firstUseMode: payload?.firstUseMode
                };
                fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2), 'utf-8');
                data = { success: true };
                break;
            }

            case 'reset_onboarding': {
                const markerPath = path.join(kernelComponents.workspaceRoot, '.reasoning_rl4', '.onboarding_complete');
                if (fs.existsSync(markerPath)) {
                    fs.unlinkSync(markerPath);
                }
                data = { success: true };
                break;
            }

            case 'get_timeline_range': {
                const ledgerDir = path.join(kernelComponents.workspaceRoot, '.reasoning_rl4', 'ledger');
                const cyclesPath = path.join(ledgerDir, 'cycles.jsonl');
                let firstCycleIso: string | null = null;
                let lastCycleIso: string | null = null;
                if (fs.existsSync(cyclesPath)) {
                    try {
                        const content = fs.readFileSync(cyclesPath, 'utf-8').trim();
                        if (content.length > 0) {
                            const lines = content.split('\n').filter(Boolean);
                            if (lines.length > 0) {
                                const first = JSON.parse(lines[0]);
                                const last = JSON.parse(lines[lines.length - 1]);
                                firstCycleIso = first?.timestamp || null;
                                lastCycleIso = last?.timestamp || null;
                            }
                        }
                    } catch (error) {
                        kernelComponents.logger?.error?.(`[Kernel] Failed to read timeline range: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
                data = { firstCycleIso, lastCycleIso };
                break;
            }

            case 'get_local_tasks': {
                const tasks = await (kernelComponents as any).taskManager.getLocalTasks();
                data = { tasks };
                break;
            }

            case 'add_local_task': {
                await (kernelComponents as any).taskManager.addLocalTask(payload.task);
                data = { success: true };
                break;
            }

            case 'toggle_local_task': {
                await (kernelComponents as any).taskManager.toggleLocalTask(payload.id);
                data = { success: true };
                break;
            }

            case 'get_captured_session': {
                const items = await (kernelComponents as any).sessionCaptureManager.getCapturedItems();
                data = { items };
                break;
            }

            case 'promote_to_rl4': {
                await (kernelComponents as any).sessionCaptureManager.promoteToRL4();
                data = { success: true };
                break;
            }

            case 'get_rl4_tasks': {
                const tasks = await (kernelComponents as any).taskManager.getRL4Tasks(payload.filter);
                data = { tasks };
                break;
            }

            case 'build_time_machine_prompt': {
                // Resolve intention (Phase 0)
                const intentionResolver = (kernelComponents as any).intentionResolver;
                if (intentionResolver) {
                    const intent = intentionResolver.resolve({
                        command: 'build_time_machine_prompt',
                        mode: payload.mode,
                        projectState: payload.projectState
                    });
                    kernelComponents.logger?.info?.(`[Kernel] Resolved intent: kind=${intent.kind}, mode=${intent.mode}, confidence=${intent.source.confidence}`);
                }
                const result = await (kernelComponents as any).timeMachinePromptBuilder.build({
                    startIso: payload.startIso,
                    endIso: payload.endIso
                });
                data = result;
                break;
            }

            case 'get_repo_delta': {
                const delta = await (kernelComponents as any).deltaCalculator.calculateRepoDelta();
                data = delta;
                break;
            }

            case 'get_plan_drift': {
                const drift = await (kernelComponents as any).planTasksContextParser.calculatePlanDrift();
                data = drift;
                break;
            }

            case 'get_blindspots': {
                // DEPRECATED: AnomalyDetector removed (violation Loi 1)
                // Blind spots detection should be done by LLM via prompts, not kernel
                data = {
                    bursts: 0,
                    gaps: 0,
                    samples: 0,
                    signals: []
                };
                break;
            }

            case 'get_current_phase': {
                const phase = await (kernelComponents as any).phaseDetector.detectCurrentPhase();
                data = { phase };
                break;
            }

            case 'reset_codec': {
                await (kernelComponents as any).systemStatusProvider.resetCodec();
                data = { success: true };
                break;
            }

            case 'export_logs': {
                const logs = await (kernelComponents as any).systemStatusProvider.exportLogs();
                data = { logs };
                break;
            }

            case 'get_faq': {
                const faq = await (kernelComponents as any).systemStatusProvider.getFAQ();
                data = { faq };
                break;
            }

            case 'get_system_status': {
                const status = await (kernelComponents as any).systemStatusProvider.getSystemStatus();
                data = status;
                break;
            }

            case 'process_llm_response': {
                // ⚠️ PHASE 4 : Extraction et stockage des décisions cognitives
                const decisionExtractor = (kernelComponents as any).decisionExtractor;
                const decisionStore = (kernelComponents as any).decisionStore;
                
                if (!decisionExtractor || !decisionStore) {
                    throw new Error('DecisionExtractor or DecisionStore not initialized');
                }
                
                const { response, rcepRef } = payload;
                if (!response || !rcepRef) {
                    throw new Error('Missing response or rcepRef');
                }
                
                // Extraire les décisions depuis la réponse LLM
                const decisions = await decisionExtractor.extractFromResponse(response, rcepRef);
                
                // Stocker chaque décision
                let storedCount = 0;
                for (const decision of decisions) {
                    try {
                        await decisionStore.store(decision);
                        storedCount++;
                    } catch (error: any) {
                        kernelComponents.logger?.error?.(`Failed to store decision ${decision.id}: ${error.message}`);
                    }
                }
                
                data = {
                    decisions: decisions.map(d => ({ id: d.id, intent: d.intent, confidence_llm: d.confidence_llm, confidence_gate: d.confidence_gate })),
                    count: storedCount
                };
                break;
            }

            case 'get_decisions': {
                // ⚠️ PHASE 10 : Récupérer les décisions par time range
                const decisionStore = (kernelComponents as any).decisionStore;
                
                if (!decisionStore) {
                    throw new Error('DecisionStore not initialized');
                }
                
                const { startTime, endTime } = payload;
                if (typeof startTime !== 'number' || typeof endTime !== 'number') {
                    throw new Error('Missing or invalid startTime/endTime');
                }
                
                const decisions = await decisionStore.getByTimeRange(startTime, endTime);
                
                data = {
                    decisions: decisions.map(d => ({
                        id: d.id,
                        intent: d.intent,
                        intent_text: d.intent_text,
                        confidence_llm: d.confidence_llm,
                        confidence_gate: d.confidence_gate,
                        timestamp: d.timestamp,
                        isoTimestamp: d.isoTimestamp,
                        context_refs: d.context_refs,
                        chosen_option: d.chosen_option,
                        validation_status: d.validation_status
                    })),
                    count: decisions.length
                };
                break;
            }

            case 'replay_trajectory': {
                // ⚠️ PHASE 6 : Replay déterministe d'une trajectoire cognitive
                const replayEngine = (kernelComponents as any).replayEngine;
                
                if (!replayEngine) {
                    throw new Error('ReplayEngine not initialized');
                }
                
                const { startTime, endTime, anchorEventId } = payload;
                if (typeof startTime !== 'number' || typeof endTime !== 'number') {
                    throw new Error('Missing or invalid startTime/endTime');
                }
                
                const replayResult = await replayEngine.replay(startTime, endTime, anchorEventId);
                
                data = {
                    events: replayResult.events.map(e => ({
                        id: e.id,
                        seq: e.seq,
                        timestamp: e.timestamp,
                        type: e.type,
                        source: e.source,
                        category: e.category
                    })),
                    decisions: replayResult.decisions.map(d => ({
                        id: d.id,
                        intent: d.intent,
                        confidence_llm: d.confidence_llm,
                        confidence_gate: d.confidence_gate,
                        timestamp: d.timestamp
                    })),
                    hash: replayResult.hash,
                    timestamp: replayResult.timestamp
                };
                break;
            }

            case 'rebuild_cache': {
                const cacheIndexer = (kernelComponents as any).cacheIndexer;
                if (!cacheIndexer) {
                    throw new Error('CacheIndexer not initialized');
                }
                const index = await cacheIndexer.rebuild();
                data = {
                    success: true,
                    cyclesIndexed: index.total_cycles
                };
                break;
            }

            default:
                throw new Error(`Unknown query type: ${query_type}`);
        }

        process.send?.({
            type: 'query_reply',
            query_seq,
            success: true,
            data
        });
    } catch (error: any) {
        process.send?.({
            type: 'query_reply',
            query_seq,
            success: false,
            error: error.message || String(error)
        });
    }
}

/**
 * Main kernel initialization function
 */
async function main() {
    // Get workspace root from command line argument
    const workspaceRoot = process.argv[2] || process.cwd();

    if (!workspaceRoot) {
        console.error('ERROR: Workspace root required');
        process.exit(1);
    }

    // ✅ Fix 5: Validate workspaceRoot is a valid directory
    try {
        if (!fs.existsSync(workspaceRoot)) {
            console.error(`ERROR: Invalid workspace root: ${workspaceRoot} (does not exist)`);
            process.exit(1);
        }
        const stats = fs.statSync(workspaceRoot);
        if (!stats.isDirectory()) {
            console.error(`ERROR: Invalid workspace root: ${workspaceRoot} (not a directory)`);
            process.exit(1);
        }
    } catch (error) {
        console.error(`ERROR: Failed to validate workspace root: ${workspaceRoot} - ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }

    console.log(`[${new Date().toISOString()}] 🧠 RL4 Kernel starting in: ${workspaceRoot}`);

    // Ensure .reasoning_rl4 directory exists
    const rl4Dir = path.join(workspaceRoot, '.reasoning_rl4');
    const tracesDir = path.join(rl4Dir, 'traces');
    const logsDir = path.join(rl4Dir, 'logs');
    const ledgerDir = path.join(rl4Dir, 'ledger');
    const snapshotsDir = path.join(rl4Dir, 'snapshots');
    const cacheDir = path.join(rl4Dir, 'cache');
    const groundTruthDir = path.join(rl4Dir, 'ground_truth');

    try {
        require('fs').mkdirSync(tracesDir, { recursive: true });
        require('fs').mkdirSync(logsDir, { recursive: true });
        require('fs').mkdirSync(ledgerDir, { recursive: true });
        require('fs').mkdirSync(snapshotsDir, { recursive: true });
        require('fs').mkdirSync(cacheDir, { recursive: true });
        require('fs').mkdirSync(groundTruthDir, { recursive: true });
    } catch (error) {
        console.error(`ERROR: Failed to create directories: ${error}`);
        process.exit(1);
    }

    // Initialize components in order
    console.log(`[DIAG] [${Date.now()}] Init start: GlobalClock`);
    const clock = GlobalClock.getInstance();
    console.log(`[DIAG] [${Date.now()}] Init done: GlobalClock`);

    console.log(`[DIAG] [${Date.now()}] Init start: TimerRegistry`);
    const timerRegistry = new TimerRegistry();
    console.log(`[DIAG] [${Date.now()}] Init done: TimerRegistry`);

    console.log(`[DIAG] [${Date.now()}] Init start: AppendOnlyWriter(kernel.jsonl)`);
    const appendWriter = new AppendOnlyWriter(
        path.join(tracesDir, 'kernel.jsonl'),
        { fsync: false, mkdirRecursive: true }
    );
    await appendWriter.init();
    console.log(`[DIAG] [${Date.now()}] Init done: AppendOnlyWriter(kernel.jsonl)`);

    console.log(`[DIAG] [${Date.now()}] Init start: cyclesWriter`);
    const cyclesWriter = new AppendOnlyWriter(
        path.join(ledgerDir, 'cycles.jsonl'),
        { fsync: false, mkdirRecursive: true }
    );
    await cyclesWriter.init();
    console.log(`[DIAG] [${Date.now()}] Init done: cyclesWriter`);

    console.log(`[DIAG] [${Date.now()}] Init start: CognitiveLogger`);
    const logger = new CognitiveLogger(workspaceRoot, 'normal');
    console.log(`[DIAG] [${Date.now()}] Init done: CognitiveLogger`);

    console.log(`[DIAG] [${Date.now()}] Init start: StateRegistry`);
    const stateRegistry = new StateRegistry(workspaceRoot, appendWriter);
    console.log(`[DIAG] [${Date.now()}] Init done: StateRegistry`);

    console.log(`[DIAG] [${Date.now()}] Init start: ExecPool`);
    const execPool = new ExecPool(
        {
            maxConcurrency: 2,
            queueLimit: 100,
            defaultTimeoutMs: 2000,
            hardKillDelayMs: 5000
        },
        timerRegistry
    );
    console.log(`[DIAG] [${Date.now()}] Init done: ExecPool`);

    // Create dedicated writers for file changes and git commits
    console.log(`[DIAG] [${Date.now()}] Init start: fileChangesWriter`);
    const fileChangesWriter = new AppendOnlyWriter(
        path.join(tracesDir, 'file_changes.jsonl'),
        { fsync: false, mkdirRecursive: true }
    );
    await fileChangesWriter.init();
    console.log(`[DIAG] [${Date.now()}] Init done: fileChangesWriter`);

    console.log(`[DIAG] [${Date.now()}] Init start: gitCommitsWriter`);
    const gitCommitsWriter = new AppendOnlyWriter(
        path.join(tracesDir, 'git_commits.jsonl'),
        { fsync: false, mkdirRecursive: true }
    );
    await gitCommitsWriter.init();
    console.log(`[DIAG] [${Date.now()}] Init done: gitCommitsWriter`);

    // Initialize MIL (Memory Index Layer)
    console.log(`[DIAG] [${Date.now()}] Init start: MIL`);
    const mil = new MIL(workspaceRoot);
    await mil.init();
    console.log(`[DIAG] [${Date.now()}] Init done: MIL`);

    console.log(`[DIAG] [${Date.now()}] Init start: FileChangeWatcher`);
    const fsWatcher = new FileChangeWatcher(workspaceRoot, fileChangesWriter, logger, mil);
    console.log(`[DIAG] [${Date.now()}] Starting FileChangeWatcher.startWatching()`);
    await fsWatcher.startWatching();
    console.log(`[DIAG] [${Date.now()}] FileChangeWatcher started`);

    console.log(`[DIAG] [${Date.now()}] Init start: GitCommitListener`);
    const gitListener = new GitCommitListener(
        workspaceRoot,
        execPool,
        gitCommitsWriter,
        logger,
        undefined, // commitCountIncrementCallback
        mil
    );
    console.log(`[DIAG] [${Date.now()}] Starting GitCommitListener.startWatching()`);
    await gitListener.startWatching();
    console.log(`[DIAG] [${Date.now()}] GitCommitListener started`);

    console.log(`[DIAG] [${Date.now()}] Init start: HealthMonitor`);
    const healthMonitor = new HealthMonitor(workspaceRoot, timerRegistry);
    healthMonitor.start(timerRegistry);
    console.log(`[DIAG] [${Date.now()}] Init done: HealthMonitor`);

    console.log(`[DIAG] [${Date.now()}] Init start: CognitiveScheduler (legacy)`);
    const rbomLedger = new RBOMLedger(workspaceRoot);
    await rbomLedger.init();
    console.log(`[DIAG] [${Date.now()}] Init start: WriteAheadLog`);
    const wal = WriteAheadLog.getInstance(workspaceRoot);
    console.log(`[DIAG] [${Date.now()}] Init done: WriteAheadLog`);
    console.log(`[DIAG] [${Date.now()}] Init start: SnapshotRotation`);
    const snapshotRotation = new SnapshotRotation(workspaceRoot);
    console.log(`[DIAG] [${Date.now()}] Init done: SnapshotRotation`);
    console.log(`[DIAG] [${Date.now()}] Init start: RL4CacheIndexer`);
    const cacheIndexer = new RL4CacheIndexer(workspaceRoot);
    console.log(`[DIAG] [${Date.now()}] Init done: RL4CacheIndexer`);
    console.log(`[DIAG] [${Date.now()}] Init start: ActivityReconstructor`);
    const activityReconstructor = new ActivityReconstructor(workspaceRoot);
    console.log(`[DIAG] [${Date.now()}] Init done: ActivityReconstructor`);
    console.log(`[DIAG] [${Date.now()}] Init start: GroundTruthSystem`);
    const groundTruthSystem = new GroundTruthSystem(rl4Dir);
    console.log(`[DIAG] [${Date.now()}] Init done: GroundTruthSystem`);
    console.log(`[DIAG] [${Date.now()}] Init start: CrossFileConsistencyValidator`);
    const consistencyValidator = new CrossFileConsistencyValidator(workspaceRoot);
    console.log(`[DIAG] [${Date.now()}] Init done: CrossFileConsistencyValidator`);
    console.log(`[DIAG] [${Date.now()}] Init start: TimelineAggregator`);
    const timelineAggregator = new TimelineAggregator(workspaceRoot);
    console.log(`[DIAG] [${Date.now()}] Init done: TimelineAggregator`);

    const scheduler = new CognitiveScheduler(
        logger,
        clock,
        fsWatcher,
        gitListener,
        appendWriter,
        {
            tickIntervalSec: 10, // Tick every 10 seconds
            hourlySummaryIntervalMs: 3600000, // 1 hour
            gapThresholdMs: 15 * 60 * 1000, // 15 minutes
            cyclesWriter,
            snapshotRotation,
            cacheIndexer,
            rbomLedger,
            wal,
            stateRegistry,
            activityReconstructor,
            healthMonitor,
            groundTruthSystem,
            consistencyValidator,
            timelineAggregator,
            rotationIntervalCycles: 100,
            workspaceRoot
        }
    );
    console.log(`[DIAG] [${Date.now()}] Init done: CognitiveScheduler (KMS)`);

    // ✅ Connecter les listeners au scheduler pour mettre à jour l'activité
    fsWatcher.setActivityNotifier(() => scheduler.notifyActivity());
    gitListener.setActivityNotifier(() => scheduler.notifyActivity());

    // RBOM kernel_start event
    await rbomLedger.append('kernel_start', { workspaceRoot, timestamp: new Date().toISOString() });

    // Initialize governance mode manager and plan parser
    const rl4Path = path.join(workspaceRoot, '.reasoning_rl4', 'governance');
    const governanceModeManager = new GovernanceModeManager(rl4Path);
    const planParser = new PlanTasksContextParser(rl4Path);
    // promptBuilder will be initialized later after DecisionStore, RCEPStore, SCFCompressor

    // Push governance mode into StateRegistry at boot
    const activeMode = governanceModeManager.getActiveMode();
    console.log(`[DIAG] [${Date.now()}] Governance mode detected: ${activeMode}`);
    await stateRegistry.setMode(activeMode as any);
    console.log(`[DIAG] [${Date.now()}] StateRegistry mode set to: ${activeMode}`);

    // Initialize new components
    // OnboardingDetector is a function, not a class

    // DEPRECATED: AnomalyDetector removed (violation Loi 1)
    // Blind spots detection should be done by LLM via prompts, not kernel

    console.log(`[DIAG] [${Date.now()}] Init start: DeltaCalculator`);
    const deltaCalculator = new DeltaCalculator(workspaceRoot, logger);
    console.log(`[DIAG] [${Date.now()}] Init done: DeltaCalculator`);

    console.log(`[DIAG] [${Date.now()}] Init start: SessionCaptureManager`);
    const sessionCaptureManager = new SessionCaptureManager(
        workspaceRoot,
        planParser,
        appendWriter,
        logger
    );
    console.log(`[DIAG] [${Date.now()}] Init done: SessionCaptureManager`);

    console.log(`[DIAG] [${Date.now()}] Init start: TaskManager`);
    const taskManager = new TaskManager(
        workspaceRoot,
        planParser,
        appendWriter,
        logger
    );
    console.log(`[DIAG] [${Date.now()}] Init done: TaskManager`);

    console.log(`[DIAG] [${Date.now()}] Init start: PhaseDetector`);
    const phaseDetector = new PhaseDetector(workspaceRoot, logger);
    console.log(`[DIAG] [${Date.now()}] Init done: PhaseDetector`);

    console.log(`[DIAG] [${Date.now()}] Init start: SystemStatusProvider`);
    const systemStatusProvider = new SystemStatusProvider(workspaceRoot, logger);
    console.log(`[DIAG] [${Date.now()}] Init done: SystemStatusProvider`);

    // ⚠️ PHASE 11 : Initialize DecisionStore, RCEPStore, SCFCompressor, ReplayEngine, DecisionInvalidator, DecisionExtractor
    console.log(`[DIAG] [${Date.now()}] Init start: DecisionStore`);
    const decisionStore = new DecisionStore(workspaceRoot);
    await decisionStore.init();
    console.log(`[DIAG] [${Date.now()}] Init done: DecisionStore`);

    console.log(`[DIAG] [${Date.now()}] Init start: RCEPStore`);
    const rcepStore = new RCEPStore(workspaceRoot);
    console.log(`[DIAG] [${Date.now()}] Init done: RCEPStore`);

    console.log(`[DIAG] [${Date.now()}] Init start: SCFCompressor`);
    const scfCompressor = new SCFCompressor(mil, decisionStore, logger);
    console.log(`[DIAG] [${Date.now()}] Init done: SCFCompressor`);

    console.log(`[DIAG] [${Date.now()}] Init start: ReplayEngine`);
    const rcepDecoder = new PromptCodecRL4();
    const replayEngine = new ReplayEngine(mil, decisionStore, rcepStore, scfCompressor, rcepDecoder, logger);
    console.log(`[DIAG] [${Date.now()}] Init done: ReplayEngine`);

    console.log(`[DIAG] [${Date.now()}] Init start: DecisionInvalidator`);
    const decisionInvalidator = new DecisionInvalidator(decisionStore, mil, logger);
    console.log(`[DIAG] [${Date.now()}] Init done: DecisionInvalidator`);

    console.log(`[DIAG] [${Date.now()}] Init start: DecisionExtractor`);
    const decisionExtractor = new DecisionExtractor(decisionStore, mil, logger);
    console.log(`[DIAG] [${Date.now()}] Init done: DecisionExtractor`);

    // Update UnifiedPromptBuilder with new components
    console.log(`[DIAG] [${Date.now()}] Updating UnifiedPromptBuilder with DecisionStore, RCEPStore, SCFCompressor`);
    const promptBuilder = new UnifiedPromptBuilder(rl4Path, logger, mil, decisionStore, rcepStore, scfCompressor);

    console.log(`[DIAG] [${Date.now()}] Init start: TimeMachinePromptBuilder`);
    const timeMachinePromptBuilder = new TimeMachinePromptBuilder(workspaceRoot, logger, mil, decisionStore, rcepStore, scfCompressor, replayEngine);
    console.log(`[DIAG] [${Date.now()}] Init done: TimeMachinePromptBuilder`);

    console.log(`[DIAG] [${Date.now()}] Init start: IntentionResolver`);
    const intentionResolver = new IntentionResolver();
    console.log(`[DIAG] [${Date.now()}] Init done: IntentionResolver`);

    // CursorChatListener (opt-in, fallback silencieux)
    let cursorChatListener: CursorChatListener | null = null;
    try {
        cursorChatListener = new CursorChatListener(workspaceRoot, mil, undefined, logger);
        await cursorChatListener.start(); // start() checks opt-in internally
        console.log(`[DIAG] [${Date.now()}] CursorChatListener: initialized (opt-in check done)`);
    } catch (error) {
        // Fallback silencieux - MIL works without CursorChatListener
        console.log(`[DIAG] [${Date.now()}] CursorChatListener: skipped (${error})`);
        cursorChatListener = null;
    }

    // Store components globally for IPC handlers
    kernelComponents = {
        workspaceRoot,
        clock,
        timerRegistry,
        stateRegistry,
        appendWriter,
        logger,
        execPool,
        fsWatcher,
        gitListener,
        scheduler,
        healthMonitor,
        rbomLedger,
        wal,
        snapshotRotation,
        cacheIndexer,
        activityReconstructor,
        groundTruthSystem,
        consistencyValidator,
        timelineAggregator,
        cyclesWriter,
        fileChangesWriter,
        gitCommitsWriter,
        governanceModeManager,
        planParser,
        planTasksContextParser: planParser, // Alias for IPC handlers
        promptBuilder,
        deltaCalculator,
        sessionCaptureManager,
        taskManager,
        phaseDetector,
        systemStatusProvider,
        timeMachinePromptBuilder,
        intentionResolver,
        mil,
        decisionStore,
        rcepStore,
        scfCompressor,
        replayEngine,
        decisionInvalidator,
        decisionExtractor
    } as any;

    // Setup IPC message handler (for fork-based communication)
    if (process.send) {
        process.on('message', (msg: any) => {
            if (msg.type === 'query') {
                handleQuery(msg).catch((error) => {
                    process.send?.({
                        type: 'query_reply',
                        query_seq: msg.query_seq,
                        success: false,
                        error: error.message || String(error)
                    });
                });
            } else if (msg.type === 'ping') {
                process.send?.({ type: 'pong', seq: msg.seq });
            }
        });
    }

    // Write initial kernel start event
    await appendWriter.append({
        event: 'kernel_start',
        timestamp: new Date().toISOString(),
        workspaceRoot: workspaceRoot
    });

    // Start scheduler (ONCE)
    console.log(`[DIAG] [${Date.now()}] Starting CognitiveScheduler...`);
    scheduler.start();
    console.log(`[DIAG] [${Date.now()}] CognitiveScheduler started`);

    // Signal that kernel is ready (both stdout and IPC)
    console.log('KERNEL_READY:true');
    logger.system('Kernel ready and running');
    
    // Send ready signal via IPC if available
    if (process.send) {
        process.send({ type: 'status', status: 'ready' });
    }

    // Write ready event
    await appendWriter.append({
        event: 'kernel_ready',
        timestamp: new Date().toISOString()
    });
}

// Start kernel
main().catch((error) => {
    console.error(`[${new Date().toISOString()}] ❌ Failed to start kernel:`, error);
    process.exit(1);
});

// Keep process alive - setup signal handlers after main() completes
// Note: scheduler, fsWatcher, gitListener, appendWriter are in main() scope
// We'll need to store them globally or handle shutdown differently

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error(`[${new Date().toISOString()}] ❌ Uncaught exception:`, error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`[${new Date().toISOString()}] ❌ Unhandled rejection:`, reason);
});
