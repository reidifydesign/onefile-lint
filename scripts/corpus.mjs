// Lint every top-level .html file in a public GitHub repo and write a summary to data/.
// Usage: node scripts/corpus.mjs [owner/repo] [ref]      (default: simonw/tools main)
//
// It reads the repo tree from the GitHub API once (set GITHUB_TOKEN to raise the rate limit), then
// downloads each file from raw.githubusercontent.com pinned to the commit it found. Nothing is
// written to the repo except the summary; the pages themselves are not stored.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lint, RULE_IDS } from '../src/index.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [repo = 'simonw/tools', ref = 'main'] = process.argv.slice(2);
const headers = { 'user-agent': 'onefile-lint-corpus/0.1', accept: 'application/vnd.github+json' };
if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const today = new Date().toISOString().slice(0, 10);

async function main() {
  const meta = await (await fetch(`https://api.github.com/repos/${repo}`, { headers })).json();
  await new Promise((r) => setTimeout(r, 3000));
  const commit = await (await fetch(`https://api.github.com/repos/${repo}/commits/${ref}`, { headers })).json();
  if (!commit.sha) throw new Error(`cannot read ${repo}@${ref}: ${JSON.stringify(commit).slice(0, 200)}`);
  await new Promise((r) => setTimeout(r, 3000));
  const tree = await (await fetch(`https://api.github.com/repos/${repo}/git/trees/${commit.sha}?recursive=1`, { headers })).json();
  if (tree.truncated) console.error('warning: the tree was truncated; the corpus is partial');
  const files = tree.tree.filter((e) => e.type === 'blob' && /^[^/]+\.html$/i.test(e.path));
  console.error(`${repo}@${commit.sha.slice(0, 7)}: ${files.length} top-level .html files`);

  const pages = [];
  let next = 0;
  async function worker() {
    while (next < files.length) {
      const f = files[next++];
      try {
        const res = await fetch(`https://raw.githubusercontent.com/${repo}/${commit.sha}/${encodeURI(f.path)}`, { headers: { 'user-agent': headers['user-agent'] } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const src = Buffer.from(await res.arrayBuffer()).toString('utf8');
        const t0 = Date.now();
        const rep = lint(src);
        pages.push({
          file: f.path,
          bytes: Buffer.byteLength(src),
          ms: Date.now() - t0,
          rules: Object.fromEntries(rep.results.map((r) => [r.id, { status: r.status, n: r.findings.filter((x) => x.level !== 'info').length }])),
        });
      } catch (e) {
        pages.push({ file: f.path, error: String(e.message || e) });
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  pages.sort((a, b) => a.file.localeCompare(b.file));

  const ok = pages.filter((p) => !p.error);
  const perRule = {};
  for (const id of RULE_IDS) {
    const c = { flagged: 0, failed: 0, pages: ok.length };
    for (const p of ok) {
      const r = p.rules[id];
      if (r && r.status !== 'OK') c.flagged++;
      if (r && r.status === 'FAIL') c.failed++;
    }
    perRule[id] = c;
  }
  const out = {
    source: `https://github.com/${repo}`,
    description: meta.description || null,
    license: meta.license?.spdx_id || null,
    commit: commit.sha,
    read: today,
    note: 'Pages are linted with onefile-lint defaults. "flagged" counts pages with at least one warning or failure for the rule.',
    pages_linted: ok.length,
    pages_errored: pages.length - ok.length,
    passed_every_rule: ok.filter((p) => Object.values(p.rules).every((r) => r.status === 'OK')).length,
    per_rule: perRule,
    pages,
  };
  const name = `corpus-${repo.replace('/', '-')}-${today}.json`;
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', name), JSON.stringify(out, null, 1) + '\n');
  console.error(`wrote data/${name}`);
  for (const [id, c] of Object.entries(perRule)) console.error(`${id.padEnd(18)} flagged ${String(c.flagged).padStart(3)} / ${c.pages}  (fail ${c.failed})`);
  console.error(`passed every rule: ${out.passed_every_rule} / ${ok.length}; slowest ${Math.max(...ok.map((p) => p.ms))} ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
