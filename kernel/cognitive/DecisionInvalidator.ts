/**
 * DecisionInvalidator - Vérification Mécanique des Conditions d'Invalidation
 * 
 * Vérifie mécaniquement si les conditions d'invalidation d'une décision sont remplies.
 * 
 * ⚠️ ZERO-INTELLIGENCE : Vérification purement mécanique, pas d'interprétation sémantique.
 * 
 * Référence : northstar.md Section 11.6
 */

import { MIL } from '../memory/MIL';
import { EventType } from '../memory/types';
import { ILogger } from '../core/ILogger';
import { DecisionStore, DecisionStatusEvent } from './DecisionStore';
import { CognitiveDecision } from './DecisionSchema';

export class DecisionInvalidator {
  constructor(
    private decisionStore: DecisionStore,
    private mil: MIL,
    private logger?: ILogger
  ) {}

  /**
   * Vérifie toutes les conditions d'invalidation pour toutes les décisions
   * 
   * ⚠️ MÉCANIQUE UNIQUEMENT : Vérifie si des événements déclencheurs existent dans MIL
   */
  async checkInvalidationConditions(): Promise<void> {
    // Récupérer toutes les décisions (depuis le cache ou le store)
    // Pour l'instant, on va itérer sur une plage temporelle large
    const now = Date.now();
    const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
    
    const decisions = await this.decisionStore.getByTimeRange(oneYearAgo, now);
    
    for (const decision of decisions) {
      // Vérifier si la décision a déjà été invalidée
      const decisionWithStatus = await this.decisionStore.getDecisionWithStatus(decision.id);
      if (decisionWithStatus?.status === 'invalidated') {
        continue; // Déjà invalidée, on passe
      }
      
      // Vérifier chaque condition d'invalidation
      for (const condition of decision.invalidation_conditions) {
        const shouldInvalidate = await this.checkCondition(decision, condition);
        
        if (shouldInvalidate) {
          // Trouver l'événement déclencheur (le plus récent qui correspond)
          const triggerEvent = await this.findTriggerEvent(condition.trigger_event_types, decision.timestamp);
          
          if (triggerEvent) {
            await this.decisionStore.invalidateDecision(
              decision.id,
              triggerEvent.id,
              `Condition triggered: ${condition.condition}`
            );
            
            this.logger?.info?.(`[DecisionInvalidator] Decision ${decision.id} invalidated due to condition: ${condition.condition}`);
          }
        }
      }
    }
  }

  /**
   * Vérifie si une condition d'invalidation est remplie
   * 
   * ⚠️ MÉCANIQUE : Vérifie uniquement l'existence d'événements déclencheurs
   */
  private async checkCondition(
    decision: CognitiveDecision,
    condition: { condition: string; trigger_event_types: EventType[]; severity: string }
  ): Promise<boolean> {
    // Récupérer les événements depuis la décision jusqu'à maintenant
    const startTime = decision.timestamp;
    const endTime = Date.now();
    
    // Récupérer les événements dans cette plage temporelle
    const events = await this.mil.queryTemporal(startTime, endTime, {
      type: condition.trigger_event_types[0] // Pour l'instant, on prend le premier type
    });
    
    // Vérifier si au moins un événement correspond aux types déclencheurs
    for (const event of events) {
      if (condition.trigger_event_types.includes(event.type)) {
        return true; // Condition remplie
      }
    }
    
    return false; // Condition non remplie
  }

  /**
   * Trouve l'événement déclencheur le plus récent
   */
  private async findTriggerEvent(
    triggerEventTypes: EventType[],
    sinceTimestamp: number
  ): Promise<{ id: string; type: EventType; timestamp: number } | null> {
    const now = Date.now();
    const events = await this.mil.queryTemporal(sinceTimestamp, now);
    
    // Trouver le premier événement qui correspond (le plus récent)
    for (const event of events.reverse()) { // Inverser pour avoir les plus récents en premier
      if (triggerEventTypes.includes(event.type)) {
        return {
          id: event.id,
          type: event.type,
          timestamp: event.timestamp
        };
      }
    }
    
    return null;
  }
}

