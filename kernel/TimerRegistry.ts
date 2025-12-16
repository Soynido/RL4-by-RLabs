/**
 * TimerRegistry - RL6 Kernel Component #1
 *
 * Centralized timer management with soft/hard timeouts and cancel safety.
 * Prevents memory leaks by tracking all timers and ensuring proper cleanup.
 *
 * Features:
 * - Soft timeout (warning) and hard timeout (cancellation)
 * - Cancel safety with automatic cleanup
 * - Memory leak prevention
 * - TimerToken interface identical to V3
 * - Health monitoring and diagnostics
 */

/**
 * Timer token interface - identical to V3
 */
export interface TimerToken {
    /** Unique timer identifier */
    id: string;
    /** Timer type */
    type: 'timeout' | 'interval';
    /** Creation timestamp */
    createdAt: number;
    /** Timer duration/interval */
    interval: number;
    /** Callback function name for debugging */
    callback: string;
    /** Soft timeout (warning) if specified */
    softTimeout?: number;
    /** Hard timeout (cancellation) if specified */
    hardTimeout?: number;
    /** Whether timer has been cancelled */
    cancelled: boolean;
    /** Execution count for intervals */
    executionCount: number;
    /** Last execution timestamp */
    lastExecution?: number;
}

/**
 * Timer configuration options
 */
export interface TimerOptions {
    /** Soft timeout in milliseconds (warning before hard timeout) */
    softTimeout?: number;
    /** Hard timeout in milliseconds (force cancellation) */
    hardTimeout?: number;
    /** Whether to auto-cleanup timeout after execution */
    autoCleanup?: boolean;
    /** Error handling behavior */
    onError?: (error: Error, timerId: string) => void;
}

/**
 * Timer statistics for monitoring
 */
export interface TimerStats {
    /** Total timers registered */
    total: number;
    /** Active timeouts */
    timeouts: number;
    /** Active intervals */
    intervals: number;
    /** Cancelled timers */
    cancelled: number;
    /** Executed timers */
    executed: number;
    /** Average execution time */
    avgExecutionTime: number;
    /** Memory usage estimate */
    memoryEstimate: number;
}

/**
 * TimerRegistry provides centralized timer management with safety guarantees
 * and comprehensive monitoring capabilities.
 */
export class TimerRegistry {
    private timers: Map<string, NodeJS.Timeout> = new Map();
    private intervals: Map<string, NodeJS.Timeout> = new Map();
    private metadata: Map<string, TimerToken> = new Map();
    private softTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private hardTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private executionTimes: Map<string, number[]> = new Map();
    private cancelledTimers: Set<string> = new Set();

    /**
     * Register a timeout with optional soft/hard timeouts
     * @param id Unique timer identifier (format: "module:purpose")
     * @param callback Function to execute
     * @param delay Delay in milliseconds
     * @param options Timer configuration options
     * @throws Error if ID already registered
     */
    public registerTimeout(
        id: string,
        callback: () => void,
        delay: number,
        options: TimerOptions = {}
    ): void {
        if (this.timers.has(id) || this.intervals.has(id)) {
            throw new Error(`Timer ID already registered: ${id}`);
        }

        if (delay <= 0) {
            throw new Error(`Timer delay must be positive: ${delay}`);
        }

        // Create timer token
        const token: TimerToken = {
            id,
            type: 'timeout',
            createdAt: Date.now(),
            interval: delay,
            callback: callback.name || 'anonymous',
            softTimeout: options.softTimeout,
            hardTimeout: options.hardTimeout,
            cancelled: false,
            executionCount: 0
        };

        // Store metadata
        this.metadata.set(id, token);
        this.executionTimes.set(id, []);

        // Create wrapped callback with error handling
        const wrappedCallback = () => {
            if (this.isCancelled(id)) {
                return;
            }

            const startTime = Date.now();

            try {
                callback();
                token.executionCount++;
                token.lastExecution = Date.now();

                // Record execution time
                const executionTime = Date.now() - startTime;
                const times = this.executionTimes.get(id)!;
                times.push(executionTime);

                // Clear soft/hard timeouts
                this.clearTimeouts(id);

                // Auto-cleanup if requested
                if (options.autoCleanup !== false) {
                    this.clear(id);
                }
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));

                if (options.onError) {
                    try {
                        options.onError(err, id);
                    } catch (handlerError) {
                        console.error(`[TimerRegistry] Error in error handler for ${id}:`, handlerError);
                    }
                } else {
                    console.error(`[TimerRegistry] Error in timer ${id}:`, err);
                }

                // Auto-cleanup on error
                this.clear(id);
            }
        };

        // Register main timer
        const timer = setTimeout(wrappedCallback, delay);
        this.timers.set(id, timer);

        // Setup soft timeout if specified
        if (options.softTimeout && options.softTimeout > 0 && options.softTimeout < delay) {
            const softTimer = setTimeout(() => {
                if (!this.isCancelled(id)) {
                    console.warn(`[TimerRegistry] Soft timeout exceeded for timer ${id} (${options.softTimeout}ms)`);
                }
            }, options.softTimeout);
            this.softTimeouts.set(id, softTimer);
        }

        // Setup hard timeout if specified
        if (options.hardTimeout && options.hardTimeout > 0) {
            const hardTimer = setTimeout(() => {
                if (!this.isCancelled(id)) {
                    console.warn(`[TimerRegistry] Hard timeout reached for timer ${id} (${options.hardTimeout}ms) - cancelling`);
                    this.cancel(id);
                }
            }, options.hardTimeout);
            this.hardTimeouts.set(id, hardTimer);
        }
    }

    /**
     * Register an interval with cancel safety
     * @param id Unique timer identifier
     * @param callback Function to execute repeatedly
     * @param interval Interval in milliseconds
     * @param options Timer configuration options
     * @throws Error if ID already registered
     */
    public registerInterval(
        id: string,
        callback: () => void,
        interval: number,
        options: TimerOptions = {}
    ): void {
        if (this.timers.has(id) || this.intervals.has(id)) {
            console.warn(`[TimerRegistry] Timer ID already registered: ${id} - auto-clearing`);
            this.clear(id);
        }

        if (interval <= 0) {
            throw new Error(`Interval must be positive: ${interval}`);
        }

        // Create timer token
        const token: TimerToken = {
            id,
            type: 'interval',
            createdAt: Date.now(),
            interval,
            callback: callback.name || 'anonymous',
            softTimeout: options.softTimeout,
            hardTimeout: options.hardTimeout,
            cancelled: false,
            executionCount: 0
        };

        // Store metadata
        this.metadata.set(id, token);
        this.executionTimes.set(id, []);

        // Create wrapped callback with cancel safety
        const wrappedCallback = () => {
            if (this.isCancelled(id)) {
                return;
            }

            const startTime = Date.now();

            try {
                callback();
                token.executionCount++;
                token.lastExecution = Date.now();

                // Record execution time
                const executionTime = Date.now() - startTime;
                const times = this.executionTimes.get(id)!;
                times.push(executionTime);

                // Keep only last 100 execution times
                if (times.length > 100) {
                    times.splice(0, times.length - 100);
                }
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));

                if (options.onError) {
                    try {
                        options.onError(err, id);
                    } catch (handlerError) {
                        console.error(`[TimerRegistry] Error in error handler for ${id}:`, handlerError);
                    }
                } else {
                    console.error(`[TimerRegistry] Error in interval ${id}:`, err);
                }
            }
        };

        // Register interval
        const timer = setInterval(wrappedCallback, interval);
        this.intervals.set(id, timer);

        // Setup hard timeout for intervals if specified
        if (options.hardTimeout && options.hardTimeout > 0) {
            const hardTimer = setTimeout(() => {
                if (!this.isCancelled(id)) {
                    console.warn(`[TimerRegistry] Hard timeout reached for interval ${id} (${options.hardTimeout}ms) - cancelling`);
                    this.cancel(id);
                }
            }, options.hardTimeout);
            this.hardTimeouts.set(id, hardTimer);
        }
    }

    /**
     * Clear a specific timer by ID with cancel safety
     * @param id Timer ID to clear
     */
    public clear(id: string): void {
        this.cancel(id);
        this.cleanup(id);
    }

    /**
     * Cancel timer (stop execution but keep metadata)
     * @param id Timer ID to cancel
     */
    public cancel(id: string): void {
        if (this.isCancelled(id)) {
            return; // Already cancelled
        }

        // Mark as cancelled
        this.cancelledTimers.add(id);

        // Update token
        const token = this.metadata.get(id);
        if (token) {
            token.cancelled = true;
        }

        // Clear underlying timers
        if (this.timers.has(id)) {
            clearTimeout(this.timers.get(id)!);
            this.timers.delete(id);
        }

        if (this.intervals.has(id)) {
            clearInterval(this.intervals.get(id)!);
            this.intervals.delete(id);
        }

        this.clearTimeouts(id);
    }

    /**
     * Resume a cancelled timer (creates new timer with same configuration)
     * @param id Timer ID to resume
     * @param callback New callback function
     * @param options New options
     * @returns True if timer was resumed
     */
    public resume(
        id: string,
        callback: () => void,
        options: TimerOptions = {}
    ): boolean {
        const token = this.metadata.get(id);
        if (!token || !this.isCancelled(id)) {
            return false;
        }

        // Clean up old timer
        this.cleanup(id);

        // Resume based on type
        if (token.type === 'timeout') {
            this.registerTimeout(id, callback, token.interval, {
                softTimeout: token.softTimeout,
                hardTimeout: token.hardTimeout,
                ...options
            });
        } else {
            this.registerInterval(id, callback, token.interval, {
                hardTimeout: token.hardTimeout,
                ...options
            });
        }

        return true;
    }

    /**
     * Clear all timers with cancel safety
     */
    public clearAll(): void {
        // Cancel all timers first
        const allIds = [
            ...Array.from(this.timers.keys()),
            ...Array.from(this.intervals.keys())
        ];

        for (const id of allIds) {
            this.cancel(id);
        }

        // Clean up all resources
        this.timers.clear();
        this.intervals.clear();
        this.metadata.clear();
        this.softTimeouts.clear();
        this.hardTimeouts.clear();
        this.executionTimes.clear();
        this.cancelledTimers.clear();
    }

    /**
     * Get active timer count for health monitoring
     * @returns Active timer counts
     */
    public getActiveCount(): {
        timeouts: number;
        intervals: number;
        total: number;
        cancelled: number;
    } {
        return {
            timeouts: this.timers.size,
            intervals: this.intervals.size,
            total: this.timers.size + this.intervals.size,
            cancelled: this.cancelledTimers.size
        };
    }

    /**
     * Get comprehensive timer statistics
     * @returns Timer statistics
     */
    public getStats(): TimerStats {
        const tokens = Array.from(this.metadata.values());
        const executed = tokens.filter(t => t.executionCount > 0).length;
        const cancelled = this.cancelledTimers.size;

        // Calculate average execution time
        let totalTime = 0;
        let totalExecutions = 0;
        for (const times of this.executionTimes.values()) {
            totalTime += times.reduce((sum, time) => sum + time, 0);
            totalExecutions += times.length;
        }

        const avgExecutionTime = totalExecutions > 0 ? totalTime / totalExecutions : 0;

        // Estimate memory usage
        const memoryEstimate =
            (this.metadata.size * 200) +    // ~200 bytes per token
            (this.executionTimes.size * 100) + // ~100 bytes per execution history
            (this.timers.size * 50) +      // ~50 bytes per timer
            (this.intervals.size * 50) +   // ~50 bytes per interval
            (this.cancelledTimers.size * 10); // ~10 bytes per cancelled ID

        return {
            total: tokens.length,
            timeouts: this.timers.size,
            intervals: this.intervals.size,
            cancelled,
            executed,
            avgExecutionTime,
            memoryEstimate
        };
    }

    /**
     * Get all timer metadata for diagnostics
     * @param includeCancelled Whether to include cancelled timers
     * @returns Array of timer tokens
     */
    public getTimers(includeCancelled: boolean = false): TimerToken[] {
        const tokens = Array.from(this.metadata.values());

        if (!includeCancelled) {
            return tokens.filter(t => !t.cancelled);
        }

        return tokens;
    }

    /**
     * Get timer by ID
     * @param id Timer ID
     * @returns Timer token or undefined
     */
    public getTimer(id: string): TimerToken | undefined {
        return this.metadata.get(id);
    }

    /**
     * Check if timer exists (including cancelled)
     * @param id Timer ID
     * @returns True if timer exists
     */
    public has(id: string): boolean {
        return this.metadata.has(id);
    }

    /**
     * Check if timer is currently active
     * @param id Timer ID
     * @returns True if timer is active
     */
    public isActive(id: string): boolean {
        return this.timers.has(id) || this.intervals.has(id);
    }

    /**
     * Check if timer is cancelled
     * @param id Timer ID
     * @returns True if timer is cancelled
     */
    public isCancelled(id: string): boolean {
        return this.cancelledTimers.has(id);
    }

    /**
     * Get execution history for a timer
     * @param id Timer ID
     * @returns Array of execution times
     */
    public getExecutionHistory(id: string): number[] {
        const times = this.executionTimes.get(id);
        return times ? [...times] : [];
    }

    /**
     * Clear timers matching pattern
     * @param pattern Regular expression to match timer IDs
     * @returns Number of timers cleared
     */
    public clearByPattern(pattern: RegExp): number {
        let cleared = 0;
        const regex = new RegExp(pattern);

        for (const id of this.metadata.keys()) {
            if (regex.test(id)) {
                this.clear(id);
                cleared++;
            }
        }

        return cleared;
    }

    /**
     * Force garbage collection (test utility)
     */
    public forceGC(): void {
        if (global.gc) {
            global.gc();
        }
    }

    /**
     * Check for memory leaks
     * @returns Memory leak diagnostic information
     */
    public checkMemoryLeaks(): {
        suspiciousTimers: string[];
        oldTimers: string[];
        memoryUsage: TimerStats;
    } {
        const now = Date.now();
        const oneHourAgo = now - 3600000;
        const tokens = Array.from(this.metadata.values());

        // Find suspicious timers
        const suspiciousTimers = tokens
            .filter(t => !t.cancelled && t.type === 'interval' && t.executionCount > 1000)
            .map(t => t.id);

        // Find very old timers
        const oldTimers = tokens
            .filter(t => !t.cancelled && t.createdAt < oneHourAgo)
            .map(t => t.id);

        return {
            suspiciousTimers,
            oldTimers,
            memoryUsage: this.getStats()
        };
    }

    /**
     * Clear all timeout timers for a specific timer
     * @param id Timer ID
     */
    private clearTimeouts(id: string): void {
        if (this.softTimeouts.has(id)) {
            clearTimeout(this.softTimeouts.get(id)!);
            this.softTimeouts.delete(id);
        }

        if (this.hardTimeouts.has(id)) {
            clearTimeout(this.hardTimeouts.get(id)!);
            this.hardTimeouts.delete(id);
        }
    }

    /**
     * Complete cleanup of timer resources
     * @param id Timer ID
     */
    private cleanup(id: string): void {
        this.clearTimeouts(id);
        this.metadata.delete(id);
        this.executionTimes.delete(id);
        this.cancelledTimers.delete(id);
    }
}