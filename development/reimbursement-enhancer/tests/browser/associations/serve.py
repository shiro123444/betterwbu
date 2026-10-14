from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

root = Path(__file__).resolve().parents[3]
print('Synthetic invoice association preview: http://127.0.0.1:8768/tests/browser/associations/', flush=True)
ThreadingHTTPServer(('127.0.0.1', 8768), partial(SimpleHTTPRequestHandler, directory=str(root))).serve_forever()
