import { BaseMessage } from "../legacy/rl4/RL4Messages";
import { UnifiedPromptBuilder } from "./UnifiedPromptBuilder";
import { SummarizedHistory, BiasReport } from "./BiasCalculator";
import { EnrichedADRSignal } from "./ADRSignalEnricher";
import { ParsedADR } from "./ADRParser";
import { CycleContextV1 } from "../core/CycleContextV1";
import { ParsedPlanningContext } from "./parsers/PlanTasksContextParser";
import { BlindSpotReport } from "./BlindSpotDataLoader";
import { ILogger } from "../core/ILogger";
import { PromptCodecRL4, PromptContext, Layer, Topic, TimelineEvent, Decision, Insight } from "../rl4/PromptCodecRL4";

export interface OptimizationRequest {
    rawIntent: string;
    history?: SummarizedHistory;
    biasReport?: BiasReport;
    adrs?: EnrichedADRSignal[];
    cycleContext?: CycleContextV1;
    planningContext?: ParsedPlanningContext;
    blindSpots?: BlindSpotReport;
    metadata?: Record<string, any>;
}

export interface OptimizedPrompt {
    originalIntent: string;
    optimizedPrompt: string;
    rcepBlob: string;                 // RCEP-encoded context for transport/storage
    compressionRatio: number;         // Size reduction achieved
    optimizationScore: number;         // 0..1 - predicted effectiveness
    contextEnrichment: {
        injectedADRCount: number;
        injectedHistoryEvents: number;
        injectedBlindSpots: number;
        injectedPlanSlices: number;
    };
    optimizationSignals: string[];
    estimatedDriftReduction: number;   // 0..1 - how much drift was corrected
    promptMetrics: {
        lexicalDensity: number;
        semanticComplexity: number;
        ambiguityScore: number;
        architecturalDepth: number;
    };
    executionHints: {
        recommendedModel: string;
        temperatureRange: [number, number];
        maxTokens: number;
        priorityContext: string[];
    };
}

export interface ContextFragment {
    type: "adr" | "history" | "blindspot" | "plan" | "invariant" | "pattern";
    relevance: number;                 // 0..1
    content: string;
    source: string;
    priority: "critical" | "high" | "medium" | "low";
    size: number;                      // tokens estimate
}

/**
 * PromptOptimizer - RL6 RCEP-Integrated Cognitive Enhancement Engine
 *
 * Purpose:
 *   Transforms raw developer intent into precision-engineered prompts using the
 *   RL4 Cognitive Encoding Protocol (RCEP) for deterministic, lossless compression.
 *
 * Architecture:
 *   - RCEP-based compression: All context flows through PromptCodecRL4
 *   - Zero creative generation: only optimize and enrich existing intent
 *   - Structure-preserving optimizations: deduplication, canonical ordering
 *   - Cross-block coherence: Ensures consistency across all RCEP blocks
 *
 * Key Innovation:
 *   The PromptOptimizer acts as an orchestration layer that:
 *   1. Normalizes heterogeneous context into PromptContext
 *   2. Delegates compression to PromptCodecRL4 (the central compressor)
 *   3. Performs structure-preserving optimizations without content loss
 *   4. Generates both human-readable prompts and RCEP-encoded transport format
 */
export class PromptOptimizer {

    private readonly codec: PromptCodecRL4;
    private readonly sessionId: string;

    constructor(private logger?: ILogger) {
        this.codec = new PromptCodecRL4();
        this.sessionId = this.generateSessionId();
    }

    /**
     * Main API: optimize a raw intent with full RCEP integration
     */
    async optimize(request: OptimizationRequest): Promise<OptimizedPrompt> {
        this.logger?.info(`Starting RCEP-based prompt optimization (session: ${this.sessionId}, intent length: ${request.rawIntent.length})`);

        // 1. Extract and rank context fragments
        const fragments = this.extractContextFragments(request);

        // 2. Filter and prioritize fragments
        const prioritized = this.prioritizeFragments(fragments);

        // 3. Normalize into PromptContext for RCEP encoding
        const promptContext = this.normalizeToPromptContext(request, prioritized);

        // 4. Encode through RCEP for deterministic compression
        const rcepBlob = this.codec.encode(promptContext, false);

        // 5. Perform structure-preserving optimizations
        const optimizedContext = this.performStructureOptimizations(promptContext);

        // 6. Build human-readable optimized prompt
        const optimizedPrompt = this.buildOptimizedPrompt(request.rawIntent, prioritized);

        // 7. Apply anti-drift corrections
        const driftCorrected = this.applyDriftCorrection(optimizedPrompt, request.biasReport);

        // 8. Calculate optimization metrics
        const metrics = this.calculatePromptMetrics(driftCorrected, request);

        // 9. Generate execution hints
        const hints = this.generateExecutionHints(driftCorrected, metrics);

        // 10. Calculate compression ratio
        const originalSize = this.calculateOriginalSize(request, prioritized);
        const compressionRatio = originalSize > 0 ? originalSize / rcepBlob.content.length : 1;

        this.logger?.success(`RCEP prompt optimization completed (session: ${this.sessionId}, fragments: ${prioritized.length}, score: ${metrics.overallScore.toFixed(2)})`);

        return {
            originalIntent: request.rawIntent,
            optimizedPrompt: driftCorrected,
            rcepBlob: rcepBlob.minified,
            compressionRatio,
            optimizationScore: metrics.overallScore,
            contextEnrichment: {
                injectedADRCount: prioritized.filter(f => f.type === "adr").length,
                injectedHistoryEvents: prioritized.filter(f => f.type === "history").length,
                injectedBlindSpots: prioritized.filter(f => f.type === "blindspot").length,
                injectedPlanSlices: prioritized.filter(f => f.type === "plan").length,
            },
            optimizationSignals: metrics.signals,
            estimatedDriftReduction: metrics.driftReduction,
            promptMetrics: {
                lexicalDensity: metrics.lexicalDensity,
                semanticComplexity: metrics.semanticComplexity,
                ambiguityScore: metrics.ambiguityScore,
                architecturalDepth: metrics.architecturalDepth
            },
            executionHints: hints
        };
    }

    /**
     * Decode an RCEP blob back to optimized prompt
     */
    decodeFromRCEP(rcepBlob: string): OptimizedPrompt | null {
        try {
            const context = this.codec.decode(rcepBlob);
            const prompt = this.reconstructPromptFromContext(context);

            return {
                originalIntent: "", // Not stored in RCEP
                optimizedPrompt: prompt,
                rcepBlob,
                compressionRatio: 1, // Unknown without original
                optimizationScore: 0.8, // Default
                contextEnrichment: {
                    injectedADRCount: context.topics.filter(t => t.name.includes("ADR")).length,
                    injectedHistoryEvents: context.timeline.length,
                    injectedBlindSpots: 0, // Not encoded separately
                    injectedPlanSlices: context.layers.filter(l => l.name.includes("plan")).length,
                },
                optimizationSignals: ["RCEP-decoded"],
                estimatedDriftReduction: 0,
                promptMetrics: {
                    lexicalDensity: 0.7,
                    semanticComplexity: 0.6,
                    ambiguityScore: 0.8,
                    architecturalDepth: 0.5
                },
                executionHints: {
                    recommendedModel: "claude-3.5-sonnet",
                    temperatureRange: [0.3, 0.7],
                    maxTokens: 4000,
                    priorityContext: []
                }
            };
        } catch (error) {
            this.logger?.error(`Failed to decode RCEP blob: ${error.message}`);
            return null;
        }
    }

    /**
     * Verify RCEP blob integrity
     */
    verifyRCEP(rcepBlob: string): boolean {
        // TODO: Implement proper verification when codec supports it
        return rcepBlob.length > 0;
    }

    /****************************************************************************************
     * CONTEXT FRAGMENT EXTRACTION
     * Pulls relevant context from all RL6 modules
     ****************************************************************************************/
    private extractContextFragments(request: OptimizationRequest): ContextFragment[] {
        const fragments: ContextFragment[] = [];

        // ADR fragments - architectural constraints and decisions
        if (request.adrs) {
            for (const adr of request.adrs) {
                if (adr.relevance > 0.3) { // Only include relevant ADRs
                    fragments.push({
                        type: "adr",
                        relevance: adr.relevance,
                        content: `ADR ${adr.adrId}: ${adr.decision}`,
                        source: `adr:${adr.adrId}`,
                        priority: adr.relevance > 0.8 ? "critical" : adr.relevance > 0.6 ? "high" : "medium",
                        size: this.estimateTokens(adr.decision)
                    });

                    // Add invariants as separate fragments
                    for (const invariant of adr.invariants) {
                        fragments.push({
                            type: "invariant",
                            relevance: adr.relevance * 0.9,
                            content: `Invariant: ${invariant}`,
                            source: `adr:${adr.adrId}:invariant`,
                            priority: adr.warnings.length > 0 ? "critical" : "high",
                            size: this.estimateTokens(invariant)
                        });
                    }

                    // Add warnings as critical fragments
                    for (const warning of adr.warnings) {
                        fragments.push({
                            type: "invariant",
                            relevance: 1.0,
                            content: `⚠️ ${warning}`,
                            source: `adr:${adr.adrId}:warning`,
                            priority: "critical",
                            size: this.estimateTokens(warning)
                        });
                    }
                }
            }
        }

        // History fragments - compressed relevant events
        if (request.history?.events) {
            const relevantEvents = request.history.events
                .filter(e => e.importance > 0.4)
                .slice(0, 10); // Limit to top 10 events

            for (const event of relevantEvents) {
                fragments.push({
                    type: "history",
                    relevance: event.importance,
                    content: event.summary,
                    source: `history:${event.id}`,
                    priority: event.importance > 0.8 ? "high" : "medium",
                    size: this.estimateTokens(event.summary)
                });
            }
        }

        // Blind spot fragments - areas needing attention
        if (request.blindSpots) {
            if (request.blindSpots.missingExpectedFiles.length > 0) {
                fragments.push({
                    type: "blindspot",
                    relevance: 0.8,
                    content: `Missing expected files: ${request.blindSpots.missingExpectedFiles.slice(0, 3).join(", ")}`,
                    source: "blindspot:missing_files",
                    priority: "high",
                    size: 50
                });
            }

            if (request.blindSpots.unexploredHotspots.length > 0) {
                fragments.push({
                    type: "blindspot",
                    relevance: 0.7,
                    content: `Unexplored hotspots: ${request.blindSpots.unexploredHotspots.slice(0, 3).map(h => h.file).join(", ")}`,
                    source: "blindspot:hotspots",
                    priority: "medium",
                    size: 60
                });
            }
        }

        // Plan fragments - current planning context
        if (request.planningContext?.slices) {
            const recentSlices = request.planningContext.slices
                .filter(s => s.messages.length > 0)
                .slice(-3); // Last 3 active slices

            for (const slice of recentSlices) {
                fragments.push({
                    type: "plan",
                    relevance: 0.9,
                    content: `Active task: ${slice.summary}`,
                    source: `plan:${slice.id}`,
                    priority: "critical",
                    size: this.estimateTokens(slice.summary)
                });
            }
        }

        return fragments;
    }

    /****************************************************************************************
     * FRAGMENT PRIORITIZATION
     * Selects and orders fragments for maximum impact
     ****************************************************************************************/
    private prioritizeFragments(fragments: ContextFragment[]): ContextFragment[] {
        // Sort by priority and relevance
        const sorted = fragments.sort((a, b) => {
            const priorityWeight = {
                critical: 1000,
                high: 100,
                medium: 10,
                low: 1
            };

            const scoreA = priorityWeight[a.priority] * a.relevance;
            const scoreB = priorityWeight[b.priority] * b.relevance;

            return scoreB - scoreA;
        });

        // Select top fragments within token budget (roughly 2000 tokens for context)
        const budget = 2000;
        let used = 0;
        const selected: ContextFragment[] = [];

        for (const fragment of sorted) {
            if (used + fragment.size <= budget) {
                selected.push(fragment);
                used += fragment.size;
            }
        }

        this.logger?.debug(`Selected ${selected.length} fragments out of ${fragments.length} within ${used} tokens`);
        return selected;
    }

    /****************************************************************************************
     * PROMPTCONTEXT NORMALIZATION
     * Converts fragments and request data into standardized PromptContext
     ****************************************************************************************/
    private normalizeToPromptContext(request: OptimizationRequest, fragments: ContextFragment[]): PromptContext {
        const context: PromptContext = {
            metadata: {
                sessionId: this.sessionId,
                llmModel: "claude-3.5-sonnet", // Default, can be overridden
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

        // Build layers from different context types
        let layerId = 0;
        const layerMap = new Map<string, number>();

        // Create layers for each fragment type
        const fragmentTypes = [...new Set(fragments.map(f => f.type))];
        for (const type of fragmentTypes) {
            const layerName = this.mapFragmentTypeToLayer(type);
            const layer: Layer = {
                id: layerId++,
                name: layerName,
                weight: this.calculateLayerWeight(type, fragments.filter(f => f.type === type)),
                parent: "ROOT"
            };
            context.layers.push(layer);
            layerMap.set(type, layer.id);
        }

        // Build topics from fragments
        let topicId = 0;
        for (const fragment of fragments) {
            const topic: Topic = {
                id: topicId++,
                name: this.extractTopicName(fragment),
                weight: Math.round(fragment.relevance * 999),
                refs: [layerMap.get(fragment.type) || 0]
            };
            context.topics.push(topic);
        }

        // Build timeline from history and planning events
        let eventId = 0;
        if (request.history?.events) {
            for (const event of request.history.events.slice(0, 20)) {
                const timelineEvent: TimelineEvent = {
                    id: eventId++,
                    time: typeof event.timestamp === 'number' ? event.timestamp : Date.now(),
                    type: "reflection",
                    ptr: `HISTORY:${event.id}`
                };
                context.timeline.push(timelineEvent);
            }
        }

        // Build decisions from ADRs
        if (request.adrs) {
            for (const adr of request.adrs) {
                const decision: Decision = {
                    id: eventId++,
                    type: adr.warnings.length > 0 ? "modify" : "accept",
                    weight: Math.round(adr.relevance * 999),
                    inputs: context.timeline.slice(-3).map(e => e.id) // Link to recent events
                };
                context.decisions.push(decision);
            }
        }

        // Build insights from patterns and correlations
        if (fragments.filter(f => f.type === "pattern").length > 0) {
            const insight: Insight = {
                id: 0,
                type: "pattern",
                salience: 750,
                links: []
            };
            context.insights.push(insight);
        }

        return context;
    }

    /****************************************************************************************
     * STRUCTURE OPTIMIZATIONS
     * Performs deduplication and canonical ordering without content loss
     ****************************************************************************************/
    private performStructureOptimizations(context: PromptContext): PromptContext {
        const optimized = JSON.parse(JSON.stringify(context));

        // Deduplicate topics with similar names
        const topicGroups = new Map<string, Topic[]>();
        for (const topic of optimized.topics) {
            const key = topic.name.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (!topicGroups.has(key)) {
                topicGroups.set(key, []);
            }
            topicGroups.get(key)!.push(topic);
        }

        // Merge similar topics
        const mergedTopics: Topic[] = [];
        for (const [key, topics] of topicGroups) {
            if (topics.length === 1) {
                mergedTopics.push(topics[0]);
            } else {
                // Merge by keeping highest weighted topic and combining references
                const merged = topics.reduce((best, current) =>
                    current.weight > best.weight ? current : best
                );
                merged.refs = [...new Set(topics.flatMap(t => t.refs))];
                mergedTopics.push(merged);
            }
        }

        optimized.topics = mergedTopics;

        // Canonical ordering is handled by PromptCodecRL4
        return optimized;
    }

    /****************************************************************************************
     * OPTIMIZED PROMPT BUILDING
     * Constructs the enhanced prompt with strategic context placement
     ****************************************************************************************/
    private buildOptimizedPrompt(rawIntent: string, fragments: ContextFragment[]): string {
        const sections = [];

        // 1. Critical warnings and invariants first
        const critical = fragments.filter(f => f.priority === "critical" && f.type === "invariant");
        if (critical.length > 0) {
            sections.push("## ARCHITECTURAL CONSTRAINTS");
            sections.push(...critical.map(f => `- ${f.content}`));
            sections.push("");
        }

        // 2. Current task and plan context
        const plans = fragments.filter(f => f.type === "plan");
        if (plans.length > 0) {
            sections.push("## CURRENT TASK CONTEXT");
            sections.push(...plans.map(f => f.content));
            sections.push("");
        }

        // 3. Relevant ADRs
        const adrs = fragments.filter(f => f.type === "adr");
        if (adrs.length > 0) {
            sections.push("## RELEVANT ARCHITECTURAL DECISIONS");
            sections.push(...adrs.map(f => f.content));
            sections.push("");
        }

        // 4. Historical context
        const history = fragments.filter(f => f.type === "history");
        if (history.length > 0) {
            sections.push("## RECENT ACTIVITY CONTEXT");
            sections.push(...history.map(f => `- ${f.content}`));
            sections.push("");
        }

        // 5. Blind spots and warnings
        const blindspots = fragments.filter(f => f.type === "blindspot");
        if (blindspots.length > 0) {
            sections.push("## AREAS REQUIRING ATTENTION");
            sections.push(...blindspots.map(f => `- ${f.content}`));
            sections.push("");
        }

        // 6. The original intent - enhanced with specificity
        sections.push("## TASK");
        sections.push(this.enhanceIntentSpecificity(rawIntent));

        return sections.join("\n");
    }

    /****************************************************************************************
     * DRIFT CORRECTION
     * Applies bias correction based on drift analysis
     ****************************************************************************************/
    private applyDriftCorrection(prompt: string, biasReport?: BiasReport): string {
        if (!biasReport || biasReport.biasScore < 0.3) {
            return prompt; // No significant drift to correct
        }

        const corrections = [];

        if (biasReport.planAlignment < 0.4) {
            corrections.push("⚠️ Note: This task appears to diverge from the current plan. Verify alignment before proceeding.");
        }

        if (biasReport.timelineAlignment < 0.3) {
            corrections.push("⏰️ Context: This task hasn't been reflected in recent activity. Consider if timing is appropriate.");
        }

        if (biasReport.codeAlignment < 0.3) {
            corrections.push("📁 Verify: Referenced files/structures should exist in the current codebase.");
        }

        if (corrections.length > 0) {
            return prompt + "\n\n## DRIFT AWARENESS\n" + corrections.join("\n");
        }

        return prompt;
    }

    /****************************************************************************************
     * METRICS CALCULATION
     * Computes optimization effectiveness scores
     ****************************************************************************************/
    private calculatePromptMetrics(prompt: string, request: OptimizationRequest) {
        const wordCount = prompt.split(/\s+/).length;
        const sentenceCount = prompt.split(/[.!?]+/).length;

        // Lexical density: unique words / total words
        const words = prompt.toLowerCase().split(/\s+/);
        const uniqueWords = new Set(words);
        const lexicalDensity = uniqueWords.size / words.length;

        // Semantic complexity: based on technical terms
        const technicalTerms = /\b(api|architecture|component|interface|implementation|module|system|pattern|algorithm)\b/gi;
        const techMatches = prompt.match(technicalTerms) || [];
        const semanticComplexity = Math.min(1, techMatches.length / 10);

        // Ambiguity score: presence of vague terms
        const vagueTerms = /\b(some|maybe|perhaps|possibly|might|could|somehow|somewhat)\b/gi;
        const vagueMatches = prompt.match(vagueTerms) || [];
        const ambiguityScore = Math.max(0, 1 - (vagueMatches.length / wordCount));

        // Architectural depth: mentions of architectural concepts
        const archTerms = /\b(adr|decision|invariant|constraint|pattern|architecture|design|structure)\b/gi;
        const archMatches = prompt.match(archTerms) || [];
        const architecturalDepth = Math.min(1, archMatches.length / 5);

        // Overall optimization score
        const contextRichness = request.history ? 0.2 : 0 + (request.adrs?.length || 0) * 0.1;
        const overallScore = Math.min(1, (
            0.3 * lexicalDensity +
            0.2 * semanticComplexity +
            0.2 * (1 - ambiguityScore) +
            0.3 * architecturalDepth +
            contextRichness
        ));

        // Drift reduction estimate
        const driftReduction = request.biasReport ? Math.min(1, request.biasReport.biasScore * 0.8) : 0;

        // Optimization signals
        const signals = [];
        if (lexicalDensity > 0.7) signals.push("High lexical density");
        if (semanticComplexity > 0.5) signals.push("Rich technical context");
        if (ambiguityScore > 0.8) signals.push("Low ambiguity");
        if (architecturalDepth > 0.6) signals.push("Strong architectural awareness");
        if (driftReduction > 0.3) signals.push("Significant drift correction");
        signals.push("RCEP-encoded");

        return {
            overallScore,
            lexicalDensity,
            semanticComplexity,
            ambiguityScore,
            architecturalDepth,
            driftReduction,
            signals
        };
    }

    /****************************************************************************************
     * EXECUTION HINTS GENERATION
     * Provides guidance for optimal LLM execution
     ****************************************************************************************/
    private generateExecutionHints(prompt: string, metrics: any) {
        const hints = {
            recommendedModel: "claude-3.5-sonnet",
            temperatureRange: [0.3, 0.7] as [number, number],
            maxTokens: 4000,
            priorityContext: [] as string[]
        };

        // Adjust temperature based on task complexity
        if (metrics.semanticComplexity > 0.7) {
            hints.temperatureRange = [0.5, 0.8]; // More creativity for complex tasks
        } else if (metrics.architecturalDepth > 0.8) {
            hints.temperatureRange = [0.2, 0.5]; // More precision for architectural work
        }

        // Set token limit based on prompt length
        const promptTokens = Math.round(prompt.length * 0.25); // Rough token estimation
        hints.maxTokens = Math.max(1000, Math.min(8000, promptTokens * 2));

        // Priority context indicators
        if (prompt.includes("ARCHITECTURAL CONSTRAINTS")) {
            hints.priorityContext.push("architectural_constraints");
        }
        if (prompt.includes("CURRENT TASK CONTEXT")) {
            hints.priorityContext.push("active_tasks");
        }
        if (prompt.includes("DRIFT AWARENESS")) {
            hints.priorityContext.push("drift_correction");
        }

        return hints;
    }

    /****************************************************************************************
     * UTILITY HELPERS
     ****************************************************************************************/
    private mapFragmentTypeToLayer(type: string): string {
        const mapping = {
            adr: "architectural_decisions",
            history: "historical_context",
            blindspot: "blind_spots",
            plan: "planning_context",
            invariant: "constraints",
            pattern: "patterns"
        };
        return mapping[type] || type;
    }

    private calculateLayerWeight(type: string, fragments: ContextFragment[]): number {
        const baseWeight = {
            adr: 800,
            history: 600,
            blindspot: 700,
            plan: 900,
            invariant: 850,
            pattern: 500
        };

        const avgRelevance = fragments.reduce((sum, f) => sum + f.relevance, 0) / fragments.length;
        return Math.round((baseWeight[type] || 500) * avgRelevance);
    }

    private extractTopicName(fragment: ContextFragment): string {
        // Extract a concise topic name from fragment content
        const words = fragment.content.split(/\s+/);
        return words.slice(0, 3).join("_").toLowerCase();
    }

    private reconstructPromptFromContext(context: PromptContext): string {
        // Reconstruct a basic prompt from PromptContext
        const sections = [];

        if (context.topics.length > 0) {
            sections.push("## CONTEXT TOPICS");
            sections.push(...context.topics.map(t => `- ${t.name}`));
            sections.push("");
        }

        if (context.timeline.length > 0) {
            sections.push("## RECENT EVENTS");
            sections.push(`${context.timeline.length} events captured`);
            sections.push("");
        }

        if (context.decisions.length > 0) {
            sections.push("## DECISIONS");
            sections.push(`${context.decisions.length} decisions recorded`);
            sections.push("");
        }

        return sections.join("\n");
    }

    private enhanceIntentSpecificity(intent: string): string {
        // Add specificity enhancers based on intent analysis
        let enhanced = intent;

        // Add file context if missing
        if (!enhanced.includes("file") && !enhanced.includes("directory")) {
            enhanced += "\n\nPlease specify which files or components this task affects.";
        }

        // Add expected outcome if missing
        if (!enhanced.includes("should") && !enhanced.includes("expect") && !enhanced.includes("result")) {
            enhanced += "\n\nWhat should be the expected outcome or deliverable?";
        }

        return enhanced;
    }

    private estimateTokens(text: string): number {
        // Rough estimation: 1 token ≈ 4 characters
        return Math.ceil(text.length / 4);
    }

    private calculateOriginalSize(request: OptimizationRequest, fragments: ContextFragment[]): number {
        // Calculate original approximate size before RCEP compression
        let size = request.rawIntent.length;

        if (request.history) {
            size += JSON.stringify(request.history).length;
        }

        if (request.adrs) {
            size += JSON.stringify(request.adrs).length;
        }

        size += fragments.reduce((sum, f) => sum + f.content.length, 0);

        return size;
    }

    private generateSessionId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}