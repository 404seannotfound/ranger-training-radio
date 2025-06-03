import http.server
import ssl
import os

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

server_address = ('0.0.0.0', 5500)
httpd = http.server.HTTPServer(server_address, CORSRequestHandler)

# Use the robust certificate names
cert_file = 'server-cert.pem'
key_file = 'server-key.pem'

if os.path.exists(cert_file) and os.path.exists(key_file):
    ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_context.load_cert_chain(cert_file, key_file)
    httpd.socket = ssl_context.wrap_socket(httpd.socket, server_side=True)
    print(f'Serving HTTPS on 0.0.0.0 port 5500...')
else:
    print(f'Warning: SSL certificates not found. Running without HTTPS.')
    print(f'Please run setup.sh first to generate certificates.')

httpd.serve_forever()

