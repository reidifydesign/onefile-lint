// Portability rules: what makes a page stop being one self-contained file.

import zlib from 'node:zlib';
import { hostOf } from '../refs.mjs';
import { lineOffset } from '../refs.mjs';
import { luminance, parseColor } from '../color.mjs';

const KIND_LABEL = {
  script: 'script', module: 'module script', stylesheet: 'stylesheet', font: 'font', iframe: 'frame', object: 'embedded object',
  'css-import': '@import', 'js-import': 'JavaScript import', importmap: 'import map entry', worker: 'worker script',
  image: 'image', media: 'audio or video', icon: 'icon', preload: 'preload hint', hint: 'connection hint', manifest: 'web app manifest',
};

const short = (u) => (u.length > 72 ? u.slice(0, 69) + '...' : u);

function hostSummary(refs) {
  const counts = new Map();
  for (const r of refs) {
    const h = hostOf(r.url) || '(unknown)';
    counts.set(h, (counts.get(h) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([h, n]) => (n > 1 ? `${h} x${n}` : h));
}

export const remoteDependency = {
  id: 'remote-dependency',
  group: 'portability',
  title: 'No remote dependencies',
  run(ctx) {
    const allow = ctx.options.allowHosts || [];
    const isAllowed = (r) => {
      const h = hostOf(r.url);
      return h && allow.some((a) => h === a || h.endsWith('.' + a));
    };
    const allRemote = ctx.refs.filter((r) => r.cls === 'remote');
    const remote = allRemote.filter((r) => !isAllowed(r));
    const allowed = allRemote.length - remote.length;
    const findings = remote.map((r) => ({
      level: r.kind === 'hint' ? 'warn' : r.level,
      line: r.line,
      message: `${KIND_LABEL[r.kind] || r.kind} loads from the network: ${short(r.url)}`,
    }));
    const tail = allowed ? ` (${allowed} on allowed hosts not counted)` : '';
    const note = (remote.length ? `${remote.length} remote reference${remote.length > 1 ? 's' : ''}: ${hostSummary(remote).slice(0, 4).join(', ')}` : 'nothing is fetched from the network by markup or CSS') + tail;
    return { findings, note };
  },
};

export const siblingFile = {
  id: 'sibling-file',
  group: 'portability',
  title: 'No sibling files',
  run(ctx) {
    const sib = ctx.refs.filter((r) => r.cls === 'sibling');
    const findings = sib.map((r) => ({
      level: r.level,
      line: r.line,
      message: `${KIND_LABEL[r.kind] || r.kind} points at a file next to the page (${short(r.url)}); it will be missing if the page is moved or emailed alone`,
    }));
    return { findings, note: sib.length ? `${sib.length} relative reference${sib.length > 1 ? 's' : ''}` : 'no relative file references' };
  },
};

const DATA_URI = /data:([a-z0-9.+/-]+)?(?:;[a-z0-9=.+-]+)*?(?:;base64)?,[^"'\s)<>]*/gi;

export const size = {
  id: 'size',
  group: 'portability',
  title: 'Size',
  run(ctx) {
    const { bytes, options } = ctx;
    const warnB = options.warnKb * 1024;
    const failB = options.failKb * 1024;
    const gz = zlib.gzipSync(ctx.buffer, { level: 9 }).length;
    const fmt = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`);
    let dataBytes = 0;
    let biggest = null;
    const byMime = new Map();
    let m;
    DATA_URI.lastIndex = 0;
    while ((m = DATA_URI.exec(ctx.src))) {
      const len = m[0].length;
      dataBytes += len;
      const mime = (m[1] || 'text/plain').toLowerCase();
      byMime.set(mime, (byMime.get(mime) || 0) + len);
      if (!biggest || len > biggest.len) biggest = { len, mime, line: ctx.doc.lineAt(m.index) };
    }
    const scriptBytes = ctx.doc.scripts.reduce((a, s) => a + Buffer.byteLength(s.raw || ''), 0);
    const styleBytes = ctx.doc.styles.reduce((a, s) => a + Buffer.byteLength(s.raw || ''), 0);
    const findings = [];
    if (bytes > failB) findings.push({ level: 'error', line: null, message: `${fmt(bytes)} is over the ${fmt(failB)} fail limit` });
    else if (bytes > warnB) findings.push({ level: 'warn', line: null, message: `${fmt(bytes)} is over the ${fmt(warnB)} warning limit` });
    if (dataBytes > 100 * 1024 && dataBytes / bytes > 0.5) {
      findings.push({
        level: 'warn',
        line: biggest?.line ?? null,
        message: `embedded data URIs are ${Math.round((dataBytes / bytes) * 100)}% of the file (${fmt(dataBytes)}); the largest is ${biggest.mime}, ${fmt(biggest.len)}. Base64 is about a third bigger than the original`,
      });
    }
    const parts = [`${fmt(bytes)}, ${fmt(gz)} gzipped`];
    parts.push(`script ${fmt(scriptBytes)}, style ${fmt(styleBytes)}${dataBytes ? `, data URIs ${fmt(dataBytes)}` : ''}`);
    return { findings, note: parts.join('; '), metrics: { bytes, gzip: gz, scriptBytes, styleBytes, dataBytes } };
  },
};

function jsBlocks(ctx) {
  return ctx.doc.scripts.filter((s) => s.raw && s.raw.trim() && !s.attrs.src && /^(|module|text\/javascript|application\/javascript|text\/babel)$/i.test((s.attrs.type || '').trim()));
}

export const offline = {
  id: 'offline',
  group: 'portability',
  title: 'Works offline',
  run(ctx) {
    const findings = [];
    for (const s of jsBlocks(ctx)) {
      const body = s.raw;
      const at = (idx) => s.rawLine + lineOffset(body, idx);
      let m;
      const reFetch = /\bfetch\(\s*(["'`])([^"'`$]*)\1/g;
      while ((m = reFetch.exec(body))) {
        const u = m[2];
        if (/^(data|blob):/i.test(u) || u.startsWith('#')) continue;
        if (/^(https?:)?\/\//i.test(u)) findings.push({ level: 'warn', line: at(m.index), message: `fetch() calls ${short(u)}; the feature needs a connection` });
        else if (u) findings.push({ level: 'warn', line: at(m.index), message: `fetch("${short(u)}") reads a file next to the page; this usually fails when the page is opened from disk` });
      }
      const reXhr = /\.open\(\s*(["'])[A-Za-z]+\1\s*,\s*(["'`])([^"'`$]*)\2/g;
      while ((m = reXhr.exec(body))) {
        if (/^(data|blob):/i.test(m[3])) continue;
        findings.push({ level: 'warn', line: at(m.index), message: `XMLHttpRequest to ${short(m[3])}; the feature needs a connection` });
      }
      const reSock = /new\s+(WebSocket|EventSource)\(\s*(["'`])([^"'`$]*)\2/g;
      while ((m = reSock.exec(body))) findings.push({ level: 'warn', line: at(m.index), message: `${m[1]} to ${short(m[3])}; the feature needs a connection` });
      const reSw = /serviceWorker\s*\.\s*register\(\s*(["'`])([^"'`$]*)\1/g;
      while ((m = reSw.exec(body))) findings.push({ level: 'warn', line: at(m.index), message: `service worker ${short(m[2])} is a separate file, and service workers only run over https or localhost, so it cannot make a one-file page work offline` });
      const reBeacon = /navigator\.sendBeacon\(\s*(["'`])([^"'`$]*)\1/g;
      while ((m = reBeacon.exec(body))) findings.push({ level: 'warn', line: at(m.index), message: `sendBeacon to ${short(m[2])}; this is a network call` });
    }
    for (const el of ctx.doc.elements) {
      if (el.name === 'form' && /^(https?:)?\/\//i.test(el.attrs.action || '')) {
        findings.push({ level: 'warn', line: el.line, message: `form posts to ${short(el.attrs.action)}; submitting needs a connection` });
      }
      if (el.name === 'link' && /\bmanifest\b/i.test(el.attrs.rel || '') && el.attrs.href) {
        findings.push({ level: 'warn', line: el.line, message: 'a web app manifest is a separate file; it is ignored when the page is one file' });
      }
    }
    const note = findings.length ? `${findings.length} network ${findings.length > 1 ? "dependencies" : "dependency"} in the page's own code` : 'no network calls found in inline scripts (dynamic URLs cannot be seen)';
    return { findings, note };
  },
};

export const printStyles = {
  id: 'print-styles',
  group: 'portability',
  title: 'Print styles',
  run(ctx) {
    const hasPrint = ctx.allCssRules.some((r) => r.at.some((a) => /\bprint\b/i.test(a))) || ctx.cssAtRules.some((a) => a.name === 'page') || ctx.doc.elements.some((e) => e.name === 'link' && /\bprint\b/i.test(e.attrs.media || '') && /stylesheet/i.test(e.attrs.rel || ''));
    const bodyText = (ctx.doc.root.text || '').replace(/\s+/g, ' ').trim();
    const findings = [];
    if (hasPrint) return { findings, note: 'has print rules' };
    if (bodyText.length < 120) return { findings, note: 'too little text to need print rules' };
    const pageRules = ctx.allCssRules.filter((r) => !r.keyframes && !r.at.some((a) => /print/i.test(a)) && /^(html|body|:root)(\s*,\s*(html|body|:root))*$/.test(r.selector.trim()));
    const decl = (p) => pageRules.flatMap((r) => r.decls).filter((d) => d.prop === p).pop();
    const clipped = pageRules.flatMap((r) => r.decls).find((d) => (d.prop === 'overflow' || d.prop === 'overflow-y') && /hidden/.test(d.value));
    const fixedH = pageRules.flatMap((r) => r.decls).find((d) => d.prop === 'height' && /100(d|s|l)?vh/.test(d.value));
    const bg = decl('background-color') || decl('background');
    const bgc = bg ? parseColor(bg.value.split(/\s+/).find((t) => parseColor(t)) || '') : null;
    const dark = bgc && luminance(bgc) < 0.15;
    let msg = 'no @media print rules, so the page prints exactly as it looks on screen';
    if (dark) msg += '; the page background is dark and browsers usually leave backgrounds out of print, which can leave light text on white paper';
    if (clipped || fixedH) msg += `; ${clipped ? 'overflow: hidden' : 'height: 100vh'} on html or body can cut the printout to one page`;
    findings.push({ level: 'warn', line: null, message: msg });
    return { findings, note: 'no print rules' };
  },
};

export const documentBasics = {
  id: 'document-basics',
  group: 'portability',
  title: 'Document basics',
  run(ctx) {
    const findings = [];
    const { doc } = ctx;
    const html = doc.elements.find((e) => e.name === 'html');
    if (!doc.doctype) findings.push({ level: 'warn', line: 1, message: 'no <!doctype html>; browsers fall back to quirks mode' });
    const head1k = ctx.src.slice(0, 1100);
    const hasCharset = /<meta[^>]+charset\s*=/i.test(head1k) || /<meta[^>]+http-equiv\s*=\s*["']?content-type/i.test(head1k) || ctx.src.charCodeAt(0) === 0xfeff;
    // eslint-disable-next-line no-control-regex
    const nonAscii = /[^\x00-\x7f]/.test(ctx.src);
    if (!hasCharset) {
      findings.push({
        level: nonAscii ? 'error' : 'warn',
        line: 1,
        message: nonAscii ? 'no <meta charset> in the first 1024 bytes and the file has non-ASCII text; opened from disk it can show garbled characters' : 'no <meta charset> in the first 1024 bytes',
      });
    }
    if (!doc.elements.some((e) => e.name === 'meta' && (e.attrs.name || '').toLowerCase() === 'viewport')) {
      findings.push({ level: 'warn', line: 1, message: 'no viewport meta tag; phones render the page at desktop width' });
    }
    if (html && !(html.attrs.lang || '').trim()) findings.push({ level: 'warn', line: html.line, message: '<html> has no lang attribute' });
    if (!html) findings.push({ level: 'warn', line: 1, message: 'no <html> element' });
    const title = doc.elements.find((e) => e.name === 'title');
    if (!title || !title.text.trim()) findings.push({ level: 'warn', line: title ? title.line : 1, message: 'no page <title>' });
    return { findings, note: findings.length ? `${findings.length} missing` : 'doctype, charset, viewport, lang and title present' };
  },
};

export default [remoteDependency, siblingFile, size, offline, printStyles, documentBasics];
