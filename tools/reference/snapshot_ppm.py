# SPDX-License-Identifier: GPL-3.0-or-later
"""Strict bounded comparison of unchanged P6 snapshots stored raw or gzip."""
import csv
import hashlib
import os
from pathlib import Path
import re
import stat
import zlib

SNAPSHOTS_MS = (250,399,633,799,866,999,1000,1132,1166,1232,1316,1382,
    1500,1800,2000,2100,2200,2250,2300,2400,2500,2600,2700,2750,3000,
    3200,3250,3300,3400,3500,3600,3700,3750,3800,3900,4000,4250,4500,
    4750,5000,5250,5500,5750,6000,6500,7500,8000,8500,9000,9500,
    10000,10500,11000,11500,12000,13000,15000,20000,30000,45000,
    60000,80000,110000,130000,170000)


def _regular_file(path):
    path = Path(path).absolute()
    for component in reversed((path, *path.parents)):
        if stat.S_ISLNK(os.lstat(component).st_mode):
            raise ValueError('Snapshot evidence symlink rejected')
    if not stat.S_ISREG(os.lstat(path).st_mode):
        raise ValueError('Snapshot evidence must be a regular file')
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    if not stat.S_ISREG(os.fstat(descriptor).st_mode):
        os.close(descriptor)
        raise ValueError('Snapshot evidence must be a regular file')
    return os.fdopen(descriptor, 'rb')


def read_snapshot(path, width, height):
    """Return exact decoded P6 bytes and hashes; reject concatenated gzip members."""
    if not isinstance(width, int) or not isinstance(height, int) or not (0 < width <= 4096 and 0 < height <= 4096):
        raise ValueError('Invalid snapshot dimensions')
    header = f'P6\n{width} {height}\n255\n'.encode('ascii')
    expected = len(header) + width * height * 3
    compressed = str(path).endswith('.ppm.gz')
    if not compressed and not str(path).endswith('.ppm'):
        raise ValueError('Unsupported snapshot encoding')
    encoded_hash = hashlib.sha256()
    encoded_bytes = 0
    decoded = bytearray()
    decoder = zlib.decompressobj(31) if compressed else None
    with _regular_file(path) as stream:
        limit = expected + 65536 if compressed else expected
        if os.fstat(stream.fileno()).st_size > limit:
            raise ValueError('Snapshot encoded size exceeds bound')
        while chunk := stream.read(65536):
            encoded_bytes += len(chunk)
            if encoded_bytes > limit:
                raise ValueError('Snapshot encoded size exceeds bound')
            encoded_hash.update(chunk)
            if decoder:
                if decoder.eof:
                    raise ValueError('Extra gzip member or trailing bytes')
                try:
                    decoded.extend(decoder.decompress(chunk, expected - len(decoded) + 1))
                except zlib.error as error:
                    raise ValueError('Invalid gzip snapshot CRC or data') from error
                if decoder.unused_data:
                    raise ValueError('Extra gzip member or trailing bytes')
            else:
                decoded.extend(chunk)
            if len(decoded) > expected:
                raise ValueError('Extra decoded snapshot bytes')
        if decoder and not decoder.eof:
            raise ValueError('Truncated gzip snapshot')
    if len(decoded) != expected or not decoded.startswith(header):
        raise ValueError('Snapshot P6 header, dimensions or pixel count differs')
    value = bytes(decoded)
    return value, {'decoded_bytes': len(value), 'decoded_sha256': hashlib.sha256(value).hexdigest(),
                   'encoded_bytes': encoded_bytes, 'encoded_sha256': encoded_hash.hexdigest(),
                   'encoding': 'gzip' if compressed else 'raw'}


def _schedule(root):
    root = Path(root)
    with _regular_file(root / 'frames.csv') as stream:
        frames = list(csv.DictReader(line.decode('ascii') for line in stream))
    with _regular_file(root / 'frame-geometry.csv') as stream:
        geometry = list(csv.DictReader(line.decode('ascii') for line in stream))
    if not frames or len(frames) != len(geometry):
        raise ValueError('Snapshot frame/geometry count differs')
    result = []
    previous = -1
    index = 0
    for number, (frame, shape) in enumerate(zip(frames, geometry)):
        if frame['frame'] != str(number) or shape['frame'] != str(number) or frame['time_ps'] != shape['time_ps']:
            raise ValueError('Snapshot frame/geometry identity differs')
        time = int(frame['time_ps'])
        if time <= previous:
            raise ValueError('Snapshot frame time is not increasing')
        previous = time
        width, height = int(shape['width']), int(shape['height'])
        if (width, height) != (576, 432):
            raise ValueError('Selected snapshot dimensions differ')
        if index < len(SNAPSHOTS_MS) and time >= SNAPSHOTS_MS[index] * 1_000_000_000:
            result.append({'name': f'{SNAPSHOTS_MS[index]}ms.ppm', 'frame': number,
                           'time_ps': str(time), 'width': width, 'height': height})
            index += 1
    return result


def _inventory(root, encoding, expected):
    root = Path(root)
    _regular_parent = root.absolute()
    for component in reversed((_regular_parent, *_regular_parent.parents)):
        if stat.S_ISLNK(os.lstat(component).st_mode):
            raise ValueError('Snapshot directory symlink rejected')
    result = {}
    for path in root.iterdir():
        if '.ppm' not in path.name:
            continue
        match = re.fullmatch(r'(\d+)ms\.ppm(\.gz)?', path.name)
        if not match or bool(match[2]) != (encoding == 'gzip'):
            raise ValueError('Unexpected snapshot name or encoding')
        name = path.name[:-3] if match[2] else path.name
        if name in result:
            raise ValueError('Duplicate snapshot')
        result[name] = path
    if set(result) != {item['name'] for item in expected}:
        raise ValueError('Missing or extra snapshot')
    return result


def compare_snapshots(original, peers, peer_encoding='gzip'):
    """Check all fixed-cadence snapshots against immutable original raw P6 files."""
    if peer_encoding not in ('raw', 'gzip'):
        raise ValueError('Unsupported snapshot encoding')
    if not peers or len({str(Path(peer).absolute()) for peer in peers}) != len(peers):
        raise ValueError('Missing or duplicate snapshot peers')
    expected = _schedule(original)
    gold = _inventory(original, 'raw', expected)
    inventories = []
    for peer in peers:
        if _schedule(peer) != expected:
            raise ValueError('Snapshot cadence/frame/time/dimensions differ')
        inventories.append(_inventory(peer, peer_encoding, expected))
    evidence = []
    for item in expected:
        value, identity = read_snapshot(gold[item['name']], item['width'], item['height'])
        comparisons = []
        for inventory in inventories:
            other, proof = read_snapshot(inventory[item['name']], item['width'], item['height'])
            if other != value:
                raise ValueError('Snapshot decoded header or pixels differ')
            comparisons.append(proof)
        evidence.append({**item, 'original': identity, 'peers': comparisons})
    return {'snapshot_count': len(evidence), 'maximum_fixed_count': len(SNAPSHOTS_MS),
            'exact_decoded_P6': True, 'snapshots': evidence}
