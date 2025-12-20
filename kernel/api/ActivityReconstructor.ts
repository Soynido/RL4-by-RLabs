/**
 * Activity Reconstructor - RL4 Kernel Activity Analysis Module
 *
 * Module 8490 - Activity reconstruction from event streams
 *
 * Reconstructs developer activity from various event sources:
 * - File system events (create, modify, delete)
 * - Git events (commits, branches, merges)
 * - Kernel API events (commands, cycles, state changes)
 * - Terminal events (commands run, output)
 * - Build/test events
 *
 * Output: Coherent timeline of tasks, bursts, focus areas, and anomalies.
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

export interface ActivityEvent {
    id: string;
    timestamp: Date;
    type: EventType;
    source: EventSource;
    data: any;
    duration?: number;
    relatedEvents?: string[];
}

export enum EventType {
    FILE_CREATE = 'file_create',
    FILE_MODIFY = 'file_modify',
    FILE_DELETE = 'file_delete',
    GIT_COMMIT = 'git_commit',
    GIT_BRANCH = 'git_branch',
    GIT_MERGE = 'git_merge',
    KERNEL_COMMAND = 'kernel_command',
    KERNEL_CYCLE = 'kernel_cycle',
    TERMINAL_COMMAND = 'terminal_command',
    BUILD_EVENT = 'build_event',
    TEST_EVENT = 'test_event',
    EDITOR_SESSION = 'editor_session',
    FOCUS_CHANGE = 'focus_change',
    ADR_ADDED = 'adr_added'
}

export enum EventSource {
    FILE_SYSTEM = 'filesystem',
    GIT = 'git',
    KERNEL = 'kernel',
    TERMINAL = 'terminal',
    EDITOR = 'editor',
    BUILD_SYSTEM = 'build',
    ADR_PARSER = 'adr_parser'
}

export interface Task {
    id: string;
    title: string;
    description?: string;
    startTime: Date;
    endTime?: Date;
    duration?: number;
    events: ActivityEvent[];
    files: string[];
    commands: string[];
    commits: string[];
    type: TaskType;
    status: TaskStatus;
    confidence: number;
}

export enum TaskType {
    FEATURE_DEVELOPMENT = 'feature_development',
    BUG_FIX = 'bug_fix',
    REFACTORING = 'refactoring',
    DOCUMENTATION = 'documentation',
    TESTING = 'testing',
    BUILD_CONFIGURATION = 'build_configuration',
    MAINTENANCE = 'maintenance',
    UNKNOWN = 'unknown'
}

export enum TaskStatus {
    ACTIVE = 'active',
    COMPLETED = 'completed',
    ABANDONED = 'abandoned',
    PAUSED = 'paused'
}

export interface ActivityBurst {
    id: string;
    startTime: Date;
    endTime: Date;
    duration: number;
    intensity: 'low' | 'medium' | 'high';
    eventCount: number;
    fileChanges: number;
    commands: string[];
    dominantTaskType?: TaskType;
}

export interface FocusArea {
    id: string;
    name: string;
    path: string;
    totalTime: number;
    visitCount: number;
    lastVisited: Date;
    fileTypes: string[];
    relatedTasks: string[];
    significance: number;
}

export interface ActivityAnomaly {
    id: string;
    timestamp: Date;
    type: AnomalyType;
    severity: 'low' | 'medium' | 'high';
    description: string;
    events: ActivityEvent[];
    suggestion?: string;
}

export enum AnomalyType {
    EXCESSIVE_FILE_DELETION = 'excessive_file_deletion',
    RAPID_CONTEXT_SWITCHING = 'rapid_context_switching',
    LONG_INACTIVE_PERIOD = 'long_inactive_period',
    REPEATED_FAILED_COMMANDS = 'repeated_failed_commands',
    UNUSUAL_WORKING_HOURS = 'unusual_working_hours',
    SUSPICIOUS_PATTERN = 'suspicious_pattern'
}

export interface ReconstructionResult {
    tasks: Task[];
    bursts: ActivityBurst[];
    focusAreas: FocusArea[];
    anomalies: ActivityAnomaly[];
    summary: ActivitySummary;
    reconstructionTime: Date;
    eventCount: number;
    timeRange: {
        start: Date;
        end: Date;
    };
}

export interface ActivitySummary {
    totalActiveTime: number;
    totalTasks: number;
    completedTasks: number;
    averageTaskDuration: number;
    mostActiveHour: number;
    mostActiveDay: string;
    productivityScore: number;
    focusScore: number;
    consistencyScore: number;
}

/**
 * Activity Reconstructor Class
 */
export class ActivityReconstructor extends EventEmitter {
    private workspaceRoot: string;
    private eventBuffer: ActivityEvent[] = [];
    private tasks: Task[] = [];
    private bursts: ActivityBurst[] = [];
    private focusAreas: Map<string, FocusArea> = new Map();
    private anomalies: ActivityAnomaly[] = [];
    private isReconstructing = false;
    private terminalEventsPath: string;

    constructor(workspaceRoot: string) {
        super();
        this.workspaceRoot = workspaceRoot;
        this.terminalEventsPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'terminal-events.jsonl');
    }

    /**
     * Add event to the reconstruction buffer
     */
    addEvent(event: Omit<ActivityEvent, 'id'>): void {
        const fullEvent: ActivityEvent = {
            ...event,
            id: this.generateEventId()
        };

        this.eventBuffer.push(fullEvent);
        this.eventBuffer.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        // Keep buffer size manageable (last 10000 events)
        if (this.eventBuffer.length > 10000) {
            this.eventBuffer = this.eventBuffer.slice(-5000);
        }

        // Emit event for real-time processing
        this.emit('eventAdded', fullEvent);
    }

    /**
     * Reconstruct activity from event stream
     */
    async reconstruct(eventStream?: ActivityEvent[]): Promise<ReconstructionResult> {
        if (this.isReconstructing) {
            throw new Error('Reconstruction already in progress');
        }

        this.isReconstructing = true;
        console.log(`ActivityReconstructor: Starting reconstruction with ${eventStream?.length || this.eventBuffer.length} events`);

        try {
            // Use provided events or buffer
            let events = eventStream || [...this.eventBuffer];

            // Enrich with terminal events (append-only) within the observed window
            if (events.length > 0) {
                const startTs = events[0].timestamp;
                const endTs = events[events.length - 1].timestamp;
                const terminalEvents = this.readTerminalEventsBetween(startTs, endTs);
                events = events.concat(terminalEvents);
            }

            if (events.length === 0) {
                return this.createEmptyResult();
            }

            // Sort events by timestamp
            events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

            // Reconstruct different aspects
            await this.reconstructTasks(events);
            await this.detectActivityBursts(events);
            await this.identifyFocusAreas(events);
            await this.detectAnomalies(events);

            // Generate summary
            const summary = await this.generateSummary();

            const timeRange = {
                start: events[0].timestamp,
                end: events[events.length - 1].timestamp
            };

            const result: ReconstructionResult = {
                tasks: [...this.tasks],
                bursts: [...this.bursts],
                focusAreas: Array.from(this.focusAreas.values()),
                anomalies: [...this.anomalies],
                summary,
                reconstructionTime: new Date(),
                eventCount: events.length,
                timeRange
            };

            console.log(`ActivityReconstructor: Reconstruction complete - ${result.tasks.length} tasks, ${result.bursts.length} bursts`);
            this.emit('reconstructionComplete', result);

            return result;

        } finally {
            this.isReconstructing = false;
        }
    }

    /**
     * Reconstruct tasks from events
     */
    private async reconstructTasks(events: ActivityEvent[]): Promise<void> {
        console.log('ActivityReconstructor: Reconstructing tasks...');
        this.tasks = [];

        const taskSeeds = this.identifyTaskSeeds(events);
        const activeTasks: Map<string, Task> = new Map();

        for (const seed of taskSeeds) {
            const task = await this.growTaskFromSeed(seed, events, activeTasks);
            if (task) {
                this.tasks.push(task);
            }
        }

        // Post-process tasks for better accuracy
        await this.postProcessTasks();

        console.log(`ActivityReconstructor: Reconstructed ${this.tasks.length} tasks`);
    }

    /**
     * Identify potential task seeds from events
     */
    private identifyTaskSeeds(events: ActivityEvent[]): ActivityEvent[] {
        const seeds: ActivityEvent[] = [];

        for (const event of events) {
            // Git commits are strong task indicators
            if (event.type === EventType.GIT_COMMIT) {
                seeds.push(event);
            }
            // Large file modification bursts can indicate tasks
            else if (event.type === EventType.FILE_MODIFY && this.isSignificantFileChange(event)) {
                seeds.push(event);
            }
            // Kernel commands can indicate task boundaries
            else if (event.type === EventType.KERNEL_COMMAND) {
                seeds.push(event);
            }
        }

        return seeds;
    }

    /**
     * Grow a task from a seed event
     */
    private async growTaskFromSeed(
        seed: ActivityEvent,
        events: ActivityEvent[],
        activeTasks: Map<string, Task>
    ): Promise<Task | null> {
        const taskId = this.generateTaskId();
        const taskEvents: ActivityEvent[] = [seed];

        // Find related events before and after the seed
        const seedIndex = events.indexOf(seed);
        const timeWindow = 2 * 60 * 60 * 1000; // 2 hours

        // Look backward
        for (let i = seedIndex - 1; i >= 0; i--) {
            const event = events[i];
            const timeDiff = seed.timestamp.getTime() - event.timestamp.getTime();

            if (timeDiff > timeWindow) break;
            if (this.isEventRelatedToTask(event, taskEvents)) {
                taskEvents.unshift(event);
            }
        }

        // Look forward
        for (let i = seedIndex + 1; i < events.length; i++) {
            const event = events[i];
            const timeDiff = event.timestamp.getTime() - seed.timestamp.getTime();

            if (timeDiff > timeWindow) break;
            if (this.isEventRelatedToTask(event, taskEvents)) {
                taskEvents.push(event);
            }
        }

        if (taskEvents.length < 2) {
            return null; // Not enough events for a meaningful task
        }

        return this.createTaskFromEvents(taskId, taskEvents);
    }

    /**
     * Create task from related events
     */
    private createTaskFromEvents(taskId: string, events: ActivityEvent[]): Task {
        const startTime = events[0].timestamp;
        const endTime = events[events.length - 1].timestamp;
        const duration = endTime.getTime() - startTime.getTime();

        const files = new Set<string>();
        const commands = new Set<string>();
        const commits = new Set<string>();

        for (const event of events) {
            if (event.data.filePath) {
                files.add(event.data.filePath);
            }
            if (event.data.command) {
                commands.add(event.data.command);
            }
            if (event.type === EventType.GIT_COMMIT && event.data.commitHash) {
                commits.add(event.data.commitHash);
            }
        }

        const taskType = this.inferTaskType(events);
        const confidence = this.calculateTaskConfidence(events);

        return {
            id: taskId,
            title: this.generateTaskTitle(events),
            startTime,
            endTime,
            duration,
            events,
            files: Array.from(files),
            commands: Array.from(commands),
            commits: Array.from(commits),
            type: taskType,
            status: TaskStatus.COMPLETED,
            confidence
        };
    }

    /**
     * Detect activity bursts
     */
    private async detectActivityBursts(events: ActivityEvent[]): Promise<void> {
        console.log('ActivityReconstructor: Detecting activity bursts...');
        this.bursts = [];

        const burstWindow = 15 * 60 * 1000; // 15 minutes
        const minEvents = 5;

        let currentBurst: ActivityEvent[] = [];

        for (const event of events) {
            if (currentBurst.length === 0) {
                currentBurst.push(event);
            } else {
                const timeDiff = event.timestamp.getTime() - currentBurst[currentBurst.length - 1].timestamp.getTime();

                if (timeDiff <= burstWindow) {
                    currentBurst.push(event);
                } else {
                    // End current burst
                    if (currentBurst.length >= minEvents) {
                        this.bursts.push(this.createBurstFromEvents(currentBurst));
                    }
                    currentBurst = [event];
                }
            }
        }

        // Handle final burst
        if (currentBurst.length >= minEvents) {
            this.bursts.push(this.createBurstFromEvents(currentBurst));
        }

        console.log(`ActivityReconstructor: Detected ${this.bursts.length} activity bursts`);
    }

    /**
     * Create burst from events
     */
    private createBurstFromEvents(events: ActivityEvent[]): ActivityBurst {
        const startTime = events[0].timestamp;
        const endTime = events[events.length - 1].timestamp;
        const duration = endTime.getTime() - startTime.getTime();

        const fileChanges = events.filter(e =>
            e.type === EventType.FILE_CREATE ||
            e.type === EventType.FILE_MODIFY ||
            e.type === EventType.FILE_DELETE
        ).length;

        const commands = events
            .filter(e => e.data.command)
            .map(e => e.data.command);

        const intensity = this.calculateBurstIntensity(duration, events.length);

        return {
            id: this.generateBurstId(),
            startTime,
            endTime,
            duration,
            intensity,
            eventCount: events.length,
            fileChanges,
            commands,
            dominantTaskType: this.inferDominantTaskType(events)
        };
    }

    /**
     * Identify focus areas
     */
    private async identifyFocusAreas(events: ActivityEvent[]): Promise<void> {
        console.log('ActivityReconstructor: Identifying focus areas...');
        this.focusAreas.clear();

        const fileActivity = new Map<string, { count: number; totalTime: number; lastVisit: Date; types: Set<string> }>();

        for (const event of events) {
            if (event.data.filePath) {
                const dirPath = path.dirname(event.data.filePath);
                const fileName = path.basename(event.data.filePath);
                const ext = path.extname(event.data.filePath);

                if (!fileActivity.has(dirPath)) {
                    fileActivity.set(dirPath, {
                        count: 0,
                        totalTime: 0,
                        lastVisit: new Date(0),
                        types: new Set()
                    });
                }

                const activity = fileActivity.get(dirPath)!;
                activity.count++;
                activity.lastVisit = event.timestamp;
                activity.types.add(ext);

                // Estimate time spent (simplified)
                activity.totalTime += event.duration || 30000; // 30 seconds default
            }
        }

        // Convert to focus areas
        for (const [dirPath, activity] of fileActivity) {
            if (activity.count >= 3) { // Minimum activity threshold
                const focusArea: FocusArea = {
                    id: this.generateFocusAreaId(),
                    name: path.basename(dirPath),
                    path: dirPath,
                    totalTime: activity.totalTime,
                    visitCount: activity.count,
                    lastVisited: activity.lastVisit,
                    fileTypes: Array.from(activity.types),
                    relatedTasks: this.findRelatedTasks(dirPath),
                    significance: this.calculateFocusSignificance(activity)
                };

                this.focusAreas.set(dirPath, focusArea);
            }
        }

        console.log(`ActivityReconstructor: Identified ${this.focusAreas.size} focus areas`);
    }

    /**
     * Detect anomalies in activity patterns
     */
    private async detectAnomalies(events: ActivityEvent[]): Promise<void> {
        console.log('ActivityReconstructor: Detecting anomalies...');
        this.anomalies = [];

        // Detect excessive file deletion
        await this.detectExcessiveFileDeletion(events);

        // Detect rapid context switching
        await this.detectRapidContextSwitching(events);

        // Detect long inactive periods
        await this.detectLongInactivePeriods(events);

        // Detect repeated failed commands
        await this.detectRepeatedFailedCommands(events);

        console.log(`ActivityReconstructor: Detected ${this.anomalies.length} anomalies`);
    }

    /**
     * Generate activity summary
     */
    private async generateSummary(): Promise<ActivitySummary> {
        const totalActiveTime = this.tasks.reduce((sum, task) => sum + (task.duration || 0), 0);
        const completedTasks = this.tasks.filter(task => task.status === TaskStatus.COMPLETED).length;
        const averageTaskDuration = completedTasks > 0 ? totalActiveTime / completedTasks : 0;

        // Calculate activity patterns
        const hourlyActivity = this.calculateHourlyActivity();
        const mostActiveHour = Object.entries(hourlyActivity)
            .reduce((max, [hour, count]) => count > max.count ? { hour: parseInt(hour), count } : max, { hour: 0, count: 0 })
            .hour;

        return {
            totalActiveTime,
            totalTasks: this.tasks.length,
            completedTasks,
            averageTaskDuration,
            mostActiveHour,
            mostActiveDay: 'Monday', // Would calculate from actual data
            productivityScore: this.calculateProductivityScore(),
            focusScore: this.calculateFocusScore(),
            consistencyScore: this.calculateConsistencyScore()
        };
    }

    // Helper methods

    private generateEventId(): string {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateTaskId(): string {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateBurstId(): string {
        return `burst_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateFocusAreaId(): string {
        return `focus_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private isEventRelatedToTask(event: ActivityEvent, taskEvents: ActivityEvent[]): boolean {
        // Check if event is related to task events
        for (const taskEvent of taskEvents) {
            if (this.areEventsRelated(event, taskEvent)) {
                return true;
            }
        }
        return false;
    }

    private areEventsRelated(event1: ActivityEvent, event2: ActivityEvent): boolean {
        // Check file path relationship
        if (event1.data.filePath && event2.data.filePath) {
            const path1 = path.dirname(event1.data.filePath);
            const path2 = path.dirname(event2.data.filePath);
            if (path1 === path2 || path1.startsWith(path2) || path2.startsWith(path1)) {
                return true;
            }
        }

        // Check time proximity (within 30 minutes)
        const timeDiff = Math.abs(event1.timestamp.getTime() - event2.timestamp.getTime());
        if (timeDiff < 30 * 60 * 1000) {
            return true;
        }

        return false;
    }

    private isSignificantFileChange(event: ActivityEvent): boolean {
        if (!event.data.filePath) return false;

        const ext = path.extname(event.data.filePath);
        const significantExts = ['.js', '.ts', '.py', '.rs', '.java', '.cpp', '.c'];
        return significantExts.includes(ext);
    }

    private inferTaskType(events: ActivityEvent[]): TaskType {
        const commitMessages = events
            .filter(e => e.type === EventType.GIT_COMMIT && e.data.message)
            .map(e => e.data.message.toLowerCase());

        const fileTypes = new Set(
            events
                .filter(e => e.data.filePath)
                .map(e => path.extname(e.data.filePath))
        );

        // Simple heuristic-based classification
        for (const message of commitMessages) {
            if (message.includes('fix') || message.includes('bug')) {
                return TaskType.BUG_FIX;
            }
            if (message.includes('refactor') || message.includes('clean')) {
                return TaskType.REFACTORING;
            }
            if (message.includes('doc') || message.includes('readme')) {
                return TaskType.DOCUMENTATION;
            }
            if (message.includes('test') || message.includes('spec')) {
                return TaskType.TESTING;
            }
        }

        // Based on file types
        if (fileTypes.has('.md') || fileTypes.has('.rst')) {
            return TaskType.DOCUMENTATION;
        }

        return TaskType.FEATURE_DEVELOPMENT;
    }

    private calculateTaskConfidence(events: ActivityEvent[]): number {
        let confidence = 50; // Base confidence

        // More events = higher confidence
        confidence += Math.min(events.length * 2, 30);

        // Git commits increase confidence
        const commitCount = events.filter(e => e.type === EventType.GIT_COMMIT).length;
        confidence += commitCount * 10;

        // File diversity increases confidence
        const uniqueFiles = new Set(events.map(e => e.data.filePath).filter(Boolean)).size;
        confidence += Math.min(uniqueFiles * 3, 20);

        return Math.min(confidence, 100);
    }

    private generateTaskTitle(events: ActivityEvent[]): string {
        // Try to extract from commit messages
        const commits = events.filter(e => e.type === EventType.GIT_COMMIT && e.data.message);
        if (commits.length > 0) {
            return commits[0].data.message;
        }

        // Fallback to file-based title
        const files = events
            .filter(e => e.data.filePath)
            .map(e => path.basename(e.data.filePath))
            .slice(0, 3);

        if (files.length > 0) {
            return `Work on ${files.join(', ')}`;
        }

        return 'Untitled Task';
    }

    private async postProcessTasks(): Promise<void> {
        // Merge similar tasks
        // Adjust task boundaries
        // Update task relationships
    }

    private calculateBurstIntensity(duration: number, eventCount: number): 'low' | 'medium' | 'high' {
        const eventsPerMinute = (eventCount / duration) * 60000;

        if (eventsPerMinute > 2) return 'high';
        if (eventsPerMinute > 1) return 'medium';
        return 'low';
    }

    private inferDominantTaskType(events: ActivityEvent[]): TaskType | undefined {
        const typeCounts = new Map<TaskType, number>();

        for (const event of events) {
            const type = this.inferTaskType([event]);
            typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
        }

        let maxCount = 0;
        let dominantType: TaskType | undefined;

        for (const [type, count] of typeCounts) {
            if (count > maxCount) {
                maxCount = count;
                dominantType = type;
            }
        }

        return dominantType;
    }

    private findRelatedTasks(dirPath: string): string[] {
        return this.tasks
            .filter(task => task.files.some(file => path.dirname(file) === dirPath))
            .map(task => task.id);
    }

    private calculateFocusSignificance(activity: any): number {
        // Simple significance calculation based on activity metrics
        return Math.min((activity.count * 10) + (activity.totalTime / 60000), 100);
    }

    private calculateHourlyActivity(): { [hour: number]: number } {
        const activity: { [hour: number]: number } = {};

        for (const task of this.tasks) {
            const hour = task.startTime.getHours();
            activity[hour] = (activity[hour] || 0) + 1;
        }

        return activity;
    }

    private calculateProductivityScore(): number {
        // Simple productivity calculation
        const completedTasks = this.tasks.filter(t => t.status === TaskStatus.COMPLETED).length;
        return Math.min((completedTasks / Math.max(this.tasks.length, 1)) * 100, 100);
    }

    private calculateFocusScore(): number {
        // Focus score based on burst intensity and focus area concentration
        if (this.bursts.length === 0) return 50;

        const highIntensityBursts = this.bursts.filter(b => b.intensity === 'high').length;
        return Math.min((highIntensityBursts / this.bursts.length) * 100, 100);
    }

    private calculateConsistencyScore(): number {
        // Consistency based on regular work patterns
        // Simplified implementation
        return 75;
    }

    /**
     * Read terminal-events.jsonl between two timestamps and map to ActivityEvent
     */
    private readTerminalEventsBetween(start: Date, end: Date): ActivityEvent[] {
        const events: ActivityEvent[] = [];
        try {
            if (!fs.existsSync(this.terminalEventsPath)) {
                return events;
            }
            const startMs = start.getTime();
            const endMs = end.getTime();
            const lines = fs.readFileSync(this.terminalEventsPath, 'utf-8').split('\n').filter(Boolean);
            for (const line of lines) {
                try {
                    const evt = JSON.parse(line);
                    const ts = new Date(evt.timestamp).getTime();
                    if (isNaN(ts) || ts < startMs || ts > endMs) continue;
                    const mapped: ActivityEvent = {
                        id: this.generateEventId(),
                        timestamp: new Date(ts),
                        type: EventType.TERMINAL_COMMAND,
                        source: EventSource.TERMINAL,
                        data: {
                            command: evt.command || evt.metadata?.command || evt.type,
                            exitCode: evt.exitCode ?? evt.metadata?.exitCode ?? null,
                            raw: evt
                        }
                    };
                    events.push(mapped);
                } catch {
                    // skip malformed lines
                }
            }
        } catch {
            // ignore read errors in passive mode
        }
        return events;
    }

    private async detectExcessiveFileDeletion(events: ActivityEvent[]): Promise<void> {
        const deletions = events.filter(e => e.type === EventType.FILE_DELETE);
        if (deletions.length > 10) {
            this.anomalies.push({
                id: this.generateAnomalyId(),
                timestamp: deletions[0].timestamp,
                type: AnomalyType.EXCESSIVE_FILE_DELETION,
                severity: 'medium',
                description: `Detected ${deletions.length} file deletions`,
                events: deletions,
                suggestion: 'Review deleted files to ensure they were intentionally removed'
            });
        }
    }

    private async detectRapidContextSwitching(events: ActivityEvent[]): Promise<void> {
        const windowSize = 5; // events
        const timeThreshold = 2 * 60 * 1000; // 2 minutes

        for (let i = 0; i <= events.length - windowSize; i++) {
            const window = events.slice(i, i + windowSize);
            const uniquePaths = new Set(
                window
                    .filter(e => e.data.filePath)
                    .map(e => path.dirname(e.data.filePath))
            );

            if (uniquePaths.size > 3) {
                const timeSpan = window[window.length - 1].timestamp.getTime() - window[0].timestamp.getTime();
                if (timeSpan < timeThreshold) {
                    this.anomalies.push({
                        id: this.generateAnomalyId(),
                        timestamp: window[0].timestamp,
                        type: AnomalyType.RAPID_CONTEXT_SWITCHING,
                        severity: 'low',
                        description: `Rapid context switching between ${uniquePaths.size} directories`,
                        events: window
                    });
                    break;
                }
            }
        }
    }

    private async detectLongInactivePeriods(events: ActivityEvent[]): Promise<void> {
        const inactivityThreshold = 4 * 60 * 60 * 1000; // 4 hours

        for (let i = 1; i < events.length; i++) {
            const timeDiff = events[i].timestamp.getTime() - events[i - 1].timestamp.getTime();
            if (timeDiff > inactivityThreshold) {
                this.anomalies.push({
                    id: this.generateAnomalyId(),
                    timestamp: events[i].timestamp,
                    type: AnomalyType.LONG_INACTIVE_PERIOD,
                    severity: 'low',
                    description: `Inactive period of ${Math.round(timeDiff / (60 * 60 * 1000))} hours`,
                    events: [events[i - 1], events[i]]
                });
            }
        }
    }

    private async detectRepeatedFailedCommands(events: ActivityEvent[]): Promise<void> {
        const failedCommands = events.filter(e =>
            e.type === EventType.TERMINAL_COMMAND && e.data.exitCode !== 0
        );

        const commandGroups = new Map<string, ActivityEvent[]>();

        for (const command of failedCommands) {
            const cmd = command.data.command;
            if (!commandGroups.has(cmd)) {
                commandGroups.set(cmd, []);
            }
            commandGroups.get(cmd)!.push(command);
        }

        for (const [cmd, cmdEvents] of commandGroups) {
            if (cmdEvents.length > 5) {
                this.anomalies.push({
                    id: this.generateAnomalyId(),
                    timestamp: cmdEvents[0].timestamp,
                    type: AnomalyType.REPEATED_FAILED_COMMANDS,
                    severity: 'medium',
                    description: `Command "${cmd}" failed ${cmdEvents.length} times`,
                    events: cmdEvents,
                    suggestion: 'Check command syntax or resolve underlying issues'
                });
            }
        }
    }

    private generateAnomalyId(): string {
        return `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private createEmptyResult(): ReconstructionResult {
        return {
            tasks: [],
            bursts: [],
            focusAreas: [],
            anomalies: [],
            summary: {
                totalActiveTime: 0,
                totalTasks: 0,
                completedTasks: 0,
                averageTaskDuration: 0,
                mostActiveHour: 0,
                mostActiveDay: 'Unknown',
                productivityScore: 0,
                focusScore: 0,
                consistencyScore: 0
            },
            reconstructionTime: new Date(),
            eventCount: 0,
            timeRange: {
                start: new Date(),
                end: new Date()
            }
        };
    }
}