from http.server import SimpleHTTPRequestHandler, HTTPServer
from pathlib import Path
root=Path(__file__).resolve().parents[3]
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(root),**kwargs)
    def do_GET(self):
        if self.path=='/tests/browser/banks/bridge-fixture.js':
            source=(root/'extension/memory-bridge.js').read_text().replace(" if(location.hostname!=='wsbx.wbu.edu.cn'||!location.pathname.startsWith('/workbench-web/'))return;",' // Local fixture only: retain all row and scope validation.')
            data=source.encode();self.send_response(200);self.send_header('Content-Type','application/javascript');self.end_headers();self.wfile.write(data)
        else:super().do_GET()
HTTPServer(('127.0.0.1',8767),Handler).serve_forever()
