// Reads anchor IDs from an `anchormap scan --json` snapshot, walks the git log
// of the passed repo, and emits an `anchormap map` shell script. Each commit
// whose subject is prefixed by an observed anchor ID contributes its src/*.ts
// files as seeds for that anchor.
//
// Usage: node bootstrap-mappings.mjs <repo-path> <scan-json> <anchormap-bin>

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [, , repoPath, scanPath, anchormapBin] = process.argv;
if (!repoPath || !scanPath || !anchormapBin) {
  process.stderr.write('usage: node bootstrap-mappings.mjs <repo-path> <scan-json> <anchormap-bin>\n');
  process.exit(2);
}

const scan = JSON.parse(readFileSync(scanPath, 'utf8'));
const anchorIds = new Set(Object.keys(scan.observed_anchors));

const log = execSync(
  'git log --pretty=format:"COMMIT%x09%H%x09%s" --name-only',
  { cwd: repoPath, maxBuffer: 64 * 1024 * 1024 },
).toString();

const commits = [];
let cur = null;
for (const line of log.split('\n')) {
  if (line.startsWith('COMMIT\t')) {
    if (cur) commits.push(cur);
    const parts = line.split('\t');
    cur = { hash: parts[1], subject: parts[2] || '', files: [] };
  } else if (line.trim() && cur) {
    cur.files.push(line.trim());
  }
}
if (cur) commits.push(cur);

const taskFiles = new Map();
let matchedCommits = 0;
for (const c of commits) {
  const m = c.subject.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\b/);
  if (!m || !anchorIds.has(m[1])) continue;
  matchedCommits++;
  const set = taskFiles.get(m[1]) || new Set();
  for (const f of c.files) {
    if (f.startsWith('src/') && f.endsWith('.ts') && !f.endsWith('.d.ts')) set.add(f);
  }
  taskFiles.set(m[1], set);
}

const out = ['#!/bin/sh', 'set -eu', `B=${JSON.stringify(anchormapBin)}`];
let emitted = 0;
for (const t of [...taskFiles.keys()].sort()) {
  const files = [...taskFiles.get(t)].sort();
  if (!files.length) continue;
  out.push(`"$B" map --anchor ${t} ${files.map((f) => `--seed ${f}`).join(' ')} --replace`);
  emitted++;
}

process.stderr.write(
  [
    `commits scanned: ${commits.length}`,
    `commits matched to an observed anchor: ${matchedCommits}`,
    `anchors emitted with src/ seeds: ${emitted}`,
    `anchors observed but not emitted: ${anchorIds.size - emitted}`,
    '',
  ].join('\n'),
);

process.stdout.write(`${out.join('\n')}\n`);
