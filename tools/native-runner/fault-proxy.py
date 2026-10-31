"""One fixed loopback route. Commit at real PostgREST, intentionally lose the HTTP reply."""
import http.client,http.server,json,socket,threading,urllib.parse

def start(api):
    parsed=urllib.parse.urlsplit(api);assert parsed.scheme=='http' and parsed.hostname in ('127.0.0.1','localhost') and parsed.port
    state={'committed_responses_dropped':0,'upstream_status':None}
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def do_POST(self):
            length=int(self.headers.get('Content-Length','0'))
            if self.path!='/rest/v1/jobs' or not 0<length<10000:self.send_error(400);return
            raw=self.rfile.read(length)
            try:body=json.loads(raw)
            except ValueError:self.send_error(400);return
            if body.get('job_description')!='synthetic-response-loss':self.send_error(400);return
            connection=http.client.HTTPConnection(parsed.hostname,parsed.port,timeout=20)
            headers={k:v for k,v in self.headers.items() if k.lower() in ('authorization','apikey','content-type','prefer')}
            connection.request('POST','/rest/v1/jobs',body=raw,headers=headers);response=connection.getresponse();response.read();state['upstream_status']=response.status;connection.close()
            if response.status in (200,201):state['committed_responses_dropped']+=1
            self.close_connection=True
            try:self.connection.shutdown(socket.SHUT_RDWR)
            except OSError:pass
            self.connection.close()
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    return server,'http://127.0.0.1:'+str(server.server_port),state
