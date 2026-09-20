import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = new URL('../dist/client/browser/', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const types = { '.css': 'text/css', '.html': 'text/html', '.ico': 'image/x-icon', '.js': 'text/javascript', '.json': 'application/json' };
createServer((req, res) => {
  const requested = normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, requested === '/' ? 'index.html' : requested);
  if (!existsSync(file) || !extname(file)) file = join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(4200, '127.0.0.1', () => console.log('Production client listening on http://127.0.0.1:4200'));
