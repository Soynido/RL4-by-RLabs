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
// import { UnifiedPromptBuilder } from '../api/UnifiedPromptBuilder'; // STUBBED - blocking build

// TEMPORARY STUB - Replace with real implementation when legacy is fixed
class UnifiedPromptBuilder {
    constructor(rl4Path: string, logger?: any) {}
    async generate(mode: string): Promise<{prompt: string, metadata: any}> {
        return {
            prompt: `# RL6 Snapshot - ${mode}\n\nBackend stub - implementation pending`,
            metadata: { mode, timestamp: new Date().toISOString() }
        };
    }
}
import { PlanTasksContextParser } from '../api/PlanTasksContextParser';
import { detectWorkspaceState } from '../onboarding/OnboardingDetector';
import { AnomalyDetector } from '../api/AnomalyDetector';
import { DeltaCalculator } from '../api/DeltaCalculator';
import { SessionCaptureManager } from '../api/SessionCaptureManager';
import { TaskManager } from '../api/TaskManager';
import { PhaseDetector } from '../api/PhaseDetector';
import { SystemStatusProvider } from '../api/SystemStatusProvider';
import { TimeMachinePromptBuilder } from '../api/TimeMachinePromptBuilder';

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
    // onboardingDetector is a function, not an instance
    anomalyDetector: AnomalyDetector;
    deltaCalculator: DeltaCalculator;
    sessionCaptureManager: SessionCaptureManager;
    taskManager: TaskManager;
    phaseDetector: PhaseDetector;
    systemStatusProvider: SystemStatusProvider;
    timeMachinePromptBuilder: TimeMachinePromptBuilder;
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
                // TODO: Implement getLastCycleHealth in CognitiveScheduler
                data = {
                    cycleId: 0,
                    success: false,
                    phases: [],
                    duration: 0,
                    error: 'getLastCycleHealth() not implemented'
                };
                break;
            }

            case 'reflect': {
                // TODO: Implement runCycle in CognitiveScheduler
                data = {
                    cycleId: 0,
                    success: false,
                    phases: [],
                    duration: 0,
                    error: 'runCycle() not implemented'
                };
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
                const result = await promptBuilder.generate(mode);
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
                const blindspots = await (kernelComponents as any).anomalyDetector.detectBlindspots();
                data = blindspots;
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

    console.log(`[${new Date().toISOString()}] 🧠 RL4 Kernel starting in: ${workspaceRoot}`);

    // Ensure .reasoning_rl4 directory exists
    const rl4Dir = path.join(workspaceRoot, '.reasoning_rl4');
    const tracesDir = path.join(rl4Dir, 'traces');
    const logsDir = path.join(rl4Dir, 'logs');

    try {
        require('fs').mkdirSync(tracesDir, { recursive: true });
        require('fs').mkdirSync(logsDir, { recursive: true });
    } catch (error) {
        console.error(`ERROR: Failed to create directories: ${error}`);
        process.exit(1);
    }

    // Initialize components in order
    console.log(`[${new Date().toISOString()}] Initializing GlobalClock...`);
    const clock = GlobalClock.getInstance();

    console.log(`[${new Date().toISOString()}] Initializing TimerRegistry...`);
    const timerRegistry = new TimerRegistry();

    console.log(`[${new Date().toISOString()}] Initializing AppendOnlyWriter...`);
    const appendWriter = new AppendOnlyWriter(
        path.join(tracesDir, 'kernel.jsonl'),
        { fsync: false, mkdirRecursive: true }
    );
    await appendWriter.init();

    console.log(`[${new Date().toISOString()}] Initializing CognitiveLogger...`);
    const logger = new CognitiveLogger(workspaceRoot, 'normal');

    console.log(`[${new Date().toISOString()}] Initializing StateRegistry...`);
    const stateRegistry = new StateRegistry(workspaceRoot, appendWriter);

    console.log(`[${new Date().toISOString()}] Initializing ExecPool...`);
    const execPool = new ExecPool(
        {
            maxConcurrency: 2,
            queueLimit: 100,
            defaultTimeoutMs: 2000,
            hardKillDelayMs: 5000
        },
        timerRegistry
    );

    console.log(`[${new Date().toISOString()}] Initializing FileChangeWatcher...`);
    const fsWatcher = new FileChangeWatcher(workspaceRoot, appendWriter, logger);
    await fsWatcher.startWatching();

    console.log(`[${new Date().toISOString()}] Initializing GitCommitListener...`);
    const gitListener = new GitCommitListener(
        workspaceRoot,
        execPool,
        appendWriter,
        logger
    );
    await gitListener.startWatching();

    console.log(`[${new Date().toISOString()}] Initializing CognitiveScheduler...`);
    const scheduler = new CognitiveScheduler(
        logger,
        clock,
        fsWatcher,
        gitListener,
        appendWriter,
        {
            tickIntervalSec: 10, // Tick every 10 seconds
            hourlySummaryIntervalMs: 3600000, // 1 hour
            gapThresholdMs: 15 * 60 * 1000 // 15 minutes
        }
    );

    // ✅ Connecter les listeners au scheduler pour mettre à jour l'activité
    fsWatcher.setActivityNotifier(() => scheduler.notifyActivity());
    gitListener.setActivityNotifier(() => scheduler.notifyActivity());

    console.log(`[${new Date().toISOString()}] Initializing HealthMonitor...`);
    const healthMonitor = new HealthMonitor(workspaceRoot, timerRegistry);
    healthMonitor.start(timerRegistry);

    // Initialize governance mode manager and prompt builder
    const rl4Path = path.join(workspaceRoot, '.reasoning_rl4', 'governance');
    const governanceModeManager = new GovernanceModeManager(rl4Path);
    const planParser = new PlanTasksContextParser(rl4Path);
    const promptBuilder = new UnifiedPromptBuilder(rl4Path, logger);

    // Initialize new components
    // OnboardingDetector is a function, not a class

    console.log(`[${new Date().toISOString()}] Initializing AnomalyDetector...`);
    const anomalyDetector = new AnomalyDetector(workspaceRoot, appendWriter, logger);

    console.log(`[${new Date().toISOString()}] Initializing DeltaCalculator...`);
    const deltaCalculator = new DeltaCalculator(workspaceRoot, logger);

    console.log(`[${new Date().toISOString()}] Initializing SessionCaptureManager...`);
    const sessionCaptureManager = new SessionCaptureManager(
        workspaceRoot,
        planParser,
        appendWriter,
        logger
    );

    console.log(`[${new Date().toISOString()}] Initializing TaskManager...`);
    const taskManager = new TaskManager(
        workspaceRoot,
        planParser,
        appendWriter,
        logger
    );

    console.log(`[${new Date().toISOString()}] Initializing PhaseDetector...`);
    const phaseDetector = new PhaseDetector(workspaceRoot, logger);

    console.log(`[${new Date().toISOString()}] Initializing SystemStatusProvider...`);
    const systemStatusProvider = new SystemStatusProvider(workspaceRoot, logger);

    console.log(`[${new Date().toISOString()}] Initializing TimeMachinePromptBuilder...`);
    const timeMachinePromptBuilder = new TimeMachinePromptBuilder(workspaceRoot, logger);

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
        governanceModeManager,
        planParser,
        promptBuilder,
          anomalyDetector,
        deltaCalculator,
        sessionCaptureManager,
        taskManager,
        phaseDetector,
        systemStatusProvider,
        timeMachinePromptBuilder
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
    console.log(`[${new Date().toISOString()}] Starting CognitiveScheduler...`);
    scheduler.start();

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
