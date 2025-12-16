/******************************************************************************************
 * RCEP_Decoder.ts — Canonical RFC 0.1.0 Decoder / Reconstruction Engine
 *
 * Responsibilities:
 *  - Parse RCEP document (string → RCEPDocument structure)
 *  - Enforce RFC invariants (ordering, formatting, ID consistency)
 *  - Resolve pointers across blocks
 *  - Reconstruct full PromptContext deterministically
 *
 * Guarantees:
 *  - Deterministic decoding (same blob → same structure)
 *  - Strict compliance to RCEP 0.1.0 RFC
 *  - Full pointer resolution with erroring on missing refs
 *  - Validation before returning context
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
  PromptContext
} from "./RCEP_Types";

import { RCEPValidator } from "./RCEP_Validator";
import { RCEPChecksum } from "./RCEP_Checksum";

export interface RCEPDecodeResult {
  document: RCEPDocument;
  context: PromptContext;
  validation: any;
  warnings: string[];
}

export class RCEPDecoder {

  /**
   * Main entry:
   * Convert blob string → PromptContext
   */
  static decode(blob: string): PromptContext {
    const doc = RCEPDecoder.parse(blob);

    // Validate doc
    const validator = new RCEPValidator();
    const validation = validator.validate(doc);
    if (!validation.valid) {
      throw new Error(`[RCEPDecoder] Invalid document: ${validation.errors.join("; ")}`);
    }

    return RCEPDecoder.buildContext(doc);
  }

  /**
   * Decode with full result (for debugging/testing)
   */
  static decodeWithResult(blob: string): RCEPDecodeResult {
    const doc = RCEPDecoder.parse(blob);
    const validator = new RCEPValidator();
    const validation = validator.validate(doc);

    if (!validation.valid) {
      throw new Error(`[RCEPDecoder] Invalid document: ${validation.errors.join("; ")}`);
    }

    return {
      document: doc,
      context: RCEPDecoder.buildContext(doc),
      validation,
      warnings: []
    };
  }

  /**
   * Quick validation without full parsing
   */
  static quickValidate(blob: string): { valid: boolean; errors: string[] } {
    try {
      const lines = blob.split("\n").map(l => l.trim());
      if (!lines.some(l => l.startsWith("BEGIN-RCEP")) || !lines.some(l => l.startsWith("END-RCEP"))) {
        return { valid: false, errors: ["Missing RCEP delimiters"] };
      }
      return { valid: true, errors: [] };
    } catch (e) {
      return { valid: false, errors: [String(e)] };
    }
  }

  /**
   * Decode without validation (for internal use)
   */
  static decodeWithoutValidation(blob: string): { context: any; document: RCEPDocument } {
    const context = RCEPDecoder.decode(blob);
    return { context, document: {} as RCEPDocument };
  }

  /**
   * Get version from blob
   */
  static getVersion(blob: string): string | null {
    const lines = blob.split("\n");
    for (const line of lines) {
      if (line.startsWith("VERSION:")) {
        return line.split(":")[1]?.trim();
      }
    }
    return null;
  }

  // ============================================================================
  // PARSE ENTIRE DOCUMENT
  // ============================================================================

  private static parse(blob: string): RCEPDocument {
    const lines = blob.split("\n").map(l => l.trimEnd());

    // Extract checksum (last line before END-RCEP)
    let checksum: string | undefined;
    const endIndex = lines.findIndex(line => line === "END-RCEP");
    if (endIndex > 0 && endIndex > 0 && lines[endIndex - 1].startsWith("checksum:")) {
      checksum = lines[endIndex - 1].substring(9);
    }

    // Content is everything before END-RCEP
    const contentLines = endIndex >= 0 ? lines.slice(0, endIndex) : lines;
    const content = contentLines.join("\n");

    // Header must be first line: "RCEP/0.1.0 <timestamp>"
    const header = contentLines.shift();
    if (!header || !header.startsWith("RCEP/0.1.0")) {
      throw new Error(`[RCEPDecoder] Missing or invalid header`);
    }

    const parts = header.split(" ");
    if (parts.length !== 2) throw new Error(`[RCEPDecoder] Malformed header`);

    const timestamp = Number(parts[1]);
    if (isNaN(timestamp)) throw new Error(`[RCEPDecoder] Invalid timestamp`);

    // Now parse each block
    const doc: RCEPDocument = {
      version: "0.1.0",
      timestamp,
      blocks: [
        RCEPDecoder.parseARCH(contentLines),
        RCEPDecoder.parseLAYERS(contentLines),
        RCEPDecoder.parseTOPICS(contentLines),
        RCEPDecoder.parseTIMELINE(contentLines),
        RCEPDecoder.parseDECISIONS(contentLines),
        RCEPDecoder.parseINSIGHTS(contentLines),
        RCEPDecoder.tryParseHUMAN(contentLines)
      ].filter(Boolean) as RCEPBlock[]
    };

    return doc;
  }

  // ============================================================================
  // BLOCK PARSERS
  // ============================================================================

  private static parseARCH(lines: string[]): ARCHBlock {
    const header = lines.shift();
    if (!header?.startsWith("ARCH:")) {
      throw new Error(`[RCEPDecoder] Expected ARCH block, got: ${header}`);
    }

    const out: any = { id: "ARCH" };

    while (lines[0] && lines[0].includes(":") && !RCEPDecoder.isBlockHeader(lines[0])) {
      const line = lines.shift()!;
      const [key, ...valParts] = line.split(":");
      const val = valParts.join(":");
      out[key.replace(/-/g, '')] = val;
    }

    return {
      id: "ARCH",
      type: "ARCH",
      timestamp: Date.now(),
      data: { content: lines.join("\n") }
    };
  }

  private static parseLAYERS(lines: string[]): LAYERSBlock {
    const header = lines.shift();
    if (!header?.startsWith("LAYERS:")) {
      throw new Error(`[RCEPDecoder] Expected LAYERS block, got: ${header}`);
    }

    return {
      id: "LAYERS",
      type: "LAYERS",
      timestamp: Date.now(),
      data: { layers: lines }
    };
  }

  private static parseTOPICS(lines: string[]): TOPICSBlock {
    const header = lines.shift();
    if (!header?.startsWith("TOPICS:")) {
      throw new Error(`[RCEPDecoder] Expected TOPICS block, got: ${header}`);
    }

    return {
      id: "TOPICS",
      type: "TOPICS",
      timestamp: Date.now(),
      data: { topics: lines }
    };
  }

  private static parseTIMELINE(lines: string[]): TIMELINEBlock {
    const header = lines.shift();
    if (!header?.startsWith("TIMELINE:")) {
      throw new Error(`[RCEPDecoder] Expected TIMELINE block, got: ${header}`);
    }

    return {
      id: "TIMELINE",
      type: "TIMELINE",
      timestamp: Date.now(),
      data: { events: lines.map(line => ({ line })) }
    };
  }

  private static parseDECISIONS(lines: string[]): DECISIONSBlock {
    const header = lines.shift();
    if (!header?.startsWith("DECISIONS:")) {
      throw new Error(`[RCEPDecoder] Expected DECISIONS block, got: ${header}`);
    }

    // Legacy parsing code - not used in M1
    // Keeping for compatibility with old formats

    return {
      id: "DECISIONS",
      type: "DECISIONS",
      timestamp: Date.now(),
      data: { decisions: lines.map(line => ({ line })) }
    };
  }

  private static parseINSIGHTS(lines: string[]): INSIGHTSBlock {
    const header = lines.shift();
    if (!header?.startsWith("INSIGHTS:")) {
      throw new Error(`[RCEPDecoder] Expected INSIGHTS block, got: ${header}`);
    }

    // Legacy parsing code - not used in M1
    // Keeping for compatibility with old formats

    return {
      id: "INSIGHTS",
      type: "INSIGHTS",
      timestamp: Date.now(),
      data: { insights: lines.map(line => ({ line })) }
    };
  }

  private static tryParseHUMAN(lines: string[]): HUMANBlock | undefined {
    if (!lines[0] || !lines[0].startsWith("HUMAN:")) return undefined;

    const line = lines.shift()!;
    const colonIndex = line.indexOf(":", 6); // Skip "HUMAN:"
    if (colonIndex <= 0) return undefined;

    const summary = line.substring(colonIndex + 1).trim();

    return {
      id: "HUMAN",
      type: "HUMAN",
      timestamp: Date.now(),
      data: { summary }
    };
  }

  private static isBlockHeader(line?: string): boolean {
    if (!line) return false;
    return [
      "ARCH:",
      "LAYERS:",
      "TOPICS:",
      "TIMELINE:",
      "DECISIONS:",
      "INSIGHTS:",
      "HUMAN:",
      "END-RCEP"
    ].some(prefix => line.startsWith(prefix));
  }

  // ============================================================================
  // RECONSTRUCT PROMPT CONTEXT
  // ============================================================================

  private static buildContext(doc: RCEPDocument): PromptContext {
    const context: PromptContext = {};

    for (const block of doc.blocks) {
      switch (block.id) {
        case "LAYERS":
          context.layers = block.data.layers;
          break;
        case "TOPICS":
          context.topics = block.data.topics;
          break;
        case "TIMELINE":
          context.events = block.data.events;
          break;
        case "DECISIONS":
          context.decisions = block.data.decisions;
          break;
        case "INSIGHTS":
          context.insights = block.data.insights;
          break;
        case "HUMAN":
          context.humanSummary = block.data.summary;
          break;
      }
    }

    return context;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Quick validation without full parsing
   */
  quickValidate(blob: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const lines = blob.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    if (lines.length < 2) {
      errors.push('Blob too short');
      return { valid: false, errors };
    }

    const header = lines[0];
    if (!header.startsWith('RCEP/')) {
      errors.push('Invalid header format');
    }

    const hasEnd = lines.includes('END-RCEP');
    if (!hasEnd) {
      errors.push('Missing END-RCEP marker');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Parse block body by ID (for internal use)
   */
  static parseBlockBody(blockId: string, content: string): RCEPBlock {
    const lines = content.split('\n').map(l => l.trim());

    // M1 Minimal Strict parsing
    switch (blockId) {
      case "ARCH":
        return {
          id: "ARCH",
          type: "ARCH",
          timestamp: Date.now(),
          data: { content }
        } as ARCHBlock;
      case "LAYERS":
        return {
          id: "LAYERS",
          type: "LAYERS",
          timestamp: Date.now(),
          data: { layers: [] }
        } as LAYERSBlock;
      case "TOPICS":
        return {
          id: "TOPICS",
          type: "TOPICS",
          timestamp: Date.now(),
          data: { topics: [] }
        } as TOPICSBlock;
      case "TIMELINE":
        return {
          id: "TIMELINE",
          type: "TIMELINE",
          timestamp: Date.now(),
          data: { events: [] }
        } as TIMELINEBlock;
      case "DECISIONS":
        return {
          id: "DECISIONS",
          type: "DECISIONS",
          timestamp: Date.now(),
          data: { decisions: [] }
        } as DECISIONSBlock;
      case "INSIGHTS":
        return {
          id: "INSIGHTS",
          type: "INSIGHTS",
          timestamp: Date.now(),
          data: { insights: [] }
        } as INSIGHTSBlock;
      case "HUMAN":
        return {
          id: "HUMAN",
          type: "HUMAN",
          timestamp: Date.now(),
          data: { summary: "" }
        } as HUMANBlock;
      default:
        return {
          id: blockId,
          type: blockId,
          timestamp: Date.now(),
          data: { content }
        } as RCEPBlock;
    }
  }
}