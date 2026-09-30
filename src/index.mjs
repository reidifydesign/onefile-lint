// Public API: lint(htmlString, options) -> report

import { scanHtml } from './html.mjs';
import { parseCss, parseStyleAttr } from './css.mjs';
import { collectRefs } from './refs.mjs';
import portability from './rules/portability.mjs';
import display from './rules/display.mjs';
import robustness from './rules/robustness.mjs';

export const RULES = [...portability, ...display, ...robustness];
export const RULE_IDS = RULES.map((r) => r.id);
export const DEFAULTS = { warnKb: 1024, failKb: 5120, skip: [], only: null, strict: false, allowHosts: [] };

export function buildContext(src, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const buffer = Buffer.from(src, 'utf8');
  const doc = scanHtml(src);
  const cssRules = [];
  const cssAtRules = [];
  let cssText = '';
  for (const s of doc.styles) {
    const parsed = parseCss(s.raw || '', s.rawLine || 1);
    const media = (s.attrs.media || '').trim();
    for (const r of parsed.rules) cssRules.push(media && media !== 'all' && media !== 'screen' ? { ...r, at: [`@media ${media}`, ...r.at] } : r);
    cssAtRules.push(...parsed.atRules);
    cssText += parsed.text + '\n';
  }
  const attrRules = [];
  for (const el of doc.elements) if (el.attrs.style) attrRules.push(parseStyleAttr(el.attrs.style, el.line));
  const ctx = { src, buffer, bytes: buffer.length, doc, cssRules, cssAtRules, cssText, attrRules, allCssRules: [...cssRules, ...attrRules], options: opts };
  ctx.refs = collectRefs(ctx);
  return ctx;
}

export function lint(src, options = {}) {
  const ctx = buildContext(src, options);
  const { skip, only, strict } = ctx.options;
  const results = [];
  for (const rule of RULES) {
    if (only && !only.includes(rule.id)) continue;
    if (skip.includes(rule.id) || skip.includes(rule.group)) continue;
    const out = rule.run(ctx);
    const findings = out.findings.map((f) => ({ rule: rule.id, ...f }));
    const status = findings.some((f) => f.level === 'error') ? 'FAIL' : findings.some((f) => f.level === 'warn') ? 'WARN' : 'OK';
    results.push({ id: rule.id, group: rule.group, title: rule.title, status, note: out.note || '', findings, metrics: out.metrics });
  }
  const count = (s) => results.filter((r) => r.status === s).length;
  const fails = count('FAIL');
  const warns = count('WARN');
  return {
    bytes: ctx.bytes,
    results,
    summary: { ok: count('OK'), warn: warns, fail: fails, verdict: fails || (strict && warns) ? 'FAIL' : warns ? 'PASS with warnings' : 'PASS' },
    passed: !(fails || (strict && warns)),
  };
}
