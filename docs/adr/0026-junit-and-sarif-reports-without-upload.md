# ADR-0026: JUnit and SARIF reports without upload

Status: Accepted
Date: 2026-05-14
Owner: AnchorMap maintainers

## Context

SaaS-ready 1 added Markdown reports and explicitly excluded JUnit, SARIF,
upload, source locations, and schema v5. SaaS-ready 2 needs CI-native and code
scanning report formats while preserving local artifact-only execution and the
privacy boundary.

Relevant constraints:

- `report` must serialize existing artifacts, not analyze the repository.
- JUnit and SARIF must not include source snippets.
- SARIF upload, GitHub App behavior, dashboard behavior, and network access are
  outside CLI SaaS-ready 2.
- Format-specific output must preserve existing stdout/stderr/exit discipline.

## Decision

We will extend `anchormap report` with:

```bash
anchormap report --check <check.json> --format junit
anchormap report --scan <scan.json> --format sarif
anchormap report --scan <scan.json> --check <check.json> --format sarif
anchormap report --scan <scan.json> --diff <diff.json> --format sarif
anchormap report --scan <scan.json> --check <check.json> --diff <diff.json> --format sarif
```

JUnit serializes `PolicyResult` violations as failed testcases. A passing
policy result emits a stable testsuite with zero failures. JUnit does not
require a scan artifact.

SARIF serializes scan findings, optional policy violations, and optional diff
lost-coverage signals as SARIF results. When a schema v5 scan supplies source
locations, SARIF locations include `artifactLocation.uri` and a region. When a
schema v4 scan lacks source locations, SARIF uses file-level
`artifactLocation.uri` only. SARIF never embeds source snippets, source
contents, CI logs, environment values, or upload instructions.

Markdown report behavior remains unchanged by this ADR.

## Alternatives considered

### Option A - Add SARIF upload

Pros:

- More complete GitHub code scanning workflow.

Cons:

- Requires network, auth, API, and product decisions outside CLI SaaS-ready 2.

### Option B - Wait for schema v5 before any SARIF

Pros:

- All SARIF results can include precise regions.

Cons:

- Blocks useful file-level code scanning output for schema v4 artifacts.

### Option C - Local JUnit and SARIF renderers over artifacts

Pros:

- Fits CI and PR workflows without SaaS or upload.
- Keeps report as deterministic artifact serialization.

Cons:

- Requires XML and SARIF canonical rendering rules and goldens.

## Consequences

Positive:

- CI systems can ingest policy failures through JUnit.
- Code scanning tools can ingest AnchorMap findings through local SARIF files.

Negative:

- Report renderer surface and golden coverage expand.

Risks:

- SARIF wording can overclaim severity or remediation. Results must stay
  structural and derived only from supported artifacts.

## Contract impact

Yes. `docs/contract.md` must define JUnit and SARIF report forms, input
requirements, canonical rendering, no-snippet/no-upload guarantees, and stream
discipline.

## Eval impact

Yes. `docs/evals.md` must add B-report-JUnit and B-report-SARIF fixtures and
goldens, including v4 file-level SARIF and v5 region SARIF.

## Design impact

`docs/design.md` must add report renderers for JUnit XML and SARIF JSON that
consume parsed artifacts and do not perform repository I/O.

## Rollback / supersession

A future hosted integration ADR may add upload, but it must keep local report
rendering behavior stable unless explicitly superseded.

## Links

- `docs/contract.md` — `report --format junit`, `report --format sarif`
- `docs/design.md` — report renderer boundaries
- `docs/evals.md` — B-report-JUnit, B-report-SARIF
- `docs/tasks.md` — T20.0, T20.3, T20.4
