import { Inflate } from 'fflate';

export const ROM_LIMITS = { archiveBytes: 2097152, entries: 128, entryBytes: 262144, totalBytes: 1048576, nameBytes: 256 } as const;
export class ZipError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'ZipError'; }
}
export interface ZipMember { name: string; bytes: Uint8Array; crc32: string }
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) { let value = i; for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; crcTable[i] = value >>> 0; }
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export function crc32Hex(bytes: Uint8Array): string { return crc32(bytes).toString(16).toUpperCase().padStart(8, '0'); }
const fail = (code: string, message: string): never => { throw new ZipError(code, message); };
interface DirectoryEntry { name: string; rawName: Uint8Array; flags: number; method: number; crc: number; compressed: number; size: number; offset: number; directory: boolean }

/** Parse ordinary stored/deflated ZIPs in memory. Never extract paths or trust advertised output lengths. */
export function readZip(input: ArrayBuffer | Uint8Array): ZipMember[] {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length > ROM_LIMITS.archiveBytes) fail('archive-too-large', 'ZIP is too large. The maximum archive size is 2 MiB.');
  if (bytes.length < 22) fail('malformed-zip', 'The file is not a complete ZIP archive.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bounds = (offset: number, length: number, end = bytes.length): void => { if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > end) fail('malformed-zip', 'ZIP contains a truncated or invalid entry.'); };
  const u16 = (offset: number): number => { bounds(offset, 2); return view.getUint16(offset, true); };
  const u32 = (offset: number): number => { bounds(offset, 4); return view.getUint32(offset, true); };
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (u32(offset) === 0x06054b50 && offset + 22 + u16(offset + 20) === bytes.length) { end = offset; break; }
  }
  if (end < 0) fail('malformed-zip', 'ZIP directory is missing or truncated.');
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10)) fail('unsupported-zip', 'Split ZIP archives are unsupported.');
  const count = u16(end + 10);
  const directorySize = u32(end + 12);
  const directoryOffset = u32(end + 16);
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) fail('unsupported-zip', 'ZIP64 archives are unsupported. Use an ordinary ZIP.');
  if (!count || count > ROM_LIMITS.entries) fail('too-many-entries', 'ZIP must contain between 1 and 128 entries.');
  bounds(directoryOffset, directorySize, end);
  if (directoryOffset + directorySize !== end) fail('malformed-zip', 'ZIP directory does not match the archive layout.');
  function extraFields(offset: number, length: number): void {
    bounds(offset, length);
    const extraEnd = offset + length;
    while (offset < extraEnd) {
      bounds(offset, 4, extraEnd);
      const kind = u16(offset); const size = u16(offset + 2); offset += 4;
      bounds(offset, size, extraEnd);
      if (kind === 1) fail('unsupported-zip', 'ZIP64 entries are unsupported. Use an ordinary ZIP.');
      offset += size;
    }
  }
  function decodeName(raw: Uint8Array, flags: number): string {
    if (!raw.length || raw.length > ROM_LIMITS.nameBytes) fail('unsafe-name', 'ZIP entry names must be 1–256 bytes long.');
    if (!(flags & 0x800) && raw.some((value) => value >= 128)) fail('unsupported-zip', 'Use ASCII or UTF-8 names in the ZIP.');
    let name: string;
    try { name = new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch { return fail('unsafe-name', 'ZIP contains an invalid filename.'); }
    const parts = name.replace(/\/$/, '').split('/');
    if (name.includes('\\') || name.includes(':') || /[\u0000-\u001f\u007f]/.test(name) || parts.some((part) => !part || part === '.' || part === '..')) fail('unsafe-name', 'ZIP contains an unsafe path or filename.');
    return name;
  }
  const entries: DirectoryEntry[] = [];
  const names = new Set<string>();
  let cursor = directoryOffset;
  let advertisedTotal = 0;
  for (let index = 0; index < count; index += 1) {
    bounds(cursor, 46, end);
    if (u32(cursor) !== 0x02014b50) fail('malformed-zip', 'ZIP directory entry is invalid.');
    const flags = u16(cursor + 8); const method = u16(cursor + 10);
    if (flags & 1) fail('unsupported-zip', 'Encrypted ZIP entries are unsupported.');
    if ((flags & ~0x080e) || (method !== 0 && method !== 8) || (method === 0 && (flags & 6))) fail('unsupported-zip', 'Use an unencrypted stored or deflated ZIP.');
    if (u16(cursor + 34)) fail('unsupported-zip', 'Split ZIP entries are unsupported.');
    if ((u32(cursor + 38) >>> 16 & 0xf000) === 0xa000) fail('unsafe-name', 'ZIP symlinks are unsupported.');
    const compressed = u32(cursor + 20); const size = u32(cursor + 24); const offset = u32(cursor + 42);
    if (size === 0xffffffff || compressed === 0xffffffff || offset === 0xffffffff) fail('unsupported-zip', 'ZIP64 entries are unsupported.');
    if (size > ROM_LIMITS.entryBytes || (advertisedTotal += size) > ROM_LIMITS.totalBytes) fail('inflated-too-large', 'ZIP decompressed contents exceed the import limit.');
    const nameSize = u16(cursor + 28); const extraSize = u16(cursor + 30); const commentSize = u16(cursor + 32);
    bounds(cursor + 46, nameSize + extraSize + commentSize, end);
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameSize);
    const name = decodeName(rawName, flags);
    const collisionKey = name.replace(/\/$/, '').normalize('NFC').toLowerCase();
    if (names.has(collisionKey)) fail('duplicate-name', 'ZIP contains duplicate or colliding filenames.');
    names.add(collisionKey);
    extraFields(cursor + 46 + nameSize, extraSize);
    entries.push({ name, rawName, flags, method, crc: u32(cursor + 16), compressed, size, offset, directory: name.endsWith('/') });
    cursor += 46 + nameSize + extraSize + commentSize;
  }
  if (cursor !== end) fail('malformed-zip', 'ZIP entry count does not match its directory.');
  const ranges: [number, number][] = [];
  const result: ZipMember[] = [];
  let actualTotal = 0;
  for (const entry of entries) {
    bounds(entry.offset, 30, directoryOffset);
    if (u32(entry.offset) !== 0x04034b50 || u16(entry.offset + 6) !== entry.flags || u16(entry.offset + 8) !== entry.method) fail('malformed-zip', 'ZIP local header does not match its directory.');
    const nameSize = u16(entry.offset + 26); const extraSize = u16(entry.offset + 28);
    const dataOffset = entry.offset + 30 + nameSize + extraSize;
    bounds(entry.offset + 30, nameSize + extraSize, directoryOffset);
    const localName = bytes.subarray(entry.offset + 30, entry.offset + 30 + nameSize);
    if (localName.length !== entry.rawName.length || localName.some((byte, index) => byte !== entry.rawName[index])) fail('malformed-zip', 'ZIP filenames disagree between headers.');
    extraFields(entry.offset + 30 + nameSize, extraSize);
    const localValues = [u32(entry.offset + 14), u32(entry.offset + 18), u32(entry.offset + 22)];
    const expectedValues = [entry.crc, entry.compressed, entry.size];
    if (localValues.some((value, index) => value !== expectedValues[index] && (!(entry.flags & 8) || value !== 0))) fail('malformed-zip', 'ZIP sizes or checksum disagree between headers.');
    bounds(dataOffset, entry.compressed, directoryOffset);
    let rangeEnd = dataOffset + entry.compressed;
    if (entry.flags & 8) {
      bounds(rangeEnd, 12, directoryOffset);
      const signature = u32(rangeEnd) === 0x08074b50;
      const descriptor = rangeEnd + (signature ? 4 : 0);
      bounds(descriptor, 12, directoryOffset);
      if (u32(descriptor) !== entry.crc || u32(descriptor + 4) !== entry.compressed || u32(descriptor + 8) !== entry.size) fail('malformed-zip', 'ZIP data descriptor is invalid.');
      rangeEnd = descriptor + 12;
    }
    ranges.push([entry.offset, rangeEnd]);
    const compressedBytes = bytes.subarray(dataOffset, dataOffset + entry.compressed);
    let output: Uint8Array;
    if (entry.method === 0) {
      if (entry.compressed !== entry.size) fail('malformed-zip', 'Stored ZIP entry has inconsistent sizes.');
      output = compressedBytes.slice();
    } else {
      let size = 0; let final = false; const chunks: Uint8Array[] = [];
      const inflater = new Inflate((chunk, complete) => {
        size += chunk.length;
        // Streaming emits the actual output. No fixed-size buffer can silently clip a bomb.
        if (size > entry.size || size > ROM_LIMITS.entryBytes || actualTotal + size > ROM_LIMITS.totalBytes) fail('inflated-too-large', 'ZIP output exceeds its advertised size or the import limit.');
        chunks.push(chunk); final = complete;
      });
      try {
        // Tiny input chunks bound each decompressor allocation before its output callback.
        if (!compressedBytes.length) inflater.push(compressedBytes, true);
        for (let index = 0; index < compressedBytes.length; index += 128) inflater.push(compressedBytes.subarray(index, index + 128), index + 128 >= compressedBytes.length);
      } catch (error) {
        if (error instanceof ZipError) throw error;
        return fail('malformed-zip', 'ZIP deflate stream is invalid or truncated.');
      }
      if (!final || size !== entry.size) fail('malformed-zip', 'ZIP decompressed size does not match its directory.');
      output = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
    }
    actualTotal += output.length;
    if (actualTotal > ROM_LIMITS.totalBytes) fail('inflated-too-large', 'ZIP decompressed contents exceed the import limit.');
    if (crc32(output) !== entry.crc) fail('crc-mismatch', 'ZIP entry checksum is invalid. The file may be damaged.');
    if (entry.directory) { if (output.length) fail('malformed-zip', 'ZIP directory entries must be empty.'); }
    else result.push({ name: entry.name, bytes: output, crc32: entry.crc.toString(16).toUpperCase().padStart(8, '0') });
  }
  ranges.sort((left, right) => left[0] - right[0]);
  let rangeEnd = 0;
  for (const range of ranges) { if (range[0] !== rangeEnd) fail('malformed-zip', 'ZIP entries overlap or contain unlisted data.'); rangeEnd = range[1]; }
  if (rangeEnd !== directoryOffset) fail('malformed-zip', 'ZIP contains unlisted data before its directory.');
  return result;
}
