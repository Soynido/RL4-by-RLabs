/**
 * SCFCompressor - Compression Sémantique RCEP → RL4-SCF
 * 
 * Compresse un PromptContext (depuis RCEP) en SCFDocument (langage d'exécution cognitive).
 * 
 * ⚠️ VERROU 1 RENFORCÉ : Séparation Niveau A (kernel) et Niveau B (candidats)
 * - Niveau A : PHASE (temporel pur), refs, contraintes mécaniques
 * - Niveau B : PATTERN_CANDIDATE, CORRELATE_CANDIDATE, ANALYZE (queries suggérées)
 * 
 * ⚠️ ZERO-INTELLIGENCE : Détection mécanique uniquement, pas d'interprétation sémantique
 * 
 * Référence : northstar.md Section 11.4, 11.8 (Verrou 1)
 */

import { PromptContext } from '../context/types/PromptContext';
import { MIL } from '../memory/MIL';
import { DecisionStore } from '../cognitive/DecisionStore';
import { ILogger } from '../core/ILogger';
import { SCFDocument, SCFOperator, MechanicalSignal, SCFReferences } from './SCFTypes';

export class SCFCompressor {
  constructor(
    private mil: MIL,
    private decisionStore: DecisionStore,
    private logger?: ILogger
  ) {}

  /**
   * Compresse un PromptContext en SCFDocument
   */
  async compress(rcepContext: PromptContext, anchorEventId?: string): Promise<SCFDocument> {
    // Construire les références
    const refs = await this.buildReferences(rcepContext);
    
    // Générer les opérateurs kernel (Niveau A)
    const kernelOperators = this.generateKernelOperators(rcepContext, refs);
    
    // Détecter les signaux mécaniques
    const mechanicalSignals = await this.detectMechanicalSignals(rcepContext);
    
    // Générer les opérateurs candidats (Niveau B)
    const candidateOperators = this.generateCandidateOperators(mechanicalSignals, refs);
    
    // Construire le document SCF
    const anchor = {
      event_id: anchorEventId,
      timestamp: Date.now(),
      window_ms: this.calculateWindowMs(rcepContext)
    };
    
    return {
      version: 'scf-v1',
      anchor,
      refs,
      operators: [...kernelOperators, ...candidateOperators],
      constraints: {
        max_tokens: 8000, // Contrainte par défaut
        focus_areas: this.extractFocusAreas(rcepContext),
        forbidden_inferences: [] // À définir selon le contexte
      }
    };
  }

  /**
   * Construit les références depuis le PromptContext
   */
  private async buildReferences(context: PromptContext): Promise<SCFReferences> {
    const events: string[] = [];
    const decisions: string[] = [];
    const files: string[] = [];
    const patterns: string[] = [];
    
    // Extraire les event IDs depuis timeline
    for (const event of context.timeline) {
      if (event.ptr) {
        events.push(event.ptr);
      }
    }
    
    // Extraire les decision IDs
    for (const decision of context.decisions) {
      // Les decisions dans PromptContext ont des IDs numériques, on les convertit en strings
      decisions.push(`dec-${decision.id}`);
    }
    
    // Extraire les file paths depuis les topics (si disponibles)
    // TODO: Améliorer l'extraction des fichiers depuis le contexte
    
    return { events, decisions, files, patterns };
  }

  /**
   * Niveau A — Kernel (autorisé) : PHASE (temporel pur), refs, contraintes mécaniques
   */
  private generateKernelOperators(context: PromptContext, refs: SCFReferences): SCFOperator[] {
    const operators: SCFOperator[] = [];
    
    // Détecter les phases temporelles (mécanique pur)
    const phases = this.detectTemporalPhases(context);
    for (const phase of phases) {
      operators.push({
        op: 'PHASE',
        name: phase.name,
        events: phase.events,
        duration_ms: phase.duration_ms
      });
    }
    
    return operators;
  }

  /**
   * Détecte les phases temporelles (mécanique pur)
   */
  private detectTemporalPhases(context: PromptContext): Array<{ name: string; events: string[]; duration_ms: number }> {
    const phases: Array<{ name: string; events: string[]; duration_ms: number }> = [];
    
    if (context.timeline.length === 0) {
      return phases;
    }
    
    // Trier les événements par temps
    const sortedEvents = [...context.timeline].sort((a, b) => a.time - b.time);
    
    // Détecter les phases par clusters temporels (mécanique : distance temporelle)
    const phaseThreshold = 300000; // 5 minutes
    let currentPhase: { name: string; events: string[]; start: number; end: number } | null = null;
    
    for (const event of sortedEvents) {
      if (!currentPhase) {
        currentPhase = {
          name: `Phase-${phases.length + 1}`,
          events: [event.ptr || `evt-${event.id}`],
          start: event.time,
          end: event.time
        };
      } else {
        const timeSinceLastEvent = event.time - currentPhase.end;
        if (timeSinceLastEvent <= phaseThreshold) {
          // Même phase
          currentPhase.events.push(event.ptr || `evt-${event.id}`);
          currentPhase.end = event.time;
        } else {
          // Nouvelle phase
          phases.push({
            name: currentPhase.name,
            events: currentPhase.events,
            duration_ms: currentPhase.end - currentPhase.start
          });
          currentPhase = {
            name: `Phase-${phases.length + 2}`,
            events: [event.ptr || `evt-${event.id}`],
            start: event.time,
            end: event.time
          };
        }
      }
    }
    
    if (currentPhase) {
      phases.push({
        name: currentPhase.name,
        events: currentPhase.events,
        duration_ms: currentPhase.end - currentPhase.start
      });
    }
    
    return phases;
  }

  /**
   * ⚠️ VERROU 1 RENFORCÉ : Détection purement mécanique, retourne MechanicalSignal[]
   * 
   * ZÉRO INTELLIGENCE : Fréquence, proximité, répétition (scalars uniquement)
   */
  private async detectMechanicalSignals(context: PromptContext): Promise<MechanicalSignal[]> {
    const signals: MechanicalSignal[] = [];
    
    // Signal 1 : Fréquence (compter occurrences d'event types)
    const eventTypeCounts = new Map<string, number>();
    for (const event of context.timeline) {
      const type = event.type;
      eventTypeCounts.set(type, (eventTypeCounts.get(type) || 0) + 1);
    }
    
    for (const [type, count] of eventTypeCounts.entries()) {
      if (count > 1) {
        const eventIds = context.timeline
          .filter(e => e.type === type)
          .map(e => e.ptr || `evt-${e.id}`);
        
        signals.push({
          type: 'frequency',
          events: eventIds,
          metric: count // Scalar pur
        });
      }
    }
    
    // Signal 2 : Proximité (distance temporelle/spatiale - scalar uniquement)
    if (context.timeline.length >= 2) {
      const sortedEvents = [...context.timeline].sort((a, b) => a.time - b.time);
      for (let i = 0; i < sortedEvents.length - 1; i++) {
        const timeDiff = sortedEvents[i + 1].time - sortedEvents[i].time;
        if (timeDiff < 60000) { // Moins d'1 minute
          signals.push({
            type: 'proximity',
            events: [
              sortedEvents[i].ptr || `evt-${sortedEvents[i].id}`,
              sortedEvents[i + 1].ptr || `evt-${sortedEvents[i + 1].id}`
            ],
            metric: timeDiff // Scalar pur (ms)
          });
        }
      }
    }
    
    // Signal 3 : Répétition (séquences identiques - structure uniquement)
    // TODO: Implémenter détection de répétition mécanique
    
    return signals;
  }

  /**
   * Niveau B — Cognition LLM (interdite au kernel) : Transforme MechanicalSignal[] en candidats
   */
  private generateCandidateOperators(signals: MechanicalSignal[], refs: SCFReferences): SCFOperator[] {
    const operators: SCFOperator[] = [];
    
    // Transformer les signaux de fréquence en PATTERN_CANDIDATE
    const frequencySignals = signals.filter(s => s.type === 'frequency');
    for (const signal of frequencySignals) {
      operators.push({
        op: 'PATTERN_CANDIDATE',
        id: `pattern-freq-${signal.events.length}`,
        events: signal.events,
        confidence: Math.min(95, signal.metric * 10), // Mécanique : confidence basée sur fréquence
        rationale: `High frequency: ${signal.metric} occurrences`,
        based_on: [signal]
      });
    }
    
    // Transformer les signaux de proximité en CORRELATE_CANDIDATE
    const proximitySignals = signals.filter(s => s.type === 'proximity');
    for (const signal of proximitySignals) {
      if (signal.events.length >= 2) {
        operators.push({
          op: 'CORRELATE_CANDIDATE',
          from: signal.events[0],
          to: signal.events[1],
          type: 'temporal',
          strength: Math.max(0, 100 - signal.metric / 1000), // Mécanique : strength inversement proportionnelle à distance
          rationale: `Temporal proximity: ${signal.metric}ms`,
          based_on: [signal]
        });
      }
    }
    
    // Ajouter ANALYZE (queries suggérées)
    operators.push({
      op: 'ANALYZE',
      target: 'context',
      queries: [
        'What architectural decisions were made?',
        'What patterns emerge from the timeline?',
        'What correlations exist between events?'
      ]
    });
    
    // Ajouter GENERATE (instructions)
    operators.push({
      op: 'GENERATE',
      outputs: ['decisions', 'correlations', 'patterns', 'intentions', 'context_summary']
    });
    
    return operators;
  }

  /**
   * Calcule la fenêtre temporelle en ms
   */
  private calculateWindowMs(context: PromptContext): number {
    if (context.timeline.length === 0) {
      return 3600000; // 1 heure par défaut
    }
    
    const sortedEvents = [...context.timeline].sort((a, b) => a.time - b.time);
    const start = sortedEvents[0].time;
    const end = sortedEvents[sortedEvents.length - 1].time;
    
    return end - start;
  }

  /**
   * Extrait les zones de focus depuis le contexte
   */
  private extractFocusAreas(context: PromptContext): string[] {
    const areas: string[] = [];
    
    // Extraire depuis les topics (si disponibles)
    for (const topic of context.topics) {
      if (topic.weight > 500) { // Seuil mécanique
        areas.push(topic.name);
      }
    }
    
    return areas;
  }

  /**
   * Décompresse un SCFDocument en prompt Markdown (via SCFFormatter)
   */
  async decompress(scf: SCFDocument): Promise<string> {
    // Cette méthode sera implémentée par SCFFormatter
    // Pour l'instant, on retourne une représentation basique
    return JSON.stringify(scf, null, 2);
  }
}

