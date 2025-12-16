/**
 * Timeline Encoder - RL4 Timeline Processing Engine
 *
 * Modules 8443, 9385 - Timeline encoding and cognitive analysis
 *
 * Core RL4 cognitive engine providing:
 * - Event normalization and sequencing
 * - Timeline compression and burst detection
 * - Cognitive unit grouping (sessions, tasks, working sets)
 * - Anomaly detection and pattern recognition
 * - Integration with GlobalClock for accurate timing
 */

import * as crypto from 'crypto';
import { RL4Messages, BaseMessage, MessageType, MessageSource } from '../legacy/rl4/RL4Messages';
import { RL4Dictionary } from '../legacy/rl4/RL4Dictionary';
import { RL4Codec } from '../legacy/rl4/RL4Codec';

export namespace TimelineEncoder {
    // ============================================================================
    // TIMELINE STRUCTURES
    // ============================================================================

    export interface Timeline {
        id: string;
        version: string;
        startTime: Date;
        endTime: Date;
        events: NormalizedEvent[];
        metadata: TimelineMetadata;
        cognitiveUnits: CognitiveUnit[];
        anomalies: TimelineAnomaly[];
        statistics: TimelineStatistics;
    }

    export interface NormalizedEvent extends BaseMessage {
        // Explicitly declare BaseMessage properties to avoid type conflicts
        id: string;
        timestamp: Date;
        type: MessageType;
        source: MessageSource;
        payload: any;
        correlationId?: string;
        causationId?: string;
        next?: string;

        // NormalizedEvent specific properties
        normalizedTimestamp: number; // Milliseconds since epoch
        sequenceNumber: number;
        parentId?: string;
        children: string[];
        cognitiveUnitId?: string;
        tags: string[];
        processed: boolean;
    }

    export interface TimelineMetadata {
        workspaceRoot: string;
        sourceSystems: string[];
        encodingAlgorithm: string;
        compressionRatio: number;
        totalEvents: number;
        corruptedEvents: number;
        processingTime: number;
        version: string;
        checksum: string;
    }

    export interface CognitiveUnit {
        id: string;
        type: CognitiveUnitType;
        startTime: Date;
        endTime: Date;
        duration: number;
        events: string[]; // Event IDs
        dominantPattern: string;
        confidence: number;
        context: CognitiveContext;
        relationships: CognitiveRelationship[];
    }

    export enum CognitiveUnitType {
        SESSION = 'session',
        TASK = 'task',
        WORKING_SET = 'working_set',
        BURST = 'burst',
        REFACTOR_STREAK = 'refactor_streak',
        HOTSPOT = 'hotspot',
        ANOMALY = 'anomaly'
    }

    export interface CognitiveContext {
        workspaceRoot: string;
        activeFiles: string[];
        activeBranches: string[];
        environment: Record<string, any>;
        goals: string[];
        constraints: string[];
    }

    export interface CognitiveRelationship {
        type: 'precedes' | 'contains' | 'relates_to' | 'conflicts_with';
        targetUnitId: string;
        strength: number;
        evidence: string[];
    }

    export interface TimelineAnomaly {
        id: string;
        type: AnomalyType;
        severity: AnomalySeverity;
        startTime: Date;
        endTime: Date;
        affectedEvents: string[];
        description: string;
        confidence: number;
        suggestedActions: string[];
    }

    export enum AnomalyType {
        TEMPORAL_GAP = 'temporal_gap',
        RAPID_CONTEXT_SWITCH = 'rapid_context_switch',
        EXCESSIVE_FILE_DELETION = 'excessive_file_deletion',
        UNUSUAL_WORKING_HOURS = 'unusual_working_hours',
        CORRUPTED_DATA = 'corrupted_data',
        CIRCULAR_DEPENDENCY = 'circular_dependency',
        RESOURCE_EXHAUSTION = 'resource_exhaustion'
    }

    export enum AnomalySeverity {
        LOW = 'low',
        MEDIUM = 'medium',
        HIGH = 'high',
        CRITICAL = 'critical'
    }

    export interface TimelineStatistics {
        totalEvents: number;
        eventTypes: Record<MessageType, number>;
        averageEventInterval: number;
        longestGap: number;
        shortestGap: number;
        cognitiveUnits: {
            [key in CognitiveUnitType]: number;
        };
        timeDistribution: TimeDistribution;
        productivityMetrics: ProductivityMetrics;
    }

    export interface TimeDistribution {
        hourlyDistribution: number[]; // 24 hours
        dailyDistribution: number[]; // 7 days
        weeklyDistribution: number[]; // 4 weeks
        workingHoursPercentage: number;
        peakActivityHours: number[];
    }

    export interface ProductivityMetrics {
        focusScore: number;
        consistencyScore: number;
        burstFrequency: number;
        averageTaskDuration: number;
        contextSwitchRate: number;
        codeQualityScore: number;
    }

    // ============================================================================
    // ENCODER CONFIGURATION
    // ============================================================================

    export interface EncoderConfig {
        enableNormalization: boolean;
        enableCognitiveGrouping: boolean;
        enableAnomalyDetection: boolean;
        enableCompression: boolean;
        maxEventGap: number; // Maximum gap between events in ms
        minSessionDuration: number; // Minimum session duration in ms
        minBurstEvents: number; // Minimum events for burst detection
        anomalyThresholds: AnomalyThresholds;
        cognitiveGroupingRules: CognitiveGroupingRule[];
    }

    export interface AnomalyThresholds {
        maxGapDuration: number;
        maxContextSwitches: number;
        maxFileDeletions: number;
        unusualHourStart: number;
        unusualHourEnd: number;
        maxCircularDepth: number;
    }

    export interface CognitiveGroupingRule {
        type: CognitiveUnitType;
        conditions: GroupingCondition[];
        priority: number;
        confidence: number;
    }

    export interface GroupingCondition {
        type: 'temporal' | 'semantic' | 'structural' | 'frequency';
        operator: 'within' | 'exceeds' | 'matches' | 'contains';
        value: any;
        weight: number;
    }

    // ============================================================================
    // MAIN TIMELINE ENCODER CLASS
    // ============================================================================

    export class TimelineEncoder {
        private config: EncoderConfig;
        private codec: RL4Codec.RL4Codec;
        private globalClock: GlobalClock;
        private eventBuffer: NormalizedEvent[] = [];
        private cognitiveUnits: Map<string, CognitiveUnit> = new Map();
        private anomalies: Map<string, TimelineAnomaly> = new Map();

        constructor(config?: Partial<EncoderConfig>) {
            this.config = {
                enableNormalization: true,
                enableCognitiveGrouping: true,
                enableAnomalyDetection: true,
                enableCompression: true,
                maxEventGap: 30 * 60 * 1000, // 30 minutes
                minSessionDuration: 5 * 60 * 1000, // 5 minutes
                minBurstEvents: 5,
                anomalyThresholds: {
                    maxGapDuration: 4 * 60 * 60 * 1000, // 4 hours
                    maxContextSwitches: 10,
                    maxFileDeletions: 20,
                    unusualHourStart: 22, // 10 PM
                    unusualHourEnd: 6,   // 6 AM
                    maxCircularDepth: 5
                },
                cognitiveGroupingRules: this.getDefaultGroupingRules(),
                ...config
            };

            this.codec = new RL4Codec.RL4Codec();
            this.globalClock = new GlobalClock();
        }

        // ========================================================================
        // MAIN ENCODING API
        // ========================================================================

        /**
         * Encode events into a timeline
         */
        async encode(events: BaseMessage[]): Promise<Timeline> {
            const startTime = Date.now();

            try {
                console.log(`TimelineEncoder: Encoding ${events.length} events`);

                // Step 1: Normalize events
                const normalizedEvents = this.config.enableNormalization ?
                    await this.normalizeEvents(events) :
                    events.map((e, i) => ({ ...e, normalizedTimestamp: e.timestamp.getTime(), sequenceNumber: i, children: [], tags: [], processed: false } as NormalizedEvent));

                // Step 2: Sequence events
                const sequencedEvents = await this.sequenceEvents(normalizedEvents);

                // Step 3: Detect anomalies
                if (this.config.enableAnomalyDetection) {
                    await this.detectAnomalies(sequencedEvents);
                }

                // Step 4: Group into cognitive units
                if (this.config.enableCognitiveGrouping) {
                    await this.groupCognitiveUnits(sequencedEvents);
                }

                // Step 5: Generate timeline
                const timeline = await this.generateTimeline(sequencedEvents);

                const processingTime = Date.now() - startTime;
                timeline.metadata.processingTime = processingTime;

                console.log(`TimelineEncoder: Timeline encoding complete in ${processingTime}ms`);
                return timeline;

            } catch (error) {
                console.error(`TimelineEncoder: Encoding failed: ${error}`);
                throw new Error(`Timeline encoding failed: ${error}`);
            }
        }

        /**
         * Decode timeline back to events
         */
        async decode(timeline: Timeline): Promise<BaseMessage[]> {
            try {
                console.log(`TimelineEncoder: Decoding timeline with ${timeline.events.length} events`);

                // Validate timeline integrity
                this.validateTimeline(timeline);

                // Convert normalized events back to base messages
                const events = timeline.events.map(event => ({
                    id: event.id,
                    timestamp: new Date(event.normalizedTimestamp),
                    type: event.type,
                    source: event.source,
                    payload: event.payload,
                    correlationId: event.correlationId,
                    causationId: event.causationId,
                    version: event.version,
                    metadata: event.metadata
                } as BaseMessage));

                // Sort by original sequence
                events.sort((a, b) => {
                    const aSeq = timeline.events.find(e => e.id === a.id)?.sequenceNumber || 0;
                    const bSeq = timeline.events.find(e => e.id === b.id)?.sequenceNumber || 0;
                    return aSeq - bSeq;
                });

                console.log(`TimelineEncoder: Timeline decoding complete`);
                return events;

            } catch (error) {
                console.error(`TimelineEncoder: Decoding failed: ${error}`);
                throw new Error(`Timeline decoding failed: ${error}`);
            }
        }

        /**
         * Compress timeline for storage
         */
        async compress(timeline: Timeline): Promise<Buffer> {
            try {
                // Convert timeline to serializable format
                const serializable = {
                    ...timeline,
                    events: timeline.events.map(e => ({
                        ...e,
                        timestamp: e.timestamp.toISOString(),
                        startTime: e.startTime?.toISOString(),
                        endTime: e.endTime?.toISOString()
                    })),
                    cognitiveUnits: timeline.cognitiveUnits.map(cu => ({
                        ...cu,
                        startTime: cu.startTime.toISOString(),
                        endTime: cu.endTime.toISOString()
                    })),
                    anomalies: timeline.anomalies.map(a => ({
                        ...a,
                        startTime: a.startTime.toISOString(),
                        endTime: a.endTime.toISOString()
                    })),
                    metadata: {
                        ...timeline.metadata,
                        startTime: timeline.startTime.toISOString(),
                        endTime: timeline.endTime.toISOString()
                    }
                };

                const serialized = JSON.stringify(serializable);

                // Compress using codec
                if (this.config.enableCompression) {
                    const compressed = await this.codec.compressData(Buffer.from(serialized, 'utf8'));
                    return compressed;
                }

                return Buffer.from(serialized, 'utf8');

            } catch (error) {
                console.error(`TimelineEncoder: Compression failed: ${error}`);
                throw new Error(`Timeline compression failed: ${error}`);
            }
        }

        /**
         * Decompress timeline from storage
         */
        async decompress(compressed: Buffer): Promise<Timeline> {
            try {
                let serialized: string;

                // Decompress if needed
                if (this.config.enableCompression) {
                    const decompressed = await this.codec.decompressData(compressed, RL4Codec.CompressionAlgorithm.GZIP);
                    serialized = decompressed.toString('utf8');
                } else {
                    serialized = compressed.toString('utf8');
                }

                // Parse and restore dates
                const parsed = JSON.parse(serialized);

                const timeline: Timeline = {
                    ...parsed,
                    startTime: new Date(parsed.metadata.startTime),
                    endTime: new Date(parsed.metadata.endTime),
                    events: parsed.events.map((e: any) => ({
                        ...e,
                        timestamp: new Date(e.timestamp),
                        startTime: e.startTime ? new Date(e.startTime) : undefined,
                        endTime: e.endTime ? new Date(e.endTime) : undefined
                    })),
                    cognitiveUnits: parsed.cognitiveUnits.map((cu: any) => ({
                        ...cu,
                        startTime: new Date(cu.startTime),
                        endTime: new Date(cu.endTime)
                    })),
                    anomalies: parsed.anomalies.map((a: any) => ({
                        ...a,
                        startTime: new Date(a.startTime),
                        endTime: new Date(a.endTime)
                    }))
                };

                return timeline;

            } catch (error) {
                console.error(`TimelineEncoder: Decompression failed: ${error}`);
                throw new Error(`Timeline decompression failed: ${error}`);
            }
        }

        // ========================================================================
        // COGNITIVE ANALYSIS
        // ========================================================================

        /**
         * Group events into cognitive units
         */
        async groupByCognitiveUnits(events: NormalizedEvent[]): Promise<CognitiveUnit[]> {
            console.log(`TimelineEncoder: Grouping ${events.length} events into cognitive units`);

            this.cognitiveUnits.clear();
            this.eventBuffer = [...events];

            // Apply grouping rules in priority order
            const sortedRules = [...this.config.cognitiveGroupingRules].sort((a, b) => b.priority - a.priority);

            for (const rule of sortedRules) {
                await this.applyGroupingRule(rule);
            }

            // Detect specific patterns
            await this.detectSessions();
            await this.detectBursts();
            await this.detectWorkingSets();
            await this.detectRefactorStreaks();
            await this.detectHotspots();

            const units = Array.from(this.cognitiveUnits.values());
            console.log(`TimelineEncoder: Identified ${units.length} cognitive units`);
            return units;
        }

        /**
         * Detect anomalies in timeline
         */
        async detectAnomalies(events: NormalizedEvent[]): Promise<TimelineAnomaly[]> {
            console.log(`TimelineEncoder: Detecting anomalies in ${events.length} events`);

            this.anomalies.clear();

            // Detect temporal gaps
            await this.detectTemporalGaps(events);

            // Detect rapid context switching
            await this.detectRapidContextSwitching(events);

            // Detect unusual patterns
            await this.detectUnusualPatterns(events);

            // Detect data corruption
            await this.detectDataCorruption(events);

            const anomalies = Array.from(this.anomalies.values());
            console.log(`TimelineEncoder: Detected ${anomalies.length} anomalies`);
            return anomalies;
        }

        // ========================================================================
        // PRIVATE METHODS
        // ========================================================================

        private async normalizeEvents(events: BaseMessage[]): Promise<NormalizedEvent[]> {
            const normalized: NormalizedEvent[] = [];

            for (let i = 0; i < events.length; i++) {
                const event = events[i];

                try {
                    // Validate message
                    if (!RL4Messages.validateMessage(event)) {
                        console.warn(`TimelineEncoder: Skipping invalid event: ${event.id}`);
                        continue;
                    }

                    // Normalize timestamp
                    const normalizedTimestamp = this.globalClock.normalizeTimestamp(event.timestamp);

                    const normalizedEvent: NormalizedEvent = {
                        ...event,
                        normalizedTimestamp,
                        sequenceNumber: i,
                        children: [],
                        tags: [],
                        processed: false
                    };

                    // Classify and add tags
                    const classification = RL4Dictionary.classifyEvent(event);
                    normalizedEvent.tags.push(classification.classification);
                    if (classification.patternId) {
                        normalizedEvent.tags.push(classification.patternId);
                    }

                    normalized.push(normalizedEvent);

                } catch (error) {
                    console.error(`TimelineEncoder: Failed to normalize event ${event.id}: ${error}`);
                }
            }

            return normalized.sort((a, b) => a.normalizedTimestamp - b.normalizedTimestamp);
        }

        private async sequenceEvents(events: NormalizedEvent[]): Promise<NormalizedEvent[]> {
            console.log(`TimelineEncoder: Sequencing ${events.length} events`);

            // Establish parent-child relationships
            for (let i = 0; i < events.length; i++) {
                const current = events[i];

                // Find potential parents based on correlation and causation
                if (current.correlationId || current.causationId) {
                    const parentId = current.causationId || current.correlationId;
                    const parent = events.find(e => e.id === parentId);

                    if (parent) {
                        current.parentId = parentId;
                        parent.children.push(current.id);
                    }
                }

                // Temporal sequencing for related events
                if (i > 0) {
                    const prevEvent = events[i - 1];
                    const timeDiff = current.normalizedTimestamp - prevEvent.normalizedTimestamp;

                    // If within reasonable time gap and related, establish relationship
                    if (timeDiff < this.config.maxEventGap && this.areEventsRelated(current, prevEvent)) {
                        if (!current.parentId) {
                            current.parentId = prevEvent.id;
                            prevEvent.children.push(current.id);
                        }
                    }
                }
            }

            return events;
        }

        private async applyGroupingRule(rule: CognitiveGroupingRule): Promise<void> {
            const candidates = this.eventBuffer.filter(e => !e.processed);

            for (const candidate of candidates) {
                if (this.evaluateGroupingCondition(rule, candidate)) {
                    const unit = await this.createCognitiveUnit(rule.type, candidate);
                    this.cognitiveUnits.set(unit.id, unit);
                    candidate.processed = true;
                }
            }
        }

        private evaluateGroupingCondition(rule: CognitiveGroupingRule, event: NormalizedEvent): boolean {
            let score = 0;

            for (const condition of rule.conditions) {
                let matches = false;

                switch (condition.type) {
                    case 'temporal':
                        matches = this.evaluateTemporalCondition(condition, event);
                        break;
                    case 'semantic':
                        matches = this.evaluateSemanticCondition(condition, event);
                        break;
                    case 'structural':
                        matches = this.evaluateStructuralCondition(condition, event);
                        break;
                    case 'frequency':
                        matches = this.evaluateFrequencyCondition(condition, event);
                        break;
                }

                if (matches) {
                    score += condition.weight;
                }
            }

            return score >= rule.confidence;
        }

        private evaluateTemporalCondition(condition: GroupingCondition, event: NormalizedEvent): boolean {
            // Simplified temporal condition evaluation
            return true;
        }

        private evaluateSemanticCondition(condition: GroupingCondition, event: NormalizedEvent): boolean {
            // Use RL4Dictionary for semantic evaluation
            const classification = RL4Dictionary.classifyEvent(event);
            return classification.classification === condition.value;
        }

        private evaluateStructuralCondition(condition: GroupingCondition, event: NormalizedEvent): boolean {
            // Evaluate based on file structure, dependencies, etc.
            return true;
        }

        private evaluateFrequencyCondition(condition: GroupingCondition, event: NormalizedEvent): boolean {
            // Evaluate based on event frequency patterns
            return true;
        }

        private async createCognitiveUnit(type: CognitiveUnitType, seedEvent: NormalizedEvent): Promise<CognitiveUnit> {
            const unit: CognitiveUnit = {
                id: crypto.randomUUID(),
                type,
                startTime: new Date(seedEvent.normalizedTimestamp),
                endTime: new Date(seedEvent.normalizedTimestamp),
                duration: 0,
                events: [seedEvent.id],
                dominantPattern: seedEvent.tags[0] || 'unknown',
                confidence: 0.7,
                context: {
                    workspaceRoot: '',
                    activeFiles: [],
                    activeBranches: [],
                    environment: {},
                    goals: [],
                    constraints: []
                },
                relationships: []
            };

            seedEvent.cognitiveUnitId = unit.id;

            return unit;
        }

        private async detectSessions(): Promise<void> {
            const unprocessed = this.eventBuffer.filter(e => !e.processed);
            let sessionStart: NormalizedEvent | null = null;
            let sessionEvents: NormalizedEvent[] = [];

            for (const event of unprocessed) {
                if (!sessionStart) {
                    sessionStart = event;
                    sessionEvents = [event];
                } else {
                    const timeDiff = event.normalizedTimestamp - sessionStart.normalizedTimestamp;

                    if (timeDiff > this.config.maxEventGap) {
                        // End current session
                        if (sessionEvents.length >= 1) {
                            await this.createSessionUnit(sessionEvents);
                        }
                        sessionStart = event;
                        sessionEvents = [event];
                    } else {
                        sessionEvents.push(event);
                    }
                }
            }

            // Handle final session
            if (sessionEvents.length >= 1) {
                await this.createSessionUnit(sessionEvents);
            }
        }

        private async createSessionUnit(events: NormalizedEvent[]): Promise<void> {
            if (events.length === 0) return;

            const startTime = new Date(Math.min(...events.map(e => e.normalizedTimestamp)));
            const endTime = new Date(Math.max(...events.map(e => e.normalizedTimestamp)));
            const duration = endTime.getTime() - startTime.getTime();

            if (duration < this.config.minSessionDuration) {
                return; // Too short for a session
            }

            const unit: CognitiveUnit = {
                id: crypto.randomUUID(),
                type: CognitiveUnitType.SESSION,
                startTime,
                endTime,
                duration,
                events: events.map(e => e.id),
                dominantPattern: this.findDominantPattern(events),
                confidence: 0.8,
                context: this.buildContext(events),
                relationships: []
            };

            for (const event of events) {
                event.cognitiveUnitId = unit.id;
                event.processed = true;
            }

            this.cognitiveUnits.set(unit.id, unit);
        }

        private async detectBursts(): Promise<void> {
            const unprocessed = this.eventBuffer.filter(e => !e.processed);
            let burstStart: NormalizedEvent | null = null;
            let burstEvents: NormalizedEvent[] = [];

            for (let i = 0; i < unprocessed.length; i++) {
                const event = unprocessed[i];

                if (!burstStart) {
                    burstStart = event;
                    burstEvents = [event];
                } else {
                    // Look ahead for burst window
                    const burstEnd = this.findBurstWindow(unprocessed, i);
                    if (burstEnd.length >= this.config.minBurstEvents) {
                        await this.createBurstUnit(burstEnd);
                        burstStart = null;
                        burstEvents = [];
                    }
                }
            }
        }

        private findBurstWindow(events: NormalizedEvent[], startIndex: number): NormalizedEvent[] {
            const burstWindow = 5 * 60 * 1000; // 5 minutes
            const burstEvents: NormalizedEvent[] = [];
            const startTime = events[startIndex].normalizedTimestamp;

            for (let i = startIndex; i < events.length; i++) {
                const event = events[i];
                if (event.normalizedTimestamp - startTime <= burstWindow) {
                    burstEvents.push(event);
                } else {
                    break;
                }
            }

            return burstEvents;
        }

        private async createBurstUnit(events: NormalizedEvent[]): Promise<void> {
            const startTime = new Date(Math.min(...events.map(e => e.normalizedTimestamp)));
            const endTime = new Date(Math.max(...events.map(e => e.normalizedTimestamp)));
            const duration = endTime.getTime() - startTime.getTime();

            const unit: CognitiveUnit = {
                id: crypto.randomUUID(),
                type: CognitiveUnitType.BURST,
                startTime,
                endTime,
                duration,
                events: events.map(e => e.id),
                dominantPattern: this.findDominantPattern(events),
                confidence: 0.9,
                context: this.buildContext(events),
                relationships: []
            };

            for (const event of events) {
                event.cognitiveUnitId = unit.id;
                event.processed = true;
            }

            this.cognitiveUnits.set(unit.id, unit);
        }

        private async detectWorkingSets(): Promise<void> {
            // Group by file paths to identify working sets
            const pathGroups = new Map<string, NormalizedEvent[]>();

            for (const event of this.eventBuffer.filter(e => !e.processed)) {
                if (event.payload?.filePath) {
                    const dirPath = this.getDirectoryPath(event.payload.filePath);
                    if (!pathGroups.has(dirPath)) {
                        pathGroups.set(dirPath, []);
                    }
                    pathGroups.get(dirPath)!.push(event);
                }
            }

            for (const [path, events] of pathGroups) {
                if (events.length >= 3) { // Minimum for working set
                    await this.createWorkingSetUnit(path, events);
                }
            }
        }

        private async createWorkingSetUnit(path: string, events: NormalizedEvent[]): Promise<void> {
            const startTime = new Date(Math.min(...events.map(e => e.normalizedTimestamp)));
            const endTime = new Date(Math.max(...events.map(e => e.normalizedTimestamp)));
            const duration = endTime.getTime() - startTime.getTime();

            const unit: CognitiveUnit = {
                id: crypto.randomUUID(),
                type: CognitiveUnitType.WORKING_SET,
                startTime,
                endTime,
                duration,
                events: events.map(e => e.id),
                dominantPattern: 'file_focus',
                confidence: 0.7,
                context: {
                    workspaceRoot: '',
                    activeFiles: [...new Set(events.map(e => e.payload?.filePath).filter(Boolean))],
                    activeBranches: [],
                    environment: {},
                    goals: [],
                    constraints: []
                },
                relationships: []
            };

            for (const event of events) {
                event.cognitiveUnitId = unit.id;
                event.processed = true;
            }

            this.cognitiveUnits.set(unit.id, unit);
        }

        private async detectRefactorStreaks(): Promise<void> {
            // Detect consecutive refactoring activities
            const refactorEvents = this.eventBuffer.filter(e =>
                !e.processed &&
                e.tags.includes('refactoring')
            );

            let streak: NormalizedEvent[] = [];

            for (const event of refactorEvents) {
                if (streak.length === 0) {
                    streak.push(event);
                } else {
                    const lastEvent = streak[streak.length - 1];
                    const timeDiff = event.normalizedTimestamp - lastEvent.normalizedTimestamp;

                    if (timeDiff <= this.config.maxEventGap) {
                        streak.push(event);
                    } else {
                        if (streak.length >= 3) {
                            await this.createRefactorStreakUnit(streak);
                        }
                        streak = [event];
                    }
                }
            }

            if (streak.length >= 3) {
                await this.createRefactorStreakUnit(streak);
            }
        }

        private async createRefactorStreakUnit(events: NormalizedEvent[]): Promise<void> {
            const startTime = new Date(Math.min(...events.map(e => e.normalizedTimestamp)));
            const endTime = new Date(Math.max(...events.map(e => e.normalizedTimestamp)));
            const duration = endTime.getTime() - startTime.getTime();

            const unit: CognitiveUnit = {
                id: crypto.randomUUID(),
                type: CognitiveUnitType.REFACTOR_STREAK,
                startTime,
                endTime,
                duration,
                events: events.map(e => e.id),
                dominantPattern: 'refactoring',
                confidence: 0.85,
                context: this.buildContext(events),
                relationships: []
            };

            for (const event of events) {
                event.cognitiveUnitId = unit.id;
                event.processed = true;
            }

            this.cognitiveUnits.set(unit.id, unit);
        }

        private async detectHotspots(): Promise<void> {
            // Detect files with high activity
            const fileActivity = new Map<string, NormalizedEvent[]>();

            for (const event of this.eventBuffer.filter(e => !e.processed)) {
                if (event.payload?.filePath) {
                    const filePath = event.payload.filePath;
                    if (!fileActivity.has(filePath)) {
                        fileActivity.set(filePath, []);
                    }
                    fileActivity.get(filePath)!.push(event);
                }
            }

            for (const [filePath, events] of fileActivity) {
                if (events.length >= 5) { // Hotspot threshold
                    await this.createHotspotUnit(filePath, events);
                }
            }
        }

        private async createHotspotUnit(filePath: string, events: NormalizedEvent[]): Promise<void> {
            const startTime = new Date(Math.min(...events.map(e => e.normalizedTimestamp)));
            const endTime = new Date(Math.max(...events.map(e => e.normalizedTimestamp)));
            const duration = endTime.getTime() - startTime.getTime();

            const unit: CognitiveUnit = {
                id: crypto.randomUUID(),
                type: CognitiveUnitType.HOTSPOT,
                startTime,
                endTime,
                duration,
                events: events.map(e => e.id),
                dominantPattern: 'hotspot',
                confidence: 0.8,
                context: {
                    workspaceRoot: '',
                    activeFiles: [filePath],
                    activeBranches: [],
                    environment: {},
                    goals: [],
                    constraints: []
                },
                relationships: []
            };

            for (const event of events) {
                event.cognitiveUnitId = unit.id;
                event.processed = true;
            }

            this.cognitiveUnits.set(unit.id, unit);
        }

        private async detectTemporalGaps(events: NormalizedEvent[]): Promise<void> {
            for (let i = 1; i < events.length; i++) {
                const gap = events[i].normalizedTimestamp - events[i - 1].normalizedTimestamp;

                if (gap > this.config.anomalyThresholds.maxGapDuration) {
                    const anomaly: TimelineAnomaly = {
                        id: crypto.randomUUID(),
                        type: AnomalyType.TEMPORAL_GAP,
                        severity: gap > 8 * 60 * 60 * 1000 ? AnomalySeverity.HIGH : AnomalySeverity.MEDIUM,
                        startTime: new Date(events[i - 1].normalizedTimestamp),
                        endTime: new Date(events[i].normalizedTimestamp),
                        affectedEvents: [events[i - 1].id, events[i].id],
                        description: `Large temporal gap detected: ${Math.round(gap / (60 * 60 * 1000))} hours`,
                        confidence: 0.9,
                        suggestedActions: ['Investigate break in activity', 'Check for missing events']
                    };

                    this.anomalies.set(anomaly.id, anomaly);
                }
            }
        }

        private async detectRapidContextSwitching(events: NormalizedEvent[]): Promise<void> {
            const windowSize = 10;
            const maxSwitches = this.config.anomalyThresholds.maxContextSwitches;

            for (let i = 0; i <= events.length - windowSize; i++) {
                const window = events.slice(i, i + windowSize);
                const uniquePaths = new Set(
                    window
                        .filter(e => e.payload?.filePath)
                        .map(e => this.getDirectoryPath(e.payload!.filePath))
                );

                if (uniquePaths.size > maxSwitches) {
                    const anomaly: TimelineAnomaly = {
                        id: crypto.randomUUID(),
                        type: AnomalyType.RAPID_CONTEXT_SWITCH,
                        severity: uniquePaths.size > 15 ? AnomalySeverity.HIGH : AnomalySeverity.MEDIUM,
                        startTime: new Date(window[0].normalizedTimestamp),
                        endTime: new Date(window[window.length - 1].normalizedTimestamp),
                        affectedEvents: window.map(e => e.id),
                        description: `Rapid context switching detected: ${uniquePaths.size} different directories`,
                        confidence: 0.8,
                        suggestedActions: ['Consider focusing on one area', 'Review task organization']
                    };

                    this.anomalies.set(anomaly.id, anomaly);
                }
            }
        }

        private async detectUnusualPatterns(events: NormalizedEvent[]): Promise<void> {
            // Detect unusual working hours
            for (const event of events) {
                const hour = new Date(event.normalizedTimestamp).getHours();

                if (hour >= this.config.anomalyThresholds.unusualHourStart ||
                    hour <= this.config.anomalyThresholds.unusualHourEnd) {
                    const anomaly: TimelineAnomaly = {
                        id: crypto.randomUUID(),
                        type: AnomalyType.UNUSUAL_WORKING_HOURS,
                        severity: AnomalySeverity.LOW,
                        startTime: new Date(event.normalizedTimestamp),
                        endTime: new Date(event.normalizedTimestamp),
                        affectedEvents: [event.id],
                        description: `Activity detected during unusual hours: ${hour}:00`,
                        confidence: 0.6,
                        suggestedActions: ['Check if this is expected', 'Consider work-life balance']
                    };

                    this.anomalies.set(anomaly.id, anomaly);
                }
            }
        }

        private async detectDataCorruption(events: NormalizedEvent[]): Promise<void> {
            // Check for corrupted events
            for (const event of events) {
                if (!RL4Messages.validateMessage(event)) {
                    const anomaly: TimelineAnomaly = {
                        id: crypto.randomUUID(),
                        type: AnomalyType.CORRUPTED_DATA,
                        severity: AnomalySeverity.HIGH,
                        startTime: new Date(event.normalizedTimestamp),
                        endTime: new Date(event.normalizedTimestamp),
                        affectedEvents: [event.id],
                        description: `Corrupted event detected: ${event.id}`,
                        confidence: 1.0,
                        suggestedActions: ['Remove corrupted event', 'Check data source integrity']
                    };

                    this.anomalies.set(anomaly.id, anomaly);
                }
            }
        }

        private async generateTimeline(events: NormalizedEvent[]): Promise<Timeline> {
            const startTime = new Date(Math.min(...events.map(e => e.normalizedTimestamp)));
            const endTime = new Date(Math.max(...events.map(e => e.normalizedTimestamp)));

            const statistics = this.calculateStatistics(events);
            const metadata = this.createMetadata(events);

            const timeline: Timeline = {
                id: crypto.randomUUID(),
                version: '1.0.0',
                startTime,
                endTime,
                events,
                metadata,
                cognitiveUnits: Array.from(this.cognitiveUnits.values()),
                anomalies: Array.from(this.anomalies.values()),
                statistics
            };

            return timeline;
        }

        private calculateStatistics(events: NormalizedEvent[]): TimelineStatistics {
            const eventTypes: Record<MessageType, number> = {} as any;
            const gaps: number[] = [];

            for (const type of Object.values(MessageType)) {
                eventTypes[type] = 0;
            }

            for (let i = 0; i < events.length; i++) {
                const event = events[i];
                eventTypes[event.type]++;

                if (i > 0) {
                    gaps.push(event.normalizedTimestamp - events[i - 1].normalizedTimestamp);
                }
            }

            const hourlyDistribution = new Array(24).fill(0);
            const dailyDistribution = new Array(7).fill(0);

            for (const event of events) {
                const date = new Date(event.normalizedTimestamp);
                hourlyDistribution[date.getHours()]++;
                dailyDistribution[date.getDay()]++;
            }

            const workingHoursCount = hourlyDistribution.slice(9, 18).reduce((a, b) => a + b, 0);
            const totalEvents = events.length;

            return {
                totalEvents,
                eventTypes,
                averageEventInterval: gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0,
                longestGap: gaps.length > 0 ? Math.max(...gaps) : 0,
                shortestGap: gaps.length > 0 ? Math.min(...gaps) : 0,
                cognitiveUnits: {
                    [CognitiveUnitType.SESSION]: 0,
                    [CognitiveUnitType.TASK]: 0,
                    [CognitiveUnitType.WORKING_SET]: 0,
                    [CognitiveUnitType.BURST]: 0,
                    [CognitiveUnitType.REFACTOR_STREAK]: 0,
                    [CognitiveUnitType.HOTSPOT]: 0,
                    [CognitiveUnitType.ANOMALY]: 0
                },
                timeDistribution: {
                    hourlyDistribution,
                    dailyDistribution,
                    weeklyDistribution: new Array(4).fill(0),
                    workingHoursPercentage: totalEvents > 0 ? (workingHoursCount / totalEvents) * 100 : 0,
                    peakActivityHours: hourlyDistribution
                        .map((count, hour) => ({ hour, count }))
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 3)
                        .map(item => item.hour)
                },
                productivityMetrics: {
                    focusScore: 0,
                    consistencyScore: 0,
                    burstFrequency: 0,
                    averageTaskDuration: 0,
                    contextSwitchRate: 0,
                    codeQualityScore: 0
                }
            };
        }

        private createMetadata(events: NormalizedEvent[]): TimelineMetadata {
            const sourceSystems = [...new Set(events.map(e => e.source))];
            const corruptedEvents = events.filter(e => !RL4Messages.validateMessage(e)).length;

            return {
                workspaceRoot: '',
                sourceSystems,
                encodingAlgorithm: 'rl4-timeline-v1',
                compressionRatio: 1.0, // Would be calculated after compression
                totalEvents: events.length,
                corruptedEvents,
                processingTime: 0, // Will be set by encode method
                version: '1.0.0',
                checksum: '' // Will be calculated
            };
        }

        private validateTimeline(timeline: Timeline): void {
            if (!timeline.events || timeline.events.length === 0) {
                throw new Error('Timeline has no events');
            }

            if (!timeline.startTime || !timeline.endTime) {
                throw new Error('Timeline missing time bounds');
            }

            if (timeline.endTime.getTime() < timeline.startTime.getTime()) {
                throw new Error('Timeline end time before start time');
            }
        }

        private areEventsRelated(event1: NormalizedEvent, event2: NormalizedEvent): boolean {
            // Check correlation/causation
            if (event1.correlationId && event1.correlationId === event2.correlationId) {
                return true;
            }

            if (event1.causationId && event1.causationId === event2.id) {
                return true;
            }

            // Check file path similarity
            const file1 = event1.payload?.filePath;
            const file2 = event2.payload?.filePath;

            if (file1 && file2) {
                const dir1 = this.getDirectoryPath(file1);
                const dir2 = this.getDirectoryPath(file2);

                if (dir1 === dir2 || dir1.startsWith(dir2) || dir2.startsWith(dir1)) {
                    return true;
                }
            }

            return false;
        }

        private getDirectoryPath(filePath: string): string {
            const path = require('path');
            return path.dirname(filePath);
        }

        private findDominantPattern(events: NormalizedEvent[]): string {
            const patternCounts = new Map<string, number>();

            for (const event of events) {
                for (const tag of event.tags) {
                    patternCounts.set(tag, (patternCounts.get(tag) || 0) + 1);
                }
            }

            let maxCount = 0;
            let dominantPattern = 'unknown';

            for (const [pattern, count] of patternCounts) {
                if (count > maxCount) {
                    maxCount = count;
                    dominantPattern = pattern;
                }
            }

            return dominantPattern;
        }

        private buildContext(events: NormalizedEvent[]): CognitiveContext {
            const activeFiles = [...new Set(events.map(e => e.payload?.filePath).filter(Boolean))];
            const activeBranches = [...new Set(
                events
                    .filter(e => e.type === MessageType.GIT_EVENT)
                    .map(e => e.payload?.branch)
                    .filter(Boolean)
            )];

            return {
                workspaceRoot: '',
                activeFiles,
                activeBranches,
                environment: {},
                goals: [],
                constraints: []
            };
        }

        private getDefaultGroupingRules(): CognitiveGroupingRule[] {
            return [
                {
                    type: CognitiveUnitType.SESSION,
                    conditions: [
                        {
                            type: 'temporal',
                            operator: 'within',
                            value: 30 * 60 * 1000, // 30 minutes
                            weight: 0.8
                        }
                    ],
                    priority: 1,
                    confidence: 0.7
                },
                {
                    type: CognitiveUnitType.BURST,
                    conditions: [
                        {
                            type: 'frequency',
                            operator: 'exceeds',
                            value: 5,
                            weight: 0.9
                        }
                    ],
                    priority: 2,
                    confidence: 0.8
                }
            ];
        }
    }

    // ============================================================================
    // GLOBAL CLOCK SIMULATION
    // ============================================================================

    class GlobalClock {
        normalizeTimestamp(timestamp: Date): number {
            return timestamp.getTime();
        }
    }

    // ============================================================================
    // CONVENIENCE EXPORTS
    // ============================================================================

    export const DEFAULT_ENCODER = new TimelineEncoder();

    export async function encode(events: RL4Messages.BaseMessage[], config?: Partial<EncoderConfig>): Promise<Timeline> {
        const encoder = config ? new TimelineEncoder(config) : DEFAULT_ENCODER;
        return encoder.encode(events);
    }

    export async function decode(timeline: Timeline, config?: Partial<EncoderConfig>): Promise<RL4Messages.BaseMessage[]> {
        const encoder = config ? new TimelineEncoder(config) : DEFAULT_ENCODER;
        return encoder.decode(timeline);
    }

    export async function groupByCognitiveUnits(events: RL4Messages.BaseMessage[], config?: Partial<EncoderConfig>): Promise<CognitiveUnit[]> {
        const encoder = config ? new TimelineEncoder(config) : DEFAULT_ENCODER;
        const normalizedEvents = await encoder.normalizeEvents(events);
        return encoder.groupByCognitiveUnits(normalizedEvents);
    }

    export async function detectAnomalies(events: RL4Messages.BaseMessage[], config?: Partial<EncoderConfig>): Promise<TimelineAnomaly[]> {
        const encoder = config ? new TimelineEncoder(config) : DEFAULT_ENCODER;
        const normalizedEvents = await encoder.normalizeEvents(events);
        return encoder.detectAnomalies(normalizedEvents);
    }
}