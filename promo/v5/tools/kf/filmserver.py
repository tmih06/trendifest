# filmserver.py: serve a film folder on a free local port (used by render.py, mix.py and finish.py).
# Run directly (python3 filmserver.py <folder> <port>) it serves a preview on a fixed port.
import http.server, socketserver, threading, functools, socket, os, sys
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
class Server(socketserver.ThreadingTCPServer):
    # V5: the default listen backlog is 5. A frame of V5 requests a dozen JPEGs at once (orbit tiles, takes),
    # the overflowing connections' SYNs were dropped and retried by TCP after ~3 s, so a seek took 3.1 s
    # instead of 15 ms. A deep backlog removes the stall.
    request_queue_size = 256
    daemon_threads = True
    allow_reuse_address = True
def serve(folder, port=0):
    if not port:
        s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    h = functools.partial(Quiet, directory=os.path.abspath(folder))
    srv = Server(('127.0.0.1', port), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{port}/', srv
if __name__ == '__main__':
    url, srv = serve(sys.argv[1], int(sys.argv[2]))
    print(url, flush=True)
    threading.Event().wait()
