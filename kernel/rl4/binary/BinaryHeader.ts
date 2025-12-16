/******************************************************************************************
 * BinaryHeader.ts — RL4-RCEP-PROTECTED binary header definition
 *
 * Structure:
 *   Magic (16 bytes)  = "RL4-RCEP-PROTECTED"
 *   Version (u8)      = 0x01
 *   Flags (u8)        = bitmask:
 *                        0x01 = CBOR enabled
 *                        0x02 = Brotli enabled
 *   Length (u32 BE)   = payload size (compressed or not)
 *
 * This header is 22 bytes total.
 ******************************************************************************************/

export const MAGIC_HEADER = Buffer.from("RL4-RCEP-PROTECTED", "utf8");
export const BINARY_VERSION = 0x01;

// Flags
export const FLAG_CBOR   = 0x01;
export const FLAG_BROTLI = 0x02;

export interface BinaryHeader {
  magic: Buffer;      // 16 bytes
  version: number;    // u8
  flags: number;      // u8
  length: number;     // u32 BE
}

export class BinaryHeaderCodec {

  static hasMagic(buf: Buffer): boolean {
    return buf.length >= 16 && buf.subarray(0, 16).equals(MAGIC_HEADER);
  }

  static encodeHeader(flags: number, payloadLength: number): Buffer {
    const header = Buffer.alloc(22);

    // Magic
    MAGIC_HEADER.copy(header, 0);

    // Version
    header[16] = BINARY_VERSION;

    // Flags
    header[17] = flags;

    // Length (u32-be)
    header.writeUInt32BE(payloadLength, 18);

    return header;
  }

  static decodeHeader(buf: Buffer): BinaryHeader & { headerSize: number } {
    if (buf.length < 22) {
      throw new Error("BinaryHeader decode failed: buffer too small (<22 bytes)");
    }

    const magic = buf.subarray(0, 16);
    if (!magic.equals(MAGIC_HEADER)) {
      throw new Error("Invalid magic header: not RL4-RCEP-PROTECTED");
    }

    const version = buf[16];
    const flags = buf[17];
    const length = buf.readUInt32BE(18);

    return { magic, version, flags, length, headerSize: 22 };
  }
}