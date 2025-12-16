/**
 * ILogger Interface - RL6 Core Logging Interface
 *
 * Defines the standard interface for all logging components in RL6
 * Used by CognitiveLogger, HealthMonitor, and other core components
 */

export type Verbosity = "silent" | "minimal" | "normal" | "debug";

export interface ILogger {
    system(msg: string): void;
    warning(msg: string): void;
    error(msg: string): void;
    narrative(msg: string): void;
    log(level: string, msg: string, cycleId?: number, metrics?: any): void;
    cycleStart(cycleId: number): void;
    cycleEnd(cycleId: number, phases: any, health: any): void;
    // Legacy compatibility methods
    info(msg: string): void;
    debug(msg: string): void;
    success(msg: string): void;
    verbose(msg: string): void;
    trace(msg: string): void;
    warn(msg: string): void;
}

export interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
    cycleId?: number;
    metrics?: any;
}