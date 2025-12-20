/**
 * Tests Round-Trip pour LegacyPromptContextV1Adapter
 *
 * Architectural Rules:
 * - Tests isolés, pas de dépendances externes
 * - Données synthétiques et contrôlées
 * - Golden master pour checksums (capturés réels)
 * - Validation de contrat, pas d'implémentation
 * - Toute évolution doit casser les tests explicitement
 */

import { LegacyPromptContextV1Adapter, V1AdapterFactory } from '../LegacyPromptContextV1Adapter.js';
import { PromptSnapshotValidator, PromptSnapshotValidatorFactory } from '../../PromptSnapshotValidator.js';
import type { LegacyPromptContextV1 } from '../LegacyPromptContextV1Adapter.js';

describe('LegacyPromptContextV1Adapter - Round Trip Tests', () => {
  let validator: PromptSnapshotValidator;
  let adapter: LegacyPromptContextV1Adapter;

  beforeEach(() => {
    // Using real validator with controlled test data (Option C)
    validator = PromptSnapshotValidatorFactory.forExport();
    adapter = V1AdapterFactory.strict(validator);
  });

  describe('Adapter basics', () => {
    test('should initialize with injected validator', () => {
      expect(adapter).toBeInstanceOf(LegacyPromptContextV1Adapter);
    });

    test('should create adapter with strict mode', () => {
      const strictAdapter = V1AdapterFactory.strict(validator);
      expect(strictAdapter).toBeDefined();
    });

    test('should create adapter with lenient mode', () => {
      const lenientAdapter = V1AdapterFactory.lenient(validator);
      expect(lenientAdapter).toBeDefined();
    });
  });

  describe('Successful adaptations - Round Trip Validation', () => {
    test('should adapt minimal valid context with deterministic checksum', () => {
      // Synthetic minimal data (Option A)
      const minimalContext: LegacyPromptContextV1 = {
        metadata: {
          sessionId: 'test-session-123',
          llmModel: 'claude-3.5-sonnet',
          contextWindow: 8000,
          encodingTime: 150,
          ptrScheme: 'mil-his-v1' as const
        },
        layers: [],
        topics: [],
        timeline: [],
        decisions: [],
        insights: []
      };

      const result = adapter.adapt(minimalContext);

      // CORRECTION 1: Golden master - sera remplacé après exécution réelle
      // TODO: Exécuter une fois et capturer le checksum réel
      // console.log('Minimal context checksum:', result.snapshot.checksum);
      expect(result.snapshot.checksum).toBe('PLACEHOLDER_MINIMAL_CHECKSUM');

      // Verify structure (contract validation)
      expect(result.snapshot.version).toBe('snapshot-v1');
      expect(result.snapshot.sessionId).toBe('test-session-123');
      expect(result.snapshot.layers).toHaveLength(0);
      expect(result.snapshot.topics).toHaveLength(0);
      expect(result.snapshot.timeline).toHaveLength(0);
      expect(result.snapshot.decisions).toHaveLength(0);
      expect(result.snapshot.insights).toHaveLength(0);

      // Verify metadata
      expect(result.metadata.sourceType).toBe('legacy-v1');
      expect(result.metadata.adaptationTime).toBeGreaterThan(0);
      expect(result.metadata.adaptationTime).toBeLessThan(100); // Should be fast
      expect(result.metadata.preservedFields.length).toBeGreaterThan(0); // CORRECTION 4: Test d'intention, pas de valeur exacte
    });

    test('should adapt complex context with all components', () => {
      const complexContext: LegacyPromptContextV1 = {
        metadata: {
          sessionId: 'complex-session-456',
          llmModel: 'claude-3.5-sonnet',
          contextWindow: 16000,
          encodingTime: 250,
          ptrScheme: 'internal-v1' as const
        },
        layers: [
          {
            id: 1,
            name: 'Core Layer',
            weight: 800,
            parent: 'ROOT'
          },
          {
            id: 2,
            name: 'UI Layer',
            weight: 300,
            parent: 1
          }
        ],
        topics: [
          {
            id: 1,
            name: 'Database Connection',
            weight: 750,
            refs: [1, 2]
          },
          {
            id: 2,
            name: 'User Authentication',
            weight: 600,
            refs: []
          }
        ],
        timeline: [
          {
            id: 1,
            time: 1640995200000, // 2022-01-01 00:00:00 UTC
            type: 'query' as const,
            ptr: 'ptr:database:connection'
          },
          {
            id: 2,
            time: 1640995210000,
            type: 'response' as const,
            ptr: 'ptr:database:result'
          }
        ],
        decisions: [
          {
            id: 1,
            type: 'accept' as const,
            weight: 900,
            inputs: [1, 2]
          }
        ],
        insights: [
          {
            id: 1,
            type: 'pattern' as const,
            salience: 850,
            links: [1]
          }
        ]
      };

      const result = adapter.adapt(complexContext);

      // CORRECTION 1: Golden master - sera remplacé après exécution réelle
      // TODO: Exécuter une fois et capturer le checksum réel
      // console.log('Complex context checksum:', result.snapshot.checksum);
      expect(result.snapshot.checksum).toBe('PLACEHOLDER_COMPLEX_CHECKSUM');

      // Verify component counts match
      expect(result.snapshot.layers).toHaveLength(2);
      expect(result.snapshot.topics).toHaveLength(2);
      expect(result.snapshot.timeline).toHaveLength(2);
      expect(result.snapshot.decisions).toHaveLength(1);
      expect(result.snapshot.insights).toHaveLength(1);

      // Verify integrity
      expect(result.snapshot.integrity.layerCount).toBe(2);
      expect(result.snapshot.integrity.topicCount).toBe(2);
      expect(result.snapshot.integrity.eventCount).toBe(2);
      expect(result.snapshot.integrity.decisionCount).toBe(1);
      expect(result.snapshot.integrity.insightCount).toBe(1);

      // Verify total weight calculation
      const expectedWeight = 800 + 300 + 750 + 600 + 900 + 850; // 4200
      expect(result.snapshot.integrity.totalWeight).toBe(4200);
    });

    test('should preserve humanSummary in droppedFields metadata', () => {
      const contextWithSummary: LegacyPromptContextV1 = {
        metadata: {
          sessionId: 'summary-test',
          llmModel: 'claude-3.5-sonnet',
          contextWindow: 8000,
          encodingTime: 100,
          ptrScheme: 'mil-his-v1' as const
        },
        layers: [],
        topics: [],
        timeline: [],
        decisions: [],
        insights: [],
        humanSummary: {
          type: 'brief' as const,
          text: 'Brief summary of the context'
        }
      };

      const result = adapter.adapt(contextWithSummary);

      expect(result.metadata.droppedFields).toContain(
        'humanSummary (not represented in PromptSnapshot v1)'
      );
    });
  });

  describe('Error handling - Rejection Validation', () => {
    test('should reject null or undefined context', () => {
      expect(() => {
        adapter.adapt(null as any);
      }).toThrow('V1 adaptation failed: Legacy context is null or undefined');

      expect(() => {
        adapter.adapt(undefined as any);
      }).toThrow('V1 adaptation failed: Legacy context is null or undefined');
    });

    test('should reject context with missing metadata', () => {
      const invalidContext = {
        // metadata missing
        layers: [],
        topics: [],
        timeline: [],
        decisions: [],
        insights: []
      } as any;

      expect(() => {
        adapter.adapt(invalidContext);
      }).toThrow('V1 adaptation failed: Missing metadata in legacy context');
    });

    test('should reject context with missing sessionId', () => {
      const invalidContext = {
        metadata: {
          sessionId: '', // Empty sessionId
          llmModel: 'claude-3.5-sonnet',
          contextWindow: 8000,
          encodingTime: 100,
          ptrScheme: 'mil-his-v1' as const
        },
        layers: [],
        topics: [],
        timeline: [],
        decisions: [],
        insights: []
      } as any;

      expect(() => {
        adapter.adapt(invalidContext);
      }).toThrow('V1 adaptation failed: Missing sessionId in legacy metadata');
    });

    test('should reject context with duplicate IDs in strict mode', () => {
      const duplicateContext: LegacyPromptContextV1 = {
        metadata: {
          sessionId: 'duplicate-test',
          llmModel: 'claude-3.5-sonnet',
          contextWindow: 8000,
          encodingTime: 100,
          ptrScheme: 'mil-his-v1' as const
        },
        layers: [
          { id: 1, name: 'Layer 1', weight: 500, parent: 'ROOT' },
          { id: 1, name: 'Layer 1 Duplicate', weight: 400, parent: 'ROOT' }
        ],
        topics: [],
        timeline: [],
        decisions: [],
        insights: []
      };

      expect(() => {
        adapter.adapt(duplicateContext);
      }).toThrow('Duplicate IDs in layers: 1');
    });

    test('should reject invalid array types', () => {
      const invalidContext = {
        metadata: {
          sessionId: 'test',
          llmModel: 'claude-3.5-sonnet',
          contextWindow: 8000,
          encodingTime: 100,
          ptrScheme: 'mil-his-v1' as const
        },
        layers: 'not-an-array' as any, // Invalid type
        topics: [],
        timeline: [],
        decisions: [],
        insights: []
      };

      expect(() => {
        adapter.adapt(invalidContext);
      }).toThrow('Invalid layers: must be an array');
    });

    test('should reject invalid ID values', () => {
      const invalidContext: LegacyPromptContextV1 = {
        metadata: {
          sessionId: 'invalid-id-test',
          llmModel: 'claude-3.5-sonnet',
          contextWindow: 8000,
          encodingTime: 100,
          ptrScheme: 'mil-his-v1' as const
        },
        layers: [
          { id: -1, name: 'Invalid Layer', weight: 500, parent: 'ROOT' } // Negative ID
        ],
        topics: [],
        timeline: [],
        decisions: [],
        insights: []
      };

      expect(() => {
        adapter.adapt(invalidContext);
      }).toThrow('Invalid ID in layers[0]: -1');
    });
  });

  describe('Edge cases - Boundary Validation', () => {
    test('should handle weight boundaries correctly', () => {
      const boundaryContext: LegacyPromptContextV1 = {
        metadata: {
          sessionId: 'boundary-test',
          llmModel: 'claude-3.5-sonnet',
          contextWindow: 8000,
          encodingTime: 100,
          ptrScheme: 'mil-his-v1' as const
        },
        layers: [
          { id: 1, name: 'Min Weight', weight: 0, parent: 'ROOT' },
          { id: 2, name: 'Max Weight', weight: 999, parent: 'ROOT' }
        ],
        topics: [],
        timeline: [],
        decisions: [],
        insights: [
          { id: 1, type: 'pattern' as const, salience: 0, links: [] },
          { id: 2, type: 'anomaly' as const, salience: 999, links: [] }
        ]
      };

      const result = adapter.adapt(boundaryContext);

      expect(result.snapshot.layers[0].weight).toBe(0);
      expect(result.snapshot.layers[1].weight).toBe(999);
      expect(result.snapshot.insights[0].salience).toBe(0);
      expect(result.snapshot.insights[1].salience).toBe(999);
    });

    test('should handle empty arrays correctly', () => {
      const emptyContext: LegacyPromptContextV1 = {
        metadata: {
          sessionId: 'empty-test',
          llmModel: 'claude-3.5-sonnet',
          contextWindow: 8000,
          encodingTime: 100,
          ptrScheme: 'mil-his-v1' as const
        },
        layers: [],
        topics: [],
        timeline: [],
        decisions: [],
        insights: []
      };

      const result = adapter.adapt(emptyContext);

      expect(result.snapshot.layers).toHaveLength(0);
      expect(result.snapshot.topics).toHaveLength(0);
      expect(result.snapshot.timeline).toHaveLength(0);
      expect(result.snapshot.decisions).toHaveLength(0);
      expect(result.snapshot.insights).toHaveLength(0);

      expect(result.snapshot.integrity.layerCount).toBe(0);
      expect(result.snapshot.integrity.topicCount).toBe(0);
      expect(result.snapshot.integrity.eventCount).toBe(0);
      expect(result.snapshot.integrity.decisionCount).toBe(0);
      expect(result.snapshot.integrity.insightCount).toBe(0);
      expect(result.snapshot.integrity.totalWeight).toBe(0);
    });

    test('should handle very long names within constraints', () => {
      const longName = 'a'.repeat(100); // Exactly at the limit
      const longContext: LegacyPromptContextV1 = {
        metadata: {
          sessionId: 'long-name-test',
          llmModel: 'claude-3.5-sonnet',
          contextWindow: 8000,
          encodingTime: 100,
          ptrScheme: 'mil-his-v1' as const
        },
        layers: [
          { id: 1, name: longName, weight: 500, parent: 'ROOT' }
        ],
        topics: [],
        timeline: [],
        decisions: [],
        insights: []
      };

      const result = adapter.adapt(longContext);

      expect(result.snapshot.layers[0].name).toBe(longName);
      expect(result.snapshot.layers[0].name.length).toBe(100);
    });
  });

  describe('Performance Validation', () => {
    test('should complete adaptation within acceptable time bounds', () => {
      const performanceContext: LegacyPromptContextV1 = {
        metadata: {
          sessionId: 'perf-test',
          llmModel: 'claude-3.5-sonnet',
          contextWindow: 8000,
          encodingTime: 100,
          ptrScheme: 'mil-his-v1' as const
        },
        // Create moderate complexity
        layers: Array.from({ length: 10 }, (_, i) => ({
          id: i,
          name: `Layer ${i}`,
          weight: 500,
          parent: i === 0 ? 'ROOT' : i - 1
        })),
        topics: Array.from({ length: 20 }, (_, i) => ({
          id: i,
          name: `Topic ${i}`,
          weight: 600,
          refs: [i % 10]
        })),
        timeline: Array.from({ length: 50 }, (_, i) => ({
          id: i,
          time: Date.now() + i * 1000,
          type: 'query' as const,
          ptr: `ptr:test:${i}`
        })),
        decisions: Array.from({ length: 5 }, (_, i) => ({
          id: i,
          type: 'accept' as const,
          weight: 700,
          inputs: [i]
        })),
        insights: Array.from({ length: 8 }, (_, i) => ({
          id: i,
          type: 'pattern' as const,
          salience: 800,
          links: [i % 5]
        }))
      };

      const startTime = Date.now();
      const result = adapter.adapt(performanceContext);
      const adaptationTime = Date.now() - startTime;

      // CORRECTION 3: Bounds plus larges pour CI
      expect(adaptationTime).toBeLessThan(250); // Should be fast but CI-robust

      // Verify adaptation time recording (with tolerance - CORRECTION 2)
      expect(
        Math.abs(result.metadata.adaptationTime - adaptationTime)
      ).toBeLessThan(5);

      // Verify all data processed
      expect(result.snapshot.layers).toHaveLength(10);
      expect(result.snapshot.topics).toHaveLength(20);
      expect(result.snapshot.timeline).toHaveLength(50);
      expect(result.snapshot.decisions).toHaveLength(5);
      expect(result.snapshot.insights).toHaveLength(8);
    });

    test('should maintain deterministic checksums for identical inputs', () => {
      const deterministicContext: LegacyPromptContextV1 = {
        metadata: {
          sessionId: 'deterministic-test',
          llmModel: 'claude-3.5-sonnet',
          contextWindow: 8000,
          encodingTime: 150,
          ptrScheme: 'mil-his-v1' as const
        },
        layers: [
          { id: 1, name: 'Test Layer', weight: 500, parent: 'ROOT' }
        ],
        topics: [],
        timeline: [],
        decisions: [],
        insights: []
      };

      // Run same adaptation multiple times
      const results = Array.from({ length: 5 }, () => adapter.adapt(deterministicContext));
      const checksums = results.map(result => result.snapshot.checksum);

      // CORRECTION 6: Test de déterminisme des données, pas du runtime
      expect(checksums).toHaveLength(5);
      expect(new Set(checksums).size).toBe(1);
    });
  });

  describe('Regression Prevention', () => {
    test('should maintain explicit snapshot contract', () => {
      // CORRECTION 5: Test de contrat structurel explicite
      const expectedSnapshotKeys = [
        'version',
        'timestamp',
        'sessionId',
        'checksum',
        'layers',
        'topics',
        'timeline',
        'decisions',
        'insights',
        'source',
        'generationTime',
        'schema',
        'integrity'
      ];

      const context: LegacyPromptContextV1 = {
        metadata: {
          sessionId: 'regression-test',
          llmModel: 'claude-3.5-sonnet',
          contextWindow: 8000,
          encodingTime: 100,
          ptrScheme: 'mil-his-v1' as const
        },
        layers: [{ id: 1, name: 'Test', weight: 500, parent: 'ROOT' }],
        topics: [],
        timeline: [],
        decisions: [],
        insights: []
      };

      const result = adapter.adapt(context);

      // Contract validation: exact key set, no missing, no extra
      expect(Object.keys(result.snapshot).sort()).toEqual(expectedSnapshotKeys.sort());

      // Verify structure types are correct
      expect(Array.isArray(result.snapshot.layers)).toBe(true);
      expect(Array.isArray(result.snapshot.topics)).toBe(true);
      expect(Array.isArray(result.snapshot.timeline)).toBe(true);
      expect(Array.isArray(result.snapshot.decisions)).toBe(true);
      expect(Array.isArray(result.snapshot.insights)).toBe(true);

      // Verify required fields have correct types
      expect(typeof result.snapshot.version).toBe('string');
      expect(typeof result.snapshot.timestamp).toBe('number');
      expect(typeof result.snapshot.sessionId).toBe('string');
      expect(typeof result.snapshot.checksum).toBe('string');
      expect(typeof result.snapshot.generationTime).toBe('number');
    });
  });
});

// Golden Master Checksum Documentation
// ======================================
//
// INSTRUCTIONS POUR CAPTURER LES CHECKSUMS RÉELS:
//
// 1. Exécuter une seule fois: `npm test -- --testPathPattern=LegacyPromptContextV1Adapter`
// 2. Copier les checksums depuis la sortie console ci-dessous
// 3. Remplacer les PLACEHOLDER_* par les vraies valeurs
//
// Notes:
// - Les checksums seront stables tant que l'implémentation ne change pas
// - Toute modification structurelle ou de validation changera les checksums
// - C'est exactement le comportement souhaité: les tests casseront explicitement