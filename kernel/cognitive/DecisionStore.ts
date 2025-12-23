/**
 * DecisionStore - Stockage Append-Only des Décisions Cognitives
 * 
 * Stocke les décisions cognitives de manière immuable (append-only).
 * 
 * ⚠️ VERROU 4 : Invalidation = événement append-only, jamais mutation
 * - Une décision est immuable
 * - L'invalidation est un événement séparé (DecisionStatusEvent)
 * - La décision originale reste dans son état original
 * 
 * Référence : northstar.md Section 11.6
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AppendOnlyWriter, OverflowStrategy } from '../AppendOnlyWriter';
import { WriteTracker } from '../WriteTracker';
import { CognitiveDecision } from './DecisionSchema';
import { RotationManager } from '../persistence/RotationManager';
import { MemoryClass } from '../memory/MemoryClass';
import { MIL } from '../memory/MIL';

/**
 * Événement de statut d'une décision (invalidation, revalidation, confirmation)
 * 
 * ⚠️ CRITIQUE : Ces événements sont append-only, jamais mutation de la décision originale
 */
export interface DecisionStatusEvent {
  id: string;
  type: 'DECISION_INVALIDATED' | 'DECISION_REVALIDATED' | 'DECISION_CONFIRMED';
  decision_id: string;
  cause_event_id?: string;  // Event qui a déclenché l'invalidation
  timestamp: number;
  isoTimestamp: string;
  rationale: string;
}

export class DecisionStore {
  private writer: AppendOnlyWriter;
  private statusWriter: AppendOnlyWriter;  // Pour événements d'invalidation
  private workspaceRoot: string;
  private decisionsPath: string;
  private statusPath: string;
  private readonly MAX_CACHE_SIZE = 1000;  // NEW: Maximum cache size
  private decisionsCache: Map<string, CognitiveDecision> = new Map();
  private statusCache: Map<string, DecisionStatusEvent[]> = new Map();
  private rotationManager?: RotationManager;
  private mil?: MIL;

  constructor(workspaceRoot: string, mil?: MIL) {
    this.mil = mil;
    this.workspaceRoot = workspaceRoot;
    this.decisionsPath = path.join(workspaceRoot, '.reasoning_rl4', 'cognitive', 'decisions.jsonl');
    this.statusPath = path.join(workspaceRoot, '.reasoning_rl4', 'cognitive', 'decision_status.jsonl');
    
    // Créer les répertoires si nécessaire
    const decisionsDir = path.dirname(this.decisionsPath);
    if (!fs.existsSync(decisionsDir)) {
      fs.mkdirSync(decisionsDir, { recursive: true });
    }
    
    // BLOCK strategy for critical data (decisions)
    this.writer = new AppendOnlyWriter(this.decisionsPath, { 
      fsync: false, 
      mkdirRecursive: true,
      overflowStrategy: OverflowStrategy.BLOCK
    });
    this.statusWriter = new AppendOnlyWriter(this.statusPath, { 
      fsync: false, 
      mkdirRecursive: true,
      overflowStrategy: OverflowStrategy.BLOCK
    });
  }

  async init(): Promise<void> {
    await this.writer.init();
    await this.statusWriter.init();
    await this.loadCache();
    
    // NEW: Initialize rotation manager
    // NOTE: HOT data should never be rotated, but we initialize for consistency
    this.rotationManager = new RotationManager(
      this.workspaceRoot,
      {
        maxFileSizeMB: 50,
        maxAgeDays: 90,
        enableArchiving: false,
        enableCompression: false,
        memoryClass: MemoryClass.HOT  // HOT car rebuild required, jamais purgé
      },
      this.mil
    );
    
    // Check rotation on startup (should never rotate HOT data, but check anyway)
    await this.checkRotation();
  }
  
  /**
   * NEW: Check and rotate files if needed
   * NOTE: HOT data should never be rotated (checked in RotationManager)
   */
  private async checkRotation(): Promise<void> {
    if (!this.rotationManager) return;
    
    // Check decisions file (should never rotate for HOT, but check for consistency)
    if (this.rotationManager.shouldRotate(this.decisionsPath).shouldRotate) {
      const result = await this.rotationManager.rotateFile(this.decisionsPath);
      if (result.errors.length > 0) {
        console.warn(`[DecisionStore] Rotation errors: ${result.errors.join(', ')}`);
      } else if (result.rotated.length > 0) {
        // Reload cache after rotation
        await this.loadCache();
      }
    }
    
    // Check status file
    if (this.rotationManager.shouldRotate(this.statusPath).shouldRotate) {
      const result = await this.rotationManager.rotateFile(this.statusPath);
      if (result.errors.length > 0) {
        console.warn(`[DecisionStore] Rotation errors: ${result.errors.join(', ')}`);
      } else if (result.rotated.length > 0) {
        await this.loadCache();
      }
    }
  }

  /**
   * Charge le cache depuis les fichiers JSONL
   * 
   * MODIFIED: Load only recent decisions (last MAX_CACHE_SIZE)
   */
  private async loadCache(): Promise<void> {
    try {
      const decisionsPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'cognitive', 'decisions.jsonl');
      const statusPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'cognitive', 'decision_status.jsonl');
      
      // Charger les décisions
      if (fs.existsSync(decisionsPath)) {
        const content = fs.readFileSync(decisionsPath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        const allDecisions: CognitiveDecision[] = [];
        
        for (const line of lines) {
          try {
            const decision: CognitiveDecision = JSON.parse(line);
            allDecisions.push(decision);
          } catch (e) {
            // Ignorer les lignes invalides
          }
        }
        
        // NEW: Keep only last MAX_CACHE_SIZE (most recent)
        const sorted = allDecisions
          .sort((a, b) => b.timestamp - a.timestamp)  // Most recent first
          .slice(0, this.MAX_CACHE_SIZE);
        
        this.decisionsCache.clear();
        for (const decision of sorted) {
          this.decisionsCache.set(decision.id, decision);
        }
      }
      
      // Charger les statuts (pas de limite pour status, mais on pourrait ajouter si nécessaire)
      if (fs.existsSync(statusPath)) {
        const content = fs.readFileSync(statusPath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const statusEvent: DecisionStatusEvent = JSON.parse(line);
            const existing = this.statusCache.get(statusEvent.decision_id) || [];
            existing.push(statusEvent);
            this.statusCache.set(statusEvent.decision_id, existing);
          } catch (e) {
            // Ignorer les lignes invalides
          }
        }
      }
    } catch (error) {
      // Si erreur, on continue avec un cache vide
      console.warn(`[DecisionStore] Failed to load cache: ${error}`);
    }
  }
  
  /**
   * NEW: LRU cache eviction
   * Remove oldest (first inserted) if cache exceeds MAX_CACHE_SIZE
   */
  private evictLRU(): void {
    if (this.decisionsCache.size <= this.MAX_CACHE_SIZE) return;
    
    // Remove oldest (first inserted in Map)
    const firstKey = this.decisionsCache.keys().next().value;
    if (firstKey) {
      this.decisionsCache.delete(firstKey);
    }
  }

  /**
   * Stocke une décision cognitive (append-only)
   * 
   * Validation : confidence >= 95% pour RL4 updates
   */
  async store(decision: CognitiveDecision): Promise<void> {
    // Validation : confidence >= 95% pour RL4 updates
    if (decision.intent.includes('rl4_update') && decision.confidence_llm < 95) {
      throw new Error(`Decision rejected: confidence_llm ${decision.confidence_llm} < 95% for RL4 update intent`);
    }
    
    // Validation : intent obligatoire
    if (!decision.intent || !decision.intent.trim()) {
      throw new Error('Decision rejected: intent is mandatory');
    }
    
    // Marquer l'écriture interne
    WriteTracker.getInstance().markInternalWrite(this.decisionsPath);
    
    // Stocker la décision
    await this.writer.append(decision);
    await this.writer.flush();
    
    // NEW: Evict if needed before adding
    this.evictLRU();
    
    // Mettre à jour le cache
    this.decisionsCache.set(decision.id, decision);
  }

  /**
   * ⚠️ VERROU 4 : Invalidation = événement append-only, jamais mutation
   * 
   * Cette méthode crée un événement d'invalidation, mais ne modifie JAMAIS la décision originale.
   */
  async invalidateDecision(
    decisionId: string,
    causeEventId: string,
    rationale: string
  ): Promise<void> {
    // 1. Vérifier que la décision existe
    const decision = this.decisionsCache.get(decisionId);
    if (!decision) {
      throw new Error(`Decision ${decisionId} not found`);
    }
    
    // 2. Créer événement d'invalidation (append-only)
    const statusEvent: DecisionStatusEvent = {
      id: uuidv4(),
      type: 'DECISION_INVALIDATED',
      decision_id: decisionId,
      cause_event_id: causeEventId,
      timestamp: Date.now(),
      isoTimestamp: new Date().toISOString(),
      rationale
    };
    
    // 3. Marquer l'écriture interne
    WriteTracker.getInstance().markInternalWrite(this.statusPath);
    
    // 4. Append (jamais mutation de la décision originale)
    await this.statusWriter.append(statusEvent);
    await this.statusWriter.flush();
    
    // 5. Mettre à jour le cache
    const existing = this.statusCache.get(decisionId) || [];
    existing.push(statusEvent);
    this.statusCache.set(decisionId, existing);
    
    // ⚠️ CRITIQUE : La décision originale reste dans son état original
    // L'invalidation est un événement séparé
  }

  /**
   * Récupère les décisions par intent
   */
  async getByIntent(intentId: string): Promise<CognitiveDecision[]> {
    const decisions: CognitiveDecision[] = [];
    for (const decision of this.decisionsCache.values()) {
      if (decision.intent === intentId) {
        decisions.push(decision);
      }
    }
    return decisions.sort((a, b) => a.seq - b.seq);
  }

  /**
   * Récupère les décisions dans une plage temporelle
   */
  async getByTimeRange(start: number, end: number): Promise<CognitiveDecision[]> {
    const decisions: CognitiveDecision[] = [];
    for (const decision of this.decisionsCache.values()) {
      if (decision.timestamp >= start && decision.timestamp <= end) {
        decisions.push(decision);
      }
    }
    return decisions.sort((a, b) => a.seq - b.seq);
  }

  /**
   * Récupère une décision avec son statut (dérivé, pas stocké)
   */
  async getDecisionWithStatus(decisionId: string): Promise<{
    decision: CognitiveDecision;
    status: 'valid' | 'invalidated' | 'revalidated';
    statusEvents: DecisionStatusEvent[];
  } | null> {
    const decision = this.decisionsCache.get(decisionId);
    if (!decision) {
      return null;
    }
    
    const statusEvents = this.statusCache.get(decisionId) || [];
    
    // Déterminer le statut actuel (dérivé depuis les événements)
    let status: 'valid' | 'invalidated' | 'revalidated' = 'valid';
    for (const event of statusEvents) {
      if (event.type === 'DECISION_INVALIDATED') {
        status = 'invalidated';
      } else if (event.type === 'DECISION_REVALIDATED') {
        status = 'revalidated';
      }
    }
    
    return {
      decision,
      status,
      statusEvents
    };
  }

  /**
   * Récupère une décision par ID
   * 
   * NEW: Lazy load from file if not in cache
   */
  async getById(decisionId: string): Promise<CognitiveDecision | null> {
    // Check cache first
    if (this.decisionsCache.has(decisionId)) {
      return this.decisionsCache.get(decisionId) || null;
    }
    
    // Lazy load from file
    return await this.loadDecisionFromFile(decisionId);
  }
  
  /**
   * NEW: Lazy load decision from file if not in cache
   */
  private async loadDecisionFromFile(decisionId: string): Promise<CognitiveDecision | null> {
    try {
      const decisionsPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'cognitive', 'decisions.jsonl');
      
      if (!fs.existsSync(decisionsPath)) {
        return null;
      }
      
      // Read file line by line until found
      const content = fs.readFileSync(decisionsPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const decision: CognitiveDecision = JSON.parse(line);
          if (decision.id === decisionId) {
            // Add to cache (evict if needed)
            this.evictLRU();
            this.decisionsCache.set(decision.id, decision);
            return decision;
          }
        } catch (e) {
          // Ignore invalid lines
        }
      }
      
      return null;
    } catch (error) {
      console.warn(`[DecisionStore] Failed to load decision from file: ${error}`);
      return null;
    }
  }

  /**
   * Ferme les writers
   */
  async close(): Promise<void> {
    await this.writer.flush();
    await this.statusWriter.flush();
  }
}

