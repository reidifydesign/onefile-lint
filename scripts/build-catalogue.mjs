// Build catalogue/CATALOGUE.md from catalogue/rules.json and the newest corpus run in data/.
// Usage: node scripts/build-catalogue.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cat = JSON.parse(fs.readFileSync(path.join(root, 'catalogue', 'rules.json'), 'utf8'));
const corpusFiles = fs.readdirSync(path.join(root, 'data')).filter((f) => f.startsWith('corpus-')).sort();
const corpus = corpusFiles.length ? JSON.parse(fs.readFileSync(path.join(root, 'data', corpusFiles[corpusFiles.length - 1]), 'utf8')) : null;

const rank = { A: 0, B: 1, C: 2, D: 3 };
const best = (r) => r.evidence.map((e) => e.grade).sort((a, b) => rank[a] - rank[b])[0];
const pct = (n, d) => `${Math.round((n / d) * 100)}%`;

const out = [];
out.push('# Rule catalogue', '');
out.push('What each onefile-lint check looks for, why, and the evidence behind it. Run `onefile-lint explain <rule>` to read any entry in the terminal.', '');
out.push('## How to read the evidence grades', '');
for (const [g, d] of Object.entries(cat.grades)) out.push(`- **${g}**: ${d}`);
out.push('', 'Grades describe the evidence, not how bad a failure is. A frequency is quoted only where a source states it. "D" means no public measurement was found, and the entry says so rather than guessing.', '');
out.push("## Sources", "");
for (const s of Object.values(cat.sources)) out.push(`- [${s.title}](${s.url}), read ${s.read}. ${s.scope}.`);
out.push('');
if (corpus) {
  out.push('## Seen in the first corpus run', '');
  out.push(`The linter was run on ${corpus.pages_linted} single-file pages from [${corpus.source.replace('https://github.com/', '')}](${corpus.source}) at commit \`${corpus.commit.slice(0, 7)}\`, read ${corpus.read}. The repo describes itself as "${corpus.description}" and is licensed ${corpus.license}. That description is the repo's own claim; it was not checked page by page. The column below is how many of the ${corpus.pages_linted} pages got a warning or failure for the rule, with default settings.`, '');
  out.push('| Rule | Group | Level | Best evidence | Pages flagged |', '| --- | --- | --- | :---: | ---: |');
  for (const r of cat.rules) {
    const c = corpus.per_rule[r.id];
    out.push(`| [${r.id}](#${r.id}) | ${r.group} | ${r.level} | ${best(r)} | ${c ? `${c.flagged} (${pct(c.flagged, c.pages)})` : 'n/a'} |`);
  }
  out.push('', `${corpus.passed_every_rule} of ${corpus.pages_linted} pages had no warning or failure on any rule. Per-page results are in \`data/${corpusFiles[corpusFiles.length - 1]}\`. Run \`npm run corpus\` to repeat it.`, '');
  out.push('This is a count of what a static check can see in a sample from one author, not a measure of how agents behave in general. The contrast and form-label counts in particular include pages where the check is right but the impact is small.', '');
}
out.push('## Rules', '');
for (const r of cat.rules) {
  out.push(`### ${r.id}`, '');
  out.push(`${r.title}. Group: ${r.group}. Reports as: ${r.level}.`, '');
  out.push(`- **Checks:** ${r.what}`, `- **Why:** ${r.why}`, `- **How:** ${r.how}`, `- **Limits:** ${r.limits}`);
  if (corpus && corpus.per_rule[r.id]) {
    const c = corpus.per_rule[r.id];
    out.push(`- **Corpus:** ${c.flagged} of ${c.pages} pages flagged (${pct(c.flagged, c.pages)}).`);
  }
  out.push('- **Evidence:**');
  for (const e of r.evidence) out.push(`  - [${e.grade}] ${e.finding} ([source](${e.url}), read ${e.read})`);
  out.push('');
}
out.push('## Known failures the linter does not check yet', '');
for (const n of cat.not_checked) {
  out.push(`### ${n.title}`, '');
  for (const e of n.evidence) out.push(`- [${e.grade}] ${e.finding} ([source](${e.url}), read ${e.read})`);
  out.push(`- **Why it is not checked:** ${n.why_not}`, '');
}
fs.writeFileSync(path.join(root, 'catalogue', 'CATALOGUE.md'), out.join('\n'));
console.log(`wrote catalogue/CATALOGUE.md (${cat.rules.length} rules${corpus ? ', corpus ' + corpus.read : ''})`);
