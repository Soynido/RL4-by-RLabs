/**
 * Tests for DecisionStore
 * 
 * Verifies append-only storage and invalidation via DecisionStatusEvent (never mutation).
 */

import { DecisionStore } from '../DecisionStore';
import { CognitiveDecision } from '../DecisionSchema';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('DecisionStore - Append-Only and Invalidation', () => {
  let decisionStore: DecisionStore;
  let testWorkspaceRoot: string;
  let decisionsPath: string;
  let statusPath: string;

  beforeEach(async () => {
    testWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rl4-decision-test-'));
    decisionStore = new DecisionStore(testWorkspaceRoot);
    await decisionStore.init();
    
    decisionsPath = path.join(testWorkspaceRoot, '.reasoning_rl4', 'cognitive', 'decisions.jsonl');
    statusPath = path.join(testWorkspaceRoot, '.reasoning_rl4', 'cognitive', 'decision_status.jsonl');
  });

  afterEach(async () => {
    await decisionStore.close();
    if (fs.existsSync(testWorkspaceRoot)) {
      fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
    }
  });

  test('should store decision append-only', async () => {
    const decision: CognitiveDecision = {
      id: 'dec-1',
      seq: 1,
      timestamp: Date.now(),
      isoTimestamp: new Date().toISOString(),
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

    // Verify file exists and contains decision
    expect(fs.existsSync(decisionsPath)).toBe(true);
    const content = fs.readFileSync(decisionsPath, 'utf-8');
    expect(content).toContain('dec-1');
    expect(content).toContain('test_intent');
  });

  test('should invalidate decision via append-only event (never mutate original)', async () => {
    const decision: CognitiveDecision = {
      id: 'dec-1',
      seq: 1,
      timestamp: Date.now(),
      isoTimestamp: new Date().toISOString(),
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

    // Read original decision from file
    const originalContent = fs.readFileSync(decisionsPath, 'utf-8');
    const originalDecision = JSON.parse(originalContent.trim());

    // Invalidate decision
    await decisionStore.invalidateDecision('dec-1', 'evt-cause', 'Test invalidation');

    // Verify original decision file unchanged
    const afterInvalidationContent = fs.readFileSync(decisionsPath, 'utf-8');
    const afterInvalidationDecision = JSON.parse(afterInvalidationContent.trim());
    
    expect(afterInvalidationDecision.id).toBe(originalDecision.id);
    expect(afterInvalidationDecision.intent).toBe(originalDecision.intent);
    expect(afterInvalidationDecision.validation_status).toBe(originalDecision.validation_status); // Original unchanged

    // Verify status event was created
    expect(fs.existsSync(statusPath)).toBe(true);
    const statusContent = fs.readFileSync(statusPath, 'utf-8');
    const statusEvent = JSON.parse(statusContent.trim());
    
    expect(statusEvent.type).toBe('DECISION_INVALIDATED');
    expect(statusEvent.decision_id).toBe('dec-1');
    expect(statusEvent.cause_event_id).toBe('evt-cause');
  });

  test('should reject decision with confidence < 95% for RL4 update intent', async () => {
    const decision: CognitiveDecision = {
      id: 'dec-1',
      seq: 1,
      timestamp: Date.now(),
      isoTimestamp: new Date().toISOString(),
      intent: 'rl4_update_test',
      intent_text: 'RL4 Update Test',
      context_refs: ['evt-1'],
      options_considered: [{ option: 'Option1', rationale: 'Test', weight: 500 }],
      chosen_option: 'Option1',
      constraints: [],
      invalidation_conditions: [],
      previous_decisions: [],
      related_adrs: [],
      confidence_llm: 90, // < 95%
      confidence_gate: 'fail',
      validation_status: 'pending',
      rcep_ref: 'test-checksum'
    };

    await expect(decisionStore.store(decision)).rejects.toThrow('confidence_llm 90 < 95%');
  });

  test('should accept decision with confidence >= 95% for RL4 update intent', async () => {
    const decision: CognitiveDecision = {
      id: 'dec-1',
      seq: 1,
      timestamp: Date.now(),
      isoTimestamp: new Date().toISOString(),
      intent: 'rl4_update_test',
      intent_text: 'RL4 Update Test',
      context_refs: ['evt-1'],
      options_considered: [{ option: 'Option1', rationale: 'Test', weight: 500 }],
      chosen_option: 'Option1',
      constraints: [],
      invalidation_conditions: [],
      previous_decisions: [],
      related_adrs: [],
      confidence_llm: 95, // >= 95%
      confidence_gate: 'pass',
      validation_status: 'validated',
      rcep_ref: 'test-checksum'
    };

    await expect(decisionStore.store(decision)).resolves.not.toThrow();
  });
});

