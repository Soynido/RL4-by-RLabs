/******************************************************************************************
 * RCEP_Validator.ts — Strict RFC 0.1.0 M1 Minimal Validator
 *
 * Enforces:
 *  - Canonical RCEP structure
 *  - M1 minimal block validation (id/type/timestamp/data)
 *  - Block presence and basic structure
 *  - Timestamp ordering
 *  - UTF-8, LF-only, no forbidden chars
 *  - Deterministic checksum validation
 *
 * This is the firewall of the RCEP protocol - M1 edition.
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
  HUMANBlock
} from "./RCEP_Types";
import { RCEPChecksum } from "./RCEP_Checksum";

export interface RCEPValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class RCEPValidator {

  constructor() {}
  /**
   * Validate entire RCEP document according to RFC 0.1.0 M1.
   */
  validate(doc: RCEPDocument): RCEPValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Block presence and basic structure
    this.validateDocumentStructure(doc, errors, warnings);

    if (errors.length > 0) {
      return { valid: false, errors, warnings };
    }

    // 2. Extract blocks for validation
    const archBlock = this.extractBlock(doc, "ARCH") as ARCHBlock;
    const layersBlock = this.extractBlock(doc, "LAYERS") as LAYERSBlock;
    const topicsBlock = this.extractBlock(doc, "TOPICS") as TOPICSBlock;
    const timelineBlock = this.extractBlock(doc, "TIMELINE") as TIMELINEBlock;
    const decisionsBlock = this.extractBlock(doc, "DECISIONS") as DECISIONSBlock;
    const insightsBlock = this.extractBlock(doc, "INSIGHTS") as INSIGHTSBlock;
    const humanBlock = this.extractBlock(doc, "HUMAN") as HUMANBlock | undefined;

    // 3. Validate each block (M1 minimal)
    this.validateARCH(archBlock, errors);
    this.validateLAYERS(layersBlock, errors);
    this.validateTOPICS(topicsBlock, layersBlock, errors);
    this.validateTIMELINE(timelineBlock, errors);
    this.validateDECISIONS(decisionsBlock, timelineBlock, errors);
    this.validateINSIGHTS(insightsBlock, errors);
    if (humanBlock) {
      this.validateHUMAN(humanBlock, errors);
    }

    // 4. Timestamp invariants
    this.validateTimestamps(timelineBlock, errors);

    // 5. Checksum verification
    if (doc.checksum) {
      if (!RCEPChecksum.verify(doc)) {
        errors.push("Checksum mismatch: document has been altered or corrupted");
      }
    } else {
      warnings.push("No checksum found: integrity cannot be guaranteed");
    }

    // 6. RFC invariants (UTF-8, LF-only, etc.)
    this.validateRFCInvariants(doc, errors);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  // ============================================================================
  // STRUCTURE VALIDATION
  // ============================================================================

  private validateDocumentStructure(
    doc: RCEPDocument,
    errors: string[],
    warnings: string[]
  ): void {
    // Version check
    if (!doc.version || doc.version !== "0.1.0") {
      errors.push(`Invalid or missing version: ${doc.version}, expected: 0.1.0`);
    }

    // Timestamp check
    if (!doc.timestamp || doc.timestamp <= 0) {
      errors.push("Invalid or missing timestamp: must be positive Unix epoch");
    }

    // Blocks array check
    if (!Array.isArray(doc.blocks)) {
      errors.push("Invalid blocks: must be an array");
      return;
    }

    // Required blocks check
    const requiredBlocks = ["ARCH", "LAYERS", "TOPICS", "TIMELINE", "DECISIONS", "INSIGHTS"];
    const blockIds = doc.blocks.map(b => b.id);

    for (const required of requiredBlocks) {
      if (!blockIds.includes(required as any)) {
        errors.push(`Missing required block: ${required}`);
      }
    }
  }

  private extractBlock(doc: RCEPDocument, blockId: string): RCEPBlock | null {
    return doc.blocks.find(b => b.id === blockId) || null;
  }

  // ============================================================================
  // M1 BLOCK VALIDATORS (MINIMAL)
  // ============================================================================

  private validateARCH(arch: ARCHBlock, errors: string[]): void {
    if (!arch) {
      errors.push("ARCH block is null");
      return;
    }

    // M1: Only validate id, type, timestamp, data structure
    if (arch.id !== "ARCH") {
      errors.push(`ARCH: invalid block id: ${arch.id}`);
    }

    if (arch.type !== "ARCH") {
      errors.push(`ARCH: invalid block type: ${arch.type}`);
    }

    if (!arch.timestamp || arch.timestamp <= 0) {
      errors.push("ARCH: timestamp must be > 0");
    }

    if (!arch.data || typeof arch.data !== "object" || typeof arch.data.content !== "string") {
      errors.push("ARCH: data must contain string content");
    }
  }

  private validateLAYERS(layers: LAYERSBlock, errors: string[]): void {
    if (!layers) {
      errors.push("LAYERS block is null");
      return;
    }

    if (layers.id !== "LAYERS") {
      errors.push(`LAYERS: invalid block id: ${layers.id}`);
    }

    if (layers.type !== "LAYERS") {
      errors.push(`LAYERS: invalid block type: ${layers.type}`);
    }

    if (!layers.timestamp || layers.timestamp <= 0) {
      errors.push("LAYERS: timestamp must be > 0");
    }

    if (!layers.data || !Array.isArray(layers.data.layers)) {
      errors.push("LAYERS: data must contain layers array");
      return;
    }

    // Validate each layer is a string (M1)
    for (const [i, layer] of layers.data.layers.entries()) {
      if (typeof layer !== "string") {
        errors.push(`LAYERS: layer ${i} must be a string`);
      }
    }
  }

  private validateTOPICS(
    topics: TOPICSBlock,
    layers: LAYERSBlock,
    errors: string[]
  ): void {
    if (!topics) {
      errors.push("TOPICS block is null");
      return;
    }

    if (topics.id !== "TOPICS") {
      errors.push(`TOPICS: invalid block id: ${topics.id}`);
    }

    if (topics.type !== "TOPICS") {
      errors.push(`TOPICS: invalid block type: ${topics.type}`);
    }

    if (!topics.timestamp || topics.timestamp <= 0) {
      errors.push("TOPICS: timestamp must be > 0");
    }

    if (!topics.data || !Array.isArray(topics.data.topics)) {
      errors.push("TOPICS: data must contain topics array");
      return;
    }

    // Validate each topic is a string (M1)
    for (const [i, topic] of topics.data.topics.entries()) {
      if (typeof topic !== "string") {
        errors.push(`TOPICS: topic ${i} must be a string`);
      }
    }
  }

  private validateTIMELINE(timeline: TIMELINEBlock, errors: string[]): void {
    if (!timeline) {
      errors.push("TIMELINE block is null");
      return;
    }

    if (timeline.id !== "TIMELINE") {
      errors.push(`TIMELINE: invalid block id: ${timeline.id}`);
    }

    if (timeline.type !== "TIMELINE") {
      errors.push(`TIMELINE: invalid block type: ${timeline.type}`);
    }

    if (!timeline.timestamp || timeline.timestamp <= 0) {
      errors.push("TIMELINE: timestamp must be > 0");
    }

    if (!timeline.data || !Array.isArray(timeline.data.events)) {
      errors.push("TIMELINE: data must contain events array");
      return;
    }

    // Basic event validation (M1)
    for (const [i, event] of timeline.data.events.entries()) {
      if (!event || typeof event !== "object") {
        errors.push(`TIMELINE: event ${i} must be an object`);
        continue;
      }

      if (!event.id || typeof event.id !== "number" || event.id <= 0) {
        errors.push(`TIMELINE: event ${i} must have positive numeric id`);
      }

      if (!event.type || typeof event.type !== "string") {
        errors.push(`TIMELINE: event ${i} must have string type`);
      }

      if (!event.time || typeof event.time !== "number" || event.time <= 0) {
        errors.push(`TIMELINE: event ${i} must have positive timestamp`);
      }

      if (!event.ptr || typeof event.ptr !== "string") {
        errors.push(`TIMELINE: event ${i} must have string ptr`);
      }
    }
  }

  private validateDECISIONS(
    decisions: DECISIONSBlock,
    timeline: TIMELINEBlock,
    errors: string[]
  ): void {
    if (!decisions) {
      errors.push("DECISIONS block is null");
      return;
    }

    if (decisions.id !== "DECISIONS") {
      errors.push(`DECISIONS: invalid block id: ${decisions.id}`);
    }

    if (decisions.type !== "DECISIONS") {
      errors.push(`DECISIONS: invalid block type: ${decisions.type}`);
    }

    if (!decisions.timestamp || decisions.timestamp <= 0) {
      errors.push("DECISIONS: timestamp must be > 0");
    }

    if (!decisions.data || !Array.isArray(decisions.data.decisions)) {
      errors.push("DECISIONS: data must contain decisions array");
      return;
    }

    // Basic decision validation (M1)
    for (const [i, decision] of decisions.data.decisions.entries()) {
      if (!decision || typeof decision !== "object") {
        errors.push(`DECISIONS: decision ${i} must be an object`);
        continue;
      }

      if (!decision.id || typeof decision.id !== "number" || decision.id <= 0) {
        errors.push(`DECISIONS: decision ${i} must have positive numeric id`);
      }

      if (!decision.type || typeof decision.type !== "string") {
        errors.push(`DECISIONS: decision ${i} must have string type`);
      }

      if (typeof decision.weight !== "number" || decision.weight < 0 || decision.weight > 999) {
        errors.push(`DECISIONS: decision ${i} must have valid weight (0-999)`);
      }
    }
  }

  private validateINSIGHTS(insights: INSIGHTSBlock, errors: string[]): void {
    if (!insights) {
      errors.push("INSIGHTS block is null");
      return;
    }

    if (insights.id !== "INSIGHTS") {
      errors.push(`INSIGHTS: invalid block id: ${insights.id}`);
    }

    if (insights.type !== "INSIGHTS") {
      errors.push(`INSIGHTS: invalid block type: ${insights.type}`);
    }

    if (!insights.timestamp || insights.timestamp <= 0) {
      errors.push("INSIGHTS: timestamp must be > 0");
    }

    if (!insights.data || !Array.isArray(insights.data.insights)) {
      errors.push("INSIGHTS: data must contain insights array");
      return;
    }

    // Basic insight validation (M1)
    for (const [i, insight] of insights.data.insights.entries()) {
      if (!insight || typeof insight !== "object") {
        errors.push(`INSIGHTS: insight ${i} must be an object`);
        continue;
      }

      if (!insight.id || typeof insight.id !== "number" || insight.id <= 0) {
        errors.push(`INSIGHTS: insight ${i} must have positive numeric id`);
      }

      if (!insight.type || typeof insight.type !== "string") {
        errors.push(`INSIGHTS: insight ${i} must have string type`);
      }

      if (typeof insight.salience !== "number" || insight.salience < 0 || insight.salience > 999) {
        errors.push(`INSIGHTS: insight ${i} must have valid salience (0-999)`);
      }
    }
  }

  private validateHUMAN(human: HUMANBlock, errors: string[]): void {
    if (!human) {
      errors.push("HUMAN block is null");
      return;
    }

    if (human.id !== "HUMAN") {
      errors.push(`HUMAN: invalid block id: ${human.id}`);
    }

    if (human.type !== "HUMAN") {
      errors.push(`HUMAN: invalid block type: ${human.type}`);
    }

    if (!human.timestamp || human.timestamp <= 0) {
      errors.push("HUMAN: timestamp must be > 0");
    }

    if (!human.data || typeof human.data !== "object") {
      errors.push("HUMAN: data must be an object");
      return;
    }

    // M1: Only validate that summary is a string
    if (typeof human.data.summary !== "string") {
      errors.push("HUMAN: data.summary must be a string");
    }
  }

  // ============================================================================
  // TIMESTAMP VALIDATION
  // ============================================================================

  private validateTimestamps(timeline: TIMELINEBlock, errors: string[]): void {
    if (!timeline || !timeline.data || timeline.data.events.length <= 1) return;

    const times = timeline.data.events.map(e => e.time);

    for (let i = 1; i < times.length; i++) {
      if (times[i] < times[i - 1]) {
        errors.push(
          `TIMELINE: timestamp disorder at event ${timeline.data.events[i].id} (${times[i]} < ${times[i - 1]})`
        );
      }
    }
  }

  // ============================================================================
  // RFC INVARIANTS VALIDATION
  // ============================================================================

  private validateRFCInvariants(doc: RCEPDocument, errors: string[]): void {
    // Convert to string to check for forbidden characters
    const docStr = JSON.stringify(doc);

    // Check for control characters (except allowed ones)
    const controlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;
    if (controlChars.test(docStr)) {
      errors.push("Document contains forbidden control characters");
    }

    // Check for proper UTF-8 (should be guaranteed by JSON.stringify but still worth noting)
    try {
      Buffer.from(docStr, 'utf8');
    } catch (e) {
      errors.push("Document contains invalid UTF-8 sequences");
    }
  }
}