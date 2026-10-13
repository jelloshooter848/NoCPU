#!/usr/bin/env python3
"""The production frontend must not carry the dev ROM endpoint or ROM bytes.

The Vite dev server can offer local fixture ZIPs (vite.config.ts,
web/src/dev-roms.ts). This inspects an actual production build in build/web
(or --dist) after `npm run build:web`. When fixtures are present
(NOCPU_ROM_DIR, else build/roms) every archive and every descriptor-sized
member is searched for, raw and base64-encoded; without fixtures that part
is reported as skipped rather than passed.
"""
# SPDX-License-Identifier: GPL-3.0-or-later
import argparse
import base64
import os
import sys
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'build/web'
DEV_MARKERS = [b'__nocpu-dev-roms', b'importDevRoms', b'nocpu-dev-rom-fixtures']


def rom_dir():
    configured = os.environ.get('NOCPU_ROM_DIR')
    path = Path(configured) if configured else ROOT / 'build/roms'
    return path if path.is_dir() else None


def bundle():
    return {path.relative_to(DIST).as_posix(): path.read_bytes() for path in sorted(DIST.rglob('*')) if path.is_file()}


class ProductionBundleExcludesDevRoms(unittest.TestCase):
    def setUp(self):
        if not (DIST / 'index.html').is_file():
            self.skipTest(f'no production build at {DIST}; run npm run build:web first')
        self.files = bundle()

    def test_no_dev_endpoint_or_module(self):
        for name, data in self.files.items():
            for marker in DEV_MARKERS:
                self.assertNotIn(marker, data, f'{marker.decode()} found in production {name}')

    def test_no_embedded_zip_archives(self):
        for name, data in self.files.items():
            self.assertNotIn(b'PK\x03\x04', data, f'ZIP local header in production {name}')
            self.assertNotIn(b'data:application/zip', data, f'inlined ZIP in production {name}')

    def test_no_fixture_rom_bytes(self):
        directory = rom_dir()
        if directory is None:
            self.skipTest('no ROM fixture directory (NOCPU_ROM_DIR or build/roms); ROM byte search not run')
        needles = []
        for archive in sorted(directory.glob('*.zip')):
            needles.append((archive.name, archive.read_bytes()))
            with zipfile.ZipFile(archive) as source:
                # Descriptor-sized payloads; tiny members could collide by chance.
                needles += [(f'{archive.name}:{info.filename}', source.read(info))
                            for info in source.infolist() if not info.is_dir() and info.file_size >= 256]
        self.assertTrue(needles, 'fixture directory holds no ZIP archives')
        for label, payload in needles:
            # One of three byte offsets aligns with any enclosing base64 stream.
            encoded = [base64.b64encode(payload[shift:])[:-4] for shift in range(3)]
            for name, data in self.files.items():
                self.assertNotIn(payload, data, f'ROM bytes from {label} found in production {name}')
                for variant in encoded:
                    self.assertNotIn(variant, data, f'base64 ROM bytes from {label} found in production {name}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', type=Path, help='production build directory (default build/web)')
    args, rest = parser.parse_known_args()
    if args.dist:
        DIST = args.dist.resolve()
    unittest.main(argv=[sys.argv[0], '-v', *rest])
