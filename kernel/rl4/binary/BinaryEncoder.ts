/******************************************************************************************
 * BinaryEncoder.ts — RL4-RCEP-PROTECTED Binary Encoder
 *
 * Pipeline:
 *   1. Serialize PromptContext as canonical JSON
 *   2. Encode JSON → CBOR
 *   3. Optionally compress using Brotli
 *   4. Prepend RL4 binary header (magic, version, flags, length)
 *
 * Output: Buffer (binary RL4 document)
 ******************************************************************************************/

import { BinaryHeaderCodec, FLAG_CBOR, FLAG_BROTLI } from "./BinaryHeader";
import { encode as cborEncode } from "cbor-x";
import * as zlib from "zlib";

const brotliCompress = (input: Buffer) =>
  new Promise<Buffer>((resolve, reject) => {
    zlib.brotliCompress(input, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }, (err, out) => {
      if (err) reject(err);
      else resolve(out);
    });
  });

export interface BinaryEncodeOptions {
  cbor?: boolean;      // default true
  brotli?: boolean;    // default true
  pretty?: boolean;    // pretty JSON before CBOR (debug only)
}

export class BinaryEncoder {
  static async encode(context: any, options: BinaryEncodeOptions = {}): Promise<Buffer> {
    const useCBOR = options.cbor !== false;
    const useBrotli = options.brotli !== false;

    // 1. Canonical JSON
    const json = JSON.stringify(context, null, options.pretty ? 2 : 0);
    const jsonBuf = Buffer.from(json, "utf8");

    // 2. Convert → CBOR
    const cborBuf = useCBOR ? Buffer.from(cborEncode(context)) : jsonBuf;

    // 3. Brotli compression
    let payload: Buffer = cborBuf;
    if (useBrotli) {
      payload = await brotliCompress(cborBuf);
    }

    // 4. Prepare flags
    let flags = 0;
    if (useCBOR)   flags |= FLAG_CBOR;
    if (useBrotli) flags |= FLAG_BROTLI;

    // 5. Header: RL4 magic + flags + length
    const header = BinaryHeaderCodec.encodeHeader(flags, payload.length);

    // 6. Final binary blob
    return Buffer.concat([header, payload]);
  }
}