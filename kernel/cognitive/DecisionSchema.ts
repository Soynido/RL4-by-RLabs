/**
 * DecisionSchema - Modèle Cognitif Explicite
 * 
 * Définit la structure complète d'une décision cognitive générée par le LLM.
 * 
 * ⚠️ VERROU 2 : Séparation confidence LLM vs gate système
 * - confidence_llm : subjectif, généré par LLM (0-100)
 * - confidence_gate : mécanique, calculé par kernel ('pass'|'fail')
 * 
 * Référence : northstar.md Section 11.5
 */

import { EventType } from '../memory/types';

/**
 * Décision cognitive explicite générée par le LLM
 * 
 * Une décision n'est PAS une mémoire.
 * Une décision est un engagement cognitif explicite.
 */
export interface CognitiveDecision {
  // Identity
  id: string;                    // UUID v4
  seq: number;                   // Monotonic sequence (GlobalClock)
  timestamp: number;             // Unix timestamp (ms)
  isoTimestamp: string;          // ISO 8601
  
  // Core cognitive structure
  intent: string;                // KernelIntent.id (MANDATORY)
  intent_text: string;            // Human-readable intent
  
  context_refs: string[];         // MIL event IDs, ADR IDs, file paths
  options_considered: Array<{
    option: string;
    rationale: string;
    weight: number;              // 0-999
  }>;
  chosen_option: string;
  constraints: string[];         // Constraints that influenced decision
  
  invalidation_conditions: Array<{
    condition: string;
    trigger_event_types: EventType[]; // EventType enum values
    severity: 'critical' | 'warning' | 'info';
  }>;
  
  // Links
  previous_decisions: string[];  // Decision IDs that led to this
  related_adrs: string[];         // ADR IDs
  
  // ⚠️ VERROU 2 : Séparation confidence LLM vs gate système
  confidence_llm: number;            // 0-100 (subjectif, généré par LLM)
  confidence_gate: 'pass' | 'fail';  // Calculé par kernel (mécanique)
  
  // Calcul du gate (mécanique, dans DecisionExtractor)
  // confidence_gate = 'pass' si :
  //   - confidence_llm >= 95 ET intent.includes('rl4_update')
  //   - OU intent ne contient PAS 'rl4_update'
  //   - ET tous les context_refs existent (validés mécaniquement)
  
  validation_status: 'pending' | 'validated' | 'invalidated';
  
  // Storage
  rcep_ref: string;              // Reference to RCEP blob (source of truth)
  scf_generation_id?: string;    // SCF generation that produced this (optional, for audit)
}

