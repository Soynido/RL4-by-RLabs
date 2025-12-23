/**
 * PromptCodecRL4.ts — RCEP 0.1.0 Reference Codec (Phase 1)
 *
 * Implements the structure, interfaces, block definitions, error classes,
 * invariants and public API surface. Encoding/Decoding logic will be added
 * in Phase 2 for reliability and testability.
 */

import * as crypto from "crypto";
import { RCEPEncoder } from "./codec/RCEP_Encoder";
import { RCEPDecoder } from "./codec/RCEP_Decoder";
import { PromptContext as RCEPPromptContext } from "./codec/RCEP_Types";

/* --------------------------------------------------------------------------
 * RCEP Version
 * -------------------------------------------------------------------------- */
export const RCEP_VERSION = "0.1.0";

/* --------------------------------------------------------------------------
 * Error Types
 * -------------------------------------------------------------------------- */

export class RCEPError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "RCEPError";
  }
}

export class RCEPDecodeError extends RCEPError {
  constructor(msg: string) {
    super(msg);
    this.name = "RCEPDecodeError";
  }
}

export class RCEPEncodeError extends RCEPError {
  constructor(msg: string) {
    super(msg);
    this.name = "RCEPEncodeError";
  }
}

export class RCEPValidationError extends RCEPError {
  constructor(msg: string) {
    super(msg);
    this.name = "RCEPValidationError";
  }
}

/* --------------------------------------------------------------------------
 * Type Definitions — RL4 Prompt Context (Semantic Units)
 * -------------------------------------------------------------------------- */

export interface PromptContext {
  metadata: {
    sessionId: string;
    llmModel: string;
    contextWindow: number;
    encodingTime: number;
    ptrScheme: "mil-his-v1" | "internal-v1";
  };

  layers: Layer[];
  topics: Topic[];
  timeline: TimelineEvent[];
  decisions: Decision[];
  insights: Insight[];
  humanSummary?: {
    type: "brief" | "detailed" | "technical";
    text: string;
  };
}

export interface Layer {
  id: number;
  name: string;
  weight: number; // 0-999
  parent: number | "ROOT";
}

export interface Topic {
  id: number;
  name: string;
  weight: number; // 0-999
  refs: number[];
}

export interface TimelineEvent {
  id: number;
  time: number; // Unix timestamp
  type: "query" | "response" | "reflection" | "decision";
  ptr: string;
}

export interface Decision {
  id: number;
  type: "accept" | "reject" | "modify" | "defer";
  weight: number; // 0-999
  inputs: number[];
}

export interface Insight {
  id: number;
  type: "pattern" | "anomaly" | "correlation" | "causation";
  salience: number; // 0-999
  links: number[];
}

export interface RCEPBlob {
  version: string;
  content: string;
  checksum: string;
  minified: string;
  pretty: string;
}

/* --------------------------------------------------------------------------
 * Internal Canonical Model (post-parse)
 * -------------------------------------------------------------------------- */

export interface RCEPDocument {
  header: {
    version: string;
    timestamp: number;
  };

  blocks: {
    ARCH?: RCEPBlock;
    LAYERS?: RCEPBlock;
    TOPICS?: RCEPBlock;
    TIMELINE?: RCEPBlock;
    DECISIONS?: RCEPBlock;
    INSIGHTS?: RCEPBlock;
    HUMAN?: RCEPBlock;
  };

  footer: {
    checksum: string;
  };
}

export interface RCEPBlock {
  id: string;
  size: number;
  body: string;
}

/* --------------------------------------------------------------------------
 * Internal Helpers
 * -------------------------------------------------------------------------- */

export type CodecMode = "strict" | "permissive";

/**
 * Pointer resolution interface for MIL/HIS or external URI
 */
export interface PointerResolver {
  resolveInternal(ptr: string): any;
  resolveExternal?(ptr: string): Promise<any>;
  resolveMIL?(address: string, version: string): Promise<any>;
}

/* --------------------------------------------------------------------------
 * PromptCodecRL4 — PUBLIC API SURFACE
 * -------------------------------------------------------------------------- */

export class PromptCodecRL4 {

  private mode: CodecMode;
  private readonly version = RCEP_VERSION;

  constructor(mode: CodecMode = "strict") {
    this.mode = mode;
    // Validate runtime environment
    this.validateEnvironment();
  }

  /* ----------------------------------------------------------------------
   * PUBLIC API
   * ---------------------------------------------------------------------- */

  /**
   * Encode a PromptContext → RCEP encoded string
   */
  encode(ctx: PromptContext, pretty: boolean = false): RCEPBlob {
    // Convert PromptContext (PromptCodecRL4 type) to RCEPPromptContext (RCEP_Types)
    const rcepContext: RCEPPromptContext = {
      layers: ctx.layers.map(l => l.name),
      topics: ctx.topics.map(t => t.name),
      events: ctx.timeline.map(e => ({ id: e.id, time: e.time, type: e.type, ptr: e.ptr })),
      decisions: ctx.decisions.map(d => ({ id: d.id, type: d.type, weight: d.weight, inputs: d.inputs })),
      insights: ctx.insights.map(i => ({ id: i.id, type: i.type, salience: i.salience, links: i.links })),
      humanSummary: ctx.humanSummary?.text
    };
    
    // Encode using RCEPEncoder
    const rcepString = RCEPEncoder.encode(rcepContext);
    
    // Calculate checksum
    const checksum = this.sha256(rcepString);
    
    return {
      version: this.version,
      content: rcepString,
      checksum,
      minified: rcepString,
      pretty: pretty ? rcepString : rcepString
    };
  }

  /**
   * Decode RCEP string → PromptContext
   */
  decode(rcep: string): PromptContext {
    // Decode using RCEPDecoder (returns RCEPPromptContext)
    const rcepContext = RCEPDecoder.decode(rcep);
    
    // Convert RCEPPromptContext (RCEP_Types) to PromptContext (PromptCodecRL4 type)
    return {
      metadata: {
        sessionId: 'decoded',
        llmModel: 'unknown',
        contextWindow: 8000,
        encodingTime: Date.now(),
        ptrScheme: 'mil-his-v1'
      },
      layers: (rcepContext.layers || []).map((name, idx) => ({
        id: idx,
        name,
        weight: 500,
        parent: 'ROOT' as const
      })),
      topics: (rcepContext.topics || []).map((name, idx) => ({
        id: idx,
        name,
        weight: 500,
        refs: []
      })),
      timeline: (rcepContext.events || []).map((e: any, idx: number) => ({
        id: e.id || idx,
        time: e.time || Date.now(),
        type: e.type || 'query' as const,
        ptr: e.ptr || ''
      })),
      decisions: (rcepContext.decisions || []).map((d: any, idx: number) => ({
        id: d.id || idx,
        type: d.type || 'accept' as const,
        weight: d.weight || 500,
        inputs: d.inputs || []
      })),
      insights: (rcepContext.insights || []).map((i: any, idx: number) => ({
        id: i.id || idx,
        type: i.type || 'pattern' as const,
        salience: i.salience || 500,
        links: i.links || []
      })),
      humanSummary: rcepContext.humanSummary ? {
        type: 'brief' as const,
        text: rcepContext.humanSummary
      } : undefined
    };
  }

  /**
   * Validate RCEP document → throws on error
   */
  validate(rcep: string): void {
    // Implementation arrives in PHASE 2
    return;
  }

  /**
   * Verify checksum consistency
   */
  verifyChecksum(rcep: string): boolean {
    // Implementation arrives in PHASE 2
    return false;
  }

  /**
   * Get codec version
   */
  getVersion(): string {
    return this.version;
  }

  /* ----------------------------------------------------------------------
   * INTERNAL BUILDERS (placeholders, real logic in Phase 2)
   * ---------------------------------------------------------------------- */

  private buildARCH(ctx: PromptContext): RCEPBlock {
    return { id: "ARCH", size: 0, body: "" };
  }

  private buildLAYERS(ctx: PromptContext): RCEPBlock {
    return { id: "LAYERS", size: 0, body: "" };
  }

  private buildTOPICS(ctx: PromptContext): RCEPBlock {
    return { id: "TOPICS", size: 0, body: "" };
  }

  private buildTIMELINE(ctx: PromptContext): RCEPBlock {
    return { id: "TIMELINE", size: 0, body: "" };
  }

  private buildDECISIONS(ctx: PromptContext): RCEPBlock {
    return { id: "DECISIONS", size: 0, body: "" };
  }

  private buildINSIGHTS(ctx: PromptContext): RCEPBlock {
    return { id: "INSIGHTS", size: 0, body: "" };
  }

  private buildHUMAN(ctx: PromptContext): RCEPBlock | undefined {
    return undefined;
  }

  /* ----------------------------------------------------------------------
   * BLOCK PARSERS (PHASE 2 will implement fully)
   * ---------------------------------------------------------------------- */

  private parseARCH(body: string): PromptContext["metadata"] {
    throw new RCEPDecodeError("parseARCH not implemented");
  }

  private parseLAYERS(body: string): Layer[] {
    throw new RCEPDecodeError("parseLAYERS not implemented");
  }

  private parseTOPICS(body: string): Topic[] {
    throw new RCEPDecodeError("parseTOPICS not implemented");
  }

  private parseTIMELINE(body: string): TimelineEvent[] {
    throw new RCEPDecodeError("parseTIMELINE not implemented");
  }

  private parseDECISIONS(body: string): Decision[] {
    throw new RCEPDecodeError("parseDECISIONS not implemented");
  }

  private parseINSIGHTS(body: string): Insight[] {
    throw new RCEPDecodeError("parseINSIGHTS not implemented");
  }

  private parseHUMAN(body: string): PromptContext["humanSummary"] {
    throw new RCEPDecodeError("parseHUMAN not implemented");
  }

  /* ----------------------------------------------------------------------
   * INTERNAL UTILS — canonical ordering, hashing, safety checks
   * ---------------------------------------------------------------------- */

  private sha256(input: string): string {
    return crypto.createHash("sha256").update(input).digest("hex");
  }

  private canonicalSort<T>(items: T[], key: (t: T) => string | number): T[] {
    return [...items].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  }

  private validateEnvironment(): void {
    // Check required Node.js features
    if (typeof crypto === "undefined") {
      throw new RCEPError("Crypto module is required");
    }
  }
}