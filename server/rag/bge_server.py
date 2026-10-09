"""Local BGE-M3 embedding endpoint. Run with server/.venv-rag/bin/python rag/bge_server.py."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from FlagEmbedding import BGEM3FlagModel

model = BGEM3FlagModel('BAAI/bge-m3', use_fp16=False)

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/embed': self.send_error(404); return
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length))
        texts = body.get('texts', [])
        vectors = model.encode(texts, batch_size=8, max_length=8192)['dense_vecs'].tolist()
        raw = json.dumps({'embeddings': vectors}).encode()
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(raw))); self.end_headers(); self.wfile.write(raw)

ThreadingHTTPServer(('127.0.0.1', 8091), Handler).serve_forever()
