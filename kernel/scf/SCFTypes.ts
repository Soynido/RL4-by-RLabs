/**
 * SCFTypes - Types pour RL4-SCF (Semantic Compression Frame)
 * 
 * Définit la structure du langage d'exécution cognitive compressé.
 * 
 * ⚠️ VERROU 1 RENFORCÉ : MechanicalSignal pour garantir zéro intelligence dans le kernel
 * 
 * Référence : northstar.md Section 11.4
 */

import { EventType } from '../memory/types';

/**
 * Signal mécanique pur (zéro intelligence)
 * 
 * ⚠️ CRITIQUE : Aucune interprétation sémantique, aucun mot métier, aucune causalité implicite
 */
export interface MechanicalSignal {
  type: 'frequency' | 'proximity' | 'repetition';
  events: string[];  // Event IDs uniquement
  metric: number;    // Scalar pur (pas d'interprétation)
}

/**
 * Document SCF (Semantic Compression Frame)
 * 
 * Langage d'exécution cognitive compressé pour le LLM.
 * ⚠️ JETABLE : Toujours régénéré depuis RCEP, jamais stocké comme source de vérité.
 */
export interface SCFDocument {
  version: 'scf-v1';
  anchor: {
    event_id?: string;
    timestamp: number;
    window_ms: number;
  };
  refs: {
    events: string[];      // Event IDs
    decisions: string[];   // Decision IDs
    files: string[];       // File paths
    patterns: string[];    // Pattern IDs (candidats)
  };
  operators: SCFOperator[];
  constraints: {
    max_tokens?: number;
    focus_areas?: string[];
    forbidden_inferences?: string[];
  };
}

/**
 * Opérateur SCF
 * 
 * Niveau A (kernel) : PHASE (temporel pur)
 * Niveau B (candidats) : PATTERN_CANDIDATE, CORRELATE_CANDIDATE, ANALYZE, GENERATE
 */
export type SCFOperator =
  | { op: 'PHASE'; name: string; events: string[]; duration_ms: number }  // Niveau A (kernel)
  | { op: 'PATTERN_CANDIDATE'; id: string; events: string[]; confidence: number; rationale: string; based_on: MechanicalSignal[] }  // Niveau B (candidat)
  | { op: 'CORRELATE_CANDIDATE'; from: string; to: string; type: 'temporal' | 'spatial' | 'semantic'; strength: number; rationale: string; based_on: MechanicalSignal[] }  // Niveau B (candidat)
  | { op: 'ANALYZE'; target: string; queries: string[] }  // Niveau B (queries suggérées)
  | { op: 'GENERATE'; outputs: string[] };  // Niveau B (instructions)

/**
 * Références SCF (pour résolution)
 */
export interface SCFReferences {
  events: string[];
  decisions: string[];
  files: string[];
  patterns: string[];
}

