# ADR-0015: Deterministic TypeScript export scaffold

Status: Accepted
Date: 2026-05-03
Owner: AnchorMap maintainers

## Context

AnchorMap adoption is blocked when an otherwise supported TypeScript repository
has no formal spec anchors yet. The project still requires the trust boundary
where mappings are written or validated by humans.

Relevant constraints:

- `docs/brief.md` identifies startup cost as the main adoption risk.
- `docs/contract.md` forbids implicit mapping trust and hidden state.
- `docs/design.md` keeps parsing deterministic and project-owned.
- `ADR-0002` keeps CLI behavior under project-owned parsing.
- `ADR-0006` fixes the TypeScript parser profile.

## Decision

We will add `anchormap scaffold --output <path>` as a deterministic Markdown
draft generator from top-level TypeScript exports.

The command requires an existing valid `anchormap.yaml`, uses its
`product_root`, `spec_roots`, and `ignore_roots`, creates only the requested
Markdown output file, and never writes `anchormap.yaml`.

Generated anchors are derived from module path plus export name. The output is a
draft structure for human completion, not a semantic claim and not a mapping.

## Alternatives considered

### Option A — Markdown scaffold from exports

Pros:

- lowers startup cost while preserving the Human mapping boundary;
- deterministic and local;
- reuses the TypeScript parser profile already accepted.

Cons:

- generated IDs are mechanical and may need human renaming.

### Option B — JSDoc anchors in product files

Pros:

- low friction for teams that want specs near code.

Cons:

- makes product files a spec source and weakens the current separation between
  code observation and spec observation.

### Option C — Mapping suggestions

Pros:

- would reduce setup time further.

Cons:

- risks promoting observations into trusted mappings and conflicts with the
  product trust boundary.

## Consequences

Positive:

- existing TypeScript repos can reach a first editable spec draft quickly;
- no network, Git, cache, clock, or AI dependency is introduced;
- generated files are reproducible byte-for-byte.

Negative:

- the CLI surface and fixture harness grow by one command;
- output collisions must be explicit failures.

Risks:

- users may over-read generated anchors as product intent unless docs and
  comments keep the draft status clear.

## Contract impact

Yes.

`docs/contract.md` must define the `scaffold` command, output file mutation
rules, generated Markdown format, exit-code classification, and non-mutation of
`anchormap.yaml`.

## Eval impact

Yes.

`docs/evals.md` must add B-scaffold fixtures for success, create-only behavior,
invalid output, config errors, product parse errors, empty generation, generated
collisions, and collisions with existing spec anchors.

## Design impact

`docs/design.md` must reference this ADR from the ADR list and describe the
`scaffold` pipeline and command classification.

## Rollback / supersession

This decision can be superseded by a later spec-source strategy such as JSDoc
anchors only if the contract explicitly preserves the Observed/Human/Derived
trust boundary.

## Links

- `docs/brief.md`
- `docs/contract.md`
- `docs/design.md`
- `docs/evals.md`
- `docs/tasks.md`
