// Re-check every entry in awesome/apps.json and rewrite awesome/README.md and awesome/last-run.json.
//
// Usage: node scripts/refresh-list.mjs [--licenses] [--only id1,id2]
//   --licenses   also re-read each repo's licence from the GitHub API (3 s apart, waits 65 s on a 403).
//                Set GITHUB_TOKEN for a higher rate limit. Without the flag, stored licences are kept.
//
// An entry is listed when its file has no failure from remote-dependency or sibling-file, which is
// what "single file" means here. Everything else is written under "Checked and left out" with the
// reason the linter gave. Nothing on this list is endorsed; it is only checked.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { lint } from '../src/index.mjs';
import { scanHtml } from '../src/html.mjs';
import { fetchUrl } from '../src/inputs.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const appsPath = path.join(root, 'awesome', 'apps.json');
const lastPath = path.join(root, 'awesome', 'last-run.json');
const args = process.argv.slice(2);
const wantLicenses = args.includes('--licenses');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const today = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const data = JSON.parse(fs.readFileSync(appsPath, 'utf8'));
const prev = fs.existsSync(lastPath) ? JSON.parse(fs.readFileSync(lastPath, 'utf8')) : { entries: [] };
const prevById = new Map(prev.entries.map((e) => [e.id, e]));

async function readLicense(repo) {
  const headers = { 'user-agent': 'onefile-lint-list/0.1', accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    await sleep(3000);
    const res = await fetch(`https://api.github.com/repos/${repo}`, { headers });
    if (res.status === 403 || res.status === 429) {
      await sleep(65000);
      continue;
    }
    if (!res.ok) return null;
    const j = await res.json();
    return { license: j.license?.spdx_id || null, read: today };
  }
  return null;
}

const results = [];
for (const e of data.entries) {
  if (only && !only.includes(e.id)) {
    if (prevById.has(e.id)) results.push(prevById.get(e.id));
    continue;
  }
  const r = { id: e.id, name: e.name, url: e.url, file: e.file || e.url, repo: e.repo || null, source: e.source || null, checked: today };
  try {
    const src = await fetchUrl(r.file);
    const rep = lint(src);
    const doc = scanHtml(src);
    const title = (doc.elements.find((x) => x.name === 'title')?.text || '').replace(/\s+/g, ' ').trim();
    const desc = (doc.elements.find((x) => x.name === 'meta' && (x.attrs.name || '').toLowerCase() === 'description')?.attrs.content || '').replace(/\s+/g, ' ').trim();
    const get = (id) => rep.results.find((x) => x.id === id);
    const remote = get('remote-dependency');
    const sibling = get('sibling-file');
    const offline = get('offline');
    const bytes = Buffer.byteLength(src);
    r.reachable = true;
    r.bytes = bytes;
    r.gzip = zlib.gzipSync(Buffer.from(src), { level: 9 }).length;
    r.title = title || null;
    r.blurb = e.blurb || null;
    r.description = desc || null;
    r.remote_refs = remote.findings.length;
    r.sibling_refs = sibling.findings.length;
    r.self_contained = remote.status !== 'FAIL' && sibling.status !== 'FAIL';
    r.offline = r.self_contained ? (offline.status === 'OK' ? 'yes' : 'partly') : 'no';
    r.reason = r.self_contained
      ? null
      : [remote.status === 'FAIL' ? `remote-dependency: ${remote.note}` : null, sibling.status === 'FAIL' ? `sibling-file: ${sibling.note}` : null].filter(Boolean).join('; ');
    r.verdicts = Object.fromEntries(rep.results.map((x) => [x.id, x.status]));
    r.unreachable_runs = 0;
  } catch (err) {
    const old = prevById.get(e.id);
    r.reachable = false;
    r.error = String(err.message || err);
    r.unreachable_runs = (old?.unreachable_runs || 0) + 1;
    if (old) Object.assign(r, { bytes: old.bytes, gzip: old.gzip, title: old.title, blurb: old.blurb, description: old.description, remote_refs: old.remote_refs, sibling_refs: old.sibling_refs, self_contained: old.self_contained, offline: old.offline, reason: old.reason });
  }
  await sleep(1500);
  results.push(r);
}

// licences
const cache = new Map();
for (const r of results) {
  if (!r.repo) continue;
  let lic = data.licenses?.[r.repo] || null;
  if (wantLicenses && !cache.has(r.repo)) cache.set(r.repo, await readLicense(r.repo));
  if (cache.get(r.repo)) {
    lic = cache.get(r.repo);
    data.licenses = data.licenses || {};
    data.licenses[r.repo] = { ...(data.licenses[r.repo] || {}), ...lic };
  }
  r.license = lic ? lic.license : undefined;
  r.license_note = lic?.note || null;
  r.license_read = lic?.read || null;
}
if (wantLicenses) fs.writeFileSync(appsPath, JSON.stringify(data, null, 2) + '\n');

fs.writeFileSync(lastPath, JSON.stringify({ tool: `onefile-lint ${pkg.version}`, checked: today, entries: results }, null, 1) + '\n');

// markdown
const kb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(0.1, b / 1024).toFixed(0)} KB`);
const esc = (s) => String(s ?? '').replace(/[–—]/g, ' - ').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const licText = (r) => (r.license === undefined ? '[[CONFIRM: no repo given]]' : r.license === null ? 'none stated' : r.license === 'NOASSERTION' ? 'not detected by GitHub' : r.license);
const listed = results.filter((r) => r.self_contained && (r.reachable || r.unreachable_runs < 2)).sort((a, b) => a.name.localeCompare(b.name));
const left = results.filter((r) => !listed.includes(r)).sort((a, b) => a.name.localeCompare(b.name));

const md = [];
md.push('# Single-file web apps, checked by script', '');
md.push(`Checked ${today} with onefile-lint ${pkg.version} (\`npm run list:refresh\`). A page is listed when its file has no remote dependency and no sibling file, so it still works if you save it and open it offline. "Offline" is **yes** when the page also makes no network calls of its own, and **partly** when it does.`, '');
md.push('This list is checked, not endorsed. Licences are read from the GitHub repo and can lag; see the repo before reusing anything. Sizes are the file as served.', '');
md.push('| App | What the page says | Size | Offline | Licence | Checked |', '| --- | --- | ---: | --- | --- | --- |');
for (const r of listed) {
  md.push(`| [${esc(r.name)}](${r.url}) | ${esc(r.blurb || r.description || r.title || '[[CONFIRM: page has no title]]')} | ${kb(r.bytes)} | ${r.offline} | ${licText(r)} | ${r.checked} |`);
}
md.push('');
md.push('## Checked and left out', '');
md.push('These were checked and do not meet the rule today. The reason is what the linter reported; the app itself may be fine, because the page tested is often its website, not the app file.', '');
for (const r of left) md.push(`- ${esc(r.name)} (${r.url}): ${r.reachable ? esc(r.reason) : `not reachable on ${r.checked} (${esc(r.error)})`}`);
md.push('');
md.push('## Add one', '');
md.push('Add an entry to `apps.json` (name, `url`, optional `file` if the single file differs from the page, `repo` for the licence, and a `source`) and run `npm run list:refresh -- --only <id>`. If the check passes, the entry appears in the table. Only pages that pass are listed, so there is nothing to argue about.', '');
md.push('The monthly refresh workflow is disabled until the repo launches. It opens a pull request with the new numbers rather than pushing.', '');
fs.writeFileSync(path.join(root, 'awesome', 'README.md'), md.join('\n'));
console.log(`listed ${listed.length}, left out ${left.length}; wrote awesome/README.md and awesome/last-run.json`);
