/******************************************************************************************
 * BinaryDecoder.ts — RL4-RCEP-PROTECTED Binary Decoder
 *
 * Responsibilities:
 *   - Detect RL4 binary format from magic header
 *   - Parse header (version, flags, payload length)
 *   - Decompress Brotli if needed
 *   - Decode CBOR or JSON depending on flags
 *   - Return canonical PromptContext object
 ******************************************************************************************/

import { BinaryHeaderCodec, FLAG_CBOR, FLAG_BROTLI } from "./BinaryHeader";
import { decode as cborDecode } from "cbor-x";
import * as zlib from "zlib";

const brotliDecompress = (input: Buffer) =>
  new Promise<Buffer>((resolve, reject) => {
    zlib.brotliDecompress(input, (err, out) => {
      if (err) reject(err);
      else resolve(out);
    });
  });

export class BinaryDecoder {

  /**
   * Detects whether the buffer is RL4-binary or plain JSON.
   */
  static isBinaryFormat(buf: Buffer): boolean {
    return BinaryHeaderCodec.hasMagic(buf);
  }

  /**
   * Auto-detect + decode into PromptContext-like object.
   */
  static async decode(buf: Buffer): Promise<any> {
    // TEXT MODE → return JSON directly
    if (!this.isBinaryFormat(buf)) {
      return JSON.parse(buf.toString("utf8"));
    }

    // 1. Parse RL4 binary header
    const { version, flags, length, headerSize } =
      BinaryHeaderCodec.decodeHeader(buf);

    const payload = buf.subarray(headerSize, headerSize + length);

    let data = payload;

    // 2. Brotli decompression
    if (flags & FLAG_BROTLI) {
      data = await brotliDecompress(payload);
    }

    // 3. CBOR decoding
    if (flags & FLAG_CBOR) {
      return cborDecode(data);
    }

    // 4. Fallback JSON
    return JSON.parse(data.toString("utf8"));
  }
}