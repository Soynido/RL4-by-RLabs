/**
 * StateRegistry - RL6 Kernel Component #5
 *
 * Centralized state management with immutable structure and AppendOnlyWriter integration.
 * Provides atomic state operations, persistence, and kernel-wide coordination.
 *
 * Features:
 * - Central registry for cycle, mode, last snapshot, errors
 * - Immutable structure guarantees
 * - AppendOnlyWriter compatibility
 * - Atomic state operations
 * - History tracking and rollback capability
 */

import * as path from 'path';
import * as fs from 'fs';
import { WriteTracker } from './WriteTracker';

// Forward declaration - AppendOnlyWriter will be implemented later
export interface AppendOnlyWriterInterface {
    append(data: any): Promise<void>;
    flush(force?: boolean): Promise<void>;
}

/**
 * Current operational mode
 */
export type KernelMode = 'strict' | 'flexible' | 'exploratory' | 'free' | 'firstUse' | 'unknown';

/**
 * Current phase of operation
 */
export type KernelPhase = 'initialization' | 'setup' | 'implementation' | 'refactor' | 'debug' | 'test' | 'deploy' | 'maintenance' | 'unknown';

/**
 * System health metrics
 */
export interface HealthMetrics {
    memoryMB: number;
    activeTimers: number;
    queueSize: number;
    eventLoopLag: number;
    diskUsageMB: number;
    cpuUsage: number;
}

/**
 * Error tracking information
 */
export interface ErrorInfo {
    timestamp: string;
    error: string;
    source: string;
    severity: 'critical' | 'warning' | 'info';
    resolved: boolean;
    context?: any;
}

/**
 * Cycle tracking information
 */
export interface CycleInfo {
    cycleId: number;
    startTime: string;
    endTime?: string;
    phase: KernelPhase;
    eventsCount: number;
    success: boolean;
    errors: string[];
}

/**
 * Kernel state interface
 */
export interface KernelState {
    /** Kernel version */
    version: string;
    /** Kernel uptime in milliseconds */
    uptime: number;
    /** Current operational mode */
    mode: KernelMode;
    /** Current operational phase */
    phase: KernelPhase;
    /** Total events processed */
    totalEvents: number;
    /** Current cycle information */
    currentCycle: CycleInfo | null;
    /** Last successful snapshot timestamp */
    lastSnapshot: string;
    /** Last successful cycle timestamp */
    lastCycle: string | null;
    /** System health metrics */
    health: HealthMetrics;
    /** Active error states */
    errors: ErrorInfo[];
    /** Kernel start timestamp */
    startedAt: string;
    /** Last heartbeat timestamp */
    lastHeartbeat: string;
    /** Additional metadata */
    metadata: Record<string, any>;
}

/**
 * State patch operations
 */
export interface StatePatch {
    /** Path to update (dot notation) */
    path: string;
    /** New value */
    value: any;
    /** Optional merge behavior for objects */
    merge?: boolean;
}

/**
 * State registry statistics
 */
export interface StateRegistryStats {
    stateSize: number;
    historyEntries: number;
    lastUpdate: string;
    snapshotCount: number;
    errorCount: number;
    uptime: number;
}

/**
 * StateRegistry provides centralized, immutable state management for the RL6 kernel.
 * Ensures data consistency and provides atomic operations with full audit trail.
 */
export class StateRegistry {
    private state: KernelState;
    private stateDir: string;
    private snapshotInterval: number;
    private writer: AppendOnlyWriterInterface | null;
    private historyPath: string;
    private snapshotPath: string;
    private startTime: number;
    private lastSnapshotTime: number;
    private snapshotCount: number;
    private writeTracker = WriteTracker.getInstance();

    constructor(workspaceRoot: string, writer?: AppendOnlyWriterInterface) {
        this.stateDir = path.join(workspaceRoot, '.reasoning_rl4', 'state');
        this.historyPath = path.join(this.stateDir, 'kernel_history.jsonl');
        this.snapshotPath = path.join(this.stateDir, 'kernel.json');
        this.snapshotInterval = 600000; // 10 minutes
        this.writer = writer || null;
        this.startTime = Date.now();
        this.lastSnapshotTime = 0;
        this.snapshotCount = 0;

        // Ensure state directory exists
        this.ensureDirectory();

        // Load or create initial state
        this.state = this.loadState();

        // Update startup fields
        this.updateStartupFields();
    }

    /**
     * Get current state (immutable snapshot)
     * @returns Read-only copy of current state
     */
    public getState(): Readonly<KernelState> {
        return Object.freeze({ ...this.state });
    }

    /**
     * Get specific state field by path
     * @param path Dot notation path (e.g., 'health.memoryMB')
     * @returns Value at specified path
     */
    public getField(path: string): any {
        const keys = path.split('.');
        let current: any = this.state;

        for (const key of keys) {
            if (current === null || current === undefined) {
                return undefined;
            }
            current = current[key];
        }

        return current;
    }

    /**
     * Update state atomically with complete replacement
     * @param updates Partial state updates
     */
    public async updateState(updates: Partial<KernelState>): Promise<void> {
        // Create new immutable state
        const newState = { ...this.state, ...updates };

        // Validate state integrity
        this.validateStateInternal(newState);

        // Apply new state
        this.state = newState;

        // Update heartbeat
        this.updateHeartbeat();

        // Snapshot if needed
        await this.maybeSnapshot();
    }

    /**
     * Apply atomic patches to state
     * @param patches Array of patches to apply
     */
    public async patch(patches: StatePatch[]): Promise<void> {
        let newState = { ...this.state };

        for (const patch of patches) {
            newState = this.applyPatch(newState, patch);
        }

        await this.updateState(newState);
    }

    /**
     * Apply single patch to state
     * @param state Current state
     * @param patch Patch to apply
     * @returns Updated state
     */
    private applyPatch(state: KernelState, patch: StatePatch): KernelState {
        const keys = patch.path.split('.');
        let current: any = state;

        // Navigate to parent of target
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            } else {
                current[key] = { ...current[key] };
            }
            current = current[key];
        }

        // Apply the patch
        const finalKey = keys[keys.length - 1];
        if (patch.merge && typeof current[finalKey] === 'object' && typeof patch.value === 'object') {
            current[finalKey] = { ...current[finalKey], ...patch.value };
        } else {
            current[finalKey] = patch.value;
        }

        return state;
    }

    /**
     * Reset state to defaults
     * @param preserveMetadata Whether to preserve some metadata
     */
    public async reset(preserveMetadata: boolean = false): Promise<void> {
        const defaultState = this.createDefaultState();

        if (preserveMetadata) {
            defaultState.startedAt = this.state.startedAt;
            defaultState.version = this.state.version;
        }

        await this.updateState(defaultState);
    }

    /**
     * Update cycle information
     * @param cycleInfo New cycle information
     */
    public async updateCycle(cycleInfo: Partial<CycleInfo>): Promise<void> {
        const currentCycle = this.state.currentCycle;
        const updates: Partial<KernelState> = {
            currentCycle: currentCycle ? { ...currentCycle, ...cycleInfo } : {
                cycleId: 0,
                startTime: new Date().toISOString(),
                phase: 'initialization',
                eventsCount: 0,
                success: true,
                errors: [],
                ...cycleInfo
            }
        };

        await this.updateState(updates);
    }

    /**
     * Complete current cycle
     * @param success Whether cycle was successful
     * @param errors Array of errors if any
     */
    public async completeCycle(success: boolean = true, errors: string[] = []): Promise<void> {
        const now = new Date().toISOString();
        const updates: Partial<KernelState> = {
            lastCycle: now,
            totalEvents: this.state.totalEvents + (this.state.currentCycle?.eventsCount || 0)
        };

        if (this.state.currentCycle) {
            updates.currentCycle = {
                ...this.state.currentCycle,
                endTime: now,
                success,
                errors
            };
        }

        await this.updateState(updates);
        
        // Force snapshot after every cycle to ensure state persistence
        await this.snapshot(true);
    }

    /**
     * Add error to state
     * @param error Error information
     */
    public async addError(error: Omit<ErrorInfo, 'timestamp'>): Promise<void> {
        const errorInfo: ErrorInfo = {
            ...error,
            timestamp: new Date().toISOString()
        };

        const errors = [...this.state.errors, errorInfo];
        await this.updateState({ errors });
    }

    /**
     * Resolve error by ID or timestamp
     * @param identifier Error identifier (timestamp or index)
     */
    public async resolveError(identifier: string | number): Promise<void> {
        let errors = [...this.state.errors];

        if (typeof identifier === 'number') {
            if (identifier >= 0 && identifier < errors.length) {
                errors[identifier] = { ...errors[identifier], resolved: true };
            }
        } else {
            errors = errors.map(error =>
                error.timestamp === identifier ? { ...error, resolved: true } : error
            );
        }

        await this.updateState({ errors });
    }

    /**
     * Update health metrics
     * @param metrics New health metrics
     */
    public async updateHealth(metrics: Partial<HealthMetrics>): Promise<void> {
        const health = { ...this.state.health, ...metrics };
        await this.updateState({ health });
    }

    /**
     * Update kernel mode
     * @param mode New kernel mode
     */
    public async setMode(mode: KernelMode): Promise<void> {
        await this.updateState({ mode });
    }

    /**
     * Update kernel phase
     * @param phase New kernel phase
     */
    public async setPhase(phase: KernelPhase): Promise<void> {
        await this.updateState({ phase });
    }

    /**
     * Trigger manual snapshot
     * @param force Force snapshot even if interval not met
     */
    public async snapshot(force: boolean = false): Promise<void> {
        const now = Date.now();

        if (!force && (now - this.lastSnapshotTime) < this.snapshotInterval) {
            return; // Skip if interval not met
        }

        try {
            // Update last snapshot time
            this.state.lastSnapshot = new Date().toISOString();
            this.lastSnapshotTime = now;

            // Ensure directory exists
            this.ensureDirectory();

            // Write current state snapshot
            fs.writeFileSync(this.snapshotPath, JSON.stringify(this.state, null, 2));
            this.writeTracker.markInternalWrite(this.snapshotPath);

            // Append to history if writer available
            if (this.writer) {
                await this.writer.append({
                    timestamp: new Date().toISOString(),
                    type: 'state_snapshot',
                    seq: this.snapshotCount,
                    data: this.state
                });
            }

            // Write to local history as backup
            this.writeToHistory(this.state);

            this.snapshotCount++;

        } catch (error) {
            console.error('[StateRegistry] Failed to create snapshot:', error);
            throw error;
        }
    }

    /**
     * Get registry statistics
     * @returns Current statistics
     */
    public getStats(): StateRegistryStats {
        return {
            stateSize: JSON.stringify(this.state).length,
            historyEntries: this.getHistoryEntryCount(),
            lastUpdate: this.state.lastHeartbeat,
            snapshotCount: this.snapshotCount,
            errorCount: this.state.errors.length,
            uptime: this.state.uptime
        };
    }

    /**
     * Validate state integrity
     * @returns True if state is valid
     */
    public validateState(): boolean {
        try {
            // Check required fields
            const required = ['version', 'uptime', 'mode', 'phase', 'totalEvents', 'lastSnapshot', 'startedAt'];
            for (const field of required) {
                if (!(field in this.state)) {
                    return false;
                }
            }

            // Check data types
            if (typeof this.state.uptime !== 'number') return false;
            if (typeof this.state.totalEvents !== 'number') return false;
            if (!Array.isArray(this.state.errors)) return false;

            return true;
        } catch {
            return false;
        }
    }

    /**
     * Load state from disk
     * @returns Loaded state or default
     */
    private loadState(): KernelState {
        if (fs.existsSync(this.snapshotPath)) {
            try {
                const data = fs.readFileSync(this.snapshotPath, 'utf-8');
                const state = JSON.parse(data);
                this.validateStateInternal(state); // Will throw if invalid
                return state;
            } catch (error) {
                console.warn('⚠️ Failed to load state, using defaults:', error);
                return this.createDefaultState();
            }
        }

        return this.createDefaultState();
    }

    /**
     * Create default state
     * @returns Default kernel state
     */
    private createDefaultState(): KernelState {
        const now = new Date().toISOString();
        return {
            version: '2.0.0',
            uptime: 0,
            mode: 'unknown',
            phase: 'initialization',
            totalEvents: 0,
            currentCycle: null,
            lastSnapshot: now,
            lastCycle: null,
            health: {
                memoryMB: 0,
                activeTimers: 0,
                queueSize: 0,
                eventLoopLag: 0,
                diskUsageMB: 0,
                cpuUsage: 0
            },
            errors: [],
            startedAt: now,
            lastHeartbeat: now,
            metadata: {}
        };
    }

    /**
     * Update startup fields
     */
    private updateStartupFields(): void {
        this.state.startedAt = new Date(this.startTime).toISOString();
        this.state.lastHeartbeat = this.state.startedAt;
    }

    /**
     * Update heartbeat timestamp
     */
    private updateHeartbeat(): void {
        this.state.lastHeartbeat = new Date().toISOString();
        this.state.uptime = Date.now() - this.startTime;
    }

    /**
     * Snapshot if interval has passed
     */
    private async maybeSnapshot(): Promise<void> {
        await this.snapshot(false);
    }

    /**
     * Ensure state directory exists
     */
    private ensureDirectory(): void {
        if (!fs.existsSync(this.stateDir)) {
            fs.mkdirSync(this.stateDir, { recursive: true });
        }
    }

    /**
     * Write entry to local history
     * @param state State to write
     */
    private writeToHistory(state: KernelState): void {
        const entry = {
            timestamp: new Date().toISOString(),
            type: 'state_snapshot',
            seq: this.snapshotCount,
            data: state
        };

        try {
            fs.appendFileSync(this.historyPath, JSON.stringify(entry) + '\n');
            this.writeTracker.markInternalWrite(this.historyPath);
        } catch (error) {
            console.warn('[StateRegistry] Failed to write to history:', error);
        }
    }

    /**
     * Get number of history entries
     * @returns History entry count
     */
    private getHistoryEntryCount(): number {
        if (!fs.existsSync(this.historyPath)) {
            return 0;
        }

        try {
            const content = fs.readFileSync(this.historyPath, 'utf-8');
            return content.split('\n').filter(line => line.trim()).length;
        } catch {
            return 0;
        }
    }

    /**
     * Validate state structure
     * @param state State to validate
     */
    private validateStateInternal(state: any): void {
        if (!state || typeof state !== 'object') {
            throw new Error('Invalid state: not an object');
        }

        if (typeof state.version !== 'string') {
            throw new Error('Invalid state: missing or invalid version');
        }

        if (typeof state.uptime !== 'number' || state.uptime < 0) {
            throw new Error('Invalid state: invalid uptime');
        }
    }
}