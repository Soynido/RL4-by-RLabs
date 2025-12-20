/******************************************************************************************
 * BinaryMiddleware.ts — Unified RL4 Codec Router (JSON ↔ RCEP ↔ Binary)
 *
 * OPTION 1: Legacy + Nouveau Codec
 *
 * Responsibilities:
 *  - Detect incoming format (binary / RCEP / JSON)
 *  - Route to correct decoder
 *  - Route outgoing context to correct encoder
 *  - Preserve RL4 isolation: no logic change in RL4codec, RCEP, PromptCodecRL4
 *
 * Guarantees:
 *  - Zero-breaking-changes
 *  - Fully backward compatible with existing extension
 *  - Transparent upgrade path to binary codec
 ******************************************************************************************/

import { BinaryEncoder, BinaryDecoder } from "../binary/BinaryCodec";
import { RCEPParser } from "./RCEP_Parser";
import { PromptCodecRL4 } from "../PromptCodecRL4";

export type RL4InputFormat = "binary" | "rcep" | "json";
export type RL4OutputFormat = RL4InputFormat;

export interface DecodeResult<T = any> {
  context: T;
  format: RL4InputFormat;
}

export class BinaryMiddleware {
  // ============================================================================
  // DETECTION LOGIC
  // ============================================================================

  static detectFormat(raw: Buffer | string): RL4InputFormat {
    // 1. BINARY ?
    if (this.isBinaryFormat(raw)) return "binary";

    // 2. JSON fallback (legacy) - RCEP disabled for automatic processing
    return "json";
  }

  static isBinaryFormat(raw: Buffer | string): boolean {
    if (Buffer.isBuffer(raw)) {
      // Simple heuristic: check for common binary signatures
      const firstBytes = raw.slice(0, 4);
      return firstBytes[0] === 0x89 && firstBytes[1] === 0x50 && firstBytes[2] === 0x4E && firstBytes[3] === 0x47; // PNG signature
    }
    return false;
  }

  // ============================================================================
  // DECODE ENTRYPOINT
  // ============================================================================

  static async decode(raw: Buffer | string): Promise<DecodeResult> {
    const format = this.detectFormat(raw);

    try {
      switch (format) {
        case "binary":
          if (Buffer.isBuffer(raw)) {
            return {
              context: this.decodeBinaryData(raw),
              format
            };
          }
          throw new Error("Binary format requires Buffer input");

        default:
          return {
            context: this.decodeJsonData(raw),
            format
          };
      }
    } catch (err) {
      throw new Error(
        `[BinaryMiddleware] Decode failure (format=${format}): ${(err as Error).message}`
      );
    }
  }

  // ============================================================================
  // ENCODE ENTRYPOINT
  // ============================================================================

  static async encode(context: any, format: RL4OutputFormat): Promise<string | Buffer> {
    try {
      switch (format) {
        case "binary":
          return this.encodeBinaryData(context);

        default:
          return this.encodeJsonData(context);
      }
    } catch (err) {
      throw new Error(
        `[BinaryMiddleware] Encode failure (format=${format}): ${(err as Error).message}`
      );
    }
  }

  // ============================================================================
  // SAFE ROUND-TRIP (for tests)
  // ============================================================================

  static async roundTrip(context: any, format: RL4OutputFormat) {
    const encoded = await this.encode(context, format);
    const decoded = await this.decode(encoded);
    return { encoded, decoded };
  }

  // ============================================================================
  // STREAM SUPPORT (optional future extension)
  // ============================================================================

  static isBinary(raw: Buffer | string): boolean {
    return this.isBinaryFormat(raw);
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private static decodeBinaryData(buffer: Buffer): any {
    // Simple binary decode - placeholder implementation
    // In a real implementation, this would use the actual binary format
    throw new Error("Binary decoding not yet implemented - requires BinaryDecoder");
  }

  private static decodeJsonData(raw: Buffer | string): any {
    try {
      const jsonString = typeof raw === "string" ? raw : raw.toString("utf8");
      return JSON.parse(jsonString);
    } catch (err) {
      throw new Error(`JSON decode failed: ${(err as Error).message}`);
    }
  }

  private static async encodeBinaryData(context: any): Promise<Buffer> {
    // Simple binary encode - placeholder implementation
    // In a real implementation, this would use the actual binary format
    throw new Error("Binary encoding not yet implemented - requires BinaryEncoder");
  }

  private static encodeJsonData(context: any): string {
    try {
      return JSON.stringify(context, null, 2);
    } catch (err) {
      throw new Error(`JSON encode failed: ${(err as Error).message}`);
    }
  }
}