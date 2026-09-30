// Display rules: how the page behaves on screens, in dark mode and for people who turn motion off.

import { contrast, parseColor, toHex } from '../color.mjs';

const isRootSel = (sel) => /^(html|body|:root)(\s*,\s*(html|body|:root))*$/.test(sel.trim());

function ctxKey(rule) {
  const at = rule.at.join(' ');
  if (/prefers-color-scheme\s*:\s*dark/i.test(at) || /\bdark\b/i.test(rule.selector)) return 'dark';
  return '';
}

function skipRule(rule) {
  if (rule.keyframes) return true;
  if (rule.selector.startsWith('@')) return true;
  if (rule.at.some((a) => /\bprint\b/i.test(a))) return true;
  if (/disabled|::selection|\[hidden\]/i.test(rule.selector)) return true;
  return false;
}

function buildVars(rules) {
  const vars = { '': new Map(), dark: new Map() };
  for (const r of rules) {
    if (r.keyframes) continue;
    const key = ctxKey(r);
    for (const d of r.decls) if (d.prop.startsWith('--')) vars[key].set(d.prop, d.value.trim());
  }
  return vars;
}

function resolve(value, key, vars, depth = 0) {
  if (depth > 6) return null;
  let out = value;
  const re = /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/;
  for (let guard = 0; guard < 12; guard++) {
    const m = re.exec(out);
    if (!m) return out;
    const v = vars[key].get(m[1]) ?? (key ? vars[''].get(m[1]) : undefined) ?? (m[2] !== undefined ? m[2].trim() : undefined);
    if (v === undefined) return null;
    const inner = resolve(v, key, vars, depth + 1);
    if (inner === null) return null;
    out = out.slice(0, m.index) + inner + out.slice(m.index + m[0].length);
  }
  return null;
}

function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const c of s) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (/\s/.test(c) && depth === 0) {
      if (cur) out.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

function lastDecl(rule, props) {
  let found = null;
  for (const d of rule.decls) if (props.includes(d.prop)) found = d;
  return found;
}

function readColor(decl, key, vars, isBackground) {
  if (!decl) return null;
  const v = resolve(decl.value, key, vars);
  if (v === null) return null;
  if (isBackground && decl.prop === 'background') {
    if (/gradient\(|url\(/i.test(v)) return null;
    for (const tok of splitTop(v)) {
      const c = parseColor(tok);
      if (c) return c;
    }
    return null;
  }
  return parseColor(v);
}

function fontInfo(rule, key, vars) {
  const fs = lastDecl(rule, ['font-size']);
  const fw = lastDecl(rule, ['font-weight']);
  let px = null;
  if (fs) {
    const v = resolve(fs.value, key, vars);
    const m = v && /^([\d.]+)(px|rem|em|pt)$/.exec(v.trim());
    if (m) px = parseFloat(m[1]) * (m[2] === 'px' ? 1 : m[2] === 'pt' ? 4 / 3 : 16);
  }
  let bold = false;
  if (fw) {
    const v = resolve(fw.value, key, vars) || '';
    bold = /^(bold|bolder)$/i.test(v.trim()) || parseInt(v, 10) >= 700;
  }
  return { large: px !== null && (px >= 24 || (bold && px >= 18.66)) };
}

function over(fg, bg) {
  if (fg.a >= 1) return fg;
  return { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 };
}

export const contrastRule = {
  id: 'contrast',
  group: 'display',
  title: 'Text contrast',
  run(ctx) {
    const rules = ctx.allCssRules;
    const vars = buildVars(rules);
    const findings = [];
    let checked = 0;
    const seen = new Set();
    const report = (key, rule, fg, bg, large, extra = '') => {
      const solid = over(fg, bg);
      const ratio = contrast(solid, bg);
      const need = large ? 3 : 4.5;
      checked++;
      if (ratio + 1e-9 >= need) return;
      const id = `${rule.selector}|${toHex(solid)}|${toHex(bg)}|${key}`;
      if (seen.has(id)) return;
      seen.add(id);
      const mode = key === 'dark' ? ' (dark mode)' : '';
      findings.push({
        level: 'warn',
        line: rule.line,
        message: `${rule.selector.slice(0, 60)}${mode}: ${toHex(solid)} on ${toHex(bg)} is ${ratio.toFixed(2)}:1, needs ${need}:1${large ? ' (large text)' : ''}${extra}`,
      });
    };

    const usesVar = (r) => r.decls.some((d) => ['color', 'background', 'background-color', 'font-size', 'font-weight'].includes(d.prop) && d.value.includes('var('));
    // contexts a rule is evaluated in: its own, plus dark mode when it uses variables the dark scheme remaps
    const keysFor = (r) => {
      const own = ctxKey(r);
      return own === '' && vars.dark.size && usesVar(r) ? ['', 'dark'] : [own];
    };

    // page-level colours per context (rules that declare them in a dark context win in dark mode)
    const page = { '': {}, dark: {} };
    const rootRules = rules.filter((r) => !skipRule(r) && isRootSel(r.selector));
    for (const pass of ['', 'dark']) {
      for (const r of rootRules) {
        if (ctxKey(r) !== pass) continue;
        for (const key of keysFor(r)) {
          const bg = readColor(lastDecl(r, ['background-color', 'background']), key, vars, true);
          const fg = readColor(lastDecl(r, ['color']), key, vars, false);
          if (bg && bg.a >= 1) page[key].bg = bg;
          if (fg) page[key].fg = fg;
        }
      }
    }
    const schemeDark = rules.some((r) => r.decls.some((d) => d.prop === 'color-scheme' && /dark/.test(d.value)));
    const pageBg = (key) => page[key].bg || (key ? page[''].bg : null);
    const pageFg = (key) => page[key].fg || (key ? page[''].fg : null);

    for (const key of ['', 'dark']) {
      if (key === 'dark' && !page.dark.bg && !page.dark.fg) continue;
      const bg = pageBg(key);
      const fg = pageFg(key);
      if (!bg && !fg) continue;
      const assume = !key && !schemeDark;
      const usedBg = bg || (assume ? { r: 255, g: 255, b: 255, a: 1 } : null);
      const usedFg = fg || (assume ? { r: 0, g: 0, b: 0, a: 1 } : null);
      if (usedBg && usedFg) {
        const at = rootRules.find((x) => lastDecl(x, ['color', 'background', 'background-color']));
        report(key, { selector: 'page text on page background', line: at ? at.line : null }, usedFg, usedBg, false);
      }
    }

    for (const r of rules) {
      if (skipRule(r) || isRootSel(r.selector)) continue;
      const fgD = lastDecl(r, ['color']);
      const bgD = lastDecl(r, ['background-color', 'background']);
      if (!fgD || !bgD) continue;
      for (const key of keysFor(r)) {
        const fg = readColor(fgD, key, vars, false);
        if (!fg || fg.a === 0) continue;
        const bg = readColor(bgD, key, vars, true);
        if (!bg || bg.a < 1) continue;
        report(key, r, fg, bg, fontInfo(r, key, vars).large);
      }
    }

    // colour-only rules against the page background: shown as notes, never a failure
    const notes = [];
    for (const r of rules) {
      if (skipRule(r) || isRootSel(r.selector)) continue;
      const key = ctxKey(r);
      const fgD = lastDecl(r, ['color']);
      if (!fgD || lastDecl(r, ['background-color', 'background'])) continue;
      const bg = pageBg(key);
      if (!bg) continue;
      const fg = readColor(fgD, key, vars, false);
      if (!fg || fg.a < 1) continue;
      const { large } = fontInfo(r, key, vars);
      const ratio = contrast(fg, bg);
      if (ratio < (large ? 3 : 4.5) && notes.length < 5) {
        notes.push({ level: 'info', line: r.line, message: `${r.selector.slice(0, 60)}: ${toHex(fg)} would be ${ratio.toFixed(2)}:1 on the page background ${toHex(bg)}; no background is set in the rule, so this only matters if it sits directly on the page` });
      }
    }
    return { findings: [...findings, ...notes], note: checked ? `${checked} colour pair${checked > 1 ? 's' : ''} read from CSS` : 'no readable colour pairs in CSS (computed styles are not evaluated)' };
  },
};

const MOTION_TRANSITION = /\b(transform|translate|scale|rotate|top|left|right|bottom|inset|width|height|margin|max-height)\b/;

export const reducedMotion = {
  id: 'reduced-motion',
  group: 'display',
  title: 'Reduced motion',
  run(ctx) {
    const sources = [];
    for (const r of ctx.allCssRules) {
      if (r.keyframes) continue;
      for (const d of r.decls) {
        const v = d.value.trim().toLowerCase();
        if (d.prop === 'animation' || d.prop === 'animation-name') {
          if (v && !/^none\b/.test(v) && !/^0s?\b/.test(v)) sources.push({ line: d.line, what: `${d.prop}: ${v.slice(0, 40)}` });
        } else if ((d.prop === 'transition' || d.prop === 'transition-property') && MOTION_TRANSITION.test(v) && !/^none\b/.test(v)) {
          sources.push({ line: d.line, what: `${d.prop}: ${v.slice(0, 40)}` });
        } else if (d.prop === 'scroll-behavior' && v === 'smooth') sources.push({ line: d.line, what: 'scroll-behavior: smooth' });
      }
    }
    for (const a of ctx.cssAtRules) if (a.name.endsWith('keyframes')) sources.push({ line: a.line, what: `@keyframes ${a.prelude}` });
    for (const el of ctx.doc.elements) {
      if (el.name === 'video' && el.attrs.autoplay !== undefined) sources.push({ line: el.line, what: 'autoplaying <video>' });
    }
    for (const s of ctx.doc.scripts) {
      const b = s.raw || '';
      let m;
      const re = /behavior\s*:\s*["']smooth["']|requestAnimationFrame\s*\(|\.animate\(\s*[\[{]/g;
      while ((m = re.exec(b))) {
        let n = 0;
        for (let i = 0; i < m.index; i++) if (b.charCodeAt(i) === 10) n++;
        sources.push({ line: s.rawLine + n, what: m[0].startsWith('behavior') ? 'smooth scrolling in script' : m[0].startsWith('request') ? 'requestAnimationFrame loop' : 'Web Animations API' });
      }
    }
    const inCss = ctx.allCssRules.some((r) => r.at.some((a) => /prefers-reduced-motion/i.test(a))) || ctx.cssText.includes('prefers-reduced-motion');
    const inJs = ctx.doc.scripts.some((s) => /prefers-reduced-motion/i.test(s.raw || ''));
    if (!sources.length) return { findings: [], note: 'no animation found' };
    if (inCss || inJs) return { findings: [], note: `${sources.length} motion source${sources.length > 1 ? 's' : ''}, prefers-reduced-motion is handled` };
    const first = sources[0];
    const kinds = [...new Set(sources.map((s) => s.what.split(':')[0].split(' ')[0]))].slice(0, 4).join(', ');
    return {
      findings: [{ level: 'warn', line: first.line, message: `${sources.length} motion source${sources.length > 1 ? 's' : ''} (${kinds}) and no prefers-reduced-motion query or check; first: ${first.what}` }],
      note: 'motion without a reduced-motion path',
    };
  },
};

export const viewportHeight = {
  id: 'viewport-height',
  group: 'display',
  title: 'Viewport height',
  run(ctx) {
    const findings = [];
    for (const r of ctx.allCssRules) {
      if (r.keyframes || r.selector.startsWith('@') || r.at.some((a) => /\bprint\b/i.test(a))) continue;
      const heights = r.decls.filter((d) => d.prop === 'height');
      const hasDynamic = r.decls.some((d) => ['height', 'min-height'].includes(d.prop) && /\d(dvh|svh)\b/.test(d.value));
      for (const d of heights) {
        if (/(^|[\s(,])100vh\b/.test(d.value) && !hasDynamic) {
          findings.push({ level: 'warn', line: d.line, message: `${r.selector.slice(0, 50)}: height: 100vh is taller than the visible area on phones while the browser bar is showing; use 100dvh (keep 100vh as the fallback line before it)` });
        }
      }
      if (/^(html|body)(\s*,\s*(html|body))*$/.test(r.selector.trim())) {
        for (const d of r.decls) {
          if ((d.prop === 'overflow' || d.prop === 'overflow-y') && /\bhidden\b/.test(d.value)) {
            findings.push({ level: 'warn', line: d.line, message: `${r.selector}: ${d.prop}: hidden stops the page scrolling; anything taller than the window is unreachable and cannot be printed in full` });
          }
          if (d.prop === 'height' && /^\d{3,}(\.\d+)?px$/.test(d.value.trim())) {
            findings.push({ level: 'warn', line: d.line, message: `${r.selector}: height: ${d.value} is a fixed height on the page root` });
          }
        }
      }
    }
    return { findings, note: findings.length ? `${findings.length} fixed or clipped height` : 'no 100vh heights or clipped page root' };
  },
};

export const focusOutline = {
  id: 'focus-outline',
  group: 'display',
  title: 'Focus outline',
  run(ctx) {
    const rules = ctx.allCssRules.filter((r) => !r.keyframes && !r.selector.startsWith('@'));
    const replaces = (r) => r.decls.some((d) => ['box-shadow', 'border', 'border-color', 'border-bottom', 'text-decoration', 'background', 'background-color'].includes(d.prop) && !/^(none|0|transparent)$/i.test(d.value.trim()));
    const hasFocusStyle = rules.some((r) => /:focus(-visible|-within)?\b/.test(r.selector) && !/:not\(:focus-visible\)/.test(r.selector) && (r.decls.some((d) => d.prop.startsWith('outline') && !/^(none|0|0px)$/i.test(d.value.trim())) || replaces(r)));
    const findings = [];
    for (const r of rules) {
      const d = r.decls.find((x) => (x.prop === 'outline' && /^(none|0|0px)$/i.test(x.value.trim())) || (x.prop === 'outline-style' && /^none$/i.test(x.value.trim())) || (x.prop === 'outline-width' && /^0(px)?$/i.test(x.value.trim())));
      if (!d) continue;
      if (/:focus:not\(:focus-visible\)|:not\(:focus-visible\)/.test(r.selector)) continue;
      if (hasFocusStyle || replaces(r)) continue;
      findings.push({ level: 'warn', line: d.line, message: `${r.selector.slice(0, 60)}: ${d.prop}: ${d.value} removes the focus ring and nothing in the page replaces it` });
    }
    return { findings, note: findings.length ? 'focus ring removed without a replacement' : 'focus ring kept or replaced' };
  },
};

export const zoomBlocked = {
  id: 'zoom-blocked',
  group: 'display',
  title: 'Pinch zoom',
  run(ctx) {
    const findings = [];
    for (const el of ctx.doc.elements) {
      if (el.name !== 'meta' || (el.attrs.name || '').toLowerCase() !== 'viewport') continue;
      const c = (el.attrs.content || '').toLowerCase();
      const us = /user-scalable\s*=\s*(no|0)/.test(c);
      const ms = /maximum-scale\s*=\s*([\d.]+)/.exec(c);
      if (us) findings.push({ level: 'warn', line: el.line, message: 'viewport meta has user-scalable=no, which blocks pinch zoom' });
      if (ms && parseFloat(ms[1]) < 2) findings.push({ level: 'warn', line: el.line, message: `viewport meta has maximum-scale=${ms[1]}, which stops zooming short of 200%` });
    }
    return { findings, note: findings.length ? 'zoom is restricted' : 'zoom is not restricted' };
  },
};

export default [contrastRule, reducedMotion, viewportHeight, focusOutline, zoomBlocked];
