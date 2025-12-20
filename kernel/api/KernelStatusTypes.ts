export interface KernelCycleHealth {
    cycleId: number;
    success: boolean;
    phases: any[];
    duration: number;
    error: string | null;
}

export interface KernelStatusData {
    cycleCount: number;
    queueDepth: number;
    timers: number;
    uptime: number;
    memoryMB: number;
    safeMode: boolean;
    corruptionReason: string | null;
    cycleHealth: KernelCycleHealth;
}

export interface KernelStatusPayload {
    ready: boolean;
    message: string;
    status: KernelStatusData | null;
    initializing?: boolean;
    error?: boolean;
}

