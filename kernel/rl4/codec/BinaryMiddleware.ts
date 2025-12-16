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
    if (BinaryDecoder.isBinary(raw)) return "binary";

    // 2. JSON fallback (legacy) - RCEP disabled for automatic processing
    return "json";
  }

  // ============================================================================
  // DECODE ENTRYPOINT
  // ============================================================================

  static async decode(raw: Buffer | string): Promise<DecodeResult> {
    const format = this.detectFormat(raw);

    try {
      switch (format) {
        case "binary":
          return {
            context: BinaryDecoder.decode(raw),
            format
          };

        default:
          return {
            context: PromptCodecRL4.decode(
              JSON.parse(raw.toString("utf8"))
            ),
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

  static encode(context: any, format: RL4OutputFormat): Buffer | string {
    try {
      switch (format) {
        case "binary":
          return BinaryEncoder.encode(context);

        default:
          return JSON.stringify(
            PromptCodecRL4.encode(context),
            null,
            2
          );
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
    const encoded = this.encode(context, format);
    const decoded = await this.decode(encoded);
    return { encoded, decoded };
  }

  // ============================================================================
  // STREAM SUPPORT (optional future extension)
  // ============================================================================

  static isBinary(raw: Buffer | string): boolean {
    return BinaryDecoder.isBinary(raw);
  }
}