#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Reduce a ROM-backed Playwright JSON report to payload-free results.

Keeps test titles, outcomes, timings, errors and JSON or plain-text
attachments; drops every other attachment (screenshots and anything stored on
disk), since ROM-backed frames must never leave the runner. Refuses to write
output that still looks like image data.
"""
import argparse
import base64
import json
import sys
from pathlib import Path

KEEP = {'application/json', 'text/plain'}
FORBIDDEN = ('image/', 'video/', 'iVBORw0KGgo', '/9j/', 'R0lGOD', 'UklGR', 'trace.zip')


def strip(node, dropped):
    if isinstance(node, dict):
        result = {}
        for key, value in node.items():
            if key == 'attachments' and isinstance(value, list):
                kept = []
                for item in value:
                    if isinstance(item, dict) and item.get('contentType') in KEEP and 'body' in item and 'path' not in item:
                        kept.append({'name': item.get('name'), 'contentType': item['contentType'], 'body': item['body']})
                    else:
                        dropped.append(item.get('name') if isinstance(item, dict) else repr(item))
                result[key] = kept
            else:
                result[key] = strip(value, dropped)
        return result
    if isinstance(node, list):
        return [strip(item, dropped) for item in node]
    return node


def payload_free(text: str) -> bool:
    return not any(marker in text for marker in FORBIDDEN)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('report', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    dropped = []
    report = strip(json.loads(args.report.read_text()), dropped)
    # JSON/text bodies are base64; decode to check they carry no image data either.
    text = json.dumps(report, indent=2)
    decoded = []
    def bodies(node):
        if isinstance(node, dict):
            if 'body' in node and isinstance(node['body'], str):
                decoded.append(base64.b64decode(node['body'] + '==').decode('utf-8', 'replace'))
            for value in node.values():
                bodies(value)
        elif isinstance(node, list):
            for value in node:
                bodies(value)
    bodies(report)
    if not payload_free(text) or not all(payload_free(body) for body in decoded):
        print('Refusing to write: the filtered report still contains image or trace data.', file=sys.stderr)
        return 1
    report['nocpu_filter'] = {'dropped_attachments': sorted(set(map(str, dropped))),
                              'kept_content_types': sorted(KEEP)}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(f'Payload-free ROM browser results: {args.output} ({len(dropped)} attachments dropped)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
