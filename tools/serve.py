"""Local static server with caching disabled (development)."""
import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8770
    print("http://localhost:%d" % port)
    http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCache).serve_forever()
