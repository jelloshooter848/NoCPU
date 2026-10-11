#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Deterministically render the retained NoCPU SVG mark into opaque install icons.
// No network, external renderer or additional runtime dependency is required.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const source = readFileSync(new URL('../web/public/icon.svg', import.meta.url), 'utf8');
if (!/<svg\b[^>]*viewBox="0 0 64 64"/.test(source)) throw new Error('Expected the retained 64×64 icon source.');
const color = (value) => {
  if (!/^#[0-9a-f]{6}$/i.test(value ?? '')) throw new Error('Only opaque RGB source colors are supported.');
  return [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
};
const shapes = [...source.matchAll(/<(rect|path|circle)\b([^>]*)\/>/g)].map(([, kind, raw]) => {
  const a = Object.fromEntries([...raw.matchAll(/([a-z-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]));
  if (kind === 'rect') {
    const x = Number(a.x ?? 0), y = Number(a.y ?? 0), width = Number(a.width), height = Number(a.height), radius = Number(a.rx ?? 0);
    return { color: color(a.fill), contains: (px, py) => {
      if (px < x || py < y || px > x + width || py > y + height) return false;
      const cx = Math.max(x + radius, Math.min(px, x + width - radius));
      const cy = Math.max(y + radius, Math.min(py, y + height - radius));
      return (px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2;
    } };
  }
  if (kind === 'circle') return { color: color(a.fill), contains: (px, py) => (px - Number(a.cx)) ** 2 + (py - Number(a.cy)) ** 2 <= Number(a.r) ** 2 };
  // The original mark contains only move/straight-line commands with butt caps.
  const tokens = a.d.match(/[a-zA-Z]|-?(?:\d*\.)?\d+/g) ?? [];
  if (tokens.join('') !== a.d.replace(/[\s,]/g, '')) throw new Error('Unsupported SVG path syntax.');
  const lines = [];
  let x = 0, y = 0, index = 0;
  while (index < tokens.length) {
    const command = tokens[index++];
    if (!/^[MmLlHhVv]$/.test(command)) throw new Error(`Unsupported SVG path command: ${command}`);
    const relative = command === command.toLowerCase();
    const number = () => {
      const token = tokens[index++];
      if (!token || !/^-?(?:\d*\.)?\d+$/.test(token)) throw new Error('Missing SVG coordinate.');
      return Number(token);
    };
    let nx = x, ny = y;
    if (/^[MmLl]$/.test(command)) { nx = number() + (relative ? x : 0); ny = number() + (relative ? y : 0); }
    else if (/^[Hh]$/.test(command)) nx = number() + (relative ? x : 0);
    else ny = number() + (relative ? y : 0);
    if (!/^[Mm]$/.test(command)) lines.push([x, y, nx, ny]);
    x = nx; y = ny;
  }
  const half = Number(a['stroke-width']) / 2;
  return { color: color(a.stroke), contains: (px, py) => lines.some(([x1, y1, x2, y2]) => {
    const dx = x2 - x1, dy = y2 - y1, squared = dx * dx + dy * dy;
    const t = ((px - x1) * dx + (py - y1) * dy) / squared;
    return t >= 0 && t <= 1 && (px - x1 - t * dx) ** 2 + (py - y1 - t * dy) ** 2 <= half ** 2;
  }) };
});
if (shapes.length !== 3) throw new Error('Unexpected SVG source shape count; review renderer support before changing the mark.');

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(name, bytes) {
  const type = Buffer.from(name), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length); checksum.writeUInt32BE(crc32(Buffer.concat([type, bytes])));
  return Buffer.concat([length, type, bytes, checksum]);
}
function png(size) {
  const pixels = Buffer.alloc(size * (size * 3 + 1));
  const samples = 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const total = [0, 0, 0];
    for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
      const px = (x + (sx + 0.5) / samples) * 64 / size, py = (y + (sy + 0.5) / samples) * 64 / size;
      let rgb = [0, 0, 0]; // Opaque black corners let iOS apply its own icon mask.
      for (const shape of shapes) if (shape.contains(px, py)) rgb = shape.color;
      for (let channel = 0; channel < 3; channel++) total[channel] += rgb[channel];
    }
    const offset = y * (size * 3 + 1) + 1 + x * 3;
    for (let channel = 0; channel < 3; channel++) pixels[offset + channel] = Math.round(total[channel] / samples ** 2);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const destination = new URL('../web/public/icons/', import.meta.url);
const arguments_ = process.argv.slice(2);
if (arguments_.some((argument) => argument !== '--check') || arguments_.length > 1) throw new Error('Usage: node tools/render-icons.mjs [--check]');
const check = arguments_[0] === '--check';
if (!check) mkdirSync(destination, { recursive: true });
for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  const path = new URL(name, destination);
  const rendered = png(size);
  if (check) {
    if (!readFileSync(path).equals(rendered)) throw new Error(`Install icon does not match its retained source recipe: ${name}`);
  } else writeFileSync(path, rendered);
  process.stdout.write(`${check ? 'Verified ' : ''}${fileURLToPath(path)} (${size}×${size}, opaque RGB)\n`);
}
