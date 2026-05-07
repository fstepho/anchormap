# AnchorMap dogfood

This directory contains non-normative dogfood evidence for the AnchorMap repo.
It does not define runtime behavior, product scope, verification gates, or
technical decisions. Those remain owned by `docs/contract.md`,
`docs/design.md`, `docs/evals.md`, `docs/tasks.md`, and accepted ADRs.

## Strict scan

`reports/current/scan_strict.json` is the curated dogfood reference scan.

- `dogfood/specs/` contains a small trace spec with durable anchors and links to
  existing authority documents.
- `anchormap.yaml` contains the human-curated mappings for those anchors.
- The strict scan is a focused traceability signal, not a claim of full
  repository coverage.
- `reports/current/scan_strict.pretty.json` is generated from the same data for
  review only.
- `reports/current/analysis.md` records the human interpretation of what the
  reference scans teach about this repository.
- `reports/current/summary.json` records a compact derived summary of the
  current strict and exploratory scans.
- `reports/current/brief.txt` records a non-contractual scan brief for quick
  human reading.

## Exploratory scan

`reports/current/scan_docs_exploratory.json`, when present, scans broad `docs/`
anchors with an empty temporary mapping.

This output is intentionally non-blocking. It keeps the current documentation
noise visible, especially task, milestone, spike, and ADR headings that are
observable anchors but are not curated dogfood mappings.

`reports/current/scan_docs_exploratory.pretty.json` is generated from the same
data for review only. If broad `docs/` indexing fails before JSON output, the
runner records `reports/current/scan_docs_exploratory.error.txt` instead and
continues with the strict dogfood evidence.

## Refreshing

Run:

```sh
sh dogfood/run.sh
```

The script refreshes both JSON files from a temporary sandbox, updates the
derived summaries, and prints the dogfood brief.

`bootstrap-mappings.mjs` is a legacy exploratory helper. It is not part of the
durable dogfood refresh path.
