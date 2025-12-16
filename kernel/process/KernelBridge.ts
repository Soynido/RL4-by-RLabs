import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { ILogger } from '../core/ILogger';

interface QueuedEvent {
    seq: number;
    message: any;
    timestamp: number;
}

export class KernelBridge extends EventEmitter {
    private child: cp.ChildProcess | null = null;
    private extensionPath: string;
    private logger: ILogger;
    
    // Heartbeat
    private lastHeartbeat: number = Date.now();
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private readonly HEARTBEAT_RATE = 2000; // 2s
    private readonly HEARTBEAT_TIMEOUT = 5000; // 5s

    // Crash Protection
    private restartTimestamps: number[] = [];
    private readonly CRASH_WINDOW = 10000; // 10s
    private readonly MAX_QUICK_RESTARTS = 5;
    private isSafeMode: boolean = false;

    // Replay Buffer
    private queuedEvents: QueuedEvent[] = [];
    private lastAckedSeq: number = 0;
    private isKernelReady: boolean = false;
    private isReplaying: boolean = false; // Patch 2
    private readonly MAX_BUFFER_SIZE = 1000; // Bonus: Prevent replay storm
    
    // ✅ PID Lock for Zombie Killing
    private pidFile: string;

    constructor(extensionPath: string, logger: ILogger) {
        super();
        this.extensionPath = extensionPath;
        this.logger = logger;
        // Determine PID file path: .reasoning_rl4/kernel/kernel.pid
        this.pidFile = path.join(extensionPath, '..', '.reasoning_rl4', 'kernel', 'kernel.pid');
    }

    /**
     * ✅ P0-PRE: Public getter for kernel ready state
     * Exposes private isKernelReady for WebViewManager access
     * Fixes TypeScript errors in WebViewManager.ts:153,245,542
     */
    public get isReady(): boolean {
        return this.isKernelReady;
    }

    /**
     * ✅ ZOMBIE KILLER PROTOCOL (P0)
     * Checks for existing kernel process via PID lock file and KILLS it.
     * Ensures strict singleton property of the Kernel.
     */
    private async killZombies(): Promise<void> {
        try {
            // Ensure directory exists
            const dir = path.dirname(this.pidFile);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            if (fs.existsSync(this.pidFile)) {
                const pidStr = fs.readFileSync(this.pidFile, 'utf-8').trim();
                const pid = parseInt(pidStr, 10);
                
                if (!isNaN(pid)) {
                    try {
                        // Check if process exists (throws if not)
                        process.kill(pid, 0);
                        
                        this.logger.warning(`[KernelBridge] 🧟 Found zombie kernel (PID ${pid}). Executing Zombie Killer protocol...`);
                        
                        try {
                            process.kill(pid, 'SIGKILL'); // Force kill immediately
                            this.logger.system(`[KernelBridge] 💀 Zombie neutralized (SIGKILL sent to PID ${pid}).`);
                        } catch (killError) {
                            this.logger.error(`[KernelBridge] Failed to kill zombie: ${killError}`);
                        }
                        
                        // Wait briefly to ensure OS cleanup
                        await new Promise(r => setTimeout(r, 200));
                    } catch (e) {
                        // Process doesn't exist, just stale file
                        this.logger.system(`[KernelBridge] Stale PID file found (${pid}), process already dead.`);
                    }
                }
                // Remove stale PID file
                try {
                    fs.unlinkSync(this.pidFile);
                } catch (unlinkError) {
                    // Ignore unlink error if file already gone
                }
            }
        } catch (error) {
            this.logger.error(`[KernelBridge] Zombie Killer check failed: ${error}`);
        }
    }

    public async start(): Promise<void> {
        if (this.isSafeMode) {
            this.logger.warning('[KernelBridge] Cannot start: Safe Mode active due to crash loop.');
            return;
        }

        if (this.child) {
            this.logger.warning('[KernelBridge] Child process already running, stopping before restart.');
            this.stop();
        }

        // ✅ EXECUTE ZOMBIE KILLER BEFORE SPAWN
        await this.killZombies();

        const entrypoint = path.join(this.extensionPath, 'out', 'extension', 'kernel', 'process', 'entrypoint.js');

        this.logger.system(`[KernelBridge] Spawning child process: ${entrypoint}`);
        
        this.child = cp.fork(entrypoint, [], {
            stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
            env: { 
                ...process.env, 
                NODE_ENV: 'production',
                ELECTRON_RUN_AS_NODE: '1',
                VSCODE_IPC_HOOK: undefined 
            }
        });

        // ✅ WRITE PID FILE (Lock)
        if (this.child.pid) {
            try {
                fs.writeFileSync(this.pidFile, this.child.pid.toString(), 'utf-8');
            } catch (e) {
                this.logger.error(`[KernelBridge] Failed to write PID file: ${e}`);
            }
        }

        // ✅ CRITICAL: Catch spawn errors
        this.child.on('error', (err) => {
            this.logger.error(`[KernelBridge] Failed to spawn child process: ${err.message}`);
        });

        this.isKernelReady = false;
        this.lastHeartbeat = Date.now();

        // IPC Message Handler
        this.child.on('message', (msg: any) => {
            this.lastHeartbeat = Date.now();

            if (msg.type === 'pong') {
                // Patch 1: Stagnation Check
                if (msg.seq && msg.seq <= this.lastAckedSeq - 50) {
                     this.logger.warning('[KernelBridge] Kernel progress stagnation detected (lag > 50 seqs)');
                }
                return;
            }

            if (msg.type === 'status' && msg.status === 'ready') {
                this.logger.system('[KernelBridge] Kernel ready signal received. Starting replay...');
                this.isKernelReady = true;
                this.replayEvents();
                this.emit('message', msg);
                return;
            }

            if (msg.type === 'ack' && typeof msg.ack_seq === 'number') {
                this.handleAck(msg.ack_seq);
                this.emit('message', msg);
                return; 
            }

            // ✅ PHASE K: Handle kernel_kpis_updated events from Child
            if (msg.type === 'kernel_kpis_updated') {
                this.emit('message', {
                    type: 'to_webview',
                    payload: {
                        type: 'kernel_kpis_updated',
                        payload: msg.payload
                    }
                });
                return;
            }

            if (msg.type === 'loop_health_metrics') {
                this.emit('message', {
                    type: 'to_webview',
                    payload: {
                        type: 'loopHealthUpdated',
                        payload: msg.payload
                    }
                });
                return;
            }

            // Log handling
            if (msg.level && msg.message) {
                this.logger.log(msg.level, msg.message, msg.cycle_id);
            } else {
                this.emit('message', msg);
            }
        });

        // Stdout/Stderr Handling
        this.setupStreamHandlers();

        this.child.on('exit', (code, signal) => {
            this.logger.warning(`[KernelBridge] Child exited (code: ${code}, signal: ${signal})`);
            this.child = null;
            this.isKernelReady = false;
            
            // Clean PID file on exit
            try {
                if (fs.existsSync(this.pidFile)) fs.unlinkSync(this.pidFile);
            } catch {}

            this.emit('exit', code, signal);
            this.handleCrashLogic();
        });

        // Start Heartbeat Loop
        this.startHeartbeat();
    }

    private setupStreamHandlers(): void {
        if (!this.child) return;

        this.child.stdout?.on('data', (data: any) => {
            const str = data.toString();
            str.split('\n').forEach((line: string) => {
                if (!line.trim()) return;
                try {
                    const logEntry: any = JSON.parse(line);
                    if (logEntry.level && logEntry.message) {
                        this.logger.log(logEntry.level, logEntry.message, logEntry.cycle_id);
                    } else {
                        this.logger.system(`[Kernel Child] ${line}`);
                    }
                } catch (e) {
                    this.logger.system(`[Kernel Child] ${line}`);
                }
            });
        });

        this.child.stderr?.on('data', (data: any) => {
            this.logger.error(`[Kernel Child Error] ${data.toString().trim()}`);
        });
    }

    // ✅ HARDENED STOP (P0)
    public stop(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        const childToKill = this.child;
        this.child = null; // Detach immediately to prevent race conditions
        this.isKernelReady = false;

        // Clean PID file immediately
        try {
            if (fs.existsSync(this.pidFile)) fs.unlinkSync(this.pidFile);
        } catch {}

        if (childToKill) {
            this.logger.system('[KernelBridge] 🛑 Stopping child process...');
            
            // Remove all listeners to avoid crash logic trigger during manual stop
            childToKill.removeAllListeners();
            
            // Try SIGTERM first (Graceful)
            childToKill.kill('SIGTERM');
            
            // Force SIGKILL if still alive after 500ms
            const killTimer = setTimeout(() => {
                if (!childToKill.killed) {
                    this.logger.system('[KernelBridge] 💀 Force killing child process (SIGKILL)');
                    try {
                        childToKill.kill('SIGKILL');
                    } catch (e) {
                        // Ignore if already dead
                    }
                }
            }, 500);

            // Unref to prevent holding up node process exit
            if (killTimer.unref) killTimer.unref();
        }
    }

    public isRunning(): boolean {
        return this.child !== null && this.child.connected && !this.child.killed;
    }

    private handleCrashLogic(manual: boolean = false): void {
        const now = Date.now();
        this.restartTimestamps = this.restartTimestamps.filter(t => now - t < this.CRASH_WINDOW);
        
        this.restartTimestamps.push(now);

        if (this.restartTimestamps.length > this.MAX_QUICK_RESTARTS) {
            this.logger.error(`[KernelBridge] 🚨 CRASH LOOP DETECTED (${this.restartTimestamps.length} crashes in 10s). Entering SAFE MODE.`);
            this.isSafeMode = true;
            this.stop(); 
            this.emit('message', { type: 'kernelCrashed', reason: 'Crash Loop Detected' });
            return;
        }

        if (!manual) {
            this.logger.system(`[KernelBridge] Auto-restarting (Attempt ${this.restartTimestamps.length}/${this.MAX_QUICK_RESTARTS})...`);
            setTimeout(() => this.start(), 1000);
        } else {
             this.logger.system(`[KernelBridge] Manual restart triggering start...`);
             setTimeout(() => this.start(), 1000);
        }
    }

    public send(msg: any): void {
        if (this.isSafeMode) {
            this.logger.warning('[KernelBridge] Ignored message: Safe Mode active.');
            return;
        }

        const isReplayable = msg && typeof msg.seq === 'number' && msg.replayable === true;

        if (isReplayable) {
            // Bonus: Buffer limit
            if (this.queuedEvents.length >= this.MAX_BUFFER_SIZE) {
                this.logger.error('[KernelBridge] Replay buffer full. Dropping oldest event to prevent storm.');
                this.queuedEvents.shift(); // Drop oldest (FIFO)
            }

            this.queuedEvents.push({
                seq: msg.seq,
                message: msg,
                timestamp: Date.now()
            });
            this.queuedEvents.sort((a, b) => a.seq - b.seq);
        }

        if (this.isRunning() && (this.isKernelReady || msg.type === 'init' || msg.type === 'ping')) {
            this.child?.send(msg);
        } else {
            this.logger.system(`[KernelBridge] Message buffered (Kernel not ready): ${msg.type}`);
        }
    }

    private handleAck(seq: number): void {
        this.lastAckedSeq = Math.max(this.lastAckedSeq, seq);
        this.queuedEvents = this.queuedEvents.filter(e => e.seq > this.lastAckedSeq);
    }

    // Patch 2: Lock replay
    private replayEvents(): void {
        if (this.isReplaying || this.queuedEvents.length === 0) return;
        
        this.isReplaying = true;
        this.logger.system(`[KernelBridge] Replaying ${this.queuedEvents.length} buffered events...`);
        
        for (const event of this.queuedEvents) {
            if (this.child && !this.child.killed) {
                this.child.send(event.message);
            }
        }
        
        this.isReplaying = false;
        this.logger.system(`[KernelBridge] Replay complete.`);
    }

    private startHeartbeat(): void {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        
        this.heartbeatInterval = setInterval(() => {
            if (this.isRunning()) {
                const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;
                
                // If kernel is silent for too long, ping it
                if (timeSinceLastHeartbeat > this.HEARTBEAT_TIMEOUT) {
                    this.logger.warning(`[KernelBridge] Heartbeat timeout (${timeSinceLastHeartbeat}ms). Sending ping...`);
                    this.child?.send({ type: 'ping' });
                }
            }
        }, this.HEARTBEAT_RATE);
    }
}
