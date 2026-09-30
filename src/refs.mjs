// Collect every reference from the page to something outside the file.
// A reference is { url, kind, line, where, level } where level is "error" when the page breaks or
// changes meaning without it (script, stylesheet, font, frame) and "warn" when it only degrades.

import { parseStyleAttr } from './css.mjs';

const ERROR_KINDS = new Set(['script', 'module', 'stylesheet', 'font', 'iframe', 'object', 'css-import', 'js-import', 'importmap', 'worker']);

export function classify(url) {
  const u = String(url ?? '').trim();
  if (!u) return 'ignore';
  if (/^(data|blob|about|javascript|mailto|tel|sms):/i.test(u)) return 'ignore';
  if (u.startsWith('#')) return 'ignore';
  if (/^(https?:)?\/\//i.test(u) || /^wss?:\/\//i.test(u) || /^ftp:\/\//i.test(u)) return 'remote';
  return 'sibling';
}

function srcsetUrls(v) {
  return v
    .split(',')
    .map((p) => p.trim().split(/\s+/)[0])
    .filter(Boolean);
}

export function urlsInCssValue(value) {
  const out = [];
  const re = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi;
  let m;
  while ((m = re.exec(value))) out.push((m[1] ?? m[2] ?? m[3] ?? '').trim());
  return out;
}

export function collectRefs(ctx) {
  const refs = [];
  const add = (url, kind, line, where) => {
    const cls = classify(url);
    if (cls === 'ignore') return;
    refs.push({ url: url.trim(), cls, kind, line, where, level: ERROR_KINDS.has(kind) ? 'error' : 'warn' });
  };

  for (const el of ctx.doc.elements) {
    const a = el.attrs;
    const tag = `<${el.name}>`;
    switch (el.name) {
      case 'script':
        if (a.src !== undefined) add(a.src, /module/i.test(a.type || '') ? 'module' : 'script', el.line, tag);
        break;
      case 'link': {
        const rel = (a.rel || '').toLowerCase().split(/\s+/);
        if (a.href === undefined) break;
        if (rel.includes('stylesheet')) add(a.href, 'stylesheet', el.line, tag);
        else if (rel.includes('modulepreload')) add(a.href, 'module', el.line, tag);
        else if (rel.includes('preload') || rel.includes('prefetch')) add(a.href, 'preload', el.line, tag);
        else if (rel.includes('preconnect') || rel.includes('dns-prefetch')) add(a.href, 'hint', el.line, tag);
        else if (rel.some((r) => r === 'icon' || r === 'apple-touch-icon' || r === 'shortcut' || r === 'mask-icon')) add(a.href, 'icon', el.line, tag);
        else if (rel.includes('manifest')) add(a.href, 'manifest', el.line, tag);
        break;
      }
      case 'img':
      case 'source':
        if (a.src !== undefined) add(a.src, 'image', el.line, tag);
        if (a.srcset !== undefined) for (const u of srcsetUrls(a.srcset)) add(u, 'image', el.line, tag);
        if (el.name === 'source' && el.parent && /^(video|audio)$/.test(el.parent.name)) {
          for (const r of refs) if (r.line === el.line && r.where === tag && r.kind === 'image') r.kind = 'media';
        }
        break;
      case 'video':
        if (a.src !== undefined) add(a.src, 'media', el.line, tag);
        if (a.poster !== undefined) add(a.poster, 'image', el.line, tag);
        break;
      case 'audio':
      case 'track':
        if (a.src !== undefined) add(a.src, 'media', el.line, tag);
        break;
      case 'iframe':
      case 'frame':
        if (a.src !== undefined) add(a.src, 'iframe', el.line, tag);
        break;
      case 'embed':
        if (a.src !== undefined) add(a.src, 'object', el.line, tag);
        break;
      case 'object':
        if (a.data !== undefined) add(a.data, 'object', el.line, tag);
        break;
      case 'input':
        if ((a.type || '').toLowerCase() === 'image' && a.src !== undefined) add(a.src, 'image', el.line, tag);
        break;
      case 'image':
      case 'use': {
        const h = a.href ?? a['xlink:href'];
        if (h !== undefined) add(h, el.name === 'use' ? 'object' : 'image', el.line, `<${el.name}>`);
        break;
      }
      default:
        break;
    }
    if (el.attrs.style) {
      const r = parseStyleAttr(el.attrs.style, el.line);
      for (const d of r.decls) for (const u of urlsInCssValue(d.value)) add(u, 'image', el.line, 'style attribute');
    }
  }

  for (const rule of ctx.cssRules) {
    const isFont = rule.selector.startsWith('@font-face');
    for (const d of rule.decls) {
      if (!d.value.includes('url(')) continue;
      for (const u of urlsInCssValue(d.value)) add(u, isFont && d.prop === 'src' ? 'font' : 'image', d.line, isFont ? '@font-face' : 'CSS');
    }
  }
  for (const at of ctx.cssAtRules) {
    if (at.name !== 'import') continue;
    const m = /^(?:url\(\s*)?["']?([^"')\s;]+)/i.exec(at.prelude);
    if (m) add(m[1], 'css-import', at.line, '@import');
  }

  for (const s of ctx.doc.scripts) {
    const body = s.raw || '';
    if (!body.trim()) continue;
    const type = (s.attrs.type || '').toLowerCase();
    if (type === 'importmap') {
      const re = /"[^"]*"\s*:\s*"([^"]+)"/g;
      let m;
      while ((m = re.exec(body))) add(m[1], 'importmap', s.rawLine + lineOffset(body, m.index), 'import map');
      continue;
    }
    if (type && !/^(module|text\/javascript|application\/javascript|text\/babel|)$/.test(type)) continue;
    let m;
    const reStatic = /(?:^|[;\n}])\s*import\s*(?:[\w*${},\s]*?\s*from\s*)?(["'])([^"']+)\1/g;
    while ((m = reStatic.exec(body))) add(m[2], 'js-import', s.rawLine + lineOffset(body, m.index), 'import');
    const reDyn = /\bimport\(\s*(["'])([^"']+)\1\s*\)/g;
    while ((m = reDyn.exec(body))) add(m[2], 'js-import', s.rawLine + lineOffset(body, m.index), 'import()');
    const reWorker = /new\s+(?:Shared)?Worker\(\s*(["'])([^"']+)\1/g;
    while ((m = reWorker.exec(body))) add(m[2], 'worker', s.rawLine + lineOffset(body, m.index), 'Worker');
    const reImportScripts = /importScripts\(\s*(["'])([^"']+)\1/g;
    while ((m = reImportScripts.exec(body))) add(m[2], 'worker', s.rawLine + lineOffset(body, m.index), 'importScripts');
  }
  return refs;
}

export function lineOffset(text, index) {
  let n = 0;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

export function hostOf(url) {
  const m = /^(?:https?:|wss?:|ftp:)?\/\/([^/?#:]+)/i.exec(url);
  return m ? m[1].toLowerCase() : null;
}
