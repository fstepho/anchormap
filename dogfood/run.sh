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
REPORT_DIR="$DOGFOOD_DIR/reports/current"

if [ ! -x "$ANCHORMAP" ]; then
  echo "anchormap binary not found at $ANCHORMAP - run 'npm run build' first" >&2
  exit 1
fi

mkdir -p "$REPORT_DIR"

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

EXPLORATORY_STATUS=0
(
  cd "$EXPLORATORY_DIR"
  "$ANCHORMAP" init --root src --spec-root docs > /dev/null
  "$ANCHORMAP" scan --json > scan_docs_exploratory.json 2> scan_docs_exploratory.error.txt
) || EXPLORATORY_STATUS=$?

cp "$STRICT_DIR/scan_strict.json" "$REPORT_DIR/scan_strict.json"
if [ "$EXPLORATORY_STATUS" -eq 0 ]; then
  cp "$EXPLORATORY_DIR/scan_docs_exploratory.json" "$REPORT_DIR/scan_docs_exploratory.json"
  rm -f "$REPORT_DIR/scan_docs_exploratory.error.txt"
else
  cp "$EXPLORATORY_DIR/scan_docs_exploratory.error.txt" "$REPORT_DIR/scan_docs_exploratory.error.txt"
  rm -f "$REPORT_DIR/scan_docs_exploratory.json" "$REPORT_DIR/scan_docs_exploratory.pretty.json"
fi

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
    schemaVersion: j.schema_version,
    analysisHealth: j.analysis_health,
    traceabilitySummary: j.traceability_metrics.summary,
    observedAnchors: Object.keys(j.observed_anchors).length,
    storedMappings: Object.keys(j.stored_mappings).length,
    covered,
    uncovered,
    findingKinds,
    topCovered: coverage.slice(0, 10),
  };
}

function linesFor(label, specRoot, summary) {
  if (summary.status === "failed") {
    return [
      `${label} spec_root: ${specRoot}`,
      `${label} status:          failed`,
      `${label} exit_code:       ${summary.exitCode}`,
      `${label} error:           ${summary.error}`,
    ];
  }

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

function briefFor(label, specRoot, summary) {
  if (summary.status === "failed") {
    return [
      `${label} scan brief`,
      "",
      "Scan status",
      "- result: failed",
      `- exit_code: ${summary.exitCode}`,
      `- spec_root: ${specRoot}`,
      "",
      "Diagnostic",
      `- ${summary.error}`,
    ];
  }

  const trace = summary.traceabilitySummary;
  const lines = [
    `${label} scan brief`,
    "",
    "Scan status",
    `- schema_version: ${summary.schemaVersion}`,
    `- analysis_health: ${summary.analysisHealth}`,
    `- spec_root: ${specRoot}`,
    "",
    "Coverage",
    `- product files: ${trace.product_file_count}`,
    `- usable mappings: ${trace.usable_mapping_count}`,
    `- covered product files: ${trace.covered_product_file_count} / ${trace.product_file_count}`,
    `- multi-covered product files: ${trace.multi_cover_product_file_count}`,
    "",
    "Anchors",
    `- observed: ${trace.observed_anchor_count}`,
    `- active: ${trace.active_anchor_count}`,
    `- draft: ${trace.draft_anchor_count}`,
    "",
    "Findings",
  ];
  const findingEntries = Object.entries(summary.findingKinds).sort(([a], [b]) => a.localeCompare(b));
  if (findingEntries.length === 0) {
    lines.push("- none");
  } else {
    for (const [kind, count] of findingEntries) {
      lines.push(`- ${kind}: ${count}`);
    }
  }
  return lines;
}

writePrettyJson(process.argv[1]);

const strict = summarize(process.argv[1]);
const exploratoryStatus = Number(process.argv[5]);
let exploratory;
if (exploratoryStatus === 0) {
  writePrettyJson(process.argv[2]);
  exploratory = summarize(process.argv[2]);
} else {
  exploratory = {
    status: "failed",
    exitCode: exploratoryStatus,
    error: fs.readFileSync(process.argv[6], "utf8").trim(),
  };
}
fs.writeFileSync(
  process.argv[3],
  `${JSON.stringify({ strict: { status: "ok", ...strict }, exploratory }, null, 2)}\n`,
);
const brief = [
  "AnchorMap dogfood brief",
  "",
  "Dogfood strict scan is a curated traceability signal, not full repo coverage.",
  "",
  ...briefFor("strict", "dogfood/specs", strict),
  "",
  "Dogfood exploratory scan keeps broad docs/ anchors visible and is non-blocking.",
  "",
  ...briefFor("exploratory", "docs", exploratory),
  "",
  "Interpretation: this brief is a non-contractual dogfood view over scan --json. It does not imply dead code, ownership, or architecture quality.",
  "",
].join("\n");
fs.writeFileSync(process.argv[4], brief);
process.stdout.write([
  brief,
  "",
  ...linesFor("strict", "dogfood/specs", strict),
  "",
  ...linesFor("exploratory", "docs", exploratory),
  "",
].join("\n"));
' "$REPORT_DIR/scan_strict.json" "$REPORT_DIR/scan_docs_exploratory.json" "$REPORT_DIR/summary.json" "$REPORT_DIR/brief.txt" "$EXPLORATORY_STATUS" "$REPORT_DIR/scan_docs_exploratory.error.txt"
