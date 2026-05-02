#!/bin/sh
# Re-runs AnchorMap dogfood scans on this repo.
#
# The strict scan uses the curated dogfood mapping and dogfood/specs. The
# exploratory scan reads docs/ with an empty temporary mapping so broad
# documentation anchors remain visible without changing the strict signal.
set -eu

DOGFOOD_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$DOGFOOD_DIR/.." && pwd)
ANCHORMAP="$REPO_DIR/bin/anchormap"

if [ ! -x "$ANCHORMAP" ]; then
  echo "anchormap binary not found at $ANCHORMAP - run 'npm run build' first" >&2
  exit 1
fi

SANDBOX=$(mktemp -d -t anchormap-dogfood.XXXXXX)
trap 'rm -rf "$SANDBOX"' EXIT

STRICT_DIR="$SANDBOX/strict"
EXPLORATORY_DIR="$SANDBOX/exploratory"
mkdir "$STRICT_DIR" "$EXPLORATORY_DIR"

cp -R "$REPO_DIR/src" "$STRICT_DIR/src"
mkdir "$STRICT_DIR/dogfood"
cp -R "$DOGFOOD_DIR/specs" "$STRICT_DIR/dogfood/specs"
cp "$DOGFOOD_DIR/anchormap.yaml" "$STRICT_DIR/anchormap.yaml"

cp -R "$REPO_DIR/src" "$EXPLORATORY_DIR/src"
cp -R "$REPO_DIR/docs" "$EXPLORATORY_DIR/docs"

(
  cd "$STRICT_DIR"
  "$ANCHORMAP" scan --json > scan_strict.json
)

(
  cd "$EXPLORATORY_DIR"
  "$ANCHORMAP" init --root src --spec-root docs > /dev/null
  "$ANCHORMAP" scan --json > scan_docs_exploratory.json
)

cp "$STRICT_DIR/scan_strict.json" "$DOGFOOD_DIR/scan_strict.json"
cp "$EXPLORATORY_DIR/scan_docs_exploratory.json" "$DOGFOOD_DIR/scan_docs_exploratory.json"

node -e '
const fs = require("node:fs");

function writePrettyJson(sourcePath) {
  const parsed = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  fs.writeFileSync(sourcePath.replace(/\.json$/, ".pretty.json"), `${JSON.stringify(parsed, null, 2)}\n`);
}

function summarize(path) {
  const j = JSON.parse(fs.readFileSync(path, "utf8"));
  const findingKinds = {};
  for (const f of j.findings) findingKinds[f.kind] = (findingKinds[f.kind] || 0) + 1;

  let covered = 0;
  let uncovered = 0;
  const coverage = [];
  for (const [path, info] of Object.entries(j.files)) {
    if (info.covering_anchor_ids.length) covered += 1;
    else uncovered += 1;
    coverage.push([path, info.covering_anchor_ids.length]);
  }
  coverage.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));

  return {
    analysisHealth: j.analysis_health,
    observedAnchors: Object.keys(j.observed_anchors).length,
    storedMappings: Object.keys(j.stored_mappings).length,
    covered,
    uncovered,
    findingKinds,
    topCovered: coverage.slice(0, 10),
  };
}

function linesFor(label, specRoot, summary) {
  const lines = [
    `${label} spec_root: ${specRoot}`,
    `${label} analysis_health:  ${summary.analysisHealth}`,
    `${label} observed_anchors: ${summary.observedAnchors}`,
    `${label} stored_mappings:  ${summary.storedMappings}`,
    `${label} files:            ${summary.covered} covered / ${summary.uncovered} uncovered`,
    `${label} finding kinds:    ${JSON.stringify(summary.findingKinds)}`,
  ];
  if (label === "strict") {
    lines.push(`${label} top covered files:`);
    for (const [file, count] of summary.topCovered) {
      lines.push(`  ${count} ${file}`);
    }
  }
  return lines;
}

writePrettyJson(process.argv[1]);
writePrettyJson(process.argv[2]);

const strict = summarize(process.argv[1]);
const exploratory = summarize(process.argv[2]);
process.stdout.write([
  "Dogfood strict scan is a curated traceability signal, not full repo coverage.",
  ...linesFor("strict", "dogfood/specs", strict),
  "",
  "Dogfood exploratory scan keeps broad docs/ anchors visible and is non-blocking.",
  ...linesFor("exploratory", "docs", exploratory),
  "",
].join("\n"));
' "$DOGFOOD_DIR/scan_strict.json" "$DOGFOOD_DIR/scan_docs_exploratory.json"
