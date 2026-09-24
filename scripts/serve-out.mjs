// Serves the static export the way Cloudflare Pages does, closely enough for
// the smoke suite: pretty URLs (/about → about.html) and the rules in
// out/_headers, so CSP and caching are exercised before deploy, not after.
//
//   node scripts/serve-out.mjs [port]      # default 3000 (allowed by r2-cors.json)

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const OUT = join(process.cwd(), 'out');
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 3000);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
};

// Cloudflare's _headers: a path pattern line, then indented `Name: value` lines.
// `*` matches anything; every matching block applies.
function parseHeaders() {
  const file = join(OUT, '_headers');
  if (!existsSync(file)) return [];
  const rules = [];
  let current = null;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const pattern = new RegExp(
        `^${line
          .trim()
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')}$`,
      );
      current = { pattern, headers: [] };
      rules.push(current);
    } else if (current) {
      const at = line.indexOf(':');
      current.headers.push([line.slice(0, at).trim(), line.slice(at + 1).trim()]);
    }
  }
  return rules;
}

const rules = parseHeaders();

function resolve(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const candidates = [clean, `${clean}.html`, join(clean, 'index.html')];
  for (const candidate of candidates) {
    const path = join(OUT, candidate);
    if (path.startsWith(OUT) && existsSync(path) && statSync(path).isFile()) return path;
  }
  return null;
}

createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const file = resolve(pathname);
  for (const rule of rules) {
    if (rule.pattern.test(pathname))
      for (const [name, value] of rule.headers) res.setHeader(name, value);
  }
  if (!file) {
    res.statusCode = 404;
    const notFound = join(OUT, '404.html');
    res.setHeader('Content-Type', TYPES['.html']);
    res.end(existsSync(notFound) ? readFileSync(notFound) : 'Not found');
    return;
  }
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
}).listen(PORT, () => console.log(`serving out/ with _headers on http://localhost:${PORT}`));
