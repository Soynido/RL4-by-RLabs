/******************************************************************************************
 * RCEP_Types.ts — RCEP 0.1.0 M1 Minimal Strict Types
 *
 * M1 Philosophy: Simple, robust, predictable, zero technical debt
 * Perfect for BUR v0.1 implementation
 ******************************************************************************************/

// ============================================================================
// VERSION CONSTANTS
// ============================================================================
export const RCEP_VERSION = "0.1.0";

// ============================================================================
// BASIC RCEP BLOCK TYPES (M1 Minimal Strict)
// ============================================================================

export interface ARCHBlock {
  id: "ARCH";
  type: "ARCH";
  timestamp: number;
  data: { content: string };
}

export interface LAYERSBlock {
  id: "LAYERS";
  type: "LAYERS";
  timestamp: number;
  data: { layers: string[] };
}

export interface TOPICSBlock {
  id: "TOPICS";
  type: "TOPICS";
  timestamp: number;
  data: { topics: string[] };
}

export interface TIMELINEBlock {
  id: "TIMELINE";
  type: "TIMELINE";
  timestamp: number;
  data: { events: any[] };
}

export interface DECISIONSBlock {
  id: "DECISIONS";
  type: "DECISIONS";
  timestamp: number;
  data: { decisions: any[] };
}

export interface INSIGHTSBlock {
  id: "INSIGHTS";
  type: "INSIGHTS";
  timestamp: number;
  data: { insights: any[] };
}

export interface HUMANBlock {
  id: "HUMAN";
  type: "HUMAN";
  timestamp: number;
  data: { summary: string };
}

// ============================================================================
// UNIFIED BLOCK TYPE
// ============================================================================
export type RCEPBlock =
  | ARCHBlock
  | LAYERSBlock
  | TOPICSBlock
  | TIMELINEBlock
  | DECISIONSBlock
  | INSIGHTSBlock
  | HUMANBlock;

// ============================================================================
// DOCUMENT & CONTEXT
// ============================================================================
export interface RCEPDocument {
  version: string;
  timestamp: number;
  blocks: RCEPBlock[];
  checksum?: string;
}

export interface PromptContext {
  layers?: string[];
  topics?: string[];
  events?: any[];
  decisions?: any[];
  insights?: any[];
  humanSummary?: string;
}

// ============================================================================
// LEGACY COMPATIBILITY (temporary)
// ============================================================================
export interface RL4PromptContextBundle {
  rcep: RCEPDocument;
  rl4?: any;
}

// ============================================================================
// VALIDATION RESULT
// ============================================================================
export interface RCEPValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface RCEPDecodeResult {
  document: RCEPDocument;
  context: PromptContext;
  validation: RCEPValidationResult;
  warnings: string[];
}