/**
 * Tests for MIL (Memory Index Layer)
 * 
 * Verifies that MIL respects Loi 1: No semantic interpretation, no causal inference, no intention attribution.
 */

import { MIL } from '../MIL';
import { UnifiedEvent, EventSource, EventType } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('MIL - Loi 1 Compliance', () => {
  let mil: MIL;
  let testWorkspaceRoot: string;

  beforeEach(async () => {
    // Create temporary workspace
    testWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rl4-test-'));
    mil = new MIL(testWorkspaceRoot);
    await mil.init();
  });

  afterEach(async () => {
    await mil.close();
    // Cleanup
    if (fs.existsSync(testWorkspaceRoot)) {
      fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
    }
  });

  test('generateSuggestedQueries should not contain causal relationships', async () => {
    const events: UnifiedEvent[] = [
      {
        id: 'evt-1',
        seq: 1,
        timestamp: Date.now(),
        source: EventSource.FILE_SYSTEM,
        type: EventType.FILE_MODIFY,
        category: 'code_change' as any,
        source_format: 'file_change',
        payload: { file: 'test.ts' }
      },
      {
        id: 'evt-2',
        seq: 2,
        timestamp: Date.now() + 1000,
        source: EventSource.GIT,
        type: EventType.GIT_COMMIT,
        category: 'code_change' as any,
        source_format: 'git_commit',
        payload: { hash: 'abc123' }
      }
    ];

    // Access private method via reflection (for testing)
    const generateQueries = (mil as any).generateSuggestedQueries.bind(mil);
    const queries = generateQueries(events);

    // Verify no causal language
    queries.forEach(query => {
      expect(query.toLowerCase()).not.toContain('causal');
      expect(query.toLowerCase()).not.toContain('relationship');
      expect(query.toLowerCase()).not.toContain('correlation');
      expect(query.toLowerCase()).not.toContain('pattern');
      expect(query.toLowerCase()).not.toContain('emerge');
    });

    // Verify queries are structural
    expect(queries.some(q => q.includes('List') || q.includes('chronological'))).toBe(true);
  });

  test('generateSuggestedQueries should not contain pattern interpretation', async () => {
    const events: UnifiedEvent[] = [
      {
        id: 'evt-1',
        seq: 1,
        timestamp: Date.now(),
        source: EventSource.CURSOR_CHAT,
        type: 'cursor_chat_message' as any,
        category: 'communication' as any,
        source_format: 'cursor_chat',
        payload: { message: 'test' }
      }
    ];

    const generateQueries = (mil as any).generateSuggestedQueries.bind(mil);
    const queries = generateQueries(events);

    // Verify no pattern language
    queries.forEach(query => {
      expect(query.toLowerCase()).not.toContain('pattern');
      expect(query.toLowerCase()).not.toContain('emerge');
      expect(query.toLowerCase()).not.toContain('development pattern');
    });
  });

  test('buildContextForLLM should return queries without causal/pattern language', async () => {
    const events: UnifiedEvent[] = [
      {
        id: 'evt-1',
        seq: 1,
        timestamp: Date.now(),
        source: EventSource.FILE_SYSTEM,
        type: EventType.FILE_MODIFY,
        category: 'code_change' as any,
        source_format: 'file_change',
        payload: { file: 'test.ts' }
      }
    ];

    // Ingest events
    for (const event of events) {
      await mil.ingest(event, event.source);
    }

    const context = await mil.buildContextForLLM(undefined, 3600000);

    // Verify suggested_queries don't contain causal/pattern language
    if (context.suggested_queries) {
      context.suggested_queries.forEach((query: string) => {
        const lowerQuery = query.toLowerCase();
        expect(lowerQuery).not.toContain('causal');
        expect(lowerQuery).not.toContain('relationship');
        expect(lowerQuery).not.toContain('pattern');
        expect(lowerQuery).not.toContain('emerge');
        expect(lowerQuery).not.toContain('correlation');
      });
    }
  });
});

