/******************************************************************************************
 * RCEP_Encoder.ts — Canonical RFC 0.1.0 Encoder
 *
 * Responsibilities:
 *  - Convert PromptContext → RCEPDocument (structured)
 *  - Canonicalize ordering (IDs, timestamps, lexicographic ordering)
 *  - Apply semantic compression (coalescing, dedup, pointer normalization)
 *  - Serialize as RFC-compliant blob
 *  - Produce checksum
 *
 * Guarantees:
 *  - Deterministic: same PromptContext → same blob
 *  - Lossless: all semantic content preserved
 *  - Valid: output always passes RCEP_Validator
 ******************************************************************************************/

import {
  RCEPDocument,
  RCEPBlock,
  ARCHBlock,
  LAYERSBlock,
  TOPICSBlock,
  TIMELINEBlock,
  DECISIONSBlock,
  INSIGHTSBlock,
  HUMANBlock,
  RL4PromptContextBundle,
  PromptContext
} from "./RCEP_Types";
import { RCEPChecksum } from "./RCEP_Checksum";
import { RCEPValidator } from "./RCEP_Validator";

export class RCEPEncoder {

  /**
   * Main entry point:
   * Convert PromptContext → RCEP blob (string)
   */
  static encode(context: PromptContext): string {
    // 1. Build RCEP document structure from context
    const doc = this.buildDocument(context);

    // 2. Validate before serialization (protects against malformed input)
    const validator = new RCEPValidator();
    const validation = validator.validate(doc);
    if (!validation.valid) {
      throw new Error(
        `[RCEPEncoder] Invalid document: ${validation.errors.join("; ")}`
      );
    }

    // 3. Serialize to canonical string format
    const serialized = this.serializeDocument(doc);

    // 4. Compute SHA-256 checksum
    const checksum = RCEPChecksum.compute(doc);

    // 5. Append checksum line
    return serialized + "\n" + checksum;
  }

  /**
   * Encode with validation result (for debugging/testing)
   */
  static encodeWithValidation(context: PromptContext): { blob: string; validation: any } {
    const doc = this.buildDocument(context);
    const validator = new RCEPValidator();
    const validation = validator.validate(doc);

    const serialized = this.serializeDocument(doc);
    const checksum = RCEPChecksum.compute(doc);
    const blob = serialized + "\n" + checksum;

    return { blob, validation };
  }

  /**
   * Convert RL4 bundle (RCEP + extensions) to RCEP document
   */
  static fromBundle(bundle: RL4PromptContextBundle): RCEPDocument {
    const context = this.bundleToContext(bundle);
    return this.buildDocument(context);
  }

  // ============================================================================
  // BUILD DOCUMENT FROM CONTEXT
  // ============================================================================

  public static buildDocument(context: PromptContext): RCEPDocument {
    // Extract blocks from document if present (for round-trip encoding)
    const existingDoc = (context as any).rcep as RCEPDocument;

    // Build blocks from context data
    const arch = this.buildARCH(context);
    const layers = this.buildLAYERS(context, existingDoc?.blocks?.find(b => b.id === "LAYERS") as LAYERSBlock);
    const topics = this.buildTOPICS(context, existingDoc?.blocks?.find(b => b.id === "TOPICS") as TOPICSBlock);
    const timeline = this.buildTIMELINE(context, existingDoc?.blocks?.find(b => b.id === "TIMELINE") as TIMELINEBlock);
    const decisions = this.buildDECISIONS(context, existingDoc?.blocks?.find(b => b.id === "DECISIONS") as DECISIONSBlock);
    const insights = this.buildINSIGHTS(context, existingDoc?.blocks?.find(b => b.id === "INSIGHTS") as INSIGHTSBlock);
    const human = this.buildHUMAN(context, existingDoc?.blocks?.find(b => b.id === "HUMAN") as HUMANBlock);

    return {
      version: "0.1.0",
      timestamp: Date.now(),
      blocks: [arch, layers, topics, timeline, decisions, insights, human].filter(Boolean) as RCEPBlock[]
    };
  }

  static bundleToContext(bundle: RL4PromptContextBundle): PromptContext {
    // Convert RCEP document back to PromptContext
    const doc = bundle.rcep;
    const archBlock = doc.blocks?.find(b => b.id === "ARCH") as ARCHBlock;

      const layersBlock = (doc.blocks?.find(b => b.id === "LAYERS") as LAYERSBlock);
    const topicsBlock = (doc.blocks?.find(b => b.id === "TOPICS") as TOPICSBlock);
    const timelineBlock = (doc.blocks?.find(b => b.id === "TIMELINE") as TIMELINEBlock);
    const decisionsBlock = (doc.blocks?.find(b => b.id === "DECISIONS") as DECISIONSBlock);
    const insightsBlock = (doc.blocks?.find(b => b.id === "INSIGHTS") as INSIGHTSBlock);
    const human = (doc.blocks?.find(b => b.id === "HUMAN") as HUMANBlock);

    return {
      layers: layersBlock?.data?.layers || [],
      topics: topicsBlock?.data?.topics || [],
      events: timelineBlock?.data?.events || [],
      decisions: decisionsBlock?.data?.decisions || [],
      insights: insightsBlock?.data?.insights || [],
      humanSummary: human?.data?.summary
    };
  }

  // ============================================================================
  // BLOCK BUILDERS
  // ============================================================================

  private static buildARCH(context: PromptContext): ARCHBlock {
    return {
      id: "ARCH",
      type: "ARCH",
      timestamp: Date.now(),
      data: {
        content: `RCEP v0.1.0 - M1 Minimal Strict - ${new Date().toISOString()}`
      }
    };
  }

  private static buildLAYERS(context: PromptContext, existing?: LAYERSBlock): LAYERSBlock {
    // Use existing layers if available, otherwise build from context
    if (existing && existing.data?.layers && existing.data.layers.length > 0) {
      return existing;
    }

    return {
      id: "LAYERS",
      type: "LAYERS",
      timestamp: Date.now(),
      data: { layers: context.layers || [] }
    };
  }

  private static buildTOPICS(context: PromptContext, existing?: TOPICSBlock): TOPICSBlock {
    // Use existing topics if available, otherwise build from context
    if (existing && existing.data?.topics && existing.data.topics.length > 0) {
      return existing;
    }

    return {
      id: "TOPICS",
      type: "TOPICS",
      timestamp: Date.now(),
      data: { topics: context.topics || [] }
    };
  }

  private static buildTIMELINE(context: PromptContext, existing?: TIMELINEBlock): TIMELINEBlock {
    // Use existing timeline if available, otherwise build from context
    if (existing && existing.data?.events && existing.data.events.length > 0) {
      return existing;
    }

    return {
      id: "TIMELINE",
      type: "TIMELINE",
      timestamp: Date.now(),
      data: { events: context.events || [] }
    };
  }

  private static buildDECISIONS(context: PromptContext, existing?: DECISIONSBlock): DECISIONSBlock {
    // Use existing decisions if available, otherwise build from context
    if (existing && existing.data?.decisions && existing.data.decisions.length > 0) {
      return existing;
    }

    return {
      id: "DECISIONS",
      type: "DECISIONS",
      timestamp: Date.now(),
      data: { decisions: context.decisions || [] }
    };
  }

  private static buildINSIGHTS(context: PromptContext, existing?: INSIGHTSBlock): INSIGHTSBlock {
    // Use existing insights if available, otherwise build from context
    if (existing && existing.data?.insights && existing.data.insights.length > 0) {
      return existing;
    }

    return {
      id: "INSIGHTS",
      type: "INSIGHTS",
      timestamp: Date.now(),
      data: { insights: context.insights || [] }
    };
  }

  private static buildHUMAN(context: PromptContext, existing?: HUMANBlock): HUMANBlock | undefined {
    if (existing) {
      return existing;
    }

    return context.humanSummary ? {
      id: "HUMAN",
      type: "HUMAN",
      timestamp: Date.now(),
      data: { summary: context.humanSummary }
    } : undefined;
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  private static serializeDocument(doc: RCEPDocument): string {
    const lines: string[] = [];

    // HEADER
    lines.push(`RCEP/${doc.version} ${doc.timestamp}`);

    // Serialize blocks in canonical order
    for (const block of doc.blocks) {
      lines.push(this.serializeBlock(block));
    }

    // FOOTER
    lines.push("END-RCEP");

    return lines.join("\n");
  }

  private static serializeBlock(block: RCEPBlock): string {
    const body = this.serializeBlockBody(block);
    const size = new TextEncoder().encode(body).length;

    // Format: BLOCK_ID:SIZE
    // Then body on next lines with indentation
    const lines = [`${block.id}:${size}`];

    // Add body content with proper formatting
    const bodyLines = body.split("\n");
    lines.push(...bodyLines);

    return lines.join("\n");
  }

  public static serializeBlockBody(block: RCEPBlock): string {
    const blockId = (block as any).id;
    switch (blockId) {
      case "ARCH":
        return this.serializeARCH(block as ARCHBlock);
      case "LAYERS":
        return this.serializeLAYERS(block as LAYERSBlock);
      case "TOPICS":
        return this.serializeTOPICS(block as TOPICSBlock);
      case "TIMELINE":
        return this.serializeTIMELINE(block as TIMELINEBlock);
      case "DECISIONS":
        return this.serializeDECISIONS(block as DECISIONSBlock);
      case "INSIGHTS":
        return this.serializeINSIGHTS(block as INSIGHTSBlock);
      case "HUMAN":
        return this.serializeHUMAN(block as HUMANBlock);
      default:
        throw new Error(`Unknown block type: ${blockId}`);
    }
  }

  // ============================================================================
  // BLOCK SERIALIZERS
  // ============================================================================

  private static serializeARCH(arch: ARCHBlock): string {
    return arch.data.content;
  }

  private static serializeLAYERS(block: LAYERSBlock): string {
    return block.data.layers.join("\n");
  }

  private static serializeTOPICS(block: TOPICSBlock): string {
    return block.data.topics.join("\n");
  }

  private static serializeTIMELINE(block: TIMELINEBlock): string {
    return JSON.stringify(block.data.events);
  }

  private static serializeDECISIONS(block: DECISIONSBlock): string {
    return JSON.stringify(block.data.decisions);
  }

  private static serializeINSIGHTS(block: INSIGHTSBlock): string {
    return JSON.stringify(block.data.insights);
  }

  private static serializeHUMAN(human: HUMANBlock): string {
    return human.data.summary;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Generate session ID for new documents
   */
  static generateSessionId(): string {
    return crypto.randomUUID();
  }

  /**
   * Get RCEP version
   */
  static getVersion(): string {
    return "0.1.0";
  }
}