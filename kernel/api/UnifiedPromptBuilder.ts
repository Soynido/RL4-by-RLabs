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

// Prompt modes (distinct from kernel RL4Mode - explicit separation)
export type PromptMode = 'strict' | 'flexible' | 'exploratory' | 'free' | 'firstUse';

// Interface for workspace context analysis
interface PatternSummary {
  id: string;
  score: number;
}

interface ForecastSummary {
  id: string;
  confidence: number;
}

interface CorrelationSummary {
  source: string;
  target: string;
  strength: number;
}

export interface WorkspaceContext {
  recentCommits: number;
  fileChanges: number;
  patterns: PatternSummary[];
  forecasts: ForecastSummary[];
  correlations: CorrelationSummary[];
  adrs: any[];
  cycles: number;
  health: { memoryMB: number; eventLoopLag: number; };
  bias: number;
  planDrift: number;
  cognitiveLoad: number;
}

// Interface for enriched commits
export interface EnrichedCommit {
  id: string;
  message: string;
  timestamp: Date;
  author: string;
  adr?: any;
}
import { PlanTasksContextParser, PlanData, TasksData, ContextData, WorkspaceData, KPIRecordLLM, KPIRecordKernel } from './PlanTasksContextParser';
import { BlindSpotDataLoader, TimelinePeriod } from './BlindSpotDataLoader';
import { ADRParser, ADRFromFile } from './ADRParser';
import { ADRSignalEnricher, EnrichedADRSignal } from './ADRSignalEnricher';
import { ProjectAnalyzer, ProjectAnalysis } from './ProjectAnalyzer';
import { ProjectDetector } from '../detection/ProjectDetector';
import { PromptOptimizer, OptimizationRequest } from './PromptOptimizer';
import { AppendOnlyWriter } from '../AppendOnlyWriter';
import { ILogger } from '../core/ILogger';
import { SnapshotDataSummaryComplete } from '../types/ExtendedTypes';
import { CodeStateAnalyzer } from './CodeStateAnalyzer';
import { ActivityReconstructor, ActivitySummary } from './ActivityReconstructor';
import { CycleContextV1 } from '../core/CycleContextV1';
import { PromptIntegrityValidator } from './PromptIntegrityValidator';
import { PromptCodecRL4, PromptContext, Layer, Topic, TimelineEvent, Decision, Insight as RCEPInsight } from '../rl4/PromptCodecRL4';
import { KernelIntent } from '../core/KernelIntent';
import {
  PromptSnapshot,
  PromptSnapshotLayer,
  PromptSnapshotTopic,
  PromptSnapshotEvent,
  PromptSnapshotDecision,
  PromptSnapshotInsight,
  PromptSnapshotIntegrity,
  PromptSnapshotSource,
  PROMPT_SNAPSHOT_VERSION
} from '../context/snapshot/PromptSnapshot';
import { PromptSnapshotValidator } from '../context/snapshot/PromptSnapshotValidator';
import { MIL } from '../memory/MIL';

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
  // DEPRECATED: historySummary, biasReport removed (violation Loi 1)
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
  // DEPRECATED: anomalies removed (violation Loi 1)
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
  milContext?: any; // MIL context (if available)
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
  // DEPRECATED: anomalies removed (violation Loi 1)
  compression: { originalSize: number; optimizedSize: number; reductionPercent: number; mode: string };
  rcepBlob?: string; // RCEP-encoded context
  rcepChecksum?: string | null; // RCEP checksum for reference
  promptMetrics?: PromptGenerationMetrics;
  snapshot?: PromptSnapshot; // Phase 1: PromptSnapshot artefact (non-intrusive)
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
    // DEPRECATED: anomalies, historySummary removed (violation Loi 1)
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
  private adrEnricher: ADRSignalEnricher;
  private projectAnalyzer: ProjectAnalyzer;
  private codeStateAnalyzer: CodeStateAnalyzer;
  private logger: ILogger | null;
  private promptOptimizer: PromptOptimizer;
  private promptIntegrityValidator: PromptIntegrityValidator;
  private promptCodec: PromptCodecRL4;
  private snapshotValidator: PromptSnapshotValidator;
  private mil?: MIL;
  private decisionStore?: any; // DecisionStore (importé dynamiquement pour éviter dépendance circulaire)
  private rcepStore?: any; // RCEPStore (importé dynamiquement pour éviter dépendance circulaire)
  private scfCompressor?: any; // SCFCompressor (importé dynamiquement pour éviter dépendance circulaire)

  constructor(rl4Path: string, logger?: ILogger, mil?: MIL, decisionStore?: any, rcepStore?: any, scfCompressor?: any) {
    this.rl4Path = rl4Path;
    this.workspaceRoot = path.dirname(rl4Path);
    this.planParser = new PlanTasksContextParser(rl4Path);
    this.blindSpotLoader = new BlindSpotDataLoader(rl4Path);
    this.adrParser = new ADRParser(this.workspaceRoot);
    this.adrEnricher = new ADRSignalEnricher();
    this.projectAnalyzer = new ProjectAnalyzer(this.workspaceRoot);
    this.codeStateAnalyzer = new CodeStateAnalyzer();
    this.logger = logger || null;
    this.promptOptimizer = new PromptOptimizer(this.logger);
    this.promptIntegrityValidator = new PromptIntegrityValidator();
    this.promptCodec = new PromptCodecRL4();
    this.snapshotValidator = new PromptSnapshotValidator();
    this.mil = mil;
    this.decisionStore = decisionStore;
    this.rcepStore = rcepStore;
    this.scfCompressor = scfCompressor;
  }

  private resolveMode(
    requestedMode: PromptMode,
    cycleMode?: string
  ): PromptMode {
    if (cycleMode && cycleMode !== 'safe') {
      const validModes: PromptMode[] = ['strict', 'flexible', 'exploratory', 'free', 'firstUse'];
      if (validModes.includes(cycleMode as PromptMode)) {
        return cycleMode as PromptMode;
      }
      // No silent fallback - maintain explicit validation
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
        // DEPRECATED: anomalies, historySummary removed (violation Loi 1)
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
        // DEPRECATED: anomalies, historySummary removed (violation Loi 1)
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
        // DEPRECATED: anomalies, historySummary removed (violation Loi 1)
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
        // DEPRECATED: anomalies, historySummary removed (violation Loi 1)
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
        // DEPRECATED: anomalies, historySummary removed (violation Loi 1)
        bootstrap: true
      },
      compression: 'minimal',
      rules: { threshold: 0.50, suppressRedundancy: false, focusP0: false }
    }
  };

  /**
   * Generate unified context snapshot with user-selected deviation mode
   * @param deviationMode - User's perception angle (strict/flexible/exploratory/free/firstUse)
   * @param cycleContext - Optional cycle context
   * @param intent - Optional KernelIntent (Phase 0: accepted but ignored for backward-compat)
   * @returns Prompt with metadata (compression metrics, RCEP blob)
   */
  async generate(
    deviationMode: 'strict' | 'flexible' | 'exploratory' | 'free' | 'firstUse' = 'flexible',
    cycleContext?: CycleContextV1,
    intent?: KernelIntent
  ): Promise<{
    prompt: string;
    metadata: SnapshotMetadata;
  }> {
    const now = new Date();
    const resolvedMode = this.resolveMode(deviationMode, cycleContext?.deviation_mode);

    // Phase 0: Log intent if provided (observability)
    if (intent) {
      this.logger?.info?.(`[UnifiedPromptBuilder] Received intent: kind=${intent.kind}, mode=${intent.mode}, confidence=${intent.source.confidence}, advisory=${intent.source.advisory}`);
    }

    try {

    // Phase 5: Log snapshot generation start
    if (this.logger) {
      const dataSummary: SnapshotDataSummaryComplete = {
        // Structure minimale - sera complètement peuplée plus bas
        totalFiles: 0,
        totalLines: 0,
        languages: [],
        lastModified: new Date(),
        size: 0,
        fileTypes: {},
        directories: []
      };
      this.logger.info?.(`Snapshot generation started with mode: ${resolvedMode}`);
    }

    // PHASE 0: Build SnapshotData (agrège et normalise toutes les données)
    const snapshotData = await this.buildSnapshotData(resolvedMode, cycleContext);

    // PHASE 1: Build PromptContext from SnapshotData for RCEP encoding
    const promptContext = await this.buildPromptContext(snapshotData, cycleContext);

    // PHASE 1 (PARALLEL): Create PromptSnapshot from existing artifacts (non-intrusive)
    let promptSnapshot: PromptSnapshot | null = null;
    try {
      const snapshotWithoutChecksum = this.createPromptSnapshotFromExistingArtifacts(
        snapshotData,
        promptContext,
        resolvedMode,
        cycleContext
      );
      promptSnapshot = this.snapshotValidator.validateAndSeal(snapshotWithoutChecksum);
      this.logger?.info?.(`[UnifiedPromptBuilder] PromptSnapshot created: checksum=${promptSnapshot.checksum.substring(0, 16)}..., layers=${promptSnapshot.layers.length}, topics=${promptSnapshot.topics.length}`);
    } catch (error) {
      // Non-blocking: log error but don't fail prompt generation
      this.logger?.warning?.(`[UnifiedPromptBuilder] Failed to create PromptSnapshot: ${error instanceof Error ? error.message : String(error)}`);
    }

    // PHASE 2: Encode through RCEP and optimize with PromptOptimizer v2
    const formatStart = Date.now();

    // Create optimization request for PromptOptimizer v2
    const optimizationRequest: OptimizationRequest = {
      rawIntent: this.extractRawIntent(snapshotData),
      // DEPRECATED: history, biasReport removed (violation Loi 1)
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

    // ⚠️ PHASE 3 : Stocker RCEP blob dans RCEPStore (source de vérité)
    let rcepChecksum: string | null = null;
    if (this.rcepStore && rcepBlob) {
      try {
        rcepChecksum = this.rcepStore.calculateChecksumPublic(rcepBlob);
        await this.rcepStore.store(rcepBlob, {
          timestamp: Date.now(),
          checksum: rcepChecksum
        });
        this.logger?.info?.(`[UnifiedPromptBuilder] RCEP blob stored with checksum: ${rcepChecksum}`);
      } catch (error) {
        this.logger?.error?.(`[UnifiedPromptBuilder] Failed to store RCEP blob: ${error}`);
      }
    }

    // ⚠️ PHASE 7 : Compresser RCEP en SCF et décompresser en prompt final
    let finalPrompt = prompt;
    let scfGenerationId: string | undefined;
    if (this.scfCompressor && rcepBlob && rcepChecksum) {
      try {
        // Décoder RCEP → PromptContext
        const promptContext = this.promptCodec.decode(rcepBlob);
        
        // Compresser PromptContext → SCF
        const anchorEventId = (snapshotData.metadata as any).anchorEventId;
        const scf = await this.scfCompressor.compress(promptContext, anchorEventId);
        scfGenerationId = scf.anchor.event_id;
        
        // Décompresser SCF → prompt final
        finalPrompt = await this.scfCompressor.decompress(scf);
        
        this.logger?.info?.(`[UnifiedPromptBuilder] SCF compression and decompression applied.`);
      } catch (error) {
        this.logger?.error?.(`[UnifiedPromptBuilder] Failed to compress/decompress SCF: ${error}`);
        // Fallback to original prompt
      }
    } else {
      finalPrompt = prompt; // Fallback to original prompt if SCF not enabled/available
    }

    // Add MIL context section if available (MVP: enrich prompt with unified events)
    if (snapshotData.milContext) {
      const milSection = this.formatMILContext(snapshotData.milContext);
      // Insert after first section or at beginning
      const firstSectionMatch = prompt.match(/^(##\s+[^\n]+\n)/m);
      if (firstSectionMatch) {
        const insertPos = firstSectionMatch.index! + firstSectionMatch[0].length;
        prompt = prompt.slice(0, insertPos) + '\n' + milSection + '\n\n' + prompt.slice(insertPos);
      } else {
        prompt = milSection + '\n\n' + prompt;
      }
    }

    // ⚠️ PHASE 3 : Ajouter instructions cognitives strictes pour LLM
    const cognitiveInstructions = this.formatCognitiveInstructions();
    // Insérer avant la fin du prompt
    prompt = prompt + '\n\n' + cognitiveInstructions;

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
    snapshotData.metadata.rcepChecksum = rcepChecksum; // Store checksum for reference
    snapshotData.metadata.promptMetrics = {
      prompt_chars_original: originalSize,
      prompt_chars_optimized: optimizedSize,
      compression_ratio: Number(compressionRatio.toFixed(4)),
      rcep_compression_ratio: Number(rcepCompressionRatio.toFixed(4)),
      format_time_ms: formatDuration,
      optimize_time_ms: 0, // Handled by PromptOptimizer
      total_time_ms: formatDuration
    };

    // Phase 1: Add snapshot to metadata (non-intrusive, doesn't affect prompt)
    if (promptSnapshot) {
      snapshotData.metadata.snapshot = promptSnapshot;
    }

    if (this.logger) {
      this.logger.info?.(`Snapshot generation completed - size: ${optimizedSize} chars (compressed from ${originalSize})`);
    }

    // Verify RCEP blob integrity
    if (!this.promptOptimizer.verifyRCEP(rcepBlob)) {
      throw new Error('[UnifiedPromptBuilder] RCEP blob integrity verification failed');
    }

    const integrity = this.promptIntegrityValidator.validate([]);
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

    // Add SCF generation ID to metadata if available
    if (scfGenerationId) {
      (snapshotData.metadata as any).scfGenerationId = scfGenerationId;
    }

    // Return prompt with enriched metadata
    return {
      prompt: finalPrompt,
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
          weight: Math.round(0.5 * 999),
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

    // DEPRECATED: History timeline removed (violation Loi 1)
    let eventId = 0;

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

    // DEPRECATED: Anomalies insights removed (violation Loi 1)
    // Anomaly detection should be done by LLM via prompts, not kernel

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
  // DEPRECATED: convertHistoryForOptimizer removed (violation Loi 1)
  // History summarization should be done by LLM via prompts, not kernel

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
  // PHASE 1: PROMPT SNAPSHOT CREATION (NON-INTRUSIVE)
  // ============================================================================

  /**
   * Create PromptSnapshot from existing artifacts (SnapshotData + PromptContext)
   * This is called in parallel and does NOT affect prompt generation.
   */
  private createPromptSnapshotFromExistingArtifacts(
    snapshotData: SnapshotData,
    promptContext: PromptContext,
    mode: PromptMode,
    cycleContext?: CycleContextV1
  ): Omit<PromptSnapshot, 'checksum'> {
    const now = Date.now();
    const sessionId = promptContext.metadata.sessionId || this.generateSessionId();

    // Map layers from PromptContext
    const layers: PromptSnapshotLayer[] = promptContext.layers.map((layer, index) => ({
      kind: 'layer' as const,
      id: layer.id,
      name: layer.name,
      weight: layer.weight,
      parent: layer.parent
    }));

    // Map topics from PromptContext
    const topics: PromptSnapshotTopic[] = promptContext.topics.map((topic, index) => ({
      kind: 'topic' as const,
      id: topic.id,
      name: topic.name,
      weight: topic.weight,
      refs: topic.refs
    }));

    // Map timeline from PromptContext
    const timeline: PromptSnapshotEvent[] = promptContext.timeline.map((event, index) => ({
      kind: 'event' as const,
      id: event.id,
      time: event.time,
      type: event.type,
      ptr: event.ptr
    }));

    // Map decisions from PromptContext
    const decisions: PromptSnapshotDecision[] = promptContext.decisions.map((decision, index) => ({
      kind: 'decision' as const,
      id: decision.id,
      type: decision.type,
      weight: decision.weight,
      inputs: decision.inputs
    }));

    // Map insights from PromptContext
    const insights: PromptSnapshotInsight[] = promptContext.insights.map((insight, index) => ({
      kind: 'insight' as const,
      id: insight.id,
      type: insight.type,
      salience: insight.salience,
      links: insight.links
    }));

    // Calculate integrity
    const totalWeight =
      layers.reduce((sum, l) => sum + l.weight, 0) +
      topics.reduce((sum, t) => sum + t.weight, 0) +
      decisions.reduce((sum, d) => sum + d.weight, 0) +
      insights.reduce((sum, i) => sum + i.salience, 0);

    const integrity: PromptSnapshotIntegrity = {
      totalWeight,
      layerCount: layers.length,
      topicCount: topics.length,
      eventCount: timeline.length,
      decisionCount: decisions.length,
      insightCount: insights.length
    };

    // Document source with artifacts (Phase 1: origin documentation)
    const source: PromptSnapshotSource = {
      type: 'runtime',
      component: 'UnifiedPromptBuilder',
      version: '1.0',
      artifacts: ['SnapshotData', 'PromptContext'] // Origin documentation
    };

    return {
      version: PROMPT_SNAPSHOT_VERSION,
      timestamp: now,
      sessionId,
      layers,
      topics,
      timeline,
      decisions,
      insights,
      source,
      generationTime: 0, // Will be calculated by validator if needed
      sourceVersion: '1.0',
      schema: 'strict-v1',
      integrity
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
      // DEPRECATED: historySummarizer removed (violation Loi 1)
      const historySummary = null;

      // 3. Calculate bias and confidence
      // DEPRECATED: calculateBias removed (violation Loi 1)
      const biasReport = { total: 0, planAlignment: 0, timelineAlignment: 0, patternAlignment: 0, codeAlignment: 0, signals: [] };

      // Get workspace reality for confidence calculation
      const timelinePeriod = this.getTimelinePeriod(profile.sections.timeline);
      let timeline = this.normalizeTimeline(this.blindSpotLoader.loadTimeline(timelinePeriod));
      let gitHistory = this.normalizeGitHistory(this.blindSpotLoader.loadGitHistory(profile.sections.timeline === 'extended' ? 50 : 10));
      let healthTrends = this.normalizeHealthTrends(this.blindSpotLoader.loadHealthTrends(timelinePeriod));
      let enrichedCommits: EnrichedADRSignal[] = [];
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
      
      // ✅ INVARIANT RL6: Load ADRs from THREE sources:
      // 1. From ledger/adrs.jsonl (from ADRs.RL4)
      const adrsFromLedger = this.adrParser.getAllADRsFromLedger(10);
      // 2. From adrs/ directories (existing functionality)
      const adrsFromDirs = await this.adrParser.loadAll();
      // 3. From ground_truth/ADRs.yaml (structural ADRs)
      const adrsFromGroundTruth = this.loadADRsFromGroundTruth();
      // Merge and deduplicate by ID
      const allADRs: any[] = [...adrsFromLedger, ...adrsFromDirs, ...adrsFromGroundTruth];
      const uniqueADRs = Array.from(
        new Map(allADRs.map(adr => [adr.id, adr])).values()
      );
      const adrs = this.normalizeADRs(uniqueADRs.slice(0, 10));

      // 5. Enrich commits with ADR detection signals
      throw new Error("NOT IMPLEMENTED: EnrichedCommit vs EnrichedADRSignal type transformation required - implement proper adapter or fix upstream types");

      // 6. Detect ad-hoc actions
      const adHocActions = this.normalizeAdHocActions([]);

      // 7. Load engine-generated data
      const enginePatterns: any[] = [];
      const engineCorrelations: any[] = [];
      const engineForecasts: any[] = [];

      // 8. Analyze project context
      const projectContext = await this.projectAnalyzer.analyze();
      const projectDetector = new ProjectDetector(this.workspaceRoot);
      const detectedProject = await projectDetector.detectProjectType();

      // 9. Build MIL context (if available)
      let milContext = null;
      if (this.mil) {
        try {
          milContext = await this.mil.buildContextForLLM(undefined, 3600000); // 1 hour window
        } catch (error) {
          // Silent failure - MIL is optional
          this.logger?.warning?.(`Failed to build MIL context: ${error}`);
        }
      }

      // 10. Analyze code state
      const goalText = plan?.goal || '';
      const taskTexts = tasks?.active.map(t => t.task) || [];
      const goals = goalText ? [goalText, ...taskTexts] : taskTexts;
      const codeState = await this.codeStateAnalyzer.analyze(this.workspaceRoot, []);

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
        planDrift: 0, // DEPRECATED: biasReport removed (violation Loi 1)
        cognitiveLoad: 0
      };

      // DEPRECATED: anomalyDetector removed (violation Loi 1)
      const anomalies: any[] = [];

      // 11. Build complete snapshot data
      const snapshotData: SnapshotData = {
        plan,
        tasks,
        context,
        adrs,
        // DEPRECATED: historySummary, biasReport removed (violation Loi 1)
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
        // DEPRECATED: anomalies removed (violation Loi 1)
        projectContext,
        detectedProject: {
          name: detectedProject.metadata?.name || 'Unknown Project',
          description: detectedProject.metadata?.description,
          structure: detectedProject.metadata?.type
        },
        codeState,
        bootstrap: null,
        generated: now.toISOString(),
        deviationMode: resolvedMode,
        generatedTimestamp: now,
        milContext: milContext || undefined, // Add MIL context to snapshot
        metadata: {
          kernelCycle: (cycleContext as any)?.kernel_cycle || 0,
          merkleRoot: (cycleContext as any)?.merkle_root || safeDefaults.merkleRoot,
          kernelFlags: {
            safeMode: (cycleContext as any)?.kernel_flags?.safe_mode || safeDefaults.safeMode,
            ready: (cycleContext as any)?.kernel_flags?.ready || safeDefaults.ready
          },
          deviationMode: resolvedMode,
          compressionRatio: 0,
          dataHashes: {
            plan: plan ? this.hashData(plan) : null,
            tasks: tasks ? this.hashData(tasks) : null,
            context: context ? this.hashData(context) : null,
            ledger: cycleContext ? this.hashData(cycleContext) : null
          },
          // DEPRECATED: anomalies removed (violation Loi 1)
          compression: { originalSize: 0, optimizedSize: 0, reductionPercent: 0, mode: resolvedMode }
        },
        cycleContext,
        recentActivityDigest: (cycleContext as any)?.recent_activity_digest,
        rbomCycleSummary: (cycleContext as any)?.rbom_cycle_summary,
        ledgerState: (cycleContext as any)?.ledger_state,
        kernelKPIs: (cycleContext as any)?.kernel_kpis,
        llmKPIs: (cycleContext as any)?.llm_kpis,
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

  private async normalizeHistory(history: any): Promise<any | null> {
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

  /**
   * Load ADRs from ground_truth/ADRs.yaml
   */
  private loadADRsFromGroundTruth(): ADRFromFile[] {
    try {
      const { GroundTruthSystem } = require('../ground_truth/GroundTruthSystem');
      const groundTruthSystem = new GroundTruthSystem(this.rl4Path);
      return groundTruthSystem.loadADRs();
    } catch (error) {
      console.error('[UnifiedPromptBuilder] Failed to load ADRs from ground_truth:', error);
      return [];
    }
  }

  private normalizeEnrichedCommits(commits: EnrichedCommit[]): EnrichedCommit[] {
    return commits || [];
  }

  private normalizeAdHocActions(actions: any[]): AdHocAction[] {
    return actions || [];
  }

  private buildContextFromCycleContext(cycleContext: CycleContextV1): ContextData {
    // Build context from cycle context data
    throw new Error("NOT IMPLEMENTED: CycleContextV1 missing required properties (current_goal, next_task, deviation_mode) - extend CycleContextV1 or implement proper adapter");
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
      updated: cycleContext.updated || baseContext.updated
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

      // Step 2: Import RCEP encoder and validator dynamically (only when explicitly called)
      const { RCEPEncoder } = await import('../rl4/codec/RCEP_Encoder');
      const { RCEPValidator } = await import('../rl4/codec/RCEP_Validator');
      const { RCEPChecksum } = await import('../rl4/codec/RCEP_Checksum');

      // Step 3: Encode to RCEP format (FAIL FAST: Type conversion not implemented)
      const encoded: string = "";
      let validation: any = null;
      let checksum: string = "";

      throw new Error("RCEP export not implemented: PromptContext type conversion between PromptCodecRL4 and RCEP_Types not available");

      // Unreachable code - compilation safeguards only
      /*
      if (false) { // Never executed
        // Step 4: Optional validation
        if (options.includeValidation) {
          const validator = new RCEPValidator();
          const doc = {} as any; // Type compatibility placeholder
          validation = validator.validate(doc);
        }

        // Step 5: Optional checksum
        if (options.includeChecksum) {
          checksum = "placeholder";
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
            cycleId: cycleContext?.getCycleId(),
            rcepVersion: "0.1.0"
          }
        };
      }
      */

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[UnifiedPromptBuilder] RCEP export failed:', errorMessage);
      throw new Error(`RCEP export failed: ${errorMessage}`);
    }
  }

  // ============================================================================
  // MISSING METHODS - Fail-fast implementations as per rules
  // ============================================================================

  
  private detectProjectType(): string {
    throw new Error("Not implemented: ProjectDetector.detect() method not available");
  }


  private loadWorkspaceContext(): WorkspaceContext {
    throw new Error("Not implemented: WorkspaceContext loading not implemented");
  }

  private loadTimelineData(): any {
    throw new Error("Not implemented: BlindSpotDataLoader.loadTimeline() method not available");
  }

  private loadGitHistoryData(): any {
    throw new Error("Not implemented: BlindSpotDataLoader.loadGitHistory() method not available");
  }

  private loadHealthData(): any {
    throw new Error("Not implemented: BlindSpotDataLoader.loadHealthTrends() method not available");
  }

  private loadFilePatterns(): any {
    throw new Error("Not implemented: BlindSpotDataLoader.loadFilePatterns() method not available");
  }

  private loadADRData(): any {
    throw new Error("Not implemented: BlindSpotDataLoader.loadADRs() method not available");
  }

  private enrichCommitData(): EnrichedCommit[] {
    throw new Error("Not implemented: ADRSignalEnricher.enrichCommits() method not available");
  }


  /**
   * Format MIL context for prompt inclusion
   */
  private formatMILContext(milContext: any): string {
    if (!milContext || !milContext.events || milContext.events.length === 0) {
      return '';
    }

    const events = milContext.events;
    const window = milContext.window;
    const spatial = milContext.spatial_context;
    const queries = milContext.suggested_queries || [];

    let section = '## 🧠 MEMORY CONSOLIDATOR CONTEXT\n\n';
    
    section += `### Temporal Window\n`;
    section += `- **Period**: ${new Date(window.start).toISOString()} → ${new Date(window.end).toISOString()}\n`;
    section += `- **Duration**: ${Math.round(window.duration_ms / 1000)}s\n`;
    section += `- **Total Events**: ${events.length} (normalized, unified schema)\n\n`;

    if (spatial && (spatial.files?.length > 0 || spatial.modules?.length > 0)) {
      section += `### Spatial Context (Where)\n`;
      if (spatial.files && spatial.files.length > 0) {
        section += `- **Files**: ${spatial.files.slice(0, 10).join(', ')}${spatial.files.length > 10 ? ` (+${spatial.files.length - 10} more)` : ''}\n`;
      }
      if (spatial.modules && spatial.modules.length > 0) {
        section += `- **Modules**: ${spatial.modules.slice(0, 5).join(', ')}${spatial.modules.length > 5 ? ` (+${spatial.modules.length - 5} more)` : ''}\n`;
      }
      section += '\n';
    }

    if (queries.length > 0) {
      section += `### Suggested Analysis Queries\n\n`;
      queries.forEach((q: string, i: number) => {
        section += `${i + 1}. ${q}\n`;
      });
      section += '\n';
    }

    section += `### Unified Event Timeline\n\n`;
    // Show recent events (last 10)
    const recentEvents = events.slice(-10);
    for (const event of recentEvents) {
      const time = new Date(event.timestamp).toISOString();
      section += `[${time}] ${event.type} (${event.source})\n`;
      if (event.indexed_fields?.files && event.indexed_fields.files.length > 0) {
        section += `  → Files: ${event.indexed_fields.files.slice(0, 3).join(', ')}${event.indexed_fields.files.length > 3 ? '...' : ''}\n`;
      }
      section += '\n';
    }

    if (events.length > 10) {
      section += `*(${events.length - 10} more events in this window)*\n\n`;
    }

    return section;
  }

  /**
   * ⚠️ PHASE 3 : Formatage des instructions cognitives strictes pour LLM
   * 
   * Instructions non-négociables pour génération de décisions cognitives :
   * - Format JSON strict avec schéma DecisionSchema
   * - confidence >= 95% pour RL4 updates
   * - Jamais inventer context_refs
   */
  private formatCognitiveInstructions(): string {
    let section = '## 🧠 COGNITIVE DECISION GENERATION (MANDATORY)\n\n';
    
    section += 'You MUST generate cognitive decisions in the following format:\n\n';
    section += '```json:decisions\n';
    section += '[\n';
    section += '  {\n';
    section += '    "id": "uuid-v4",\n';
    section += '    "intent": "kernel_intent_id (MANDATORY)",\n';
    section += '    "intent_text": "Human-readable intent",\n';
    section += '    "context_refs": ["event_id_1", "event_id_2", "file_path"],\n';
    section += '    "options_considered": [\n';
    section += '      { "option": "...", "rationale": "...", "weight": 0-999 }\n';
    section += '    ],\n';
    section += '    "chosen_option": "...",\n';
    section += '    "constraints": ["constraint1", "constraint2"],\n';
    section += '    "invalidation_conditions": [\n';
    section += '      { "condition": "...", "trigger_event_types": ["FILE_DELETE"], "severity": "critical" }\n';
    section += '    ],\n';
    section += '    "previous_decisions": ["decision_id_1"],\n';
    section += '    "related_adrs": ["adr_id_1"],\n';
    section += '    "confidence_llm": 95,  // 0-100 (MUST be >= 95 for RL4 updates)\n';
    section += '    "validation_status": "pending",\n';
    section += '    "rcep_ref": "rcep_checksum"\n';
    section += '  }\n';
    section += ']\n';
    section += '```\n\n';
    
    section += '### ⚠️ NON-NEGOTIABLE RULES:\n\n';
    section += '1. **Intent is MANDATORY**: Every decision MUST have a valid `intent` field.\n';
    section += '2. **Confidence >= 95% for RL4 updates**: If `intent` includes `rl4_update`, `confidence_llm` MUST be >= 95.\n';
    section += '3. **Never invent context_refs**: All `context_refs` MUST reference real event IDs, ADR IDs, or file paths from the context.\n';
    section += '4. **Explicit options**: Always provide at least 2 options in `options_considered`.\n';
    section += '5. **Invalidation conditions**: For critical decisions, specify `invalidation_conditions` that would invalidate the decision.\n';
    section += '6. **Previous decisions**: Link to previous decisions that led to this one via `previous_decisions`.\n\n';
    
    section += '### ⚠️ VALIDATION:\n\n';
    section += 'Decisions with `confidence_llm < 95%` for RL4 updates will be REJECTED.\n';
    section += 'Decisions with invalid or missing `context_refs` will be REJECTED.\n';
    section += 'Decisions without a valid `intent` will be REJECTED.\n\n';
    
    return section;
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