# ADR-0021: Scan artifact diff

Status: Accepted
Date: 2026-05-14
Owner: AnchorMap maintainers

## Context

PR and CI workflows need to compare AnchorMap states. Comparing Git refs would
make Git an implicit source of truth and would require the CLI to decide how to
checkout, build, or isolate repositories.

Relevant constraints:

- Diff must compare two scan artifacts, never refs.
- Unknown schemas fail explicitly.
- SaaS-ready 1 accepts only scan artifacts with `schema_version = 4`.
- Comparability is a result field, not an implicit failure, when both artifacts
  are valid schema v4 scans but the analyzed scope changed.

## Decision

We will add `anchormap diff --base <scan.json> --head <scan.json> [--json]`.
The command compares two valid scan artifacts and emits a `TraceabilityDiff`
artifact. SaaS-ready 1 accepts only scan artifacts with `schema_version = 4`;
any other scan schema exits `4`.

For two valid schema v4 scans, comparability is computed from the rendered scan
`config` object. If the two `config` objects are byte-equivalent under canonical
JSON rendering, comparability is `same_scope`; otherwise it is `scope_changed`.

## Alternatives considered

### Option A - `anchormap diff main HEAD`

Pros:

- Familiar to users.

Cons:

- Requires Git as an input source and creates non-deterministic checkout
  responsibilities.

### Option B - Diff raw JSON text

Pros:

- Simple implementation.

Cons:

- Does not expose domain concepts such as coverage lost or mapping-state
  changes.

### Option C - Domain diff over two scan artifacts

Pros:

- Keeps inputs explicit and produces PR-usable change categories.

Cons:

- Requires a closed schema and comparability rules.

## Consequences

Positive:

- PR impact can be computed without source access.

Negative:

- Changes in scan schema compatibility must be handled deliberately.

Risks:

- Comparability rules can overstate equivalence if too narrow; fixtures must
  include scope-changed cases.

## Contract impact

Yes. `docs/contract.md` must define the command, input validation, diff fields,
and comparability rules.

## Eval impact

Yes. B-diff fixtures and JSON goldens must cover same-scope changes,
scope-changed comparisons, invalid artifacts, and unknown schemas.

## Design impact

`docs/design.md` must add a diff domain module over parsed scan artifacts.

## Rollback / supersession

Future ADRs may add support for additional scan schemas and explicit
cross-schema comparability. Git-ref comparison requires a separate ADR and
product-scope amendment.

## Links

- `docs/contract.md` — `diff`, `TraceabilityDiff`
- `docs/evals.md` — B-diff
- `docs/tasks.md` — T19.3
