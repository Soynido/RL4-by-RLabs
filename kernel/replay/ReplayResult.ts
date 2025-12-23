/**
 * ReplayResult - Résultat d'un Replay Déterministe
 * 
 * Contient les événements, décisions, SCF régénéré, et hash déterministe.
 * 
 * ⚠️ VERROU 3 : SCF toujours régénéré depuis RCEP, jamais relu
 * 
 * Référence : northstar.md Section 11.7
 */

import { UnifiedEvent } from '../memory/types';
import { CognitiveDecision } from '../cognitive/DecisionSchema';
import { SCFDocument } from '../scf/SCFTypes';

export interface ReplayResult {
  events: UnifiedEvent[];
  decisions: CognitiveDecision[];
  scf: SCFDocument;  // ⚠️ VERROU 3 : toujours régénéré, jamais relu
  hash: string;      // Hash déterministe (juridiquement défendable)
  timestamp: number;
}

