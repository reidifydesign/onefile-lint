import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lint, RULE_IDS } from '../src/index.mjs';

const page = (head = '', body = '') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>t</title>${head}</head><body><main><p>${'word '.repeat(60)}</p>${body}</main></body></html>`;
const res = (src, id, opts) => lint(src, opts).results.find((r) => r.id === id);
const msgs = (r) => r.findings.map((f) => f.message).join('\n');

test('every rule runs on a clean page and survives broken input', () => {
  const good = lint(fs.readFileSync(new URL('./fixtures/good.html', import.meta.url), 'utf8'));
  assert.equal(good.summary.fail, 0);
  assert.equal(good.summary.warn, 0);
  assert.equal(good.results.length, RULE_IDS.length);
  assert.doesNotThrow(() => lint(''));
  assert.doesNotThrow(() => lint('<<<>>> <a href="'));
  assert.doesNotThrow(() => lint('<style>a{color:</style><script>fetch(</script>'));
});

test('remote-dependency: each kind is found, data and fragments are not', () => {
  const head =
    '<script src="https://a.com/x.js"></script><link rel="stylesheet" href="//b.com/s.css"><link rel="preconnect" href="https://c.com"><style>@import url("https://d.com/f.css"); .x{background:url(https://e.com/i.png)} @font-face{font-family:f;src:url(https://f.com/f.woff2)}</style>';
  const body =
    '<img src="https://g.com/i.png"><iframe src="https://h.com"></iframe><img src="data:image/gif;base64,AAAA"><a href="https://i.com">link</a><video src="https://j.com/v.mp4"></video><svg><use href="#x"></use></svg>';
  const r = res(page(head, body), 'remote-dependency');
  const hosts = ['a.com', 'b.com', 'c.com', 'd.com', 'e.com', 'f.com', 'g.com', 'h.com', 'j.com'];
  for (const h of hosts) assert.ok(msgs(r).includes(h), `missing ${h}`);
  assert.ok(!msgs(r).includes('i.com'));
  assert.equal(r.findings.length, hosts.length);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.findings.find((f) => f.message.includes('e.com')).level, 'warn');
  assert.equal(r.findings.find((f) => f.message.includes('a.com')).level, 'error');
  assert.equal(r.findings.find((f) => f.message.includes('c.com')).level, 'warn');
});

test('remote-dependency: module imports, import maps and allow-host', () => {
  const src = page(
    '<script type="importmap">{"imports":{"three":"https://cdn.x.com/three.js"}}</script><script type="module">import * as T from "three"; import { a } from "https://esm.sh/a"; const m = await import("https://esm.sh/b");</script>',
  );
  const r = res(src, 'remote-dependency');
  assert.equal(r.findings.length, 3);
  const allowed = res(src, 'remote-dependency', { allowHosts: ['esm.sh', 'cdn.x.com'] });
  assert.equal(allowed.findings.length, 0);
  assert.match(allowed.note, /allowed hosts/);
});

test('sibling-file: relative files are errors for scripts and warnings for images', () => {
  const r = res(page('<script src="app.js"></script><link rel="stylesheet" href="./s.css">', '<img src="images/a.png"><a href="other.html">x</a>'), 'sibling-file');
  assert.equal(r.findings.length, 3);
  assert.equal(r.findings.filter((f) => f.level === 'error').length, 2);
});

test('size: limits, gzip and data URI share', () => {
  const big = 'x'.repeat(2048);
  assert.equal(res(page('', `<p>${big}</p>`), 'size', { warnKb: 1 }).status, 'WARN');
  assert.equal(res(page('', `<p>${big}</p>`), 'size', { warnKb: 1, failKb: 2 }).status, 'FAIL');
  assert.equal(res(page('', `<p>${big}</p>`), 'size').status, 'OK');
  const uri = 'data:image/png;base64,' + 'A'.repeat(150 * 1024);
  const r = res(page('', `<img alt="" src="${uri}">`), 'size');
  assert.equal(r.status, 'WARN');
  assert.match(msgs(r), /data URIs are \d+%/);
  assert.ok(r.metrics.gzip < r.metrics.bytes);
});

test('offline: fetch, service worker, forms and manifests', () => {
  const src = page('<link rel="manifest" href="m.json">', '<form action="https://x.com/post"></form>').replace(
    '</body>',
    '<script>fetch("https://api.x.com/a"); fetch("data.json"); fetch(url); new WebSocket("wss://s.x.com"); navigator.serviceWorker.register("/sw.js");</script></body>',
  );
  const r = res(src, 'offline');
  assert.equal(r.findings.length, 6);
  assert.match(msgs(r), /api\.x\.com/);
  assert.match(msgs(r), /data\.json/);
  assert.match(msgs(r), /service worker/);
  assert.equal(res(page('', '<script>const u = "https://x.com"; document.title = u;</script>'), 'offline').status, 'OK');
});

test('print-styles: missing print rules, dark page, clipped root', () => {
  assert.equal(res(page('<style>body{color:#000}</style>'), 'print-styles').status, 'WARN');
  assert.equal(res(page('<style>body{color:#000}@media print{body{color:#000}}</style>'), 'print-styles').status, 'OK');
  const dark = res(page('<style>body{background:#111;color:#eee;overflow:hidden}</style>'), 'print-styles');
  assert.match(msgs(dark), /dark/);
  assert.match(msgs(dark), /overflow: hidden/);
  assert.equal(res('<p>short</p>', 'print-styles').status, 'OK');
});

test('document-basics: doctype, charset, viewport, lang, title', () => {
  const r = res('<html><head></head><body>café</body></html>', 'document-basics');
  assert.equal(r.status, 'FAIL');
  assert.equal(r.findings.length, 5);
  assert.equal(r.findings.find((f) => /charset/.test(f.message)).level, 'error');
  assert.equal(
    res('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>x</title></head></html>', 'document-basics').status,
    'OK',
  );
  const late = '<!doctype html><html lang="en"><head><title>x</title><meta name="viewport" content="width=device-width">' + '<!-- -->'.repeat(200) + '<meta charset="utf-8"></head></html>';
  assert.ok(res(late, 'document-basics').findings.some((f) => /charset/.test(f.message)));
});

test('contrast: same-rule pairs, variables, dark mode, large text and skips', () => {
  const low = res(page('<style>.a{color:#999;background:#fff}</style>'), 'contrast');
  assert.equal(low.status, 'WARN');
  assert.match(msgs(low), /#999999 on #ffffff is 2\.85:1/);
  assert.equal(res(page('<style>.a{color:#767676;background:#fff}</style>'), 'contrast').status, 'OK');
  assert.equal(res(page('<style>.a{color:#777;background:#fff;font-size:24px}</style>'), 'contrast').status, 'OK');
  assert.equal(res(page('<style>.a{color:#777;background:#fff;font-size:14px}</style>'), 'contrast').status, 'WARN');
  assert.equal(res(page('<style>:root{--fg:#999;--bg:#fff}.a{color:var(--fg);background:var(--bg)}</style>'), 'contrast').status, 'WARN');
  assert.equal(res(page('<style>.a{color:var(--missing);background:#fff}</style>'), 'contrast').status, 'OK');
  const dark = res(page('<style>:root{--fg:#111;--bg:#fff}@media (prefers-color-scheme: dark){:root{--fg:#444;--bg:#222}}body{color:var(--fg);background:var(--bg)}</style>'), 'contrast');
  assert.match(msgs(dark), /dark mode/);
  assert.equal(res(page('<style>.a{color:#ccc;background:linear-gradient(#fff,#eee)}</style>'), 'contrast').status, 'OK');
  assert.equal(res(page('<style>button:disabled{color:#ccc;background:#fff}@media print{.a{color:#ccc;background:#fff}}</style>'), 'contrast').status, 'OK');
  assert.match(msgs(res(page('<style>.a{color:oklch(0.9 0 0);background:white}</style>'), 'contrast')), /on #ffffff/);
  assert.match(msgs(res(page('', '<p style="color:#aaa;background:#fff">x</p>'), 'contrast')), /style attribute/);
});

test('contrast: colour-only rules are notes and never fail the page', () => {
  const r = res(page('<style>body{background:#fff;color:#000}.m{color:#999}</style>'), 'contrast');
  assert.equal(r.status, 'OK');
  assert.equal(r.findings[0].level, 'info');
});

test('reduced-motion: detects motion, accepts a media query or a script check', () => {
  const motion = '<style>.a{animation:spin 1s infinite}@keyframes spin{to{transform:rotate(1turn)}}</style>';
  assert.equal(res(page(motion), 'reduced-motion').status, 'WARN');
  assert.equal(res(page(motion + '<style>@media (prefers-reduced-motion: reduce){.a{animation:none}}</style>'), 'reduced-motion').status, 'OK');
  assert.equal(res(page('', '<script>if (matchMedia("(prefers-reduced-motion: reduce)").matches) {} requestAnimationFrame(f)</script>'), 'reduced-motion').status, 'OK');
  assert.equal(res(page('<style>a{transition:color .2s}</style>'), 'reduced-motion').status, 'OK');
  assert.equal(res(page('<style>.a{transition:transform .2s}</style>'), 'reduced-motion').status, 'WARN');
  assert.equal(res(page('<style>html{scroll-behavior:smooth}</style>'), 'reduced-motion').status, 'WARN');
  assert.equal(res(page('', '<video autoplay muted></video>'), 'reduced-motion').status, 'WARN');
});

test('viewport-height: 100vh, dvh fallback, overflow and fixed root height', () => {
  assert.equal(res(page('<style>.a{height:100vh}</style>'), 'viewport-height').status, 'WARN');
  assert.equal(res(page('<style>.a{height:100vh;height:100dvh}</style>'), 'viewport-height').status, 'OK');
  assert.equal(res(page('<style>.a{min-height:100vh}</style>'), 'viewport-height').status, 'OK');
  assert.equal(res(page('<style>body{overflow:hidden}</style>'), 'viewport-height').status, 'WARN');
  assert.equal(res(page('<style>html,body{height:800px}</style>'), 'viewport-height').status, 'WARN');
});

test('focus-outline: removal needs a replacement', () => {
  assert.equal(res(page('<style>button{outline:none}</style>'), 'focus-outline').status, 'WARN');
  assert.equal(res(page('<style>button{outline:none}button:focus-visible{box-shadow:0 0 0 3px blue}</style>'), 'focus-outline').status, 'OK');
  assert.equal(res(page('<style>input{outline:0;border:2px solid blue}</style>'), 'focus-outline').status, 'OK');
  assert.equal(res(page('<style>button:focus:not(:focus-visible){outline:none}</style>'), 'focus-outline').status, 'OK');
});

test('zoom-blocked', () => {
  const v = (c) => `<!doctype html><html lang=en><head><meta charset=utf-8><meta name="viewport" content="${c}"><title>t</title></head></html>`;
  assert.equal(res(v('width=device-width, user-scalable=no'), 'zoom-blocked').status, 'WARN');
  assert.equal(res(v('width=device-width, maximum-scale=1'), 'zoom-blocked').status, 'WARN');
  assert.equal(res(v('width=device-width, maximum-scale=5'), 'zoom-blocked').status, 'OK');
});

test('form-labels: label for, wrapping label, aria-label, placeholder only', () => {
  const r = res(
    page('', '<label for="a">A</label><input id="a"><label>B <input></label><input aria-label="C"><input type="hidden"><input type="submit"><input placeholder="D"><select></select><textarea></textarea>'),
    'form-labels',
  );
  assert.equal(r.findings.length, 3);
  assert.match(msgs(r), /only a placeholder/);
});

test('img-alt', () => {
  const r = res(page('', '<img src="data:,a"><img src="data:,b" alt=""><img src="data:,c" alt="c"><img src="data:,d" role="presentation">'), 'img-alt');
  assert.equal(r.findings.length, 1);
});

test('control-name: text, aria-label, image alt, svg title and empties', () => {
  const r = res(
    page('', '<button>Go</button><button aria-label="x"><svg></svg></button><button><img alt="Close" src="data:,a"></button><button><svg><title>Menu</title></svg></button><button><svg></svg></button><a href="/x"></a><a href="/y">y</a><a name="z"></a>'),
    'control-name',
  );
  assert.equal(r.findings.length, 2);
});

test('positive-tabindex and click-target', () => {
  assert.equal(res(page('', '<div tabindex="0"></div><div tabindex="-1"></div><div tabindex="2"></div>'), 'positive-tabindex').findings.length, 1);
  const r = res(page('', '<div onclick="x()">a</div><div onclick="x()" role="button" tabindex="0">b</div><button onclick="x()">c</button><span onclick="x()">d</span>'), 'click-target');
  assert.equal(r.findings.length, 2);
});

test('landmarks: only for pages with real text', () => {
  assert.equal(res('<!doctype html><html><body><p>' + 'word '.repeat(60) + '</p></body></html>', 'landmarks').status, 'WARN');
  assert.equal(res('<!doctype html><html><body><div role="main">' + 'word '.repeat(60) + '</div></body></html>', 'landmarks').status, 'OK');
  assert.equal(res('<p>short</p>', 'landmarks').status, 'OK');
});

test('the display and robustness extras are opt-out and never fail a page on their own', () => {
  const src = fs.readFileSync(new URL('./fixtures/bad.html', import.meta.url), 'utf8');
  const all = lint(src);
  const extras = all.results.filter((r) => r.group === 'display' || r.group === 'robustness');
  assert.ok(extras.length >= 11);
  assert.ok(extras.every((r) => r.status !== 'FAIL'));
  const core = lint(src, { skip: ['display', 'robustness'] });
  assert.deepEqual(core.results.map((r) => r.id), all.results.filter((r) => r.group === 'portability').map((r) => r.id));
  assert.ok(core.results.every((r) => r.group === 'portability'));
});

test('options: only, skip (rule and group) and strict', () => {
  const src = fs.readFileSync(new URL('./fixtures/bad.html', import.meta.url), 'utf8');
  assert.deepEqual(lint(src, { only: ['size'] }).results.map((r) => r.id), ['size']);
  assert.equal(lint(src, { skip: ['contrast'] }).results.some((r) => r.id === 'contrast'), false);
  assert.equal(lint(src, { skip: ['portability'] }).results.some((r) => r.group === 'portability'), false);
  const warnOnly = lint(page('<style>.a{color:#999;background:#fff}</style>'));
  assert.equal(warnOnly.passed, true);
  assert.equal(lint(page('<style>.a{color:#999;background:#fff}</style>'), { strict: true }).passed, false);
});
