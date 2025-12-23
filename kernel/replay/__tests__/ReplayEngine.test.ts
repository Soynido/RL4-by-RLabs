/**
 * Tests for ReplayEngine
 * 
 * Verifies deterministic replay hash: same input → same hash.
 */

import { ReplayEngine } from '../ReplayEngine';
import { MIL } from '../../memory/MIL';
import { DecisionStore } from '../../cognitive/DecisionStore';
import { RCEPStore } from '../../storage/RCEPStore';
import { SCFCompressor } from '../../scf/SCFCompressor';
import { PromptCodecRL4 } from '../../rl4/PromptCodecRL4';
import { UnifiedEvent, EventSource, EventType } from '../../memory/types';
import { CognitiveDecision } from '../../cognitive/DecisionSchema';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ReplayEngine - Deterministic Hash', () => {
  let replayEngine: ReplayEngine;
  let mil: MIL;
  let decisionStore: DecisionStore;
  let rcepStore: RCEPStore;
  let scfCompressor: SCFCompressor;
  let rcepDecoder: PromptCodecRL4;
  let testWorkspaceRoot: string;

  beforeEach(async () => {
    testWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rl4-replay-test-'));
    
    mil = new MIL(testWorkspaceRoot);
    await mil.init();
    
    decisionStore = new DecisionStore(testWorkspaceRoot);
    await decisionStore.init();
    
    rcepStore = new RCEPStore(testWorkspaceRoot);
    scfCompressor = new SCFCompressor(mil, decisionStore);
    rcepDecoder = new PromptCodecRL4();
    
    replayEngine = new ReplayEngine(mil, decisionStore, rcepStore, scfCompressor, rcepDecoder);
  });

  afterEach(async () => {
    await mil.close();
    await decisionStore.close();
    if (fs.existsSync(testWorkspaceRoot)) {
      fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
    }
  });

  test('should produce same hash for same input', async () => {
    const startTime = Date.now() - 3600000; // 1 hour ago
    const endTime = Date.now();

    // Create test events
    const event1: UnifiedEvent = {
      id: 'evt-1',
      seq: 1,
      timestamp: startTime + 1000,
      source: EventSource.FILE_SYSTEM,
      type: EventType.FILE_MODIFY,
      category: 'code_change' as any,
      source_format: 'file_change',
      payload: { file: 'test.ts' }
    };

    await mil.ingest(event1, EventSource.FILE_SYSTEM);

    // Create test decision
    const decision: CognitiveDecision = {
      id: 'dec-1',
      seq: 1,
      timestamp: startTime + 2000,
      isoTimestamp: new Date(startTime + 2000).toISOString(),
      intent: 'test_intent',
      intent_text: 'Test Intent',
      context_refs: ['evt-1'],
      options_considered: [{ option: 'Option1', rationale: 'Test', weight: 500 }],
      chosen_option: 'Option1',
      constraints: [],
      invalidation_conditions: [],
      previous_decisions: [],
      related_adrs: [],
      confidence_llm: 90,
      confidence_gate: 'pass',
      validation_status: 'validated',
      rcep_ref: 'test-checksum'
    };

    await decisionStore.store(decision);

    // Replay twice with same input
    const result1 = await replayEngine.replay(startTime, endTime);
    const result2 = await replayEngine.replay(startTime, endTime);

    // Hashes should be identical
    expect(result1.hash).toBe(result2.hash);
    expect(result1.events.length).toBe(result2.events.length);
    expect(result1.decisions.length).toBe(result2.decisions.length);
  });

  test('should produce different hash for different input', async () => {
    const startTime = Date.now() - 3600000;
    const endTime = Date.now();

    // First replay with one event
    const event1: UnifiedEvent = {
      id: 'evt-1',
      seq: 1,
      timestamp: startTime + 1000,
      source: EventSource.FILE_SYSTEM,
      type: EventType.FILE_MODIFY,
      category: 'code_change' as any,
      source_format: 'file_change',
      payload: { file: 'test1.ts' }
    };

    await mil.ingest(event1, EventSource.FILE_SYSTEM);
    const result1 = await replayEngine.replay(startTime, endTime);

    // Second replay with different event
    const event2: UnifiedEvent = {
      id: 'evt-2',
      seq: 2,
      timestamp: startTime + 2000,
      source: EventSource.FILE_SYSTEM,
      type: EventType.FILE_MODIFY,
      category: 'code_change' as any,
      source_format: 'file_change',
      payload: { file: 'test2.ts' }
    };

    await mil.ingest(event2, EventSource.FILE_SYSTEM);
    const result2 = await replayEngine.replay(startTime, endTime);

    // Hashes should be different
    expect(result1.hash).not.toBe(result2.hash);
  });
});

