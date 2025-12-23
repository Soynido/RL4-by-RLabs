/**
 * CanonicalReplay - Objet Canonique pour Hash Juridiquement Défendable
 * 
 * ⚠️ VERROU 3 RENFORCÉ : Objet canonique pour hash déterministe
 * 
 * Garantit : même cognition logique → même hash, cognition différente → hash différent
 * 
 * Référence : Correction critique #3
 */

import { UnifiedEvent, EventType } from '../memory/types';
import { CognitiveDecision } from '../cognitive/DecisionSchema';
import { SCFDocument } from '../scf/SCFTypes';

export interface CanonicalReplay {
  events: Array<{
    id: string;
    seq: number;
    type: EventType;
    timestamp: number;
  }>;  // Champs strictement whitelistés
  decisions: Array<{
    id: string;
    intent: string;
    confidence_gate: 'pass' | 'fail';
  }>;  // Champs strictement whitelistés
  scf_ops: Array<{
    op: string;
    refs: string[];
    params: Record<string, any>;  // Sérialisation stable
  }>;  // Opérateurs SCF triés strictement
}

export class CanonicalReplayBuilder {
  /**
   * Construit un CanonicalReplay depuis events, decisions, scf
   * 
   * ⚠️ CRITIQUE : Tri strict et sérialisation canonique
   */
  static toCanonical(
    events: UnifiedEvent[],
    decisions: CognitiveDecision[],
    scf: SCFDocument
  ): CanonicalReplay {
    // Tri strict des events par seq
    const canonicalEvents = events
      .map(e => ({
        id: e.id,
        seq: e.seq,
        type: e.type,
        timestamp: e.timestamp
      }))
      .sort((a, b) => a.seq - b.seq);
    
    // Tri strict des decisions par seq
    const canonicalDecisions = decisions
      .map(d => ({
        id: d.id,
        intent: d.intent,
        confidence_gate: d.confidence_gate
      }))
      .sort((a, b) => {
        // Trouver les seq depuis les décisions originales
        const seqA = decisions.find(d => d.id === a.id)?.seq || 0;
        const seqB = decisions.find(d => d.id === b.id)?.seq || 0;
        return seqA - seqB;
      });
    
    // Tri strict des scf_ops par op puis refs
    const canonicalOps = scf.operators
      .map(op => ({
        op: op.op,
        refs: this.extractRefs(op),
        params: this.extractParams(op)
      }))
      .sort((a, b) => {
        if (a.op !== b.op) {
          return a.op.localeCompare(b.op);
        }
        return a.refs.join(',').localeCompare(b.refs.join(','));
      });
    
    return {
      events: canonicalEvents,
      decisions: canonicalDecisions,
      scf_ops: canonicalOps
    };
  }

  /**
   * Extrait les références d'un opérateur
   */
  private static extractRefs(op: any): string[] {
    if (op.events) return op.events;
    if (op.from && op.to) return [op.from, op.to];
    if (op.refs) return op.refs;
    return [];
  }

  /**
   * Extrait les paramètres d'un opérateur (sérialisation stable)
   */
  private static extractParams(op: any): Record<string, any> {
    const params: Record<string, any> = {};
    
    // Extraire les champs non-refs de manière stable
    for (const [key, value] of Object.entries(op)) {
      if (key !== 'op' && key !== 'events' && key !== 'from' && key !== 'to' && key !== 'refs') {
        params[key] = value;
      }
    }
    
    return params;
  }

  /**
   * Sérialise en JSON canonique (clés triées, format stable)
   */
  static toCanonicalJSON(canonical: CanonicalReplay): string {
    // Sérialiser avec clés triées
    return JSON.stringify(canonical, (key, value) => {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const sorted: Record<string, any> = {};
        for (const k of Object.keys(value).sort()) {
          sorted[k] = value[k];
        }
        return sorted;
      }
      return value;
    });
  }
}

