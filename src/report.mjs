// Output formats: text for people, json for tools, markdown for pull requests.

const COLORS = { OK: '32', WARN: '33', FAIL: '31' };

export function paint(s, code, on) {
  return on ? `\x1b[${code}m${s}\x1b[0m` : s;
}

function fmtBytes(b) {
  return b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(1)} KB`;
}

export function formatText(name, report, { color = false, all = false, limit = 3 } = {}) {
  const lines = [];
  lines.push(`${paint(name, '1', color)}  ${fmtBytes(report.bytes)}`);
  lines.push('');
  const w = Math.max(...report.results.map((r) => r.id.length));
  for (const r of report.results) {
    lines.push(`${paint(r.status.padEnd(4), COLORS[r.status], color)}  ${r.id.padEnd(w)}  ${r.note}`);
    const pool = all ? r.findings : r.findings.filter((f) => f.level !== 'info');
    const shown = all ? pool : pool.slice(0, limit);
    for (const f of shown) {
      const where = f.line ? `line ${f.line}`.padEnd(9) : ' '.repeat(9);
      lines.push(`        ${where}${f.level === 'info' ? '(note) ' : ''}${f.message}`);
    }
    if (pool.length > shown.length || (!all && pool.length < r.findings.length)) lines.push(`        ... ${r.findings.length - shown.length} more (use --all)`);
  }
  const s = report.summary;
  lines.push('');
  lines.push(`${paint(report.passed ? 'PASS' : 'FAIL', report.passed ? '32' : '31', color)}  ${s.fail} fail, ${s.warn} warn, ${s.ok} ok`);
  return lines.join('\n');
}

export function formatJson(entries) {
  return JSON.stringify(
    entries.map(({ name, report }) => ({
      file: name,
      bytes: report.bytes,
      passed: report.passed,
      summary: report.summary,
      rules: report.results.map((r) => ({ id: r.id, group: r.group, status: r.status, note: r.note, findings: r.findings.map(({ level, line, message }) => ({ level, line, message })), metrics: r.metrics })),
    })),
    null,
    2,
  );
}

export function formatMarkdown(entries) {
  const out = [];
  for (const { name, report } of entries) {
    out.push(`### ${name} (${fmtBytes(report.bytes)}): ${report.summary.verdict}`, '');
    out.push('| Rule | Status | Note |', '| --- | --- | --- |');
    for (const r of report.results) out.push(`| ${r.id} | ${r.status} | ${r.note.replace(/\|/g, '\|')} |`);
    const fs = report.results.flatMap((r) => r.findings.filter((f) => f.level !== 'info'));
    if (fs.length) {
      out.push('', '<details><summary>Findings</summary>', '');
      for (const f of fs) out.push(`- \`${f.rule}\`${f.line ? ` line ${f.line}` : ''}: ${f.message}`);
      out.push('', '</details>');
    }
    out.push('');
  }
  return out.join('\n');
}
