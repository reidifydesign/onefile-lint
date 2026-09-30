import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(root, 'bin', 'onefile-lint.mjs');
const fx = (n) => path.join(root, 'tests', 'fixtures', n);
const run = (args, input) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', input });

test('passes a clean page with exit 0', () => {
  const r = run([fx('good.html'), '--no-color']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /PASS {2}0 fail, 0 warn, 17 ok/);
});

test('fails a bad page with exit 1 and prints line numbers', () => {
  const r = run([fx('bad.html'), '--no-color']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FAIL {2}remote-dependency/);
  assert.match(r.stdout, /line 6 +script loads from the network: https:\/\/unpkg\.com/);
  assert.match(r.stdout, /more \(use --all\)/);
});

test('--all shows every finding', () => {
  const r = run([fx('bad.html'), '--no-color', '--all', '--only', 'remote-dependency']);
  assert.doesNotMatch(r.stdout, /use --all/);
  assert.match(r.stdout, /fonts\.googleapis\.com/);
});

test('--strict turns warnings into a failing exit code', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ofl-'));
  const f = path.join(dir, 'warn.html');
  fs.writeFileSync(f, fs.readFileSync(fx('good.html'), 'utf8').replace('<img alt=""', '<img'));
  assert.equal(run([f, '--no-color']).status, 0);
  assert.equal(run([f, '--no-color', '--strict']).status, 1);
});

test('--format json is valid and complete', () => {
  const r = run([fx('bad.html'), '--format', 'json']);
  const j = JSON.parse(r.stdout);
  assert.equal(j.length, 1);
  assert.equal(j[0].passed, false);
  assert.equal(j[0].rules.length, 17);
  assert.ok(j[0].rules.find((x) => x.id === 'size').metrics.bytes > 0);
});

test('--format markdown is a table', () => {
  const r = run([fx('bad.html'), '--format=markdown']);
  assert.match(r.stdout, /\| Rule \| Status \| Note \|/);
  assert.match(r.stdout, /<details>/);
});

test('--skip and --only accept rule and group names', () => {
  const r = run([fx('bad.html'), '--no-color', '--skip', 'portability,contrast']);
  assert.doesNotMatch(r.stdout, /remote-dependency/);
  assert.doesNotMatch(r.stdout, / contrast /);
  assert.match(r.stdout, /reduced-motion/);
  const o = run([fx('bad.html'), '--no-color', '--only=size']);
  assert.match(o.stdout, /size/);
  assert.doesNotMatch(o.stdout, /landmarks/);
});

test('--allow-host removes a host from the count', () => {
  const r = run([fx('bad.html'), '--no-color', '--only', 'remote-dependency', '--allow-host', 'cdn.example.com,unpkg.com,images.example.com,fonts.googleapis.com']);
  assert.match(r.stdout, /OK {4}remote-dependency/);
});

test('reads stdin and folders', () => {
  const r = run(['-', '--no-color', '--only', 'sibling-file'], '<img src="a.png">');
  assert.match(r.stdout, /\(stdin\)/);
  assert.match(r.stdout, /relative reference/);
  const d = run([path.join(root, 'tests', 'fixtures'), '--no-color', '--only', 'size']);
  assert.match(d.stdout, /2 files: /);
});

test('usage errors exit 2', () => {
  assert.equal(run([]).status, 2);
  assert.equal(run(['--nope', fx('good.html')]).status, 2);
  assert.equal(run([fx('missing.html')]).status, 2);
  assert.equal(run([fx('good.html'), '--skip', 'nonsense']).status, 2);
  assert.equal(run([fx('good.html'), '--warn-kb', 'abc']).status, 2);
  assert.equal(run([fx('good.html'), '--format', 'xml']).status, 2);
});

test('--help, --version, rules and explain', () => {
  assert.match(run(['--help']).stdout, /Usage/);
  assert.match(run(['--version']).stdout, /^\d+\.\d+\.\d+/);
  assert.match(run(['rules']).stdout, /remote-dependency {2}portability/);
  const e = run(['explain', 'contrast']);
  assert.equal(e.status, 0);
  assert.match(e.stdout, /Evidence:/);
  assert.match(e.stdout, /\[A\]/);
  assert.equal(run(['explain', 'nope']).status, 2);
});
