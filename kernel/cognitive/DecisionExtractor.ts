/**
 * DecisionExtractor - Extraction et Validation des Décisions Cognitives
 * 
 * Extrait les décisions cognitives depuis la réponse LLM et valide leur structure.
 * 
 * ⚠️ VERROU 2 : Calcul mécanique de confidence_gate
 * - confidence_llm : subjectif, généré par LLM (0-100)
 * - confidence_gate : mécanique, calculé par kernel ('pass'|'fail')
 * 
 * Référence : northstar.md Section 11.5
 */

import { v4 as uuidv4 } from 'uuid';
import { GlobalClock } from '../GlobalClock';
import { MIL } from '../memory/MIL';
import { ILogger } from '../core/ILogger';
import { DecisionStore } from './DecisionStore';
import { CognitiveDecision } from './DecisionSchema';

export class DecisionExtractor {
  private clock: GlobalClock;

  constructor(
    private decisionStore: DecisionStore,
    private mil: MIL,
    private logger?: ILogger
  ) {
    this.clock = GlobalClock.getInstance();
  }

  /**
   * Extrait les décisions cognitives depuis la réponse LLM
   * 
   * Format attendu : ```json:decisions\n[{...}]\n```
   */
  async extractFromResponse(llmResponse: string, rcepRef: string): Promise<CognitiveDecision[]> {
    // Extraire le bloc JSON des décisions
    const jsonMatch = llmResponse.match(/```json:decisions\s*\n([\s\S]*?)\n```/);
    if (!jsonMatch) {
      this.logger?.warning?.('[DecisionExtractor] No decisions block found in LLM response');
      return [];
    }
    
    let rawDecisions: any[];
    try {
      rawDecisions = JSON.parse(jsonMatch[1]);
    } catch (error) {
      this.logger?.error?.(`[DecisionExtractor] Failed to parse decisions JSON: ${error}`);
      return [];
    }
    
    // Valider et transformer chaque décision
    const decisions: CognitiveDecision[] = [];
    for (const raw of rawDecisions) {
      const decision = await this.validateDecision(raw, rcepRef);
      if (decision) {
        decisions.push(decision);
      }
    }
    
    return decisions;
  }

  /**
   * Valide une décision brute et calcule confidence_gate
   * 
   * ⚠️ VERROU 2 : Calcul mécanique de confidence_gate
   */
  private async validateDecision(raw: any, rcepRef: string): Promise<CognitiveDecision | null> {
    // Validation de base : intent obligatoire
    if (!raw.intent || !raw.intent.trim()) {
      this.logger?.warning?.('[DecisionExtractor] Decision rejected: missing intent');
      return null;
    }
    
    // Validation : confidence_llm obligatoire
    if (typeof raw.confidence_llm !== 'number' || raw.confidence_llm < 0 || raw.confidence_llm > 100) {
      this.logger?.warning?.('[DecisionExtractor] Decision rejected: invalid confidence_llm');
      return null;
    }
    
    // Validation : context_refs existent (mécanique)
    const validRefs = await this.validateContextRefs(raw.context_refs || []);
    if (!validRefs) {
      this.logger?.warning?.('[DecisionExtractor] Decision rejected: invalid context_refs');
      return null;
    }
    
    // ⚠️ VERROU 2 : Calcul mécanique de confidence_gate
    const confidenceGate = this.calculateConfidenceGate(raw);
    
    // Construire la décision complète
    const decision: CognitiveDecision = {
      id: raw.id || uuidv4(),
      seq: this.clock.next(),
      timestamp: Date.now(),
      isoTimestamp: new Date().toISOString(),
      
      intent: raw.intent,
      intent_text: raw.intent_text || raw.intent,
      
      context_refs: raw.context_refs || [],
      options_considered: raw.options_considered || [],
      chosen_option: raw.chosen_option || '',
      constraints: raw.constraints || [],
      
      invalidation_conditions: raw.invalidation_conditions || [],
      previous_decisions: raw.previous_decisions || [],
      related_adrs: raw.related_adrs || [],
      
      // ⚠️ VERROU 2 : Séparation confidence LLM vs gate système
      confidence_llm: raw.confidence_llm,
      confidence_gate: confidenceGate,
      
      validation_status: confidenceGate === 'pass' ? 'validated' : 'pending',
      
      rcep_ref: rcepRef,
      scf_generation_id: raw.scf_generation_id
    };
    
    return decision;
  }

  /**
   * ⚠️ VERROU 2 : Calcul mécanique de confidence_gate
   * 
   * confidence_gate = 'pass' si :
   *   - confidence_llm >= 95 ET intent.includes('rl4_update')
   *   - OU intent ne contient PAS 'rl4_update'
   *   - ET tous les context_refs existent (validés mécaniquement)
   */
  private calculateConfidenceGate(raw: any): 'pass' | 'fail' {
    const isRL4Update = raw.intent.includes('rl4_update');
    
    // Si c'est un RL4 update, confidence doit être >= 95%
    if (isRL4Update) {
      if (raw.confidence_llm >= 95) {
        return 'pass';
      } else {
        return 'fail';
      }
    }
    
    // Si ce n'est pas un RL4 update, on accepte (mais on valide quand même les refs)
    return 'pass';
  }

  /**
   * Valide que tous les context_refs existent (mécanique)
   * 
   * Vérifie que les event IDs existent dans MIL
   */
  private async validateContextRefs(contextRefs: string[]): Promise<boolean> {
    // Pour chaque ref, vérifier si c'est un event ID, ADR ID, ou file path
    // Pour l'instant, on valide seulement que les refs ne sont pas vides
    // Une validation plus poussée nécessiterait d'interroger MIL et ADR parser
    
    // Validation minimale : pas de refs vides
    for (const ref of contextRefs) {
      if (!ref || !ref.trim()) {
        return false;
      }
    }
    
    // TODO: Validation plus poussée (vérifier existence dans MIL)
    // Pour l'instant, on accepte toutes les refs non vides
    
    return true;
  }
}

