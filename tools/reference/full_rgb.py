# SPDX-License-Identifier: GPL-3.0-or-later
"""Bounded full RGB gzip validation; hashes supplement exact byte comparison."""
import csv
import gzip
import hashlib
from pathlib import Path
from contextlib import ExitStack


def _read_frame(stream, size):
    value = stream.read(size)
    if len(value) != size:
        raise ValueError('Truncated full RGB frame')
    return value


def assert_original_geometry(directory, contract):
    root=Path(directory)
    renderer=(root.parent/'renderer-identity.txt').read_bytes()
    if hashlib.sha256(renderer).hexdigest()!=contract['renderer_sha256']:
        raise ValueError('Original renderer identity differs from frozen pilot')
    with (root/'frame-geometry.csv').open(newline='') as stream:
        rows=list(csv.DictReader(stream))
    if not rows:
        raise ValueError('Original geometry has no frames')
    for index,row in enumerate(rows):
        expected=contract['first' if index==0 else 'stable']
        actual={key:value for key,value in row.items() if key not in ('frame','time_ps')}
        if actual!=expected:
            raise ValueError('Original renderer geometry/contrast/projection differs from frozen pilot')
    return {'frames':len(rows),'original_renderer_geometry_asserted':True}


def compare_rgb_many(left, rights, *, require_renderer_geometry=True, original_geometry_contract=None):
    """Compare all decoded bytes with independently captured count/time/geometry/hash."""
    roots = [Path(left), *(Path(right) for right in rights)]
    if len(roots)<2:
        raise ValueError("Full RGB comparison requires at least one peer")
    metadata = []
    for root in roots:
        with (root / 'frames.csv').open(newline='') as stream:
            frames = list(csv.DictReader(stream))
        with (root / 'frame-geometry.csv').open(newline='') as stream:
            geometry = list(csv.DictReader(stream))
        if not frames or len(frames) != len(geometry):
            raise ValueError('Missing/inconsistent full RGB frame metadata')
        metadata.append((frames, geometry))
    comparison = metadata
    if not require_renderer_geometry:
        if original_geometry_contract is None:
            raise ValueError("Portable full RGB comparison requires original renderer contract")
        assert_original_geometry(roots[0],original_geometry_contract)
        # Portable capture records the measured raster dimensions. Original GL
        # projection/contrast remain separately retained and independently checked.
        comparison = [(frames, [{key: row[key] for key in ('frame','time_ps','width','height')} for row in geometry]) for frames, geometry in metadata]
    if any(comparison[0] != peer for peer in comparison[1:]):
        raise ValueError('Full RGB time/hash/geometry metadata differ')
    digest = hashlib.sha256()
    decoded = 0
    with ExitStack() as stack:
        streams=[stack.enter_context(gzip.open(root / 'frames.rgb.gz','rb')) for root in roots]
        for index, (frame, geometry) in enumerate(zip(*metadata[0])):
            if int(frame['frame']) != index or int(geometry['frame']) != index or frame['time_ps'] != geometry['time_ps']:
                raise ValueError('Full RGB frame sequence/time is inconsistent')
            width, height = int(geometry['width']), int(geometry['height'])
            if width <= 0 or height <= 0 or width * height > 4096 * 4096:
                raise ValueError('Invalid full RGB frame geometry')
            size = width * height * 3
            a = _read_frame(streams[0], size)
            for peer in streams[1:]:
                if a != _read_frame(peer,size):
                    raise ValueError('Full RGB bytes differ at frame %d' % index)
            fnv = 14695981039346656037
            for value in a:
                fnv = ((fnv ^ value) * 1099511628211) & 0xffffffffffffffff
            if fnv != int(frame['fnv1a64']):
                raise ValueError('Decoded full RGB hash disagrees with captured frame')
            digest.update(a)
            decoded += size
        # Forces gzip CRC/trailer verification and rejects unrecorded decoded data.
        if any(stream.read(1) for stream in streams):
            raise ValueError('Unrecorded trailing full RGB bytes')
    return {'frames': len(metadata[0][0]), 'decoded_bytes': decoded, 'decoded_sha256': digest.hexdigest(), 'exact_full_rgb': True, 'compared_streams': len(roots)}


def compare_rgb(left,right,**kwargs):
    """Two-stream convenience wrapper; all streams use the same strict gate."""
    return compare_rgb_many(left,[right],**kwargs)
