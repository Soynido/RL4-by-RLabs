/**
 * Extended Types - Comprehensive type definitions for legacy compatibility
 */

// Extended ILogger with all missing methods
export interface ILoggerExtended {
    system(msg: string): void;
    error(msg: string): void;
    warning(msg: string): void;
    debug(msg: string): void;
    info(msg: string): void;
    verbose(msg: string): void;
    warn(msg: string): void;
    log(msg: string): void;
    trace(msg: string): void;
    // Additional potential methods
    success?(msg: string): void;
    notice?(msg: string): void;
}

// Complete PromptValidationResult
export interface PromptValidationResultComplete {
    valid: boolean;
    issues: string[];
    warnings: string[];
    errors: string[];
    score?: number;
    suggestions?: string[];
}

// Complete BaseMessage
export interface BaseMessageComplete {
    id: string;
    timestamp: Date;
    type: string;
    source: string;
    payload: any;
    correlationId?: string;
    causationId?: string;
    metadata?: Record<string, any>;
    next?: string;
    kernel_flags?: Record<string, any>;
}

// Complete PlanningSlice
export interface PlanningSliceComplete {
    id: string;
    start: Date;
    end: Date;
    summary: string;
    tasks: TaskSummaryComplete;
    files: string[];
    commits: string[];
    metadata?: Record<string, any>;
}

export interface TaskSummaryComplete {
    total: number;
    completed: number;
    pending: number;
    blocked: number;
    in_progress: number;
    priority_distribution: Record<string, number>;
}

// Complete CycleContextV1
export interface CycleContextV1Complete {
    deviation_mode: string;
    id: string;
    timestamp: Date;
    mode: string;
    phase?: string;
    snapshot?: any;
    governance?: any;
    metrics?: any;
    metadata?: Record<string, any>;
}

// Complete SnapshotDataSummary
export interface SnapshotDataSummaryComplete {
    totalFiles: number;
    totalLines: number;
    languages: string[];
    lastModified: Date;
    size: number;
    fileTypes: Record<string, number>;
    directories: string[];
}

// Timeline events
export interface TimelineEvent {
    id: string;
    timestamp: Date;
    type: string;
    data: any;
    correlationId?: string;
}

// Task item with all possible properties
export interface TaskItemComplete {
    id: string;
    title: string;
    completed: boolean;
    priority: string;
    timestamp: string;
    payload?: any;
    metadata?: Record<string, any>;
    source?: string;
    tags?: string[];
}

// Project analysis results
export interface ProjectAnalysisResult {
    name: string;
    type: string;
    size: number;
    languages: string[];
    complexity: number;
    lastActivity: Date;
    metadata?: Record<string, any>;
}

// Code analysis results
export interface CodeAnalysisResult {
    files: CodeFileSnapshot[];
    metrics: CodeMetrics;
    summary: string;
    lastAnalyzed: Date;
}

export interface CodeFileSnapshot {
    path: string;
    size: number;
    language: string;
    lines: number;
    complexity: number;
    lastModified: Date;
    checksum?: string;
}

export interface CodeMetrics {
    totalFiles: number;
    totalLines: number;
    totalComplexity: number;
    languageDistribution: Record<string, number>;
    averageComplexity: number;
}

// Prompt optimization results
export interface PromptOptimizationResult {
    original: string;
    optimized: string;
    improvements: string[];
    score: number;
    suggestions: string[];
    metadata?: Record<string, any>;
}

// ADR signal enrichment
export interface ADRSignal {
    id: string;
    type: string;
    content: string;
    confidence: number;
    source: string;
    timestamp: Date;
    metadata?: Record<string, any>;
}

// Bias calculation results
export interface BiasCalculationResult {
    biases: string[];
    score: number;
    factors: Record<string, number>;
    recommendations: string[];
    timestamp: Date;
}

// History summarization
export interface HistorySummary {
    period: {
        start: Date;
        end: Date;
    };
    keyEvents: string[];
    trends: string[];
    summary: string;
    metrics: Record<string, any>;
}