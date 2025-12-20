/**
 * RL4 Messages - Core Message System for Reasoning Layer 4
 *
 * Module 8143, 8443, 8490 - Internal RL4 message structures
 *
 * Defines all internal RL4 message types used across:
 * - UnifiedPromptBuilder
 * - ActivityReconstructor
 * - TimelineEncoder
 * - KernelBridge
 * - SnapshotRotation
 */

import * as crypto from 'crypto';
import * as path from 'path';

export namespace RL4Messages {
    // ============================================================================
    // BASE MESSAGE STRUCTURE
    // ============================================================================

    export interface RL4Event extends BaseMessage {}

    export interface BaseMessage {
        id: string;
        timestamp: Date;
        type: MessageType;
        source: MessageSource;
        payload: any;
        correlationId?: string;
        causationId?: string;
        version: string;
        metadata?: Record<string, any>;
    }

    export enum MessageType {
        // Cycle messages
        CYCLE_START = 'cycle_start',
        CYCLE_END = 'cycle_end',
        CYCLE_PROGRESS = 'cycle_progress',
        CYCLE_ERROR = 'cycle_error',

        // File system events
        FILE_EVENT = 'file_event',
        FILE_CREATED = 'file_created',
        FILE_MODIFIED = 'file_modified',
        FILE_DELETED = 'file_deleted',
        FILE_MOVED = 'file_moved',

        // Git events
        GIT_EVENT = 'git_event',
        GIT_COMMIT = 'git_commit',
        GIT_BRANCH = 'git_branch',
        GIT_MERGE = 'git_merge',
        GIT_REBASE = 'git_rebase',

        // Activity events
        BURST_EVENT = 'burst_event',
        SESSION_START = 'session_start',
        SESSION_END = 'session_end',
        FOCUS_CHANGE = 'focus_change',
        CONTEXT_SWITCH = 'context_switch',

        // Pattern detection
        PATTERN_DETECTED = 'pattern_detected',
        PATTERN_MATCHED = 'pattern_matched',
        PATTERN_SCORED = 'pattern_scored',

        // Cognitive signals
        COGNITIVE_SIGNAL = 'cognitive_signal',
        INTENT_INFERRED = 'intent_inferred',
        ATTENTION_SHIFT = 'attention_shift',
        WORKING_SET_UPDATE = 'working_set_update',

        // ADR events
        ADR_PROPOSAL = 'adr_proposal',
        ADR_ACCEPTED = 'adr_accepted',
        ADR_REJECTED = 'adr_rejected',
        ADR_AMENDED = 'adr_amended',

        // Forecast events
        FORECAST_REQUEST = 'forecast_request',
        FORECAST_RESULT = 'forecast_result',
        FORECAST_UPDATE = 'forecast_update',

        // Aggregated events
        AGGREGATED_FS_CHANGE = 'aggregated_fs_change',
        AGGREGATED_GIT_ACTIVITY = 'aggregated_git_activity',
        AGGREGATED_KERNEL_METRICS = 'aggregated_kernel_metrics',

        // System events
        HEALTH_CHECK = 'health_check',
        PERFORMANCE_METRIC = 'performance_metric',
        ERROR_OCCURRED = 'error_occurred',
        RESOURCE_ALERT = 'resource_alert',

        // Configuration events
        CONFIG_CHANGED = 'config_changed',
        MODE_CHANGED = 'mode_changed',
        POLICY_VIOLATION = 'policy_violation'
    }

    export enum MessageSource {
        FILE_SYSTEM = 'filesystem',
        GIT = 'git',
        KERNEL = 'kernel',
        TERMINAL = 'terminal',
        EDITOR = 'editor',
        ACTIVITY_RECONSTRUCTOR = 'activity_reconstructor',
        PATTERN_DETECTOR = 'pattern_detector',
        COGNITIVE_ENGINE = 'cognitive_engine',
        ADR_SYSTEM = 'adr_system',
        FORECAST_ENGINE = 'forecast_engine',
        TIMELINE_ENCODER = 'timeline_encoder',
        SNAPSHOT_MANAGER = 'snapshot_manager',
        HEALTH_MONITOR = 'health_monitor'
    }

    // ============================================================================
    // SPECIALIZED MESSAGE TYPES
    // ============================================================================

    export interface CycleStartMessage extends BaseMessage {
        type: MessageType.CYCLE_START;
        payload: {
            cycleId: string;
            mode: string;
            context: CycleContext;
            objectives: string[];
        };
    }

    export interface CycleEndMessage extends BaseMessage {
        type: MessageType.CYCLE_END;
        payload: {
            cycleId: string;
            result: CycleResult;
            metrics: CycleMetrics;
            nextActions: string[];
        };
    }

    export interface FileEventMessage extends BaseMessage {
        type: MessageType.FILE_EVENT;
        payload: {
            filePath: string;
            eventType: FileEventType;
            size?: number;
            checksum?: string;
            language?: string;
            changeType?: ChangeType;
            lineCount?: number;
        };
    }

    export interface GitEventMessage extends BaseMessage {
        type: MessageType.GIT_EVENT;
        payload: {
            commitHash: string;
            branch: string;
            author: string;
            message: string;
            files: GitFileChange[];
            timestamp: Date;
            stats: GitStats;
        };
    }

    export interface BurstEventMessage extends BaseMessage {
        type: MessageType.BURST_EVENT;
        payload: {
            burstId: string;
            startTime: Date;
            endTime: Date;
            duration: number;
            intensity: BurstIntensity;
            eventCount: number;
            fileChanges: number;
            dominantPattern?: string;
            focusAreas: string[];
        };
    }

    export interface AggregatedFSChangeMessage extends BaseMessage {
        type: MessageType.AGGREGATED_FS_CHANGE;
        payload: {
            timeWindow: TimeWindow;
            changes: FSChange[];
            patterns: PatternSummary[];
            impact: ImpactAssessment;
        };
    }

    export interface PatternDetectedMessage extends BaseMessage {
        type: MessageType.PATTERN_DETECTED;
        payload: {
            patternId: string;
            patternType: PatternType;
            confidence: number;
            events: string[];
            context: PatternContext;
            implications: string[];
        };
    }

    export interface CognitiveSignalMessage extends BaseMessage {
        type: MessageType.COGNITIVE_SIGNAL;
        payload: {
            signalType: CognitiveSignalType;
            strength: number;
            source: string;
            evidence: Evidence[];
            interpretation: CognitiveInterpretation;
        };
    }

    export interface ADRProposalMessage extends BaseMessage {
        type: MessageType.ADR_PROPOSAL;
        payload: {
            adrId: string;
            title: string;
            context: ADRContext;
            options: ADROption[];
            recommendation: ADROption;
            status: ADRStatus;
            stakeholders: string[];
        };
    }

    export interface ForecastResultMessage extends BaseMessage {
        type: MessageType.FORECAST_RESULT;
        payload: {
            forecastId: string;
            target: string;
            horizon: ForecastHorizon;
            predictions: Prediction[];
            confidence: number;
            methodology: string;
            assumptions: string[];
        };
    }

    // ============================================================================
    // PAYLOAD TYPE DEFINITIONS
    // ============================================================================

    export interface CycleContext {
        workspaceRoot: string;
        activeFiles: string[];
        currentTasks: string[];
        workingSet: string[];
        environment: Record<string, any>;
    }

    export interface CycleResult {
        success: boolean;
        outcomes: string[];
        artifacts: string[];
            insights: Insight[];
        errors?: string[];
    }

    export interface CycleMetrics {
        duration: number;
        eventsProcessed: number;
        patternsDetected: number;
        decisions: number;
        resourcesUsed: ResourceUsage;
    }

    export interface ResourceUsage {
        memory: number;
        cpu: number;
        diskIO: number;
        networkIO: number;
    }

    export enum FileEventType {
        CREATE = 'create',
        MODIFY = 'modify',
        DELETE = 'delete',
        MOVE = 'move',
        COPY = 'copy'
    }

    export enum ChangeType {
        ADDITION = 'addition',
        DELETION = 'deletion',
        MODIFICATION = 'modification',
        REFACTORING = 'refactoring'
    }

    export enum BurstIntensity {
        LOW = 'low',
        MEDIUM = 'medium',
        HIGH = 'high',
        EXTREME = 'extreme'
    }

    export interface TimeWindow {
        start: Date;
        end: Date;
        duration: number;
    }

    export interface FSChange {
        filePath: string;
        eventType: FileEventType;
        timestamp: Date;
        size: number;
        checksum: string;
    }

    export interface PatternSummary {
        patternType: string;
        frequency: number;
        confidence: number;
        files: string[];
    }

    export interface ImpactAssessment {
        complexityChange: number;
        riskLevel: 'low' | 'medium' | 'high';
        affectedComponents: string[];
        estimatedEffort: number;
    }

    export enum PatternType {
        REFACTORING = 'refactoring',
        FEATURE_DEVELOPMENT = 'feature_development',
        BUG_FIX = 'bug_fix',
        DOCUMENTATION = 'documentation',
        TESTING = 'testing',
        CONFIGURATION = 'configuration',
        MAINTENANCE = 'maintenance',
        PERFORMANCE_OPTIMIZATION = 'performance_optimization',
        SECURITY_HARDENING = 'security_hardening'
    }

    export interface PatternContext {
        timeWindow: TimeWindow;
        files: string[];
        directories: string[];
        technologies: string[];
        previousPatterns: string[];
    }

    export enum CognitiveSignalType {
        ATTENTION_SHIFT = 'attention_shift',
        FOCUS_INTENSITY = 'focus_intensity',
        COGNITIVE_LOAD = 'cognitive_load',
        INTENT_CHANGE = 'intent_change',
        WORKING_MEMORY_UPDATE = 'working_memory_update'
    }

    export interface Evidence {
        type: string;
        strength: number;
        source: string;
        timestamp: Date;
        data: any;
    }

    export interface CognitiveInterpretation {
        meaning: string;
        confidence: number;
        implications: string[];
        nextStates: string[];
    }

    export interface ADRContext {
        problem: string;
        constraints: string[];
        stakeholders: string[];
        timeframe: string;
        impactAreas: string[];
    }

    export interface ADROption {
        id: string;
        title: string;
        description: string;
        pros: string[];
        cons: string[];
        effort: 'low' | 'medium' | 'high';
        risk: 'low' | 'medium' | 'high';
        impact: 'low' | 'medium' | 'high';
    }

    export enum ADRStatus {
        PROPOSED = 'proposed',
        UNDER_REVIEW = 'under_review',
        ACCEPTED = 'accepted',
        REJECTED = 'rejected',
        SUPERSEDED = 'superseded'
    }

    export interface GitFileChange {
        path: string;
        type: 'added' | 'modified' | 'deleted' | 'renamed';
        additions: number;
        deletions: number;
    }

    export interface GitStats {
        totalFiles: number;
        additions: number;
        deletions: number;
        commits: number;
        authors: number;
    }

    export enum ForecastHorizon {
        IMMEDIATE = 'immediate',   // Next few minutes
        SHORT_TERM = 'short_term', // Next few hours
        MEDIUM_TERM = 'medium_term', // Next few days
        LONG_TERM = 'long_term'    // Next few weeks
    }

    export interface Prediction {
        metric: string;
        value: any;
        confidence: number;
        timeRange: TimeWindow;
        factors: string[];
    }

    export interface Insight {
        type: string;
        title: string;
        description: string;
        confidence: number;
        evidence: string[];
        recommendations: string[];
    }

    // ============================================================================
    // MESSAGE FACTORY
    // ============================================================================

    export class MessageFactory {
        /**
         * Create a base message with automatic ID and timestamp
         */
        static createBaseMessage(
            type: MessageType,
            source: MessageSource,
            payload: any,
            correlationId?: string,
            causationId?: string
        ): BaseMessage {
            return {
                id: crypto.randomUUID(),
                timestamp: new Date(),
                type,
                source,
                payload,
                correlationId,
                causationId,
                version: '1.0.0'
            };
        }

        /**
         * Create a cycle start message
         */
        static createCycleStart(
            cycleId: string,
            mode: string,
            context: CycleContext,
            objectives: string[]
        ): CycleStartMessage {
            return {
                ...this.createBaseMessage(MessageType.CYCLE_START, MessageSource.KERNEL, {}),
                type: MessageType.CYCLE_START,
                payload: {
                    cycleId,
                    mode,
                    context,
                    objectives
                }
            };
        }

        /**
         * Create a cycle end message
         */
        static createCycleEnd(
            cycleId: string,
            result: CycleResult,
            metrics: CycleMetrics,
            nextActions: string[]
        ): CycleEndMessage {
            return {
                ...this.createBaseMessage(MessageType.CYCLE_END, MessageSource.KERNEL, {}),
                type: MessageType.CYCLE_END,
                payload: {
                    cycleId,
                    result,
                    metrics,
                    nextActions
                }
            };
        }

        /**
         * Create a file event message
         */
        static createFileEvent(
            filePath: string,
            eventType: FileEventType,
            changeType?: ChangeType,
            size?: number,
            checksum?: string
        ): FileEventMessage {
            const ext = path.extname(filePath);
            const language = this.inferLanguageFromExtension(ext);

            return {
                ...this.createBaseMessage(MessageType.FILE_EVENT, MessageSource.FILE_SYSTEM, {}),
                type: MessageType.FILE_EVENT,
                payload: {
                    filePath,
                    eventType,
                    size,
                    checksum,
                    language,
                    changeType,
                    lineCount: undefined // Would be calculated if needed
                }
            };
        }

        /**
         * Create a git event message
         */
        static createGitEvent(
            commitHash: string,
            branch: string,
            author: string,
            message: string,
            files: GitFileChange[],
            stats: GitStats
        ): GitEventMessage {
            return {
                ...this.createBaseMessage(MessageType.GIT_EVENT, MessageSource.GIT, {}),
                type: MessageType.GIT_EVENT,
                payload: {
                    commitHash,
                    branch,
                    author,
                    message,
                    files,
                    timestamp: new Date(),
                    stats
                }
            };
        }

        /**
         * Create a burst event message
         */
        static createBurstEvent(
            burstId: string,
            startTime: Date,
            endTime: Date,
            duration: number,
            intensity: BurstIntensity,
            eventCount: number,
            fileChanges: number,
            focusAreas: string[]
        ): BurstEventMessage {
            return {
                ...this.createBaseMessage(MessageType.BURST_EVENT, MessageSource.ACTIVITY_RECONSTRUCTOR, {}),
                type: MessageType.BURST_EVENT,
                payload: {
                    burstId,
                    startTime,
                    endTime,
                    duration,
                    intensity,
                    eventCount,
                    fileChanges,
                    focusAreas
                }
            };
        }

        /**
         * Create a pattern detected message
         */
        static createPatternDetected(
            patternId: string,
            patternType: PatternType,
            confidence: number,
            events: string[],
            context: PatternContext,
            implications: string[]
        ): PatternDetectedMessage {
            return {
                ...this.createBaseMessage(MessageType.PATTERN_DETECTED, MessageSource.PATTERN_DETECTOR, {}),
                type: MessageType.PATTERN_DETECTED,
                payload: {
                    patternId,
                    patternType,
                    confidence,
                    events,
                    context,
                    implications
                }
            };
        }

        /**
         * Create a cognitive signal message
         */
        static createCognitiveSignal(
            signalType: CognitiveSignalType,
            strength: number,
            source: string,
            evidence: Evidence[],
            interpretation: CognitiveInterpretation
        ): CognitiveSignalMessage {
            return {
                ...this.createBaseMessage(MessageType.COGNITIVE_SIGNAL, MessageSource.COGNITIVE_ENGINE, {}),
                type: MessageType.COGNITIVE_SIGNAL,
                payload: {
                    signalType,
                    strength,
                    source,
                    evidence,
                    interpretation
                }
            };
        }

        /**
         * Create an ADR proposal message
         */
        static createADRProposal(
            adrId: string,
            title: string,
            context: ADRContext,
            options: ADROption[],
            recommendation: ADROption,
            stakeholders: string[]
        ): ADRProposalMessage {
            return {
                ...this.createBaseMessage(MessageType.ADR_PROPOSAL, MessageSource.ADR_SYSTEM, {}),
                type: MessageType.ADR_PROPOSAL,
                payload: {
                    adrId,
                    title,
                    context,
                    options,
                    recommendation,
                    status: ADRStatus.PROPOSED,
                    stakeholders
                }
            };
        }

        /**
         * Create a forecast result message
         */
        static createForecastResult(
            forecastId: string,
            target: string,
            horizon: ForecastHorizon,
            predictions: Prediction[],
            confidence: number,
            methodology: string,
            assumptions: string[]
        ): ForecastResultMessage {
            return {
                ...this.createBaseMessage(MessageType.FORECAST_RESULT, MessageSource.FORECAST_ENGINE, {}),
                type: MessageType.FORECAST_RESULT,
                payload: {
                    forecastId,
                    target,
                    horizon,
                    predictions,
                    confidence,
                    methodology,
                    assumptions
                }
            };
        }

        /**
         * Infer language from file extension
         */
        private static inferLanguageFromExtension(ext: string): string {
            const languageMap: Record<string, string> = {
                '.js': 'javascript',
                '.ts': 'typescript',
                '.jsx': 'javascript',
                '.tsx': 'typescript',
                '.py': 'python',
                '.rs': 'rust',
                '.java': 'java',
                '.cpp': 'cpp',
                '.c': 'c',
                '.cs': 'csharp',
                '.go': 'go',
                '.rb': 'ruby',
                '.php': 'php',
                '.swift': 'swift',
                '.kt': 'kotlin',
                '.scala': 'scala',
                '.zig': 'zig',
                '.nim': 'nim',
                '.elm': 'elm',
                '.hs': 'haskell',
                '.ml': 'ocaml',
                '.fs': 'fsharp',
                '.dart': 'dart',
                '.lua': 'lua',
                '.r': 'r',
                '.m': 'objective-c',
                '.sh': 'shell',
                '.bash': 'bash',
                '.zsh': 'zsh',
                '.ps1': 'powershell',
                '.bat': 'batch',
                '.cmd': 'batch',
                '.sql': 'sql',
                '.json': 'json',
                '.yaml': 'yaml',
                '.yml': 'yaml',
                '.xml': 'xml',
                '.toml': 'toml',
                '.ini': 'ini',
                '.cfg': 'config',
                '.conf': 'config',
                '.md': 'markdown',
                '.rst': 'restructuredtext',
                '.txt': 'text',
                '.html': 'html',
                '.css': 'css',
                '.scss': 'scss',
                '.sass': 'sass',
                '.less': 'less',
                '.styl': 'stylus',
                '.vue': 'vue',
                '.svelte': 'svelte'
            };

            return languageMap[ext.toLowerCase()] || 'unknown';
        }
    }

    // ============================================================================
    // TYPE GUARDS
    // ============================================================================

    export function isCycleStartMessage(message: BaseMessage): message is CycleStartMessage {
        return message.type === MessageType.CYCLE_START;
    }

    export function isCycleEndMessage(message: BaseMessage): message is CycleEndMessage {
        return message.type === MessageType.CYCLE_END;
    }

    export function isFileEventMessage(message: BaseMessage): message is FileEventMessage {
        return message.type === MessageType.FILE_EVENT;
    }

    export function isGitEventMessage(message: BaseMessage): message is GitEventMessage {
        return message.type === MessageType.GIT_EVENT;
    }

    export function isBurstEventMessage(message: BaseMessage): message is BurstEventMessage {
        return message.type === MessageType.BURST_EVENT;
    }

    export function isPatternDetectedMessage(message: BaseMessage): message is PatternDetectedMessage {
        return message.type === MessageType.PATTERN_DETECTED;
    }

    export function isCognitiveSignalMessage(message: BaseMessage): message is CognitiveSignalMessage {
        return message.type === MessageType.COGNITIVE_SIGNAL;
    }

    export function isADRProposalMessage(message: BaseMessage): message is ADRProposalMessage {
        return message.type === MessageType.ADR_PROPOSAL;
    }

    export function isForecastResultMessage(message: BaseMessage): message is ForecastResultMessage {
        return message.type === MessageType.FORECAST_RESULT;
    }

    // ============================================================================
    // MESSAGE VALIDATION
    // ============================================================================

    export function validateMessage(message: any): message is BaseMessage {
        return (
            message &&
            typeof message === 'object' &&
            typeof message.id === 'string' &&
            message.id.length > 0 &&
            typeof message.timestamp === 'string' &&
            Object.values(MessageType).includes(message.type) &&
            Object.values(MessageSource).includes(message.source) &&
            typeof message.payload === 'object' &&
            typeof message.version === 'string'
        );
    }

    export function validateMessageArray(messages: any[]): messages is BaseMessage[] {
        return Array.isArray(messages) && messages.every(validateMessage);
    }

    // ============================================================================
    // MESSAGE SERIALIZATION
    // ============================================================================

    export function serializeMessage(message: BaseMessage): string {
        return JSON.stringify({
            ...message,
            timestamp: message.timestamp.toISOString()
        });
    }

    export function deserializeMessage(data: string): BaseMessage | null {
        try {
            const parsed = JSON.parse(data);
            if (validateMessage(parsed)) {
                return {
                    ...parsed,
                    timestamp: new Date(parsed.timestamp)
                };
            }
        } catch (error) {
            console.error('Failed to deserialize message:', error);
        }
        return null;
    }

    export function serializeMessages(messages: BaseMessage[]): string {
        return messages.map(serializeMessage).join('\n');
    }

    export function deserializeMessages(data: string): BaseMessage[] {
        const messages: BaseMessage[] = [];
        const lines = data.split('\n').filter(line => line.trim());

        for (const line of lines) {
            const message = deserializeMessage(line);
            if (message) {
                messages.push(message);
            }
        }

        return messages;
    }
}

// Direct exports for compatibility
export type BaseMessage = RL4Messages.BaseMessage;
export type RL4Event = RL4Messages.RL4Event;
export const MessageType = RL4Messages.MessageType;
export const MessageSource = RL4Messages.MessageSource;