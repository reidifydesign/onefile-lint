import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES } from '../src/index.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const cat = JSON.parse(read('catalogue/rules.json'));

test('catalogue has exactly one entry per rule, in the same group', () => {
  assert.deepEqual(cat.rules.map((r) => r.id).sort(), RULES.map((r) => r.id).sort());
  for (const rule of RULES) assert.equal(cat.rules.find((r) => r.id === rule.id).group, rule.group, rule.id);
});

test('every catalogue claim has a grade, a source URL and a date read', () => {
  const all = [...cat.rules.flatMap((r) => r.evidence), ...cat.not_checked.flatMap((n) => n.evidence)];
  assert.ok(all.length >= cat.rules.length);
  for (const e of all) {
    assert.ok(cat.grades[e.grade], `bad grade ${e.grade}`);
    assert.match(e.url, /^https:\/\//);
    assert.match(e.read, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(e.finding.length > 20);
  }
  for (const r of cat.rules) {
    for (const f of ['what', 'why', 'how', 'limits']) assert.ok(r[f] && r[f].length > 10, `${r.id}.${f}`);
    assert.ok(r.evidence.length >= 1, r.id);
  }
});

test('a D-graded entry never states a frequency', () => {
  for (const r of cat.rules) for (const e of r.evidence) if (e.grade === 'D') assert.doesNotMatch(e.finding, /\d+(\.\d+)?%/, r.id);
});

test('generated catalogue is up to date with rules.json and the corpus file', () => {
  const md = read('catalogue/CATALOGUE.md');
  for (const r of cat.rules) assert.ok(md.includes(`### ${r.id}`), r.id);
  const files = fs.readdirSync(path.join(root, 'data')).filter((f) => f.startsWith('corpus-'));
  assert.ok(files.length >= 1);
  assert.ok(md.includes(files.sort().pop()));
});

test('corpus file is complete and consistent', () => {
  const file = fs.readdirSync(path.join(root, 'data')).filter((f) => f.startsWith('corpus-')).sort().pop();
  const c = JSON.parse(read(`data/${file}`));
  assert.match(c.commit, /^[0-9a-f]{40}$/);
  assert.match(c.read, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(c.pages_linted + c.pages_errored, c.pages.length);
  assert.ok(c.pages_linted > 100);
  for (const r of RULES) {
    const pr = c.per_rule[r.id];
    assert.equal(pr.pages, c.pages_linted);
    const flagged = c.pages.filter((p) => p.rules && p.rules[r.id].status !== 'OK').length;
    assert.equal(pr.flagged, flagged, r.id);
  }
});

test('awesome list: ids are unique, every listed app passed, rows match the last run', () => {
  const apps = JSON.parse(read('awesome/apps.json'));
  const last = JSON.parse(read('awesome/last-run.json'));
  const ids = apps.entries.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(last.entries.map((e) => e.id).sort(), ids.slice().sort());
  const md = read('awesome/README.md');
  for (const e of last.entries) {
    const rowLinked = md.includes(`[${e.name.replace(/\|/g, '\\|')}](${e.url})`);
    assert.equal(rowLinked, e.self_contained === true, `${e.id}: listed only when self-contained`);
    if (e.self_contained) assert.equal(e.remote_refs, 0);
  }
  for (const e of apps.entries) if (e.repo) assert.ok(e.repo in apps.licenses, `licence recorded for ${e.repo}`);
  assert.doesNotMatch(md, /—/);
});

test('repo text has no em dashes', () => {
  for (const f of ['README.md', 'catalogue/CATALOGUE.md', 'catalogue/rules.json', 'CONTRIBUTING.md', 'src/report.mjs', 'bin/onefile-lint.mjs']) {
    assert.doesNotMatch(read(f), /—/, f);
  }
});
