/******************************************************************************************
 * RCEP_Parser.ts — High-Level RCEP 0.1.0 Parser & Utilities
 *
 * Responsibilities:
 *  - Unified encode/decode interface
 *  - Stream processing for large RCEP documents
 *  - Pointer resolution registry
 *  - Compatibility layer for different RCEP versions
 *  - Performance profiling and optimization
 *
 * This is the main public API for RCEP operations.
 ******************************************************************************************/

import {
  RCEPDocument,
  RCEPBlock,
  ARCHBlock,
  RL4PromptContextBundle,
  PromptContext
} from "./RCEP_Types";
import { RCEPEncoder } from "./RCEP_Encoder";
import { RCEPDecoder, RCEPDecodeResult } from "./RCEP_Decoder";
import { RCEPValidator } from "./RCEP_Validator";
import { RCEPChecksum } from "./RCEP_Checksum";

export interface RCEPOptions {
  mode?: 'strict' | 'permissive';
  resolveExternalPointers?: boolean;
  validateOnEncode?: boolean;
  validateOnDecode?: boolean;
  enableProfiling?: boolean;
}

export interface RCEPStats {
  version: string;
  blockCount: number;
  totalSize: number;
  compressionRatio?: number;
  encodeTime?: number;
  decodeTime?: number;
  validationTime?: number;
}

export interface PointerResolver {
  scheme: string;
  resolve(ptr: string): Promise<any>;
}

export class RCEPParser {

  private static resolvers = new Map<string, PointerResolver>();
  private static stats: RCEPStats = {
    version: "0.1.0",
    blockCount: 0,
    totalSize: 0
  };

  // ============================================================================
  // MAIN API
  // ============================================================================

  /**
   * Encode PromptContext → RCEP blob
   */
  static encode(context: PromptContext, options: RCEPOptions = {}): string {
    const startTime = options.enableProfiling ? performance.now() : 0;

    // Validation step (optional)
    if (options.validateOnEncode !== false) {
      const doc = RCEPEncoder.buildDocument(context as any);
      const validator = new RCEPValidator();
      const validation = validator.validate(doc);
      if (!validation.valid) {
        throw new Error(`[RCEPParser] Validation failed: ${validation.errors.join('; ')}`);
      }
    }

    const blob = RCEPEncoder.encode(context);

    if (options.enableProfiling) {
      this.stats.encodeTime = performance.now() - startTime;
      this.stats.totalSize = blob.length;
    }

    return blob;
  }

  /**
   * Decode RCEP blob → PromptContext
   */
  static async decode(blob: string, options: RCEPOptions = {}): Promise<RCEPDecodeResult> {
    const startTime = options.enableProfiling ? performance.now() : 0;

    const context = RCEPDecoder.decode(blob);

    const result = {
      context,
      document: {} as any, // TODO: Extract from decoder
      validation: { valid: true, errors: [], warnings: [] },
      warnings: []
    };

    if (options.enableProfiling) {
      this.stats.decodeTime = performance.now() - startTime;
      this.stats.totalSize = blob.length;
    }

    return result;
  }

  /**
   * Validate RCEP document
   */
  static validate(blob: string): { valid: boolean; errors: string[]; warnings: string[] } {
    const quick = RCEPDecoder.quickValidate(blob);
    if (!quick.valid) {
      return { valid: false, errors: quick.errors, warnings: [] };
    }

    try {
      const { document } = RCEPDecoder.decodeWithoutValidation(blob);
      const validator = new RCEPValidator();
      const validation = validator.validate(document);
      return validation;
    } catch (error) {
      return { valid: false, errors: [error instanceof Error ? error.message : String(error)], warnings: [] };
    }
  }

  /**
   * Verify RCEP checksum
   */
  static verifyChecksum(blob: string): boolean {
    try {
      const { document } = RCEPDecoder.decodeWithoutValidation(blob);
      return RCEPChecksum.verify(document);
    } catch {
      return false;
    }
  }

  // ============================================================================
  // BUNDLE OPERATIONS
  // ============================================================================

  /**
   * Create RL4 bundle from PromptContext
   */
  static createBundle(context: PromptContext, extras: any = {}): RL4PromptContextBundle {
    const doc = RCEPEncoder.buildDocument(context as any);
    return {
      rcep: doc,
      rl4: extras
    };
  }

  /**
   * Extract PromptContext from RL4 bundle
   */
  static extractContext(bundle: RL4PromptContextBundle): PromptContext {
    // M1: Direct extraction from bundle using encoder
    return RCEPEncoder.bundleToContext(bundle);
  }

  /**
   * Encode RL4 bundle → RCEP blob + JSON metadata
   */
  static encodeBundle(bundle: RL4PromptContextBundle): { rcep: string; metadata: string } {
    const rcep = RCEPEncoder.encode(this.extractContext(bundle));
    const metadata = JSON.stringify(bundle.rl4, null, 2);
    return { rcep, metadata };
  }

  /**
   * Decode RCEP blob + metadata → RL4 bundle
   */
  static decodeBundle(rcep: string, metadata: string): RL4PromptContextBundle {
    const context = RCEPEncoder.buildDocument(RCEPDecoder.decodeWithoutValidation(rcep).context as any);
    const rl4 = JSON.parse(metadata);
    return { rcep: context, rl4 };
  }

  // ============================================================================
  // STREAM PROCESSING
  // ============================================================================

  /**
   * Process RCEP document in chunks (for large files)
   */
  static async *processStream(chunks: AsyncIterable<string>, options: RCEPOptions = {}): AsyncGenerator<RCEPBlock> {
    let buffer = '';
    let inBlock = false;
    let currentBlockId = '';
    let expectedSize = 0;
    let blockContent = '';

    for await (const chunk of chunks) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed || trimmed === 'END-RCEP') continue;

        // Block header
        if (trimmed.includes(':') && !inBlock) {
          const [id, size] = trimmed.split(':');
          currentBlockId = id;
          expectedSize = parseInt(size, 10);
          inBlock = true;
          blockContent = '';
          continue;
        }

        // Block content
        if (inBlock) {
          blockContent += trimmed + '\n';

          // Check if we have enough content
          if (new TextEncoder().encode(blockContent).length >= expectedSize) {
            // Parse and yield the block
            try {
              const block = RCEPDecoder.parseBlockBody(currentBlockId, blockContent.trim());
              yield block;
            } catch (error) {
              if (options.mode !== 'permissive') {
                throw error;
              }
              // In permissive mode, skip malformed blocks
            }

            inBlock = false;
            currentBlockId = '';
            blockContent = '';
          }
        }
      }
    }
  }

  /**
   * Stream encode large PromptContext
   */
  static async *encodeStream(context: PromptContext): AsyncGenerator<string> {
    const doc = RCEPEncoder.buildDocument(context as any);

    // Header
    yield `RCEP/${doc.version} ${doc.timestamp}\n`;

    // Blocks
    for (const block of doc.blocks) {
      const body = RCEPEncoder.serializeBlockBody(block);
      const size = new TextEncoder().encode(body).length;
      yield `${block.id}:${size}\n${body}\n`;
    }

    // Footer
    yield "END-RCEP\n";

    // Checksum
    const checksum = RCEPChecksum.compute(doc);
    yield `checksum:${checksum}\n`;
  }

  // ============================================================================
  // POINTER RESOLUTION
  // ============================================================================

  /**
   * Register pointer resolver
   */
  static registerResolver(resolver: PointerResolver): void {
    this.resolvers.set(resolver.scheme, resolver);
  }

  /**
   * Resolve pointer using registered resolvers
   */
  static async resolvePointer(ptr: string): Promise<any> {
    const colonIndex = ptr.indexOf(':');
    if (colonIndex <= 0) {
      throw new Error(`Invalid pointer format: ${ptr}`);
    }

    const scheme = ptr.substring(0, colonIndex);
    const address = ptr.substring(colonIndex + 1);

    const resolver = this.resolvers.get(scheme);
    if (!resolver) {
      throw new Error(`No resolver registered for scheme: ${scheme}`);
    }

    return resolver.resolve(address);
  }

  /**
   * Get registered resolver schemes
   */
  static getRegisteredSchemes(): string[] {
    return Array.from(this.resolvers.keys());
  }

  // ============================================================================
  // COMPATIBILITY
  // ============================================================================

  /**
   * Get version from RCEP blob
   */
  static getVersion(blob: string): string | null {
    return RCEPDecoder.getVersion(blob);
  }

  /**
   * Check version compatibility
   */
  static isVersionCompatible(version: string): boolean {
    const supported = ["0.1.0"];
    return supported.includes(version);
  }

  /**
   * Migrate between RCEP versions
   */
  static async migrate(blob: string, targetVersion: string): Promise<string> {
    const currentVersion = this.getVersion(blob);
    if (!currentVersion) {
      throw new Error('Cannot determine version of input blob');
    }

    if (currentVersion === targetVersion) {
      return blob; // No migration needed
    }

    // For now, only support 0.1.0
    if (currentVersion !== "0.1.0") {
      throw new Error(`Migration from ${currentVersion} not supported`);
    }

    if (targetVersion !== "0.1.0") {
      throw new Error(`Migration to ${targetVersion} not supported`);
    }

    return blob; // Same version migration
  }

  // ============================================================================
  // ANALYTICS & PROFILING
  // ============================================================================

  /**
   * Get processing statistics
   */
  static getStats(): RCEPStats {
    return { ...this.stats };
  }

  /**
   * Reset processing statistics
   */
  static resetStats(): void {
    this.stats = {
      version: "0.1.0",
      blockCount: 0,
      totalSize: 0
    };
  }

  /**
   * Analyze RCEP document structure
   */
  static analyze(blob: string): {
    size: number;
    blockCount: number;
    blocks: string[];
    hasChecksum: boolean;
    version: string | null;
  } {
    const size = blob.length;
    const lines = blob.split('\n');
    const blockHeaders = lines.filter(line => /^\w+:\d+$/.test(line.trim()));
    const blocks = blockHeaders.map(h => h.split(':')[0]);
    const hasChecksum = lines.some(line => line.trim().startsWith('checksum:'));
    const version = this.getVersion(blob);

    return {
      size,
      blockCount: blocks.length,
      blocks,
      hasChecksum,
      version
    };
  }

  /**
   * Calculate compression metrics
   */
  static calculateCompression(context: PromptContext): {
    originalSize: number;
    compressedSize: number;
    ratio: number;
    savings: number;
  } {
    // Estimate original size (JSON representation)
    const originalJson = JSON.stringify(context, null, 2);
    const originalSize = new TextEncoder().encode(originalJson).length;

    const compressed = RCEPEncoder.encode(context);
    const compressedSize = compressed.length;

    const ratio = originalSize > 0 ? compressedSize / originalSize : 1;
    const savings = originalSize > 0 ? ((originalSize - compressedSize) / originalSize) * 100 : 0;

    return {
      originalSize,
      compressedSize,
      ratio,
      savings
    };
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Generate session ID
   */
  static generateSessionId(): string {
    return crypto.randomUUID();
  }

  /**
   * Validate pointer format
   */
  static isValidPointer(ptr: string): boolean {
    const colonIndex = ptr.indexOf(':');
    return colonIndex > 0 && colonIndex < ptr.length - 1;
  }

  /**
   * Extract pointer scheme
   */
  static getPointerScheme(ptr: string): string | null {
    const colonIndex = ptr.indexOf(':');
    return colonIndex > 0 ? ptr.substring(0, colonIndex) : null;
  }

  /**
   * Format timestamp for RCEP
   */
  static formatTimestamp(date: Date = new Date()): number {
    return date.getTime();
  }

  /**
   * Parse RCEP timestamp
   */
  static parseTimestamp(timestamp: number): Date {
    return new Date(timestamp);
  }

  /**
   * Create minimal RCEP document for testing
   */
  static createTestDocument(overrides: Partial<PromptContext> = {}): PromptContext {
    const now = this.formatTimestamp();
    return {
      layers: overrides.layers || ['test-layer'],
      topics: overrides.topics || ['test-topic'],
      events: overrides.events || [
        { id: 1, time: now, type: 'query', ptr: 'LAYER:1' }
      ],
      decisions: overrides.decisions || [
        { id: 1, type: 'accept', weight: 100, inputs: [1] }
      ],
      insights: overrides.insights || [
        { summary: 'Test insight pattern detected' }
      ],
      humanSummary: overrides.humanSummary || 'Test RCEP document - M1 Minimal Strict'
    };
  }
}

// ============================================================================
// DEFAULT POINTER RESOLVERS
// ============================================================================

class HistoryResolver implements PointerResolver {
  scheme = 'HISTORY';

  async resolve(ptr: string): Promise<any> {
    // Placeholder for history resolution
    // In real implementation, this would query the history system
    return {
      type: 'history',
      id: ptr,
      timestamp: Date.now(),
      content: `History entry for ${ptr}`
    };
  }
}

class MILResolver implements PointerResolver {
  scheme = 'MIL';

  async resolve(ptr: string): Promise<any> {
    // Placeholder for MIL resolution
    // In real implementation, this would query the MIL system
    return {
      type: 'mil',
      address: ptr,
      timestamp: Date.now(),
      content: `MIL entry for ${ptr}`
    };
  }
}

// Register default resolvers
RCEPParser.registerResolver(new HistoryResolver());
RCEPParser.registerResolver(new MILResolver());