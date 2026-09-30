// A small, forgiving CSS reader. It flattens rules (including @media, @supports, @layer and native
// nesting) into { selector, at, decls, line } and pulls out url() and @import references.

function blankComments(text) {
  // Replace comments with spaces, keeping newlines, so line numbers stay right.
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

const BLOCK_AT = new Set(['media', 'supports', 'layer', 'container', 'scope', 'document', 'starting-style']);

export function parseCss(raw, baseLine = 1) {
  const text = blankComments(raw);
  const nl = [];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) nl.push(i);
  const lineAt = (pos) => {
    let lo = 0;
    let hi = nl.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (nl[mid] < pos) lo = mid + 1;
      else hi = mid;
    }
    return baseLine + lo;
  };

  const rules = [];
  const atRules = [];
  let pos = 0;

  // Read one statement: returns { text, stop, at } where stop is ';', '{', '}' or '' (end of input).
  function readStatement() {
    while (pos < text.length && /\s/.test(text[pos])) pos++;
    const start = pos;
    let q = null;
    let paren = 0;
    while (pos < text.length) {
      const c = text[pos];
      if (q) {
        if (c === '\\') pos++;
        else if (c === q) q = null;
      } else if (c === '"' || c === "'") q = c;
      else if (c === '(') paren++;
      else if (c === ')') paren = Math.max(0, paren - 1);
      else if (paren === 0 && (c === ';' || c === '{' || c === '}')) {
        const out = { text: text.slice(start, pos), stop: c, at: start };
        pos++;
        return out;
      }
      pos++;
    }
    return { text: text.slice(start), stop: '', at: start };
  }

  function parseBlock(ctx) {
    const rule = ctx.rule;
    for (;;) {
      const st = readStatement();
      const t = st.text.trim();
      if (st.stop === '}' || st.stop === '') {
        if (t && rule) pushDecl(rule, t, st.at);
        return;
      }
      if (st.stop === ';') {
        if (!t) continue;
        if (t.startsWith('@')) {
          const m = /^@([a-zA-Z-]+)\s*([\s\S]*)$/.exec(t);
          atRules.push({ name: m ? m[1].toLowerCase() : '', prelude: m ? m[2].trim() : '', line: lineAt(st.at) });
        } else if (rule) pushDecl(rule, t, st.at);
        continue;
      }
      // '{'
      if (t.startsWith('@')) {
        const m = /^@([a-zA-Z-]+)\s*([\s\S]*)$/.exec(t);
        const name = m ? m[1].toLowerCase() : '';
        const prelude = m ? m[2].trim() : '';
        atRules.push({ name, prelude, line: lineAt(st.at) });
        if (BLOCK_AT.has(name)) {
          parseBlock({ at: [...ctx.at, `@${name} ${prelude}`.trim()], rule: null, selector: ctx.selector, keyframes: ctx.keyframes });
        } else if (name.endsWith('keyframes')) {
          parseBlock({ at: ctx.at, rule: null, selector: '', keyframes: true });
        } else {
          // @font-face, @page, @property and friends: declarations inside
          const r = { selector: `@${name}${prelude ? ' ' + prelude : ''}`, at: ctx.at, decls: [], line: lineAt(st.at), keyframes: ctx.keyframes };
          rules.push(r);
          parseBlock({ at: ctx.at, rule: r, selector: r.selector, keyframes: ctx.keyframes });
        }
      } else {
        let selector = t.replace(/\s+/g, ' ');
        if (ctx.selector && !ctx.keyframes) selector = selector.includes('&') ? selector.replace(/&/g, ctx.selector) : `${ctx.selector} ${selector}`;
        const r = { selector, at: ctx.at, decls: [], line: lineAt(st.at), keyframes: ctx.keyframes };
        rules.push(r);
        parseBlock({ at: ctx.at, rule: r, selector: ctx.keyframes ? '' : selector, keyframes: ctx.keyframes });
      }
    }
  }

  function pushDecl(rule, t, at) {
    const i = t.indexOf(':');
    if (i < 1) return;
    const prop = t.slice(0, i).trim().toLowerCase();
    if (!/^(--[^\s]+|[a-z-]+)$/i.test(prop)) return;
    let value = t.slice(i + 1).trim().replace(/\s*!important\s*$/i, '');
    rule.decls.push({ prop: prop.startsWith('--') ? prop : prop.toLowerCase(), value, line: lineAt(at) });
  }

  parseBlock({ at: [], rule: null, selector: '', keyframes: false });

  // url() and @import references, with line numbers (an @import url(...) counts once, as an import)
  const urls = [];
  const seen = new Set();
  let m;
  const reImp = /@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi;
  while ((m = reImp.exec(text))) {
    const u = { url: m[1].trim(), line: lineAt(m.index), context: 'css-import' };
    seen.add(`${u.line}|${u.url}`);
    urls.push(u);
  }
  const reUrl = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi;
  while ((m = reUrl.exec(text))) {
    const u = { url: (m[1] ?? m[2] ?? m[3] ?? '').trim(), line: lineAt(m.index), context: 'css-url' };
    if (seen.has(`${u.line}|${u.url}`)) continue;
    urls.push(u);
  }
  const dedup = urls;

  return { rules, atRules, urls: dedup, text };
}

export function parseStyleAttr(value, line) {
  const r = { selector: '(style attribute)', at: [], decls: [], line, keyframes: false };
  // split on ; outside parens and quotes
  let q = null;
  let paren = 0;
  let start = 0;
  const parts = [];
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === '(') paren++;
    else if (c === ')') paren = Math.max(0, paren - 1);
    else if (c === ';' && paren === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  for (const p of parts) {
    const i = p.indexOf(':');
    if (i < 1) continue;
    r.decls.push({ prop: p.slice(0, i).trim().toLowerCase(), value: p.slice(i + 1).trim().replace(/\s*!important\s*$/i, ''), line });
  }
  return r;
}
