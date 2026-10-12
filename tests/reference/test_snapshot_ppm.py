# SPDX-License-Identifier: GPL-3.0-or-later
"""Lossless snapshot retention faults, independent of private game fixtures."""
import gzip
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/reference'))
from snapshot_ppm import compare_snapshots, read_snapshot


class SnapshotRetentionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='nocpu-ppm-faults-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.header = b'P6\n576 432\n255\n'
        self.pixels = bytes(range(256)) * (576 * 432 * 3 // 256)
        self.value = self.header + self.pixels
        self.gold = self.root / 'gold'
        self.peer = self.root / 'peer'
        for directory in (self.gold, self.peer):
            directory.mkdir()
            (directory / 'frames.csv').write_text('frame,time_ps,fnv1a64\n0,250000000000,1\n1,399000000000,2\n')
            (directory / 'frame-geometry.csv').write_text('frame,time_ps,width,height\n0,250000000000,576,432\n1,399000000000,576,432\n')
        for name in ('250ms.ppm', '399ms.ppm'):
            (self.gold / name).write_bytes(self.value)
            (self.peer / (name + '.gz')).write_bytes(gzip.compress(self.value, compresslevel=1, mtime=0))

    def fingerprints(self):
        return {str(p.relative_to(self.root)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in self.root.rglob('*') if p.is_file() and not p.is_symlink()}

    def rejected(self):
        with self.assertRaises((ValueError, FileNotFoundError)):
            compare_snapshots(self.gold, [self.peer])

    def test_exact_roundtrip_and_preserves_all_existing_bytes(self):
        before = self.fingerprints()
        result = compare_snapshots(self.gold, [self.peer])
        self.assertEqual(result['snapshot_count'], 2)
        self.assertEqual(result['maximum_fixed_count'], 65)
        for item in result['snapshots']:
            self.assertEqual(item['original']['decoded_sha256'], hashlib.sha256(self.value).hexdigest())
            self.assertEqual(item['peers'][0]['decoded_bytes'], len(self.value))
        self.assertEqual(self.fingerprints(), before)

    def test_legacy_raw_readback_unchanged(self):
        other = self.root / 'legacy'
        other.mkdir()
        for path in self.gold.iterdir():
            (other / path.name).write_bytes(path.read_bytes())
        before = self.fingerprints()
        self.assertEqual(compare_snapshots(self.gold, [other], peer_encoding='raw')['snapshot_count'], 2)
        self.assertEqual(self.fingerprints(), before)

    def test_missing_or_duplicate_peers(self):
        for peers in ([], [self.peer, self.peer]):
            with self.assertRaises(ValueError):
                compare_snapshots(self.gold, peers)

    def test_crc_fault(self):
        path = self.peer / '250ms.ppm.gz'
        data = bytearray(path.read_bytes())
        data[-8] ^= 1
        path.write_bytes(data)
        self.rejected()

    def test_truncated_footer(self):
        path = self.peer / '250ms.ppm.gz'
        path.write_bytes(path.read_bytes()[:-1])
        self.rejected()

    def test_missing_required_snapshot(self):
        (self.peer / '250ms.ppm.gz').rename(self.root / 'retained-missing.gz')
        self.rejected()

    def test_extra_timestamp_snapshot(self):
        (self.peer / '500ms.ppm.gz').write_bytes(gzip.compress(self.value))
        self.rejected()

    def test_extra_member_even_empty(self):
        path = self.peer / '250ms.ppm.gz'
        path.write_bytes(path.read_bytes() + gzip.compress(b''))
        self.rejected()

    def test_trailing_encoded_data(self):
        path = self.peer / '250ms.ppm.gz'
        path.write_bytes(path.read_bytes() + b'extra')
        self.rejected()

    def test_corrupt_pixel_with_valid_gzip_crc(self):
        data = bytearray(self.value)
        data[len(self.header) + 100] ^= 1
        (self.peer / '250ms.ppm.gz').write_bytes(gzip.compress(data))
        self.rejected()

    def test_changed_header_with_same_size_and_valid_gzip_crc(self):
        data = self.value.replace(b'576 432', b'575 432', 1)
        (self.peer / '250ms.ppm.gz').write_bytes(gzip.compress(data))
        self.rejected()

    def test_extra_decoded_byte(self):
        (self.peer / '250ms.ppm.gz').write_bytes(gzip.compress(self.value + b'\0'))
        self.rejected()

    def test_truncated_pixels_with_valid_crc(self):
        (self.peer / '250ms.ppm.gz').write_bytes(gzip.compress(self.value[:-1]))
        self.rejected()

    def test_mixed_raw_and_gzip_rejected(self):
        (self.peer / '250ms.ppm').write_bytes(self.value)
        self.rejected()

    def test_snapshot_symlink_rejected(self):
        path = self.peer / '250ms.ppm.gz'
        path.rename(self.root / 'retained-link-target.gz')
        path.symlink_to(self.root / 'retained-link-target.gz')
        self.rejected()

    def test_parent_directory_symlink_rejected(self):
        link = self.root / 'linked-peer'
        link.symlink_to(self.peer, target_is_directory=True)
        with self.assertRaises(ValueError):
            compare_snapshots(self.gold, [link])

    def test_frame_time_identity_fault(self):
        geometry = self.peer / 'frame-geometry.csv'
        geometry.write_text(geometry.read_text().replace('399000000000', '399000000001'))
        self.rejected()

    def test_changed_scheduled_frame_identity(self):
        for name in ('frames.csv', 'frame-geometry.csv'):
            path = self.peer / name
            path.write_text(path.read_text().replace('399000000000', '400000000000'))
        self.rejected()

    def test_declared_dimensions_fault(self):
        path = self.peer / 'frame-geometry.csv'
        path.write_text(path.read_text().replace('576,432', '575,432'))
        self.rejected()

    def test_nonincreasing_frame_times(self):
        for name in ('frames.csv', 'frame-geometry.csv'):
            path = self.peer / name
            path.write_text(path.read_text().replace('399000000000', '250000000000'))
        self.rejected()

    def test_noncontiguous_frame_indices(self):
        for name in ('frames.csv', 'frame-geometry.csv'):
            path = self.peer / name
            path.write_text(path.read_text().replace('1,399000000000', '2,399000000000'))
        self.rejected()

    def test_valid_gzip_decoded_overrun_bomb(self):
        (self.peer / '250ms.ppm.gz').write_bytes(gzip.compress(self.value + bytes(4 * len(self.value))))
        self.rejected()

    def test_oversize_encoded_regular_file(self):
        path = self.peer / '250ms.ppm.gz'
        path.write_bytes(bytes(len(self.value) + 65537))
        self.rejected()

    def test_fifo_cannot_block_reader(self):
        import os
        path = self.root / 'fifo.ppm'
        os.mkfifo(path)
        with self.assertRaises(ValueError):
            read_snapshot(path, 576, 432)


if __name__ == '__main__':
    unittest.main()
