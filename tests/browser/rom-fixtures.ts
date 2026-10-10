// SPDX-License-Identifier: GPL-3.0-or-later
// Synthetic ZIPs exercise validation/storage only. They contain no game ROMs
// and cannot establish authentic ROM loading, gameplay or circuit fidelity.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

export type RomRequirement = {
  expected_member: string;
  accepted_crc32: string[];
  dump_variants: { crc32: string; size_bytes: number }[];
};
export type AuditedGame = {
  id: string; display_name: string; manufacturer: string; year: number;
  input_slots: number[];
  controls: { label: string; kind: string; slot: number | null }[];
  roms: RomRequirement[];
  audio: { mono_output_wired: boolean };
};
export const auditedGames: AuditedGame[] = JSON.parse(readFileSync(
  new URL('../../tests/fixtures/game-manifest.json', import.meta.url), 'utf8')).games;

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Solve the CRC's 32 linear parity constraints in the final four bytes.
// Mostly constant synthetic bytes are intentional, never copied ROM payloads.
export function syntheticDump(hex: string, size: number, seed = 0): Buffer {
  assert(size >= 4);
  const output = Buffer.alloc(size, seed);
  const baseline = crc32(output);
  const vectors = new Uint32Array(32), masks = new Uint32Array(32);
  for (let bit = 0; bit < 32; bit += 1) {
    const trial = Buffer.from(output);
    trial[size - 4 + (bit >> 3)] ^= 1 << (bit & 7);
    let vector = (crc32(trial) ^ baseline) >>> 0;
    let mask = (1 << bit) >>> 0;
    for (let pivot = 31; pivot >= 0; pivot -= 1) {
      if (!(vector & (1 << pivot))) continue;
      if (!vectors[pivot]) { vectors[pivot] = vector; masks[pivot] = mask; break; }
      vector = (vector ^ vectors[pivot]) >>> 0;
      mask = (mask ^ masks[pivot]) >>> 0;
    }
  }
  let remaining = (Number.parseInt(hex, 16) ^ baseline) >>> 0;
  let solution = 0;
  for (let pivot = 31; pivot >= 0; pivot -= 1) {
    if (!(remaining & (1 << pivot))) continue;
    assert(vectors[pivot], 'CRC repair must have full rank');
    remaining = (remaining ^ vectors[pivot]) >>> 0;
    solution = (solution ^ masks[pivot]) >>> 0;
  }
  assert.equal(remaining, 0);
  for (let bit = 0; bit < 32; bit += 1) if (solution & (1 << bit)) output[size - 4 + (bit >> 3)] ^= 1 << (bit & 7);
  assert.equal(crc32(output), Number.parseInt(hex, 16) >>> 0);
  return output;
}

export type ZipEntry = {
  name: string; data: Buffer; method?: number; flags?: number;
  localName?: string; declaredSize?: number; declaredCrc?: number;
};

export function zip(entries: ZipEntry[]): Buffer {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name), localName = Buffer.from(entry.localName ?? entry.name);
    const method = entry.method ?? 0;
    const compressed = method === 8 ? deflateRawSync(entry.data) : entry.data;
    const size = entry.declaredSize ?? entry.data.length;
    const crc = entry.declaredCrc ?? crc32(entry.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(entry.flags ?? 0, 6); header.writeUInt16LE(method, 8);
    header.writeUInt32LE(crc >>> 0, 14); header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(size, 22); header.writeUInt16LE(localName.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(entry.flags ?? 0, 8); directory.writeUInt16LE(method, 10);
    directory.writeUInt32LE(crc >>> 0, 16); directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(size, 24); directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    local.push(header, localName, compressed); central.push(directory, name);
    offset += header.length + localName.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

export function syntheticGameZip(gameId: string, seed = 0, method = 0): Buffer {
  const game = auditedGames.find((candidate) => candidate.id === gameId)!;
  assert(game?.roms.length);
  const identities = new Map<string, ZipEntry>();
  for (const requirement of game.roms) {
    const variant = requirement.dump_variants[0];
    const identity = `${variant.crc32}:${variant.size_bytes}`;
    if (!identities.has(identity)) identities.set(identity, {
      name: requirement.expected_member,
      data: syntheticDump(variant.crc32, variant.size_bytes, seed), method,
    });
  }
  return zip([...identities.values()]);
}

export function invalidAntiAircraftZips(): { name: string; buffer: Buffer }[] {
  const requirement = auditedGames.find((game) => game.id === 'antiaircraft')!.roms[0];
  const variant = requirement.dump_variants[0];
  const data = syntheticDump(variant.crc32, variant.size_bytes);
  const valid = zip([{ name: requirement.expected_member, data }]);
  const inflated = Buffer.concat([data, Buffer.alloc(128 * 1024)]);
  const corrupted = Buffer.from(data); corrupted[0] ^= 0x80;
  return [
    { name: 'wrong-compatible-data.zip', buffer: zip([{ name: requirement.expected_member, data: Buffer.alloc(32) }]) },
    { name: 'wrong-observed-size.zip', buffer: zip([{ name: requirement.expected_member, data: syntheticDump(variant.crc32, 64) }]) },
    { name: 'actual-crc-corruption.zip', buffer: zip([{ name: requirement.expected_member, data: corrupted, declaredCrc: Number.parseInt(variant.crc32, 16) }]) },
    { name: 'path-traversal.zip', buffer: zip([{ name: '../'+requirement.expected_member, data }]) },
    { name: 'absolute-path.zip', buffer: zip([{ name: '/'+requirement.expected_member, data }]) },
    { name: 'backslash-traversal.zip', buffer: zip([{ name: '..\\'+requirement.expected_member, data }]) },
    { name: 'duplicate-members.zip', buffer: zip([{ name: requirement.expected_member, data }, { name: requirement.expected_member, data: corrupted }]) },
    { name: 'case-collision.zip', buffer: zip([{ name: requirement.expected_member, data }, { name: requirement.expected_member.toUpperCase(), data }]) },
    { name: 'central-local-name-mismatch.zip', buffer: zip([{ name: requirement.expected_member, localName: 'different.bin', data }]) },
    { name: 'encrypted.zip', buffer: zip([{ name: requirement.expected_member, data, flags: 1 }]) },
    { name: 'unsupported-compression.zip', buffer: zip([{ name: requirement.expected_member, data, method: 99 }]) },
    { name: 'truncated.zip', buffer: valid.subarray(0, valid.length - 5) },
    { name: 'inflate-beyond-declared-size.zip', buffer: zip([{ name: requirement.expected_member, data: inflated, method: 8, declaredSize: 32, declaredCrc: Number.parseInt(variant.crc32, 16) }]) },
    { name: 'declared-member-limit.zip', buffer: zip([{ name: requirement.expected_member, data, method: 8, declaredSize: 2 * 1024 * 1024 }]) },
    { name: 'member-count-limit.zip', buffer: zip([{ name: requirement.expected_member, data }, ...Array.from({ length: 1024 }, (_, i) => ({ name: `extra-${i}`, data: Buffer.alloc(0) }))]) },
    { name: 'compressed-file-limit.zip', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) },
  ];
}
