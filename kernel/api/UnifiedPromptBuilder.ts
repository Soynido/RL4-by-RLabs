/**
 * UnifiedPromptBuilder — Single Context Snapshot Generator with RCEP Integration
 *
 * Phase E3.3: Combine all data sources into one unified prompt using RCEP protocol
 *
 * Data Sources:
 * 1. Plan/Tasks/Context.RL4 (persistent state files)
 * 2. ADRs from ledger/adrs.jsonl (decision history)
 * 3. Blind spot data (timeline, file patterns, git history, health)
 * 4. Confidence/Bias metrics
 * 5. Project analysis and code state
 *
 * Output:
 * Single Markdown prompt with complete context for agent LLM
 * + RCEP-encoded blob for transport/storage
 *
 * Workflow:
 * User clicks "Generate Snapshot" → Builder combines all sources → RCEP encoding → Clipboard
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'node:child_process';
import { PlanTasksContextParser, PlanData, TasksData, ContextData, WorkspaceData, KPIRecordLLM, KPIRecordKernel } from './PlanTasksContextParser';
import { BlindSpotDataLoader, TimelinePeriod } from './BlindSpotDataLoader';
import { ADRParser } from './ADRParser';
import { HistorySummarizer, SummarizedHistory } from './HistorySummarizer';
import { BiasCalculator, BiasReport } from './BiasCalculator';
import { ADRSignalEnricher, EnrichedADRSignal } from './ADRSignalEnricher';
import { ProjectAnalyzer, ProjectAnalysis } from './ProjectAnalyzer';
import { ProjectDetector } from '../detection/ProjectDetector';
import { PromptOptimizer, OptimizationRequest } from './PromptOptimizer';
import { AnomalyDetector, Anomaly } from './AnomalyDetector';
import { ILogger } from '../core/ILogger';
import { CodeStateAnalyzer } from './CodeStateAnalyzer';
import { ActivityReconstructor, ActivitySummary } from './ActivityReconstructor';
import { CycleContextV1 } from '../core/CycleContextV1';
import { PromptIntegrityValidator } from './PromptIntegrityValidator';
import { PromptCodecRL4, PromptContext, Layer, Topic, TimelineEvent, Decision, Insight as RCEPInsight } from '../rl4/PromptCodecRL4';

type AdHocAction = {
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  [key: string]: any;
};

// ============================================================================
// RL4 SNAPSHOT SYSTEM - Interfaces and Types
// ============================================================================

interface SnapshotData {
  plan: PlanData | null;
  tasks: TasksData | null;
  context: ContextData | null;
  adrs: any[];
  historySummary: SummarizedHistory | null;
  biasReport: BiasReport;
  confidence: number;
  bias: number;
  timeline: any[];
  filePatterns: any;
  gitHistory: any[];
  healthTrends: any[];
  enrichedCommits: EnrichedADRSignal[];
  adHocActions: AdHocAction[];
  enginePatterns: any[];
  engineCorrelations: any[];
  engineForecasts: any[];
  anomalies: Anomaly[];
  projectContext: ProjectAnalysis;
  detectedProject?: { name: string; description?: string; structure?: string };
  codeState: any;
  bootstrap: any | null;
  generated: string;
  deviationMode: 'strict' | 'flexible' | 'exploratory' | 'free' | 'firstUse';
  generatedTimestamp: Date;
  metadata: SnapshotMetadata;
  cycleContext?: CycleContextV1;
  recentActivityDigest?: any;
  rbomCycleSummary?: any;
  ledgerState?: any;
  kernelKPIs?: any;
  llmKPIs?: any;
  workspaceRoot?: string;
}

export interface PromptGenerationMetrics {
  prompt_chars_original: number;
  prompt_chars_optimized: number;
  compression_ratio: number;
  rcep_compression_ratio: number;
  format_time_ms: number;
  optimize_time_ms: number;
  total_time_ms: number;
}

export interface SnapshotMetadata {
  kernelCycle: number;
  merkleRoot: string;
  kernelFlags: { safeMode: boolean; ready: boolean };
  deviationMode: string;
  compressionRatio: number;
  dataHashes: { plan: string | null; tasks: string | null; context: string | null; ledger: string | null };
  anomalies: any[];
  compression: { originalSize: number; optimizedSize: number; reductionPercent: number; mode: string };
  rcepBlob?: string; // RCEP-encoded context
  promptMetrics?: PromptGenerationMetrics;
}

interface PromptProfile {
  mode: 'strict' | 'flexible' | 'exploratory' | 'free' | 'firstUse';
  includeTasks: { P0: boolean; P1: boolean; P2: boolean; completed: boolean };
  sections: {
    plan: boolean;
    tasks: boolean;
    context: 'minimal' | 'rich' | 'complete';
    timeline: false | 'condensed' | 'complete' | 'extended';
    blindSpot: false | 'selective' | 'complete' | 'extended';
    engineData: 'minimal' | 'complete';
    anomalies: 'critical' | 'medium,critical' | 'all';
    historySummary: boolean;
    bootstrap: boolean;
  };
  compression: 'aggressive' | 'moderate' | 'minimal' | 'none';
  rules: { threshold: number; suppressRedundancy: boolean; focusP0: boolean };
}

export class UnifiedPromptBuilder {
  private rl4Path: string;
  private workspaceRoot: string;
  private planParser: PlanTasksContextParser;
  private blindSpotLoader: BlindSpotDataLoader;
  private adrParser: ADRParser;
  private historySummarizer: HistorySummarizer;
  private biasCalculator: BiasCalculator;
  private adrEnricher: ADRSignalEnricher;
  private projectAnalyzer: ProjectAnalyzer;
  private codeStateAnalyzer: CodeStateAnalyzer;
  private logger: ILogger | null;
  private promptOptimizer: PromptOptimizer;
  private anomalyDetector: AnomalyDetector;
  private promptIntegrityValidator: PromptIntegrityValidator;
  private promptCodec: PromptCodecRL4;

  constructor(rl4Path: string, logger?: ILogger) {
    this.rl4Path = rl4Path;
    this.workspaceRoot = path.dirname(rl4Path);
    this.planParser = new PlanTasksContextParser(rl4Path);
    this.blindSpotLoader = new BlindSpotDataLoader(rl4Path);
    this.adrParser = new ADRParser(this.workspaceRoot);
    this.historySummarizer = new HistorySummarizer();
    this.biasCalculator = new BiasCalculator();
    this.adrEnricher = new ADRSignalEnricher();
    this.projectAnalyzer = new ProjectAnalyzer(this.workspaceRoot);
    this.codeStateAnalyzer = new CodeStateAnalyzer();
    this.logger = logger || null;
    this.promptOptimizer = new PromptOptimizer(this.logger);
    this.anomalyDetector = new AnomalyDetector();
    this.promptIntegrityValidator = new PromptIntegrityValidator();
    this.promptCodec = new PromptCodecRL4();
  }

  private resolveMode(
    requestedMode: 'strict' | 'flexible' | 'exploratory' | 'free' | 'firstUse',
    cycleMode?: string
  ): 'strict' | 'flexible' | 'exploratory' | 'free' | 'firstUse' {
    if (cycleMode && cycleMode !== 'safe') {
      return cycleMode;
    }
    return requestedMode;
  }

  // ============================================================================
  // RL4 SNAPSHOT SYSTEM - Profile Configurations
  // ============================================================================

  private readonly profiles: Record<string, PromptProfile> = {
    strict: {
      mode: 'strict',
      includeTasks: { P0: true, P1: false, P2: false, completed: false },
      sections: {
        plan: true,
        tasks: true,
        context: 'minimal',
        timeline: false,
        blindSpot: false,
        engineData: 'minimal',
        anomalies: 'critical',
        historySummary: false,
        bootstrap: false
      },
      compression: 'aggressive',
      rules: { threshold: 0.0, suppressRedundancy: true, focusP0: true }
    },
    flexible: {
      mode: 'flexible',
      includeTasks: { P0: true, P1: true, P2: false, completed: false },
      sections: {
        plan: true,
        tasks: true,
        context: 'rich',
        timeline: 'condensed',
        blindSpot: 'selective',
        engineData: 'complete',
        anomalies: 'medium,critical',
        historySummary: false,
        bootstrap: false
      },
      compression: 'moderate',
      rules: { threshold: 0.25, suppressRedundancy: true, focusP0: false }
    },
    exploratory: {
      mode: 'exploratory',
      includeTasks: { P0: true, P1: true, P2: true, completed: false },
      sections: {
        plan: true,
        tasks: true,
        context: 'complete',
        timeline: 'complete',
        blindSpot: 'complete',
        engineData: 'complete',
        anomalies: 'all',
        historySummary: false,
        bootstrap: false
      },
      compression: 'minimal',
      rules: { threshold: 0.50, suppressRedundancy: false, focusP0: false }
    },
    free: {
      mode: 'free',
      includeTasks: { P0: true, P1: true, P2: true, completed: true },
      sections: {
        plan: true,
        tasks: true,
        context: 'complete',
        timeline: 'extended',
        blindSpot: 'extended',
        engineData: 'complete',
        anomalies: 'all',
        historySummary: true,
        bootstrap: false
      },
      compression: 'none',
      rules: { threshold: 1.0, suppressRedundancy: false, focusP0: false }
    },
    firstUse: {
      mode: 'firstUse',
      includeTasks: { P0: true, P1: true, P2: true, completed: false },
      sections: {
        plan: true,
        tasks: true,
        context: 'complete',
        timeline: 'complete',
        blindSpot: 'complete',
        engineData: 'complete',
        anomalies: 'all',
        historySummary: false,
        bootstrap: true
      },
      compression: 'minimal',
      rules: { threshold: 0.50, suppressRedundancy: false, focusP0: false }
    }
  };

  /**
   * Generate unified context snapshot with user-selected deviation mode
   * @param deviationMode - User's perception angle (strict/flexible/exploratory/free/firstUse)
   * @returns Prompt with metadata (anomalies, compression metrics, RCEP blob)
   */
  async generate(
    deviationMode: 'strict' | 'flexible' | 'exploratory' | 'free' | 'firstUse' = 'flexible',
    cycleContext?: CycleContextV1
  ): Promise<{
    prompt: string;
    metadata: SnapshotMetadata;
  }> {
    const now = new Date();
    const resolvedMode = this.resolveMode(deviationMode, cycleContext?.deviation_mode);

    try {

    // Phase 5: Log snapshot generation start
    if (this.logger) {
      const dataSummary: SnapshotDataSummary = {
        mode: resolvedMode,
        total_cycles: 0, // Will be updated below
        recent_commits: 0, // Will be updated below
        file_changes: 0, // Will be updated below
        plan_rl4_found: false, // Will be updated below
        tasks_rl4_found: false, // Will be updated below
        context_rl4_found: false, // Will be updated below
        adrs_count: 0 // Will be updated below
      };
      this.logger.info?.("Snapshot generation started", { mode: resolvedMode });
    }

    // PHASE 0: Build SnapshotData (agrège et normalise toutes les données)
    const snapshotData = await this.buildSnapshotData(resolvedMode, cycleContext);

    // PHASE 1: Build PromptContext from SnapshotData for RCEP encoding
    const promptContext = await this.buildPromptContext(snapshotData, cycleContext);

    // PHASE 2: Encode through RCEP and optimize with PromptOptimizer v2
    const formatStart = Date.now();

    // Create optimization request for PromptOptimizer v2
    const optimizationRequest: OptimizationRequest = {
      rawIntent: this.extractRawIntent(snapshotData),
      history: this.convertHistoryForOptimizer(snapshotData),
      biasReport: snapshotData.biasReport,
      adrs: this.convertADRsForOptimizer(snapshotData),
      cycleContext,
      planningContext: this.convertPlanningForOptimizer(snapshotData),
      blindSpots: this.convertBlindSpotsForOptimizer(snapshotData),
      metadata: {
        deviationMode: resolvedMode,
        timestamp: now.toISOString(),
        workspaceRoot: this.workspaceRoot
      }
    };

    // Use new PromptOptimizer v2 with RCEP integration
    const optimizationResult = await this.promptOptimizer.optimize(optimizationRequest);

    let prompt = optimizationResult.optimizedPrompt;
    const rcepBlob = optimizationResult.rcepBlob;

    prompt = this.ensureSnapshotMarkers(prompt);
    const formatDuration = Date.now() - formatStart;

    // PHASE 3: Update metadata with compression metrics
    const originalSize = prompt.length;
    const optimizedSize = prompt.length; // Already optimized by PromptOptimizer
    const compressionRatio = originalSize > 0 ? (originalSize - optimizedSize) / originalSize : 0;
    const rcepCompressionRatio = optimizationResult.compressionRatio;

    snapshotData.metadata.compressionRatio = compressionRatio;
    snapshotData.metadata.compression = {
      originalSize,
      optimizedSize,
      reductionPercent: compressionRatio * 100,
      mode: resolvedMode
    };
    snapshotData.metadata.rcepBlob = rcepBlob; // Store RCEP blob
    snapshotData.metadata.promptMetrics = {
      prompt_chars_original: originalSize,
      prompt_chars_optimized: optimizedSize,
      compression_ratio: Number(compressionRatio.toFixed(4)),
      rcep_compression_ratio: Number(rcepCompressionRatio.toFixed(4)),
      format_time_ms: formatDuration,
      optimize_time_ms: 0, // Handled by PromptOptimizer
      total_time_ms: formatDuration
    };

    if (this.logger) {
      this.logger.info?.("Snapshot generation completed", {
        originalSize,
        optimizedSize,
        rcepCompressionRatio,
        optimizationScore: optimizationResult.optimizationScore
      });
    }

    // Verify RCEP blob integrity
    if (!this.promptOptimizer.verifyRCEP(rcepBlob)) {
      throw new Error('[UnifiedPromptBuilder] RCEP blob integrity verification failed');
    }

    const integrity = this.promptIntegrityValidator.validate(prompt, cycleContext);
    if (!integrity.valid) {
      throw new Error(`[UnifiedPromptBuilder] Prompt integrity failed: ${integrity.issues.join('; ')}`);
    }
    if (this.logger && integrity.warnings.length > 0) {
      this.logger?.warning?.(`[UnifiedPromptBuilder] ${integrity.warnings.join('; ')}`);
    }

    // Phase 5: Log snapshot generated
    if (this.logger) {
      const sections = (prompt.match(/^##\s+/gm) || []).length;
      this.logger?.info?.(`Snapshot generated: ${prompt.length} chars, ${sections} sections`);
    }

    // Return prompt with enriched metadata
    return {
      prompt,
      metadata: snapshotData.metadata
    };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      console.error('[UnifiedPromptBuilder] Error generating snapshot:', errorMessage);
      if (errorStack) {
        console.error('[UnifiedPromptBuilder] Stack trace:', errorStack.substring(0, 1000));
      }

      // Log to logger if available
      if (this.logger) {
        this.logger?.error?.(`❌ Snapshot generation failed: ${errorMessage}`);
        if (errorStack) {
          this.logger?.warning?.(`Stack: ${errorStack.substring(0, 500)}`);
        }
      }

      // Re-throw with more context
      throw new Error(`Failed to generate snapshot (mode: ${resolvedMode}): ${errorMessage}`);
    }
  }

  // ============================================================================
  // RCEP INTEGRATION METHODS
  // ============================================================================

  /**
   * Build PromptContext from SnapshotData for RCEP encoding
   */
  private async buildPromptContext(snapshotData: SnapshotData, cycleContext?: CycleContextV1): Promise<PromptContext> {
    const context: PromptContext = {
      metadata: {
        sessionId: this.generateSessionId(),
        llmModel: "claude-3.5-sonnet",
        contextWindow: 8000,
        encodingTime: Date.now(),
        ptrScheme: "mil-his-v1"
      },
      layers: [],
      topics: [],
      timeline: [],
      decisions: [],
      insights: []
    };

    // Build layers from different data sources
    let layerId = 0;

    // Layer 0: Core Architecture (Plan, Tasks)
    if (snapshotData.plan) {
      context.layers.push({
        id: layerId++,
        name: "core_architecture",
        weight: 900,
        parent: "ROOT"
      });
    }

    // Layer 1: Project Context
    if (snapshotData.projectContext) {
      context.layers.push({
        id: layerId++,
        name: "project_context",
        weight: 800,
        parent: "ROOT"
      });
    }

    // Layer 2: Code State
    if (snapshotData.codeState) {
      context.layers.push({
        id: layerId++,
        name: "code_state",
        weight: 850,
        parent: "ROOT"
      });
    }

    // Layer 3: Decision History
    if (snapshotData.adrs && snapshotData.adrs.length > 0) {
      context.layers.push({
        id: layerId++,
        name: "decision_history",
        weight: 750,
        parent: "ROOT"
      });
    }

    // Layer 4: Activity Timeline
    if (snapshotData.timeline && snapshotData.timeline.length > 0) {
      context.layers.push({
        id: layerId++,
        name: "activity_timeline",
        weight: 600,
        parent: "ROOT"
      });
    }

    // Build topics from working sets and tasks
    let topicId = 0;

    // Topics from plan
    if (snapshotData.plan) {
      context.topics.push({
        id: topicId++,
        name: "primary_goal",
        weight: 999,
        refs: [0] // Reference to core_architecture layer
      });
    }

    // Topics from tasks
    if (snapshotData.tasks?.active) {
      for (const task of snapshotData.tasks.active.slice(0, 5)) {
        context.topics.push({
          id: topicId++,
          name: this.sanitizeTopicName(task.task),
          weight: Math.round(task.priority * 999),
          refs: [0] // Reference to core_architecture layer
        });
      }
    }

    // Topics from ADRs
    if (snapshotData.adrs) {
      for (const adr of snapshotData.adrs.slice(0, 3)) {
        context.topics.push({
          id: topicId++,
          name: this.sanitizeTopicName(`adr_${adr.id}`),
          weight: 850,
          refs: [3] // Reference to decision_history layer
        });
      }
    }

    // Build timeline from history
    let eventId = 0;
    if (snapshotData.historySummary?.events) {
      for (const event of snapshotData.historySummary.events.slice(0, 20)) {
        context.timeline.push({
          id: eventId++,
          time: event.timestamp || Date.now(),
          type: "reflection",
          ptr: `HISTORY:${event.id}`
        });
      }
    }

    // Build decisions from ADRs and bias report
    if (snapshotData.adrs) {
      for (const adr of snapshotData.adrs) {
        const decision: Decision = {
          id: eventId++,
          type: adr.status === "accepted" ? "accept" : "modify",
          weight: 800,
          inputs: context.timeline.slice(-3).map(e => e.id)
        };
        context.decisions.push(decision);
      }
    }

    // Build insights from patterns and anomalies
    if (snapshotData.anomalies && snapshotData.anomalies.length > 0) {
      const insight: RCEPInsight = {
        id: 0,
        type: "anomaly",
        salience: 900,
        links: []
      };
      context.insights.push(insight);
    }

    // Add human summary if available
    if (snapshotData.plan?.goal) {
      context.humanSummary = {
        type: "brief",
        text: snapshotData.plan.goal.substring(0, 200)
      };
    }

    return context;
  }

  /**
   * Extract raw intent from SnapshotData for optimization
   */
  private extractRawIntent(snapshotData: SnapshotData): string {
    const parts: string[] = [];

    if (snapshotData.plan?.goal) {
      parts.push(`Primary goal: ${snapshotData.plan.goal}`);
    }

    if (snapshotData.tasks?.active && snapshotData.tasks.active.length > 0) {
      const topTasks = snapshotData.tasks.active.slice(0, 3);
      parts.push(`Active tasks: ${topTasks.map(t => t.task).join(", ")}`);
    }

    if (snapshotData.context?.next) {
      parts.push(`Next steps: ${snapshotData.context.next}`);
    }

    return parts.join(". ") || "Continue working on current tasks";
  }

  /**
   * Convert history data for PromptOptimizer
   */
  private convertHistoryForOptimizer(snapshotData: SnapshotData): any {
    if (!snapshotData.historySummary) return undefined;

    return {
      events: (snapshotData.historySummary.events || []).map(event => ({
        id: event.id,
        summary: event.summary || event.description || "",
        importance: event.importance || 0.5,
        timestamp: event.timestamp || Date.now()
      }))
    };
  }

  /**
   * Convert ADRs for PromptOptimizer
   */
  private convertADRsForOptimizer(snapshotData: SnapshotData): any[] {
    return (snapshotData.adrs || []).map(adr => ({
      adrId: adr.id,
      decision: adr.decision || adr.title || "",
      relevance: 0.8,
      invariants: adr.invariants || [],
      warnings: adr.warnings || []
    }));
  }

  /**
   * Convert planning data for PromptOptimizer
   */
  private convertPlanningForOptimizer(snapshotData: SnapshotData): any {
    if (!snapshotData.plan && !snapshotData.tasks) return undefined;

    return {
      slices: [{
        id: "current",
        summary: snapshotData.plan?.goal || "Current work",
        events: snapshotData.timeline || []
      }]
    };
  }

  /**
   * Convert blind spots for PromptOptimizer
   */
  private convertBlindSpotsForOptimizer(snapshotData: SnapshotData): any {
    return {
      missingExpectedFiles: [],
      unexploredHotspots: (snapshotData.codeState?.implementationStatus || [])
        .filter(status => status.status === "missing")
        .map(status => ({ file: status.feature }))
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private sanitizeTopicName(name: string): string {
    return name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .substring(0, 50);
  }

  private generateSessionId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  private ensureSnapshotMarkers(prompt: string): string {
    if (!prompt.startsWith('BEGIN RL4 SNAPSHOT')) {
      prompt = 'BEGIN RL4 SNAPSHOT\n\n' + prompt;
    }
    if (!prompt.endsWith('\n\nEND RL4 SNAPSHOT')) {
      prompt = prompt + '\n\nEND RL4 SNAPSHOT';
    }
    return prompt;
  }

  // ============================================================================
  // ORIGINAL BUILD SNAPSHOT DATA (preserved from original)
  // ============================================================================

  private async buildSnapshotData(
    requestedMode: 'strict' | 'flexible' | 'exploratory' | 'free' | 'firstUse',
    cycleContext?: CycleContextV1
  ): Promise<SnapshotData> {
    const resolvedMode = this.resolveMode(requestedMode, cycleContext?.deviation_mode);
    const profile = this.profiles[resolvedMode];
    const now = new Date();
    const safeDefaults = this.getSafeDefaults();

    try {
      // 1. Load persistent state files
      const plan = this.normalizePlan(this.planParser.parsePlan());
      const tasks = this.normalizeTasks(this.planParser.parseTasks());
      let context = this.normalizeContext(this.planParser.parseContext());
      if (cycleContext) {
        const derivedContext = this.buildContextFromCycleContext(cycleContext);
        context = context ? this.mergeContextWithCycle(context, derivedContext, cycleContext) : derivedContext;
      }

      // 2. Load compressed historical summary (if profile allows)
      const historySummary = profile.sections.historySummary
        ? await this.normalizeHistory(await this.historySummarizer.summarize(30))
        : null;

      // 3. Calculate bias and confidence
      const biasMode = resolvedMode === 'firstUse' ? 'exploratory' : resolvedMode;
      const biasReport = await this.biasCalculator.calculateBias(biasMode);

      // Get workspace reality for confidence calculation
      const timelinePeriod = this.getTimelinePeriod(profile.sections.timeline);
      let timeline = this.normalizeTimeline(this.blindSpotLoader.loadTimeline(timelinePeriod));
      let gitHistory = this.normalizeGitHistory(this.blindSpotLoader.loadGitHistory(profile.sections.timeline === 'extended' ? 50 : 10));
      let healthTrends = this.normalizeHealthTrends(this.blindSpotLoader.loadHealthTrends(timelinePeriod));
      if (cycleContext) {
        if (timeline.length === 0) {
          timeline = this.normalizeTimelineFromCycleContext(cycleContext);
        }
        if (gitHistory.length === 0) {
          gitHistory = this.normalizeGitHistoryFromCycleContext(cycleContext);
        }
        if (healthTrends.length === 0) {
          healthTrends = this.normalizeHealthFromCycleContext(cycleContext);
        }
      }

      const workspaceReality: WorkspaceData = {
        activeFiles: context?.activeFiles || [],
        recentCycles: timeline.length,
        recentCommits: gitHistory.length,
        health: {
          memoryMB: healthTrends[healthTrends.length - 1]?.memoryMB || 0,
          eventLoopLag: healthTrends[healthTrends.length - 1]?.eventLoopLagP50 || 0
        }
      };

      const confidence = plan ? this.planParser.calculateConfidence(plan, workspaceReality) : 0.5;
      const bias = biasReport.total;

      // 4. Load blind spot data (according to profile)
      const filePatterns = this.normalizeFilePatterns(this.blindSpotLoader.loadFilePatterns(timelinePeriod));
      const adrs = this.normalizeADRs(this.blindSpotLoader.loadADRs(5));

      // 5. Enrich commits with ADR detection signals
      const enrichedCommits = this.normalizeEnrichedCommits(await this.adrEnricher.enrichCommits(24));

      // 6. Detect ad-hoc actions
      const adHocActions = this.normalizeAdHocActions([]);

      // 7. Load engine-generated data
      const enginePatterns: any[] = [];
      const engineCorrelations: any[] = [];
      const engineForecasts: any[] = [];

      // 8. Analyze project context
      const projectContext = await this.projectAnalyzer.analyze();
      const projectDetector = new ProjectDetector(this.workspaceRoot);
      const detectedProject = await projectDetector.detect();

      // 9. Analyze code state
      const goalText = plan?.goal || '';
      const taskTexts = tasks?.active.map(t => t.task) || [];
      const goals = goalText ? [goalText, ...taskTexts] : taskTexts;
      const codeState = await this.codeStateAnalyzer.analyze(goals);

      // 10. Detect anomalies
      const workspaceContext: WorkspaceContext = {
        recentCommits: gitHistory.length,
        fileChanges: filePatterns ? Object.keys(filePatterns).length : 0,
        patterns: enginePatterns,
        forecasts: engineForecasts,
        correlations: engineCorrelations,
        adrs: adrs,
        cycles: timeline.length,
        health: {
          memoryMB: healthTrends[healthTrends.length - 1]?.memoryMB || 0,
          eventLoopLag: healthTrends[healthTrends.length - 1]?.eventLoopLagP50 || 0
        },
        bias: bias,
        planDrift: biasReport.total,
        cognitiveLoad: 0
      };

      const anomalies = await this.anomalyDetector.detect(workspaceContext);

      // 11. Build complete snapshot data
      const snapshotData: SnapshotData = {
        plan,
        tasks,
        context,
        adrs,
        historySummary,
        biasReport,
        confidence,
        bias,
        timeline,
        filePatterns,
        gitHistory,
        healthTrends,
        enrichedCommits,
        adHocActions,
        enginePatterns,
        engineCorrelations,
        engineForecasts,
        anomalies,
        projectContext,
        detectedProject,
        codeState,
        bootstrap: null,
        generated: now.toISOString(),
        deviationMode: resolvedMode,
        generatedTimestamp: now,
        metadata: {
          kernelCycle: cycleContext?.kernel_cycle || 0,
          merkleRoot: cycleContext?.merkle_root || safeDefaults.merkleRoot,
          kernelFlags: {
            safeMode: cycleContext?.kernel_flags?.safe_mode || safeDefaults.safeMode,
            ready: cycleContext?.kernel_flags?.ready || safeDefaults.ready
          },
          deviationMode: resolvedMode,
          compressionRatio: 0,
          dataHashes: {
            plan: plan ? this.hashData(plan) : null,
            tasks: tasks ? this.hashData(tasks) : null,
            context: context ? this.hashData(context) : null,
            ledger: cycleContext ? this.hashData(cycleContext) : null
          },
          anomalies: anomalies,
          compression: { originalSize: 0, optimizedSize: 0, reductionPercent: 0, mode: resolvedMode }
        },
        cycleContext,
        recentActivityDigest: cycleContext?.recent_activity_digest,
        rbomCycleSummary: cycleContext?.rbom_cycle_summary,
        ledgerState: cycleContext?.ledger_state,
        kernelKPIs: cycleContext?.kernel_kpis,
        llmKPIs: cycleContext?.llm_kpis,
        workspaceRoot: this.workspaceRoot
      };

      return snapshotData;

    } catch (error) {
      console.error('[UnifiedPromptBuilder] Error building snapshot data:', error);
      throw error;
    }
  }

  // ============================================================================
  // HELPER AND NORMALIZATION METHODS (minimal implementations)
  // ============================================================================

  private getSafeDefaults() {
    return {
      merkleRoot: '00000000000000000000000000000000',
      safeMode: false,
      ready: true
    };
  }

  private getTimelinePeriod(timeline: false | 'condensed' | 'complete' | 'extended'): TimelinePeriod {
    switch (timeline) {
      case 'condensed': return { days: 7 };
      case 'complete': return { days: 30 };
      case 'extended': return { days: 90 };
      default: return { days: 3 };
    }
  }

  private normalizePlan(plan: any): PlanData | null {
    return plan;
  }

  private normalizeTasks(tasks: any): TasksData | null {
    return tasks;
  }

  private normalizeContext(context: any): ContextData | null {
    return context;
  }

  private async normalizeHistory(history: any): Promise<HistorySummary | null> {
    return history;
  }

  private normalizeTimeline(timeline: any): any[] {
    return timeline || [];
  }

  private normalizeGitHistory(gitHistory: any): any[] {
    return gitHistory || [];
  }

  private normalizeHealthTrends(healthTrends: any): any[] {
    return healthTrends || [];
  }

  private normalizeFilePatterns(filePatterns: any): any {
    return filePatterns;
  }

  private normalizeADRs(adrs: any): any[] {
    return adrs || [];
  }

  private normalizeEnrichedCommits(commits: EnrichedCommit[]): EnrichedCommit[] {
    return commits || [];
  }

  private normalizeAdHocActions(actions: any[]): AdHocAction[] {
    return actions || [];
  }

  private buildContextFromCycleContext(cycleContext: CycleContextV1): ContextData {
    // Build context from cycle context data
    return {
      observations: [
        `Kernel mode: ${cycleContext.deviation_mode}`,
        `Total cycles: ${cycleContext.kernel_cycle}`,
        `Current goal: ${cycleContext.current_goal || 'Not specified'}`
      ],
      activeFiles: [],
      next: cycleContext.next_task || 'Continue current work',
      lastUpdate: new Date().toISOString()
    };
  }

  private mergeContextWithCycle(
    baseContext: ContextData,
    cycleContext: ContextData,
    cycle: CycleContextV1
  ): ContextData {
    return {
      ...baseContext,
      observations: [
        ...(baseContext.observations || []),
        ...(cycleContext.observations || [])
      ],
      activeFiles: [
        ...(baseContext.activeFiles || []),
        ...(cycleContext.activeFiles || [])
      ],
      next: cycleContext.next || baseContext.next,
      lastUpdate: cycleContext.last_update || baseContext.lastUpdate
    };
  }

  private normalizeTimelineFromCycleContext(cycleContext: CycleContextV1): any[] {
    // Extract timeline from cycle context if available
    return [];
  }

  private normalizeGitHistoryFromCycleContext(cycleContext: CycleContextV1): any[] {
    // Extract git history from cycle context if available
    return [];
  }

  private normalizeHealthFromCycleContext(cycleContext: CycleContextV1): any[] {
    // Extract health trends from cycle context if available
    return [];
  }

  private hashData(data: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').substring(0, 16);
  }

  // ============================================================================
  // EXPLICIT RCEP EXPORT FUNCTION
  // ============================================================================

  /**
   * EXPLICIT RCEP EXPORT - User-triggered only
   * This is the ONLY place where RCEP encoding should be called in the entire backend.
   *
   * @param snapshotData The processed snapshot data
   * @param cycleContext Optional cycle context
   * @param options RCEP export options
   * @returns Promise<RCEPExportResult> The RCEP encoded result
   */
  async exportPromptToRCEP(
    snapshotData: SnapshotData,
    cycleContext?: CycleContextV1,
    options: {
      includeValidation?: boolean;
      includeChecksum?: boolean;
    } = {}
  ): Promise<RCEPExportResult> {
    try {
      console.log('[UnifiedPromptBuilder] Starting explicit RCEP export...');

      // Step 1: Build PromptContext from snapshot data
      const promptContext = await this.buildPromptContext(snapshotData, cycleContext);

      // Step 2: Import RCEP encoder dynamically (only when explicitly called)
      const { RCEPEncoder, RCEPValidator } = await import('../rl4/codec/RCEP_Encoder');
      const { RCEPChecksum } = await import('../rl4/codec/RCEP_Checksum');

      // Step 3: Encode to RCEP format
      const encoded = RCEPEncoder.encode(promptContext);

      // Step 4: Optional validation
      let validation = null;
      if (options.includeValidation) {
        const validator = new (await import('../rl4/codec/RCEP_Validator')).RCEPValidator();
        const doc = RCEPEncoder.buildDocument(promptContext);
        validation = validator.validate(doc);
      }

      // Step 5: Optional checksum
      let checksum = null;
      if (options.includeChecksum) {
        const doc = RCEPEncoder.buildDocument(promptContext);
        checksum = RCEPChecksum.compute(doc);
      }

      console.log('[UnifiedPromptBuilder] RCEP export completed successfully');

      return {
        encoded,
        validation,
        checksum,
        context: promptContext,
        metadata: {
          exportedAt: new Date().toISOString(),
          snapshotId: snapshotData.generated,
          cycleId: cycleContext?.cycle_id,
          rcepVersion: "0.1.0"
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[UnifiedPromptBuilder] RCEP export failed:', errorMessage);
      throw new Error(`RCEP export failed: ${errorMessage}`);
    }
  }
}

export interface RCEPExportResult {
  encoded: string;
  validation?: any;
  checksum?: string;
  context: PromptContext;
  metadata: {
    exportedAt: string;
    snapshotId: string;
    cycleId?: any;
    rcepVersion: string;
  };
}