from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
root=Path(__file__).resolve().parents[3]
class Handler(SimpleHTTPRequestHandler):
 def translate_path(self,path):
  path=path.split('?')[0]
  routes={'/workbench-web/':'tests/browser/confirmation/workbench.html','/bill-wallet-web/picker.html':'tests/browser/confirmation/picker.html','/bill-wallet-web/preview.html':'tests/browser/confirmation/preview.html'}
  return str(root/routes.get(path,path.lstrip('/')))
ThreadingHTTPServer(('127.0.0.1',8765),Handler).serve_forever()
