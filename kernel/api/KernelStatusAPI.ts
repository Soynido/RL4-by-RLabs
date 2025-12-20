import { KernelBridge } from '../process/KernelBridge';
import { CognitiveLogger } from '../core/CognitiveLogger';
import { KernelStatusPayload, KernelStatusData } from './KernelStatusTypes';

export class KernelStatusAPI {
    private bridge: KernelBridge | null;
    private logger?: CognitiveLogger;
    private lastStatus: KernelStatusPayload = {
        ready: false,
        message: 'Kernel initializing...',
        status: null,
        initializing: true
    };
    private pendingWaiters: Array<{ resolve: (payload: KernelStatusPayload) => void; reject: (error: Error) => void }> = [];
    private pendingTimer: NodeJS.Timeout | null = null;
    private requestInFlight: boolean = false;
    private readonly timeoutMs: number;

    constructor(bridge: KernelBridge | null, logger?: CognitiveLogger, timeoutMs: number = 5000) {
        this.bridge = bridge;
        this.logger = logger;
        this.timeoutMs = timeoutMs;
    }

    updateBridge(bridge: KernelBridge | null): void {
        this.bridge = bridge;
    }

    handleKernelStatusMessage(message: { status: string; statusData?: KernelStatusData | null; message?: string }): KernelStatusPayload {
        const ready = message.status === 'ready';
        const payload: KernelStatusPayload = {
            ready,
            message: message.message || (ready ? 'Kernel ready' : `Kernel ${message.status}`),
            status: message.statusData || null,
            initializing: !ready && message.status !== 'error',
            error: message.status === 'error'
        };

        this.lastStatus = payload;
        this.resolvePending(payload);
        return payload;
    }

    getSnapshot(): KernelStatusPayload {
        return this.lastStatus;
    }

    async requestStatus(): Promise<KernelStatusPayload> {
        if (!this.bridge || !this.bridge.isRunning()) {
            this.logger?.warning('[KernelStatusAPI] Cannot request status: bridge not running');
            return this.lastStatus;
        }

        if (this.requestInFlight) {
            return new Promise<KernelStatusPayload>((resolve, reject) => {
                this.pendingWaiters.push({ resolve, reject });
            });
        }

        this.requestInFlight = true;
        const promise = new Promise<KernelStatusPayload>((resolve, reject) => {
            this.pendingWaiters.push({ resolve, reject });
        });
        this.pendingTimer = setTimeout(() => {
            const error = new Error('kernel_status_timeout');
            this.logger?.warning('[KernelStatusAPI] Timeout waiting for kernel status response');
            this.rejectPending(error);
        }, this.timeoutMs);

        try {
            this.bridge.send({ type: 'status_request' });
        } catch (error) {
            this.logger?.error(`[KernelStatusAPI] Failed to send status_request: ${error}`);
            this.rejectPending(error instanceof Error ? error : new Error(String(error)));
            return this.lastStatus;
        }

        try {
            return await promise;
        } catch {
            return this.lastStatus;
        }
    }

    private resolvePending(payload: KernelStatusPayload): void {
        if (this.pendingTimer) {
            clearTimeout(this.pendingTimer);
            this.pendingTimer = null;
        }
        if (this.pendingWaiters.length === 0) {
            this.requestInFlight = false;
            return;
        }
        for (const waiter of this.pendingWaiters) {
            waiter.resolve(payload);
        }
        this.pendingWaiters = [];
        this.requestInFlight = false;
    }

    private rejectPending(error: Error): void {
        if (this.pendingTimer) {
            clearTimeout(this.pendingTimer);
            this.pendingTimer = null;
        }
        if (this.pendingWaiters.length === 0) {
            this.requestInFlight = false;
            return;
        }
        for (const waiter of this.pendingWaiters) {
            waiter.reject(error);
        }
        this.pendingWaiters = [];
        this.requestInFlight = false;
    }
}


