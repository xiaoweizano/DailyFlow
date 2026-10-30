const MAX_UUID_V7_TIMESTAMP = 0xffff_ffff_ffff;

export interface UuidV7Options {
  readonly now?: () => number;
  readonly randomBytes?: (length: number) => Uint8Array;
}

function defaultRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function hex(byte: number): string {
  return byte.toString(16).padStart(2, "0");
}

export function createUuidV7(options: UuidV7Options = {}): string {
  const timestamp = Math.trunc((options.now ?? Date.now)());
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > MAX_UUID_V7_TIMESTAMP) {
    throw new RangeError("UUIDv7 timestamp must fit an unsigned 48-bit integer");
  }

  const random = (options.randomBytes ?? defaultRandomBytes)(10);
  if (!(random instanceof Uint8Array) || random.byteLength !== 10) {
    throw new RangeError("UUIDv7 random source must return exactly 10 bytes");
  }

  const bytes = new Uint8Array(16);
  let remaining = timestamp;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = remaining % 256;
    remaining = Math.floor(remaining / 256);
  }

  bytes[6] = 0x70 | (random[0]! & 0x0f);
  bytes[7] = random[1]!;
  bytes[8] = 0x80 | (random[2]! & 0x3f);
  bytes[9] = random[3]!;
  bytes.set(random.subarray(4), 10);

  const value = Array.from(bytes, hex).join("");
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20),
  ].join("-");
}
