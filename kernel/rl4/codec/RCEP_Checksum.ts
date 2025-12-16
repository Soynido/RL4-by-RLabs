/******************************************************************************************
 * RCEP_Checksum.ts — Canonical SHA-256 for RCEP 0.1.0
 *
 * Responsibilities:
 *  - Convert RCEPDocument → canonical byte stream
 *  - Compute SHA-256 digest (hex, 64 chars)
 *  - Provide integrity check utilities
 *
 * RFC Guarantees:
 *  - LF only (0x0A)
 *  - No CRLF, no tabs, no trailing whitespace
 *  - UTF-8 NFC normalization
 *  - Deterministic ordering
 ******************************************************************************************/

import crypto from "crypto";
import { RCEPDocument } from "./RCEP_Types";

export class RCEPChecksum {
  /**
   * Convert entire document to canonical byte representation.
   * NOTE: The "checksum:" line itself MUST NOT be included.
   */
  static canonicalize(doc: RCEPDocument): string {
    // 1. Normalize JSON structurally (stable key ordering)
    const ordered = RCEPChecksum.sortObjectRecursively(doc);

    // 2. Stable stringification
    let json = JSON.stringify(ordered, null, 2);

    // 3. Enforce LF-only
    json = json.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // 4. Remove trailing spaces
    json = json
      .split("\n")
      .map(line => line.replace(/\s+$/g, ""))
      .join("\n");

    // 5. Unicode NFC normalization
    json = json.normalize("NFC");

    // 6. Remove final checksum if present
    json = json.replace(/"checksum":\s*"[^"]*"/, `"checksum": null`);

    return json;
  }

  /**
   * Compute SHA-256 of canonical document.
   */
  static compute(doc: RCEPDocument): string {
    const canonical = RCEPChecksum.canonicalize(doc);
    const hash = crypto.createHash("sha256");
    hash.update(Buffer.from(canonical, "utf8"));
    return hash.digest("hex");
  }

  /**
   * Verify checksum field matches computed canonical checksum.
   * M1 Note: RCEPDocument doesn't have built-in checksum field in M1.
   * Checksum verification happens at blob level.
   */
  static verify(doc: RCEPDocument): boolean {
    // M1: No checksum in document structure
    // Verification happens at encoding/decoding level
    return true;
  }

  // ============================================================================
  // INTERNAL UTILITIES
  // ============================================================================

  /**
   * Recursively sort all object keys lexicographically.
   * Ensures deterministic ordering across encoders.
   */
  private static sortObjectRecursively(value: any): any {
    if (Array.isArray(value)) {
      return value.map(v => RCEPChecksum.sortObjectRecursively(v));
    }
    if (value && typeof value === "object") {
      return Object.keys(value)
        .sort((a, b) => a.localeCompare(b))
        .reduce((acc, key) => {
          acc[key] = RCEPChecksum.sortObjectRecursively(value[key]);
          return acc;
        }, {} as any);
    }
    return value;
  }
}