# ADR-0019: CLI artifact surface and artifact mode

Status: Accepted
Date: 2026-05-14
Owner: AnchorMap maintainers

## Context

AnchorMap currently exposes `scan --json` as the only stable machine artifact.
The SaaS-ready 1 scope requires additional local CLI commands that can consume
existing artifacts without reading source code, Git state, CI environment, a
network, a cache, or a SaaS backend.

Relevant constraints:

- `scan --json` remains the source artifact for repository analysis.
- Artifact commands must not invent product facts beyond their inputs.
- Unknown, unsupported, unreadable, or schema-invalid artifact inputs must fail
  as usage errors with exit code `4`, not as synthetic results.
- No command may embed full source content, secrets, CI logs, or implicit Git
  state in an artifact.

## Decision

We will add an artifact-oriented CLI surface for SaaS-ready 1:

- `check` interprets a scan artifact against an explicit policy.
- `diff` compares two scan artifacts.
- `explain` reconstructs anchor or file views from one scan artifact.
- `report --format markdown` serializes scan, check, and diff artifacts.

Artifact-mode inputs are explicit file paths supplied by options. Live mode is
allowed only where the task contract explicitly routes through the existing
scan pipeline and then consumes the same in-memory scan result.

For SaaS-ready 1:

- `check` supports live mode and artifact mode.
- `diff` is artifact-only.
- `explain` is artifact-only.
- `report` is artifact-only.

## Alternatives considered

### Option A - Add SaaS upload first

Pros:

- Direct path to hosted product workflows.

Cons:

- Requires network, authentication, API shape, and SaaS storage decisions that
  are outside SaaS-ready 1.

### Option B - Git-aware diff commands

Pros:

- Familiar PR workflow syntax.

Cons:

- Makes Git an implicit source of truth and violates the existing determinism
  boundary.

### Option C - Artifact-only commands with explicit inputs

Pros:

- Preserves local determinism and lets a future SaaS consume the same artifacts.
- Keeps code-source access inside `scan`.

Cons:

- CI users must produce and pass artifact files explicitly.

## Consequences

Positive:

- The CLI can support CI and PR reporting without a SaaS dependency.
- Artifact behavior remains fixture-testable with exact stdout and exit codes.

Negative:

- More command-surface and artifact-schema fixtures are required.

Risks:

- Report wording can overclaim if not constrained to artifact serialization.

## Contract impact

Yes. `docs/contract.md` must define the new commands, artifact input rules,
machine-output discipline, and no-implicit-source guarantees.

## Eval impact

Yes. `docs/evals.md` must add B-check, B-diff, B-explain, and B-report
fixtures, plus artifact golden requirements.

## Design impact

`docs/design.md` must add artifact input, command, domain, and renderer
boundaries for the new commands.

## Rollback / supersession

This ADR can be superseded by a later artifact-surface ADR if a future release
adds bundle, JUnit, SARIF, upload, or scan schema v5. The superseding ADR must
preserve explicit artifact inputs or explicitly amend the product scope.

## Links

- `docs/brief.md` — §6.10
- `docs/contract.md` — §9, §12.6, §13
- `docs/design.md` — §4, §5, §9
- `docs/evals.md` — B-check, B-diff, B-explain, B-report
- `docs/tasks.md` — T19.0 through T19.6
