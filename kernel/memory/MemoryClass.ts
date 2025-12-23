/**
 * MemoryClass - Classification des Données selon Criticité
 * 
 * RL4 classe les données en 4 catégories selon leur criticité pour la reconstruction.
 * 
 * Référence : docs/rl4-memory-contract.md
 */

export enum MemoryClass {
  HOT = "hot",        // decisions, retention_events, invariants
  WARM = "warm",      // metadata, indices, diffs
  COLD = "cold",      // code content snapshots
  ARCHIVED = "archived" // rotated files (read-only)
}

export interface MemoryClassConfig {
  class: MemoryClass;
  maxAgeDays: number;
  maxSizeMB: number;
  purgeable: boolean;
  rebuildRequired: boolean;
}

/**
 * Configuration canonique des Memory Classes
 * 
 * ⚠️ INVARIANT : HOT data jamais purgée
 * ⚠️ INVARIANT : WARM/COLD data toujours produit événement de rétention
 */
export const MEMORY_CLASS_CONFIGS: Record<MemoryClass, MemoryClassConfig> = {
  [MemoryClass.HOT]: {
    class: MemoryClass.HOT,
    maxAgeDays: Infinity,
    maxSizeMB: Infinity,
    purgeable: false,
    rebuildRequired: true
  },
  [MemoryClass.WARM]: {
    class: MemoryClass.WARM,
    maxAgeDays: 90,
    maxSizeMB: 1000,
    purgeable: true,
    rebuildRequired: true
  },
  [MemoryClass.COLD]: {
    class: MemoryClass.COLD,
    maxAgeDays: 30,
    maxSizeMB: 10000,
    purgeable: true,
    rebuildRequired: false
  },
  [MemoryClass.ARCHIVED]: {
    class: MemoryClass.ARCHIVED,
    maxAgeDays: 7,
    maxSizeMB: Infinity,
    purgeable: true,
    rebuildRequired: false
  }
};

