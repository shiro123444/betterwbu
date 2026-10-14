from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import functools
root=Path(__file__).resolve().parents[3]
class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        super().end_headers()
ThreadingHTTPServer(('127.0.0.1',8767),functools.partial(PreviewHandler,directory=str(root))).serve_forever()
