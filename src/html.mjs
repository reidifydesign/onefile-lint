// A small, forgiving HTML scanner. It is not a spec-complete parser: it reads the tags, attributes,
// text and raw-text blocks (script, style) that the rules need, and it keeps line numbers.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);

export function lineIndex(src) {
  const nl = [];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) nl.push(i);
  return (pos) => {
    let lo = 0;
    let hi = nl.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (nl[mid] < pos) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  };
}

function parseAttrs(s) {
  const attrs = {};
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(s))) {
    const k = m[1].toLowerCase();
    if (k in attrs) continue;
    attrs[k] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

// Find the end of a tag starting at `i` (the "<"), respecting quoted attribute values.
function tagEnd(src, i) {
  let q = null;
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j];
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === '>') return j;
  }
  return -1;
}

export function decodeEntities(s) {
  return s
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export function scanHtml(src) {
  const lineAt = lineIndex(src);
  const root = { name: '#root', attrs: {}, children: [], parent: null, line: 1, text: '' };
  const all = [];
  const scripts = [];
  const styles = [];
  let doctype = false;
  let stack = [root];
  const top = () => stack[stack.length - 1];
  let i = 0;
  const n = src.length;

  const addText = (text, pos) => {
    if (!text) return;
    top().children.push({ name: '#text', text, line: lineAt(pos), parent: top() });
  };

  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      addText(src.slice(i), i);
      break;
    }
    if (lt > i) addText(src.slice(i, lt), i);
    if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt + 4);
      i = e === -1 ? n : e + 3;
      continue;
    }
    if (src[lt + 1] === '!' || src[lt + 1] === '?') {
      if (/^<!doctype\s+html/i.test(src.slice(lt, lt + 20))) doctype = true;
      const e = src.indexOf('>', lt);
      i = e === -1 ? n : e + 1;
      continue;
    }
    const closing = src[lt + 1] === '/';
    const nameStart = lt + (closing ? 2 : 1);
    const nm = /^[a-zA-Z][a-zA-Z0-9:-]*/.exec(src.slice(nameStart, nameStart + 40));
    if (!nm) {
      addText('<', lt);
      i = lt + 1;
      continue;
    }
    const name = nm[0].toLowerCase();
    const end = tagEnd(src, lt);
    if (end === -1) {
      i = n;
      break;
    }
    if (closing) {
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) {
          stack = stack.slice(0, k);
          break;
        }
      }
      i = end + 1;
      continue;
    }
    const attrSrc = src.slice(nameStart + name.length, end);
    const selfClose = attrSrc.trimEnd().endsWith('/');
    const el = { name, attrs: parseAttrs(attrSrc), children: [], parent: top(), line: lineAt(lt), pos: lt, text: '' };
    top().children.push(el);
    all.push(el);
    i = end + 1;
    if (RAW.has(name) && !selfClose) {
      const re = new RegExp('</' + name + '\\b', 'gi');
      re.lastIndex = i;
      const m = re.exec(src);
      const bodyEnd = m ? m.index : n;
      const body = src.slice(i, bodyEnd);
      el.raw = body;
      el.rawLine = lineAt(i);
      if (name === 'script') scripts.push(el);
      if (name === 'style') styles.push(el);
      if (name === 'title' || name === 'textarea') el.children.push({ name: '#text', text: body, line: el.rawLine, parent: el });
      const ce = m ? src.indexOf('>', bodyEnd) : -1;
      i = ce === -1 ? n : ce + 1;
      continue;
    }
    if (!VOID.has(name) && !selfClose) stack.push(el);
  }

  // textContent per element, bottom up (script and style bodies are not text)
  const fill = (el) => {
    let t = '';
    for (const c of el.children || []) {
      if (c.name === '#text') t += c.text;
      else {
        fill(c);
        if (c.name !== 'script' && c.name !== 'style') t += c.text;
      }
    }
    el.text = t;
  };
  fill(root);

  return { root, elements: all, scripts, styles, doctype, lineAt, size: src.length };
}

export function ancestors(el) {
  const out = [];
  for (let p = el.parent; p; p = p.parent) out.push(p);
  return out;
}

export function find(doc, pred) {
  return doc.elements.filter(pred);
}
