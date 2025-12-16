/**
 * GlobalClock - RL6 Kernel Component #11
 *
 * Monotonic cycle clock providing stable timestamps even during rollbacks.
 * Essential component for EventSequencer and kernel-wide coordination.
 *
 * Features:
 * - Monotonic increasing sequence numbers
 * - Stable timestamps immune to system clock changes
 * - Singleton pattern for global consistency
 * - Thread-safe increment operations
 * - Recovery and testing support
 */

/**
 * GlobalClock provides monotonic sequence numbers for the RL6 kernel.
 * This is NOT based on system time to ensure stability during rollbacks
 * and system clock adjustments.
 */
export class GlobalClock {
    private static instance: GlobalClock;
    private seq: number = 0;
    private readonly startTime: number;

    private constructor() {
        this.startTime = Date.now();
    }

    /**
     * Get the singleton instance of GlobalClock
     * @returns GlobalClock instance
     */
    public static getInstance(): GlobalClock {
        if (!GlobalClock.instance) {
            GlobalClock.instance = new GlobalClock();
        }
        return GlobalClock.instance;
    }

    /**
     * Get current timestamp (monotonic milliseconds since clock creation)
     * @returns Current timestamp in milliseconds
     */
    public now(): number {
        return Date.now() - this.startTime;
    }

    /**
     * Get next sequence number and increment counter
     * @returns Next sequence number
     */
    public next(): number {
        return ++this.seq;
    }

    /**
     * Get current sequence number without incrementing
     * @returns Current sequence number
     */
    public current(): number {
        return this.seq;
    }

    /**
     * Legacy alias for current() - maintains compatibility
     * @returns Current sequence number
     */
    public currentSeq(): number {
        return this.current();
    }

    /**
     * Legacy alias for next() - maintains compatibility
     * @returns Next sequence number
     */
    public nextSeq(): number {
        return this.next();
    }

    /**
     * Reset sequence counter (for testing or recovery scenarios)
     * @param seq New sequence number (default: 0)
     */
    public reset(seq: number = 0): void {
        if (seq < 0) {
            throw new Error(`GlobalClock: Invalid sequence number ${seq}. Must be >= 0`);
        }
        this.seq = seq;
    }

    /**
     * Get clock statistics for monitoring
     * @returns Clock status information
     */
    public getStatus(): {
        sequence: number;
        uptime: number;
        startTime: number;
    } {
        return {
            sequence: this.seq,
            uptime: this.now(),
            startTime: this.startTime
        };
    }

    /**
     * Validate clock state consistency
     * @returns True if clock is in valid state
     */
    public isValid(): boolean {
        return this.seq >= 0 && this.startTime > 0;
    }

    /**
     * Create a unique timestamp combining sequence and monotonic time
     * @returns Unique timestamp string
     */
    public createTimestamp(): string {
        return `${this.now()}-${this.next()}`;
    }

    /**
     * Parse a timestamp created by createTimestamp()
     * @param timestamp Timestamp string to parse
     * @returns Parsed components or null if invalid
     */
    public parseTimestamp(timestamp: string): {
        time: number;
        sequence: number;
    } | null {
        const parts = timestamp.split('-');
        if (parts.length !== 2) return null;

        const time = parseInt(parts[0], 10);
        const sequence = parseInt(parts[1], 10);

        if (isNaN(time) || isNaN(sequence)) return null;

        return { time, sequence };
    }

    /**
     * Compare two timestamps for ordering
     * @param ts1 First timestamp
     * @param ts2 Second timestamp
     * @returns -1 if ts1 < ts2, 0 if equal, 1 if ts1 > ts2
     */
    public compareTimestamps(ts1: string, ts2: string): number {
        const parsed1 = this.parseTimestamp(ts1);
        const parsed2 = this.parseTimestamp(ts2);

        if (!parsed1 || !parsed2) {
            throw new Error('Invalid timestamp format');
        }

        if (parsed1.time !== parsed2.time) {
            return parsed1.time < parsed2.time ? -1 : 1;
        }

        if (parsed1.sequence !== parsed2.sequence) {
            return parsed1.sequence < parsed2.sequence ? -1 : 1;
        }

        return 0;
    }

    /**
     * Get milliseconds elapsed since given timestamp
     * @param timestamp Timestamp to measure from
     * @returns Elapsed milliseconds
     */
    public getElapsedSince(timestamp: string): number {
        const parsed = this.parseTimestamp(timestamp);
        if (!parsed) {
            throw new Error('Invalid timestamp format');
        }

        return this.now() - parsed.time;
    }

    /**
     * Check if timestamp is within recent time window
     * @param timestamp Timestamp to check
     * @param windowMs Time window in milliseconds (default: 60000)
     * @returns True if timestamp is within window
     */
    public isRecent(timestamp: string, windowMs: number = 60000): boolean {
        const elapsed = this.getElapsedSince(timestamp);
        return elapsed >= 0 && elapsed <= windowMs;
    }
}

// Export singleton instance for convenience
export const globalClock = GlobalClock.getInstance();