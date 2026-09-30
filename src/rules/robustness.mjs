// Robustness rules: the front-end failures that agent-written pages repeat (see catalogue/).

import { ancestors } from '../html.mjs';

const attr = (el, name) => (el.attrs[name] ?? '').trim();
const hasName = (el) => attr(el, 'aria-label') || attr(el, 'aria-labelledby') || attr(el, 'title');

function innerName(el) {
  if (el.text.replace(/\s+/g, '').length) return true;
  const walk = (n) => {
    for (const c of n.children || []) {
      if (c.name === '#text') continue;
      if (c.name === 'img' && attr(c, 'alt')) return true;
      if (c.name === 'svg' && (attr(c, 'aria-label') || (c.children || []).some((k) => k.name === 'title'))) return true;
      if (c.name === 'input' && attr(c, 'value')) return true;
      if (attr(c, 'aria-label') || attr(c, 'title')) return true;
      if (walk(c)) return true;
    }
    return false;
  };
  return walk(el);
}

export const formLabels = {
  id: 'form-labels',
  group: 'robustness',
  title: 'Form labels',
  run(ctx) {
    const forIds = new Set(ctx.doc.elements.filter((e) => e.name === 'label' && attr(e, 'for')).map((e) => attr(e, 'for')));
    const findings = [];
    let n = 0;
    for (const el of ctx.doc.elements) {
      if (!['input', 'select', 'textarea'].includes(el.name)) continue;
      const type = attr(el, 'type').toLowerCase();
      if (el.name === 'input' && ['hidden', 'submit', 'reset', 'button', 'image'].includes(type)) continue;
      n++;
      if (hasName(el)) continue;
      if (attr(el, 'id') && forIds.has(attr(el, 'id'))) continue;
      if (ancestors(el).some((a) => a.name === 'label')) continue;
      const what = `<${el.name}${type ? ` type="${type}"` : ''}>`;
      findings.push({
        level: 'warn',
        line: el.line,
        message: attr(el, 'placeholder') ? `${what} has only a placeholder; the hint disappears when typing and is not a label` : `${what} has no label, aria-label or title`,
      });
    }
    return { findings, note: n ? `${n} form control${n > 1 ? 's' : ''} checked` : 'no form controls' };
  },
};

export const imgAlt = {
  id: 'img-alt',
  group: 'robustness',
  title: 'Image alt text',
  run(ctx) {
    const findings = [];
    let n = 0;
    for (const el of ctx.doc.elements) {
      if (el.name !== 'img') continue;
      n++;
      if (el.attrs.alt !== undefined) continue;
      if (/^(presentation|none)$/i.test(attr(el, 'role'))) continue;
      findings.push({ level: 'warn', line: el.line, message: '<img> has no alt attribute (use alt="" for decoration)' });
    }
    return { findings, note: n ? `${n} image${n > 1 ? 's' : ''} checked` : 'no <img> elements' };
  },
};

export const controlName = {
  id: 'control-name',
  group: 'robustness',
  title: 'Button and link names',
  run(ctx) {
    const findings = [];
    let n = 0;
    for (const el of ctx.doc.elements) {
      const role = attr(el, 'role').toLowerCase();
      const isBtn = el.name === 'button' || role === 'button';
      const isLink = (el.name === 'a' && el.attrs.href !== undefined) || role === 'link';
      if (!isBtn && !isLink) continue;
      n++;
      if (hasName(el) || innerName(el)) continue;
      findings.push({ level: 'warn', line: el.line, message: `${isBtn ? 'button' : 'link'} has no text or accessible name${el.attrs.href ? ` (${el.attrs.href.slice(0, 40)})` : ''}` });
    }
    return { findings, note: n ? `${n} button${n > 1 ? 's' : ''} and links checked` : 'no buttons or links' };
  },
};

export const positiveTabindex = {
  id: 'positive-tabindex',
  group: 'robustness',
  title: 'Tab order',
  run(ctx) {
    const findings = [];
    for (const el of ctx.doc.elements) {
      const t = el.attrs.tabindex;
      if (t !== undefined && /^\s*\d+\s*$/.test(t) && parseInt(t, 10) > 0) {
        findings.push({ level: 'warn', line: el.line, message: `<${el.name} tabindex="${t.trim()}"> puts the element ahead of the natural tab order` });
      }
    }
    return { findings, note: findings.length ? 'positive tabindex found' : 'no positive tabindex' };
  },
};

const NATIVE_CLICKABLE = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary', 'label', 'option', 'area']);

export const clickTarget = {
  id: 'click-target',
  group: 'robustness',
  title: 'Keyboard-reachable clicks',
  run(ctx) {
    const findings = [];
    for (const el of ctx.doc.elements) {
      if (el.attrs.onclick === undefined) continue;
      if (NATIVE_CLICKABLE.has(el.name) && !(el.name === 'a' && el.attrs.href === undefined)) continue;
      if (attr(el, 'role') || el.attrs.tabindex !== undefined) continue;
      findings.push({ level: 'warn', line: el.line, message: `<${el.name} onclick> cannot be reached or activated from the keyboard; use <button> or add a role and tabindex` });
    }
    return { findings, note: findings.length ? `${findings.length} click handler on a non-interactive element` : 'inline click handlers are on interactive elements' };
  },
};

export const landmarks = {
  id: 'landmarks',
  group: 'robustness',
  title: 'Main landmark',
  run(ctx) {
    const text = (ctx.doc.root.text || '').replace(/\s+/g, ' ').trim();
    const hasMain = ctx.doc.elements.some((e) => e.name === 'main' || attr(e, 'role').toLowerCase() === 'main');
    if (hasMain || text.length < 200) return { findings: [], note: hasMain ? 'has a main landmark' : 'too little text to need one' };
    return { findings: [{ level: 'warn', line: 1, message: 'no <main> element; screen reader users cannot jump to the content' }], note: 'no main landmark' };
  },
};

export default [formLabels, imgAlt, controlName, positiveTabindex, clickTarget, landmarks];
