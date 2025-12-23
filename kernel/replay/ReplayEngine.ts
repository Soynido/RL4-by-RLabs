/**
 * ReplayEngine - Replay Déterministe de Trajectoires Cognitives
 * 
 * Rejoue une trajectoire cognitive de manière déterministe depuis RCEP (source de vérité).
 * 
 * ⚠️ VERROU 3 : SCF toujours régénéré depuis RCEP, jamais relu
 * ⚠️ VERROU 3 RENFORCÉ : Hash déterministe via CanonicalReplay
 * 
 * Référence : northstar.md Section 11.7
 */

import * as crypto from 'crypto';
import { MIL } from '../memory/MIL';
import { DecisionStore } from '../cognitive/DecisionStore';
import { RCEPStore } from '../storage/RCEPStore';
import { SCFCompressor } from '../scf/SCFCompressor';
import { PromptCodecRL4 } from '../rl4/PromptCodecRL4';
import { PromptContext } from '../context/types/PromptContext';
import { ILogger } from '../core/ILogger';
import { ReplayResult } from './ReplayResult';
import { CanonicalReplayBuilder } from './CanonicalReplay';

export class ReplayEngine {
  constructor(
    private mil: MIL,
    private decisionStore: DecisionStore,
    private rcepStore: RCEPStore,
    private scfCompressor: SCFCompressor,
    private rcepDecoder: PromptCodecRL4,
    private logger?: ILogger
  ) {}

  /**
   * Rejoue une trajectoire cognitive de manière déterministe
   * 
   * ⚠️ VERROU 3 : SCF toujours régénéré depuis RCEP, jamais relu
   */
  async replay(
    startTime: number,
    endTime: number,
    anchorEventId?: string
  ): Promise<ReplayResult> {
    // 1. Load RCEP blobs (source de vérité)
    const rcepBlobs = await this.rcepStore.getByTimeRange(startTime, endTime);
    
    // 2. Reconstruct events from MIL
    const events = await this.mil.queryTemporal(startTime, endTime);
    
    // 3. Reconstruct decisions
    const decisions = await this.decisionStore.getByTimeRange(startTime, endTime);
    
    // 4. ⚠️ CRITIQUE : Reconstruct SCF from RCEP (régénération)
    //    - Decode RCEP → PromptContext
    //    - Compress PromptContext → SCF (régénération)
    let scf;
    if (rcepBlobs.length > 0) {
      // Décoder le premier blob RCEP (ou merger plusieurs blobs)
      // Pour l'instant, on prend le dernier blob
      const lastBlob = rcepBlobs[rcepBlobs.length - 1];
      
      try {
        // Décoder RCEP → PromptContext
        const promptContext = await this.decodeRCEPToContext(lastBlob);
        
        // Compresser PromptContext → SCF (régénération)
        scf = await this.scfCompressor.compress(promptContext, anchorEventId);
      } catch (error) {
        this.logger?.error?.(`[ReplayEngine] Failed to reconstruct SCF from RCEP: ${error}`);
        // Fallback : créer un SCF minimal
        scf = await this.createMinimalSCF(events, decisions, anchorEventId);
      }
    } else {
      // Pas de RCEP disponible, créer un SCF minimal
      scf = await this.createMinimalSCF(events, decisions, anchorEventId);
    }
    
    // 5. Calculate replay hash (deterministic via CanonicalReplay)
    const hash = this.calculateReplayHash(events, decisions, scf);
    
    return {
      events,
      decisions,
      scf,  // ← SCF régénéré, jamais relu
      hash,
      timestamp: Date.now()
    };
  }

  /**
   * Décode un blob RCEP en PromptContext
   */
  private async decodeRCEPToContext(rcepBlob: string): Promise<PromptContext> {
    try {
      return this.rcepDecoder.decode(rcepBlob);
    } catch (error) {
      this.logger?.error?.(`[ReplayEngine] Failed to decode RCEP blob: ${error}`);
      // Fallback to minimal context
      return {
        metadata: {
          sessionId: 'replay',
          llmModel: 'unknown',
          contextWindow: 8000,
          encodingTime: Date.now(),
          ptrScheme: 'mil-his-v1'
        },
        layers: [],
        topics: [],
        timeline: [],
        decisions: [],
        insights: []
      };
    }
  }

  /**
   * Crée un SCF minimal depuis events et decisions
   */
  private async createMinimalSCF(
    events: any[],
    decisions: any[],
    anchorEventId?: string
  ): Promise<any> {
    // Créer un PromptContext minimal depuis events
    const promptContext: PromptContext = {
      metadata: {
        sessionId: 'replay-minimal',
        llmModel: 'unknown',
        contextWindow: 8000,
        encodingTime: Date.now(),
        ptrScheme: 'mil-his-v1'
      },
      layers: [],
      topics: [],
      timeline: events.map((e, i) => ({
        id: i,
        time: e.timestamp,
        type: 'query' as const,
        ptr: e.id
      })),
      decisions: decisions.map((d, i) => ({
        id: i,
        type: 'accept' as const,
        weight: d.confidence_llm,
        inputs: []
      })),
      insights: []
    };
    
    return await this.scfCompressor.compress(promptContext, anchorEventId);
  }

  /**
   * ⚠️ VERROU 3 RENFORCÉ : Calcul hash déterministe via CanonicalReplay
   * 
   * Garantit : même cognition logique → même hash, cognition différente → hash différent
   */
  private calculateReplayHash(
    events: any[],
    decisions: any[],
    scf: any
  ): string {
    // Construire CanonicalReplay
    const canonical = CanonicalReplayBuilder.toCanonical(events, decisions, scf);
    
    // Sérialisation JSON canonique (clés triées, format stable)
    const canonicalJSON = CanonicalReplayBuilder.toCanonicalJSON(canonical);
    
    // Hash SHA-256 du JSON canonique
    return crypto.createHash('sha256').update(canonicalJSON).digest('hex');
  }
}

