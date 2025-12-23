/**
 * MemoryRetentionEvent - Événements de Rétention Mémoire
 * 
 * Chaque rotation/purge de données produit un MEMORY_RETENTION_EVENT
 * pour traçabilité complète.
 * 
 * ⚠️ INVARIANT : Ces événements sont indexés dans MIL et consultés par checkCompleteness()
 * 
 * Référence : docs/rl4-memory-contract.md
 */

import { v4 as uuidv4 } from 'uuid';
import { GlobalClock } from '../GlobalClock';
import { UnifiedEvent, EventType, EventSource, EventCategory } from './types';
import { MemoryClass } from './MemoryClass';

export interface MemoryRetentionEventPayload {
  component: string;              // "MIL", "DecisionStore", "ContentStore"
  file: string;                   // File path rotated/deleted
  reason: 'maxAgeDays' | 'maxFileSize' | 'quota';
  range_affected: {
    from_timestamp: number;
    to_timestamp: number;
    from_seq?: number;
    to_seq?: number;
  };
  memory_class: MemoryClass;
  rebuild_impact: 'blocking' | 'warning' | 'none';
}

/**
 * Crée un événement de rétention mémoire
 * 
 * ⚠️ CRITIQUE : Cet événement doit être indexé dans MIL avant la rotation/purge
 */
export function createMemoryRetentionEvent(
  payload: MemoryRetentionEventPayload
): UnifiedEvent {
  const clock = GlobalClock.getInstance();
  
  return {
    id: `retention-${Date.now()}-${uuidv4().substring(0, 8)}`,
    seq: clock.next(),
    timestamp: Date.now(),
    source: EventSource.SYSTEM,
    type: EventType.MEMORY_RETENTION,
    category: EventCategory.METADATA,
    source_format: 'memory_retention',
    payload,
    indexed_fields: {
      files: [payload.file],
      keywords: ['retention', 'purge', payload.memory_class, payload.reason]
    }
  };
}

