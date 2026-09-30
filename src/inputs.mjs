// Turn command-line inputs (files, folders, URLs, stdin) into { name, src } entries.

import fs from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 50 * 1024 * 1024;
const SKIP_DIRS = new Set(['node_modules', '.git', '.hg', 'dist', 'build']);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out);
    } else if (/\.html?$/i.test(e.name)) out.push(path.join(dir, e.name));
  }
}

export function decode(buf) {
  let s = buf.toString('utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}

export async function fetchUrl(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'onefile-lint/0.1 (+https://github.com/reidifydesign/onefile-lint)', accept: 'text/html,*/*;q=0.5' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_BYTES) throw new Error(`${url} is larger than ${MAX_BYTES / 1048576} MB`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error(`${url} is larger than ${MAX_BYTES / 1048576} MB`);
  return decode(buf);
}

export async function readInputs(args) {
  const entries = [];
  for (const a of args) {
    if (a === '-') {
      const chunks = [];
      for await (const c of process.stdin) chunks.push(c);
      entries.push({ name: '(stdin)', src: decode(Buffer.concat(chunks)) });
    } else if (/^https?:\/\//i.test(a)) {
      entries.push({ name: a, src: await fetchUrl(a) });
    } else {
      let st;
      try {
        st = fs.statSync(a);
      } catch {
        throw new Error(`cannot read ${a}`);
      }
      if (st.isDirectory()) {
        const files = [];
        walk(a, files);
        files.sort();
        for (const f of files) entries.push({ name: path.relative(process.cwd(), f) || f, src: decode(fs.readFileSync(f)) });
      } else entries.push({ name: a, src: decode(fs.readFileSync(a)) });
    }
  }
  return entries;
}
