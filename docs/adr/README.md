# Architectural Decision Records

`docs/adr/` records the technical decisions that shape AnchorMap CLI.

Rule of use:

- `docs/design.md` describes the current target architecture.
- `docs/adr/` explains why a stack, dependency, or architectural strategy was chosen.
- accepted ADRs are binding until they are superseded explicitly.

An ADR is required when a decision:

- selects or rejects a core dependency;
- affects observable behavior, determinism, or reproducibility;
- affects parsing, rendering, mutation, exit behavior, packaging, or the fixture harness;
- changes release-gate assumptions or cross-platform constraints;
- is expensive to reverse once implementation starts.

An ADR is usually not required for:

- a local refactor with no architectural consequence;
- a helper function or local naming convention;
- a small test-only utility with no reuse as shared infrastructure;
- a dependency-free code move within an existing accepted design choice.

## Statuses

- `Proposed`: under discussion, not yet binding.
- `Accepted`: selected and binding.
- `Superseded`: replaced by a later ADR.
- `Rejected`: considered and not adopted.

## Naming

- one file per ADR;
- filename format: `NNNN-short-kebab-case-title.md`;
- document title format: `ADR-NNNN: <Decision title>`;
- IDs are never reused.

## Register

| ADR | Title | Status |
| --- | --- | --- |
| `ADR-0001` | Runtime and package manager | Accepted |
| `ADR-0002` | CLI interface strategy | Accepted |
| `ADR-0003` | Test runner and fixture harness | Accepted |
| `ADR-0004` | Markdown parser profile | Accepted |
| `ADR-0005` | YAML parser and config input profile | Accepted |
| `ADR-0006` | TypeScript parser and graph subset | Accepted |
| `ADR-0007` | Canonical JSON and YAML rendering | Accepted |
| `ADR-0008` | Atomic config write path | Accepted |
| `ADR-0009` | Packaging and distribution | Accepted |
| `ADR-0010` | Source formatting and linting tool | Accepted |
| `ADR-0011` | Release CLI Node launch profile | Accepted |
| `ADR-0012` | TypeScript ESM `.js` specifier source resolution | Accepted |
| `ADR-0013` | AnchorMap documentation anchor formats | Accepted |

## Template

```md
# ADR-XXXX: <Decision title>

Status: Proposed | Accepted | Superseded | Rejected
Date: YYYY-MM-DD
Owner: <name or role>

## Context

What problem forces a decision?

Relevant constraints:

- product constraints
- contract constraints
- determinism constraints
- performance constraints
- cross-platform constraints
- maintenance constraints

## Decision

We will <decision>.

## Alternatives considered

### Option A — <name>

Pros:

- ...

Cons:

- ...

### Option B — <name>

Pros:

- ...

Cons:

- ...

## Consequences

Positive:

- ...

Negative:

- ...

Risks:

- ...

## Contract impact

Does this decision affect `docs/contract.md`?

- Yes / No

If yes, describe how.

## Eval impact

Does this decision require or modify fixtures, tests, or release gates?

- Yes / No

If yes, list required eval updates.

## Design impact

Which parts of `docs/design.md` must reference this ADR?

- ...

## Rollback / supersession

How can this decision be reversed or superseded?

## Links

- `docs/brief.md`
- `docs/contract.md`
- `docs/design.md`
- `docs/evals.md`
- related tasks
```
