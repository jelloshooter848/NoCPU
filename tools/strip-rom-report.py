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
FORBIDDEN = ('image/', 'video/', 'iVBORw0KGgo', '/9j/', 'R0lGOD', 'UklGR', 'trace.zip')


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


MAGIC = (b'\x89PNG\r\n\x1a\n', b'\xff\xd8\xff', b'GIF87a', b'GIF89a', b'RIFF', b'PK\x03\x04')


def payload_free(text: str) -> bool:
    return not any(marker in text for marker in FORBIDDEN)


def lenient_decode(text: str) -> bytes | None:
    """Best-effort base64 decode of any string; None when nothing decodes.

    Never used to clear data: callers scan the raw string as well, so a body
    that is not valid base64 is still checked as text.
    """
    cleaned = re.sub(r'[^A-Za-z0-9+/]', '', text.replace('-', '+').replace('_', '/'))
    cleaned = cleaned[:len(cleaned) - len(cleaned) % 4]
    if not cleaned:
        return None
    try:
        return base64.b64decode(cleaned)
    except (binascii.Error, ValueError):
        return None


def encoded_payload_free(text: str) -> bool:
    """Scan a possibly-base64 string both raw and, where it decodes, decoded."""
    if not payload_free(text):
        return False
    decoded = lenient_decode(text)
    if decoded is None:
        return True
    return payload_free(decoded.decode('utf-8', 'replace')) and not any(magic in decoded for magic in MAGIC)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('report', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    dropped = []
    report = strip(json.loads(args.report.read_text()), dropped)
    # Attachment bodies and stdout/stderr buffers are base64; any other field
    # may be too. Scan the whole text raw, and every such string decoded too.
    text = json.dumps(report, indent=2)
    encoded = []

    def bodies(node):
        if isinstance(node, dict):
            for key in ('body', 'buffer'):
                if isinstance(node.get(key), str):
                    encoded.append(node[key])
            for value in node.values():
                bodies(value)
        elif isinstance(node, list):
            for value in node:
                bodies(value)
    bodies(report)
    if not payload_free(text) or not all(encoded_payload_free(value) for value in encoded):
        # DIAGNOSTIC (temporary): name each finding by JSON path, never its data.
        def walk(node, path):
            if isinstance(node, dict):
                for key, value in node.items():
                    if key not in FORBIDDEN and any(marker in key for marker in FORBIDDEN):
                        print('DIAG key', path, [m for m in FORBIDDEN if m in key])
                    walk(value, path + [key])
            elif isinstance(node, list):
                for index, value in enumerate(node):
                    walk(value, path + [index])
            elif isinstance(node, str):
                found = [m for m in FORBIDDEN if m in node]
                if found:
                    print('DIAG raw', path, found, 'len', len(node), 'context',
                          [node[max(0, node.find(m) - 12):node.find(m)].encode('unicode_escape').decode()[-24:] for m in found])
                if path and path[-1] in ('body', 'buffer'):
                    decoded = lenient_decode(node)
                    if decoded is not None:
                        dtext = decoded.decode('utf-8', 'replace')
                        print('DIAG decoded', path, [m for m in FORBIDDEN if m in dtext],
                              [m for m in MAGIC if m in decoded], 'len', len(node))
        walk(report, [])
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
