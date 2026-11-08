/* QA only: real uncached responses with slow first-screen photo/depth files.
   No application code, readiness state or browser behavior is mocked. */
import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.ttf':'font/ttf', '.woff':'font/woff', '.woff2':'font/woff2', '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.json':'application/json; charset=utf-8' };
const delayed = new Map([
  ['/assets/images/hero/portrait-1280.webp', 20000], ['/assets/images/hero/portrait-2456.webp', 20000],
  ['/assets/images/hero/depth-1280.webp', 24000], ['/assets/images/hero/depth-2456.webp', 24000],
]);
const inside = filename => {
  const relative = path.relative(root, filename);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
http.createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Expires', '0');
  if (!['GET','HEAD'].includes(request.method)) { response.setHeader('Allow','GET, HEAD'); response.writeHead(405).end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1:5174').pathname).replaceAll('\\', '/');
    if (pathname.includes('\0')) { response.writeHead(400).end(); return; }
    const candidate = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!inside(candidate)) { response.writeHead(403).end(); return; }
    const filename = await realpath(candidate);
    if (!inside(filename)) { response.writeHead(403).end(); return; }
    const content = await readFile(filename);
    const delay = delayed.get(pathname) || 0;
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (response.destroyed) return;
    response.writeHead(200, { 'Content-Type': types[path.extname(filename).toLowerCase()] || 'application/octet-stream', 'Content-Length': content.length });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (response.destroyed) return;
    const malformed = error instanceof URIError || error.code === 'ERR_INVALID_URL';
    response.writeHead(malformed ? 400 : 404, { 'Content-Type':'text/plain; charset=utf-8' }).end(malformed ? 'Bad request' : 'Not found');
  }
}).listen(5174, '127.0.0.1', () => console.log('Local: http://127.0.0.1:5174 (QA: portrait20s, depth24s; no-store)'));
