# ADR-0002: CLI interface strategy

Status: Accepted
Date: 2026-04-18
Owner: AnchorMap maintainers

## Context

AnchorMap CLI has a strict contract around supported commands, option combinations, exit-code priority, and `stdout` / `stderr` behavior. The implementation needs a command-boundary strategy that keeps those behaviors project-owned rather than inherited accidentally from a framework.

Relevant constraints:

- `docs/contract.md` fixes the published command surface and exit-code policy.
- `docs/evals.md` family B-cli verifies usage failures, command/option rejection, and priority rules exactly.
- `docs/design.md` keeps `commands` as a thin boundary over validated inputs and bounded side effects.
- `docs/tasks.md` milestones `M1` and `M2` depend on a deterministic CLI boundary.

## Decision

We will:

- use a project-owned CLI parser and dispatcher for the published command surface;
- keep the parsing logic explicit and narrow to the supported commands `init`, `map`, and `scan`;
- allow Node standard-library helpers only as low-level utilities, without delegating published behavior to a CLI framework;
- keep usage-error classification, help emission policy, and exit-code mapping under project control.

## Alternatives considered

### Option A — Third-party CLI framework

Pros:

- faster scaffolding for subcommands and flags;
- built-in help generation.

Cons:

- framework defaults can leak into exit codes, help formatting, or option semantics;
- harder to guarantee that contract behavior is project-owned rather than framework-owned;
- framework replacement later would be expensive.

### Option B — Node helper plus thin wrapper

Pros:

- lower implementation cost than a fully project-owned parser;
- no external dependency required.

Cons:

- may still encourage framework-like assumptions about parsing shape;
- boundary behavior can become split across helper defaults and project code.

## Consequences

Positive:

- the command surface remains directly auditable against `docs/contract.md`;
- B-cli fixtures can target project behavior without framework indirection;
- low risk of accidental behavior drift from transitive upgrades.
- the immediate `M1`/`M2` path no longer depends on a structurally unresolved ADR.

Negative:

- more project-owned parsing code;
- help/usage text, if any, must be maintained manually.

Risks:

- the parser implementation may accumulate avoidable boilerplate if the boundary is not kept deliberately small.

## Contract impact

No.

This ADR selects the implementation strategy for the CLI boundary; it does not alter the published command contract.

## Eval impact

Yes.

The chosen strategy must satisfy B-cli fixtures and preserve exact ownership of exit-code and output-discipline behavior.

No `docs/evals.md` change is introduced by this ADR alone.

## Design impact

`docs/design.md` should reference this ADR from the technology-stack section and remain compatible with a thin `commands` boundary that owns argument validation and exit-code classification.

## Rollback / supersession

This ADR can be superseded if a framework or lower-level helper proves it can preserve the full contract without hidden behavior and with lower maintenance risk.

## Links

- `docs/contract.md`
- `docs/design.md`
- `docs/evals.md`
- `docs/tasks.md`
