# ADR-0023: Markdown report from artifacts

Status: Accepted
Date: 2026-05-14
Owner: AnchorMap maintainers

## Context

SaaS-ready 1 needs a PR-friendly report before a hosted SaaS exists. The
included scope is Markdown only; JUnit, SARIF, bundle, upload, source
locations, and scan schema v5 are explicitly out of scope.

Relevant constraints:

- Report must serialize existing artifacts and not analyze the repository.
- Report validates each supplied artifact schema before rendering.
- Suggested actions, if present, must be mechanical and derived from
  contractual findings or policy violations.
- The report must not include full source content, secrets, CI logs, or
  implicit Git state.

## Decision

We will add `anchormap report --format markdown` over explicit artifact inputs:

- `--scan <scan.json>`
- optional `--check <check.json>`
- optional `--diff <diff.json>`

Markdown output is stable, UTF-8, and derived only from the parsed artifacts.
JUnit, SARIF, HTML, bundle, upload, and CI metadata are excluded from
SaaS-ready 1.

`report` does not prove that supplied artifacts come from the same run. Without
bundle metadata, artifact hashes, or source-run identifiers, it serializes the
valid artifacts it was explicitly given and must not assert common provenance
between them.

## Alternatives considered

### Option A - Generate reports by rescanning the repo

Pros:

- Fewer input files for users.

Cons:

- Makes report a new analysis surface and prevents artifact-only SaaS
  consumption.

### Option B - Add SARIF and JUnit immediately

Pros:

- More CI integrations.

Cons:

- Broadens output format scope before scan schema v5 source locations and
  fixture coverage are ready.

### Option C - Markdown-only artifact serialization

Pros:

- Delivers PR-comment value with a small deterministic renderer.

Cons:

- CI systems that require XML/SARIF wait for later milestones.

## Consequences

Positive:

- Users can publish scan/check/diff outcomes in PR comments without a SaaS.

Negative:

- Markdown becomes a stable artifact and needs golden coverage.

Risks:

- Human wording can overclaim; report text must remain bounded to structural
  traceability.

## Contract impact

Yes. `docs/contract.md` must define report inputs, Markdown stability, and
non-invention rules.

## Eval impact

Yes. B-report fixtures and Markdown goldens must cover scan-only, scan+check,
scan+check+diff, invalid artifact, and mechanical suggested actions.

## Design impact

`docs/design.md` must add a Markdown report renderer that consumes parsed
artifacts and performs no domain analysis beyond formatting and mechanical
summaries.

## Rollback / supersession

Future ADRs may add JUnit, SARIF, HTML, or bundle. They must not change the
Markdown semantics without an explicit supersession.

## Links

- `docs/contract.md` — `report`
- `docs/evals.md` — B-report, Markdown goldens
- `docs/tasks.md` — T19.5
