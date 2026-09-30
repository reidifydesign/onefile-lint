#!/usr/bin/env node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { lint, RULES, RULE_IDS, DEFAULTS } from '../src/index.mjs';
import { readInputs } from '../src/inputs.mjs';
import { formatText, formatJson, formatMarkdown } from '../src/report.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));
const GROUPS = ['portability', 'display', 'robustness'];

const HELP = `onefile-lint ${pkg.version}
Checks that a single-file HTML page is still one portable file: remote dependencies, size, print and offline use.
The display and robustness groups are optional extras: --skip display,robustness turns them off.

Usage
  onefile-lint <file|folder|url|->...    lint pages (a folder is searched for .html files)
  onefile-lint rules                     list the rules
  onefile-lint explain <rule>            what a rule checks, why, and the evidence behind it

Options
  --format text|json|markdown   output format (default text)
  --strict                      exit 1 on warnings as well as failures
  --only a,b                    run only these rules or groups (${GROUPS.join(', ')})
  --skip a,b                    skip these rules or groups, for example --skip display,robustness
  --allow-host a.com,b.com      do not count remote references to these hosts
  --warn-kb N                   size warning limit in KB (default ${DEFAULTS.warnKb})
  --fail-kb N                   size failure limit in KB (default ${DEFAULTS.failKb})
  --all                         show every finding (text output shows 3 per rule)
  --no-color                    plain text
  -v, --version  -h, --help

Exit codes: 0 pass, 1 a page failed, 2 bad input or usage.`;

function die(msg) {
  console.error(`onefile-lint: ${msg}`);
  process.exit(2);
}

function parseArgs(argv) {
  const o = { inputs: [], format: 'text', skip: [], only: null, strict: false, allowHosts: [], all: false, color: process.stdout.isTTY && !process.env.NO_COLOR };
  const list = (v) => String(v).split(',').map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.startsWith('--') && a.includes('=') ? a.indexOf('=') : -1;
    const flag = eq > 0 ? a.slice(0, eq) : a;
    const val = () => {
      if (eq > 0) return a.slice(eq + 1);
      if (i + 1 >= argv.length) die(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '-v' || a === '--version') o.version = true;
    else if (flag === '--format') o.format = val();
    else if (a === '--strict') o.strict = true;
    else if (flag === '--only') o.only = list(val());
    else if (flag === '--skip') o.skip = list(val());
    else if (flag === '--allow-host') o.allowHosts = list(val());
    else if (flag === '--warn-kb') o.warnKb = Number(val());
    else if (flag === '--fail-kb') o.failKb = Number(val());
    else if (a === '--all') o.all = true;
    else if (a === '--no-color') o.color = false;
    else if (a.startsWith('-') && a !== '-') die(`unknown option ${a} (try --help)`);
    else o.inputs.push(a);
  }
  return o;
}

function explain(id) {
  const cat = JSON.parse(fs.readFileSync(path.join(here, '..', 'catalogue', 'rules.json'), 'utf8'));
  const r = cat.rules.find((x) => x.id === id);
  if (!r) die(`no rule called "${id}". Rules: ${RULE_IDS.join(', ')}`);
  const out = [`${r.id}  (${r.group}, ${r.level})`, r.title, '', `Checks:  ${r.what}`, `Why:     ${r.why}`, `How:     ${r.how}`, `Limits:  ${r.limits}`, '', 'Evidence:'];
  for (const e of r.evidence) out.push(`  [${e.grade}] ${e.finding}`, `      ${e.url} (read ${e.read})`);
  out.push('', `Grades: ${Object.entries(cat.grades).map(([k, v]) => `${k} = ${v}`).join('; ')}`);
  console.log(out.join('\n'));
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.version) {
    console.log(pkg.version);
    return;
  }
  if (o.help || !o.inputs.length) {
    console.log(HELP);
    process.exit(o.help ? 0 : 2);
  }
  if (o.inputs[0] === 'rules') {
    const w = Math.max(...RULES.map((r) => r.id.length));
    for (const r of RULES) console.log(`${r.id.padEnd(w)}  ${r.group.padEnd(11)}  ${r.title}`);
    return;
  }
  if (o.inputs[0] === 'explain') {
    if (!o.inputs[1]) die('explain needs a rule name, for example: onefile-lint explain remote-dependency');
    explain(o.inputs[1]);
    return;
  }
  if (!['text', 'json', 'markdown'].includes(o.format)) die('--format must be text, json or markdown');
  for (const id of [...(o.only || []), ...o.skip]) {
    if (!RULE_IDS.includes(id) && !GROUPS.includes(id)) die(`unknown rule or group "${id}". Rules: ${RULE_IDS.join(', ')}`);
  }
  const options = { skip: o.skip, only: o.only, strict: o.strict, allowHosts: o.allowHosts };
  for (const k of ['warnKb', 'failKb']) if (o[k] !== undefined) {
    if (!Number.isFinite(o[k]) || o[k] <= 0) die(`--${k === 'warnKb' ? 'warn' : 'fail'}-kb needs a positive number`);
    options[k] = o[k];
  }
  let inputs;
  try {
    inputs = await readInputs(o.inputs);
  } catch (e) {
    die(e.message);
  }
  if (!inputs.length) die('no .html files found');
  const entries = inputs.map(({ name, src }) => ({ name, report: lint(src, options) }));
  if (o.format === 'json') console.log(formatJson(entries));
  else if (o.format === 'markdown') console.log(formatMarkdown(entries));
  else {
    console.log(entries.map((e) => formatText(e.name, e.report, { color: o.color, all: o.all })).join('\n\n'));
    if (entries.length > 1) {
      const failed = entries.filter((e) => !e.report.passed).length;
      console.log(`\n${entries.length} files: ${entries.length - failed} pass, ${failed} fail`);
    }
  }
  process.exitCode = entries.every((e) => e.report.passed) ? 0 : 1;
}

main().catch((e) => die(e.message));
