#!/usr/bin/env python3
"""Serve a packaged Pages artifact under its real project prefix for tests.

Source .tar.gz bytes are files, not HTTP Content-Encoding compression. Missing
assets receive an actual 404, with no development-server HTML fallback.
"""
# SPDX-License-Identifier: GPL-3.0-or-later
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
from urllib.parse import urlsplit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, default=Path('build/pages'))
    parser.add_argument('--base', default='/NoCPU/')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=4173)
    args = parser.parse_args()
    if not re.fullmatch(r'/[A-Za-z0-9/._-]*', args.base) or not args.base.endswith('/') or any(part in {'.', '..'} for part in args.base.split('/')):
        parser.error('--base must be an absolute project path ending in /')
    directory = args.directory.resolve()
    if not directory.is_dir():
        parser.error('--directory must name an existing artifact directory')

    class Handler(SimpleHTTPRequestHandler):
        extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.wasm': 'application/wasm', '.gz': 'application/gzip'}

        def do_GET(self):
            self.serve_project(False)

        def do_HEAD(self):
            self.serve_project(True)

        def serve_project(self, head):
            request = urlsplit(self.path)
            if request.path == args.base[:-1] and args.base != '/':
                self.send_response(301)
                self.send_header('Location', args.base)
                self.send_header('Content-Length', '0')
                self.end_headers()
                return
            if not request.path.startswith(args.base):
                self.send_error(404)
                return
            original = self.path
            self.path = '/' + request.path[len(args.base):]
            if request.query:
                self.path += '?' + request.query
            target = Path(self.translate_path(self.path)).resolve()
            if not target.is_relative_to(directory):
                self.send_error(404)
                return
            try:
                if head:
                    super().do_HEAD()
                else:
                    super().do_GET()
            finally:
                self.path = original

        def list_directory(self, path):
            self.send_error(404)
            return None

    server = ThreadingHTTPServer((args.host, args.port), partial(Handler, directory=str(directory)))
    bound_port = server.server_address[1]
    print(f'Serving packaged artifact {directory} at http://{args.host}:{bound_port}{args.base}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
