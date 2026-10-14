#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Reduce a ROM-backed Playwright JSON report to payload-free results.

Keeps test titles, outcomes, timings and errors, plus only the attachments
named in ALLOWED: small JSON evidence (at most MAX_BYTES, no long numeric
arrays that could carry pixels). Every other attachment (screenshots, files on
disk, unlisted or oversized JSON) is dropped and listed by name, since
ROM-backed frames must never leave the runner. Refuses to write output that
still looks like image data.
"""
import argparse
import base64
import binascii
import json
import re
import sys
from pathlib import Path

KEEP = {'application/json', 'text/plain'}
# Attachments reviewed as payload-free; add a name only after reviewing what the test writes.
ALLOWED = {'stunt-original-score9-software.json'}
MAX_BYTES = 4096
MAX_NUMERIC_RUN = 64


def longest_numeric_list(value):
    if isinstance(value, list):
        own = len(value) if value and all(isinstance(item, (int, float)) and not isinstance(item, bool) for item in value) else 0
        return max([own] + [longest_numeric_list(item) for item in value])
    if isinstance(value, dict):
        return max([0] + [longest_numeric_list(item) for item in value.values()])
    return 0


def rejection(item):
    """Why an attachment is dropped, or None to keep it."""
    if not isinstance(item, dict):
        return 'not an attachment record'
    name = item.get('name')
    if name not in ALLOWED:
        return 'name not on the allow-list'
    if item.get('contentType') not in KEEP or 'body' not in item or 'path' in item:
        return 'not an inline JSON/text body'
    try:
        body = base64.b64decode(item['body'], validate=True)
    except (ValueError, TypeError):
        return 'body is not base64'
    if len(body) > MAX_BYTES:
        return f'body is {len(body)} bytes, over {MAX_BYTES}'
    if item['contentType'] == 'application/json':
        try:
            parsed = json.loads(body)
        except ValueError:
            return 'body is not JSON'
        if longest_numeric_list(parsed) > MAX_NUMERIC_RUN:
            return f'numeric array longer than {MAX_NUMERIC_RUN}'
    return None


def strip(node, dropped):
    if isinstance(node, dict):
        result = {}
        for key, value in node.items():
            if key == 'attachments' and isinstance(value, list):
                kept = []
                for item in value:
                    reason = rejection(item)
                    if reason is None:
                        kept.append({'name': item['name'], 'contentType': item['contentType'], 'body': item['body']})
                    else:
                        name = item.get('name') if isinstance(item, dict) else repr(item)
                        dropped.append(f'{name}: {reason}')
                        print(f'Dropped attachment {name}: {reason}')
                result[key] = kept
            else:
                result[key] = strip(value, dropped)
        return result
    if isinstance(node, list):
        return [strip(item, dropped) for item in node]
    return node


# Image or trace data that could survive the attachment filter. Text markers
# need a full base64 signature at the start of a base64 run of at least
# MIN_RUN characters (or a data: URI); decoded bytes need a full file
# signature at offset 0. Generic words such as "image/" in free text (a
# commit message in Playwright's CI metadata, for example) are not evidence.
MIN_RUN = 32
BASE64_IMAGE = re.compile(
    r'(?<![A-Za-z0-9+/])(?:iVBORw0KGgo|/9j/4|R0lGODlh|R0lGODdh|UklGR[A-Za-z0-9+/]{6}XRUJQ|UEsDB)'
    r'[A-Za-z0-9+/]{%d,}' % (MIN_RUN - 12))
DATA_URI = re.compile(r'data:(?:image|video)/[A-Za-z0-9.+-]+;base64,', re.I)
MAGIC = (b'\x89PNG\r\n\x1a\n', b'\xff\xd8\xff', b'GIF87a', b'GIF89a', b'PK\x03\x04', b'\x1aE\xdf\xa3')


def text_findings(text: str) -> list[str]:
    found = []
    if BASE64_IMAGE.search(text):
        found.append('base64 image or archive signature')
    if DATA_URI.search(text):
        found.append('data: image or video URI')
    if 'trace.zip' in text:
        found.append('Playwright trace reference')
    return found


def bytes_findings(data: bytes) -> list[str]:
    found = []
    if data.startswith(MAGIC) or (data[:4] == b'RIFF' and data[8:12] in (b'WEBP', b'AVI ')):
        found.append('file signature in decoded data')
    found.extend(text_findings(data.decode('utf-8', 'replace')))
    return found


def findings(report) -> list[str]:
    """Every reason not to publish, by JSON path; never the data itself.

    Declared base64 fields (kept attachment bodies, stdout/stderr buffers) are
    strictly decoded and scanned decoded and raw; one that does not decode is a
    finding, not a pass. Every other string is scanned as text.
    """
    result = []

    def walk(node, path):
        if isinstance(node, dict):
            for key, value in node.items():
                walk(value, path + [str(key)])
        elif isinstance(node, list):
            for index, value in enumerate(node):
                walk(value, path + [str(index)])
        elif isinstance(node, str):
            where = '/'.join(path)
            declared = (len(path) >= 3 and path[-3] == 'attachments' and path[-1] == 'body') or \
                (len(path) >= 3 and path[-3] in ('stdout', 'stderr') and path[-1] == 'buffer')
            reasons = text_findings(node)
            if declared:
                try:
                    reasons += bytes_findings(base64.b64decode(node, validate=True))
                except (binascii.Error, ValueError):
                    reasons.append('declared base64 field does not decode')
            result.extend(f'{where}: {reason}' for reason in reasons)
    walk(report, [])
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('report', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    dropped = []
    report = strip(json.loads(args.report.read_text()), dropped)
    problems = findings(report)
    if problems:
        for problem in problems:
            print('Refusing:', problem, file=sys.stderr)
        print('Refusing to write: the filtered report still contains image or trace data.', file=sys.stderr)
        return 1
    report['nocpu_filter'] = {'dropped_attachments': sorted(set(map(str, dropped))),
                              'allowed_attachments': sorted(ALLOWED), 'max_attachment_bytes': MAX_BYTES,
                              'max_numeric_array': MAX_NUMERIC_RUN}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(f'Payload-free ROM browser results: {args.output} ({len(dropped)} attachments dropped)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
