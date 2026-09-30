import test from 'node:test';
import assert from 'node:assert/strict';
import { scanHtml } from '../src/html.mjs';
import { parseCss, parseStyleAttr } from '../src/css.mjs';
import { parseColor, contrast, toHex } from '../src/color.mjs';

test('html: attributes, quotes and > inside a value', () => {
  const d = scanHtml('<a href="x?a>b" title=\'t\' data-x=1 disabled>hi</a>');
  const a = d.elements[0];
  assert.equal(a.attrs.href, 'x?a>b');
  assert.equal(a.attrs.title, 't');
  assert.equal(a.attrs['data-x'], '1');
  assert.equal(a.attrs.disabled, '');
  assert.equal(a.text, 'hi');
});

test('html: script and style bodies are raw text with the right line', () => {
  const d = scanHtml('<p>a</p>\n<script>\nvar s = "<div>";\n</script>\n<style>\nbody{color:red}\n</style>');
  assert.equal(d.scripts.length, 1);
  assert.match(d.scripts[0].raw, /var s = "<div>";/);
  assert.equal(d.scripts[0].rawLine, 2);
  assert.equal(d.styles[0].rawLine, 5);
  assert.equal(d.elements.some((e) => e.name === 'div'), false);
});

test('html: comments are skipped and void elements do not nest', () => {
  const d = scanHtml('<!-- <img src="x.png"> --><p><img src="a.png"><br>text</p>');
  assert.equal(d.elements.filter((e) => e.name === 'img').length, 1);
  assert.equal(d.elements.find((e) => e.name === 'p').text, 'text');
});

test('html: doctype and line numbers', () => {
  const d = scanHtml('<!DOCTYPE html>\n<html>\n<body>\n<img src="a">');
  assert.equal(d.doctype, true);
  assert.equal(d.elements.find((e) => e.name === 'img').line, 4);
});

test('css: media, nesting, keyframes and data URIs with semicolons', () => {
  const css = '@media (prefers-color-scheme: dark) {\n body { color: #eee; background: url(data:image/png;base64,AAAA=) }\n}\n.a { color: red; &:hover { color: blue } }\n@keyframes k { from { opacity: 0 } to { opacity: 1 } }\n@font-face { font-family: x; src: url(f.woff2) }';
  const p = parseCss(css);
  const body = p.rules.find((r) => r.selector === 'body');
  assert.deepEqual(body.at, ['@media (prefers-color-scheme: dark)']);
  assert.equal(body.decls.length, 2);
  assert.ok(p.rules.find((r) => r.selector === '.a:hover'));
  assert.ok(p.rules.find((r) => r.selector === 'from').keyframes);
  assert.ok(p.rules.find((r) => r.selector === '@font-face'));
  assert.ok(p.atRules.some((a) => a.name === 'keyframes'));
});

test('css: comments keep line numbers, style attribute parses', () => {
  const p = parseCss('/* one\n two */\n.a { color: red }');
  assert.equal(p.rules[0].line, 3);
  const r = parseStyleAttr('color: #fff; background: url("a;b.png")', 7);
  assert.equal(r.decls.length, 2);
  assert.equal(r.decls[0].line, 7);
});

test('color: formats', () => {
  assert.equal(toHex(parseColor('#fff')), '#ffffff');
  assert.equal(toHex(parseColor('rgb(10, 20, 30)')), '#0a141e');
  assert.equal(toHex(parseColor('rgb(10 20 30 / 50%)')), '#0a141e');
  assert.equal(parseColor('rgb(10 20 30 / 50%)').a, 0.5);
  assert.equal(toHex(parseColor('hsl(0 100% 50%)')), '#ff0000');
  assert.equal(toHex(parseColor('hsl(120, 100%, 25%)')), '#008000');
  assert.equal(parseColor('RebeccaPurple'), null); // unknown names are skipped, never guessed
  assert.equal(toHex(parseColor('navy')), '#000080');
  assert.equal(parseColor('var(--x)'), null);
  assert.equal(parseColor('color-mix(in srgb, red, blue)'), null);
  assert.equal(parseColor('linear-gradient(red, blue)'), null);
});

test('color: oklch and oklab match known values', () => {
  assert.equal(toHex(parseColor('oklch(1 0 0)')), '#ffffff');
  assert.equal(toHex(parseColor('oklch(0 0 0)')), '#000000');
  // oklch(0.628 0.2577 29.23) is sRGB red to within rounding
  const red = parseColor('oklch(62.8% 0.2577 29.23)');
  assert.ok(red.r > 250 && red.g < 6 && red.b < 6, JSON.stringify(red));
  assert.equal(toHex(parseColor('oklab(0.5 0 0)')), '#636363');
});

test('color: WCAG contrast', () => {
  assert.equal(contrast(parseColor('#000'), parseColor('#fff')).toFixed(2), '21.00');
  assert.equal(contrast(parseColor('#777'), parseColor('#fff')).toFixed(2), '4.48');
  assert.equal(contrast(parseColor('#fff'), parseColor('#fff')).toFixed(2), '1.00');
});
