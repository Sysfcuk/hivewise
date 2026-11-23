"""Dev server for Hivewise: serves web/ with no caching and the right MIME type for .wasm.

    python serve.py          -> http://localhost:8130
"""
import http.server, functools, os

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'web')
port = int(os.environ.get('PORT', 8130))
http.server.ThreadingHTTPServer(('', port), functools.partial(Handler, directory=root)).serve_forever()
