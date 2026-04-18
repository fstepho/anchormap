# ADR-0003: Test runner and fixture harness

Status: Accepted
Date: 2026-04-18
Owner: AnchorMap maintainers

## Context

The first implementation milestone is the fixture harness. That harness must execute the CLI in temp sandboxes, compare exact goldens byte-for-byte, detect mutation policy violations, and remain deterministic across supported platforms.

The project is developed with AI agents working against repository-local docs, fixtures, and scripts. Repeated failures should therefore be addressed by improving repository-local feedback loops rather than by relying on broader prompts or manual context transfer.

Relevant constraints:

- `docs/operating-model.md` requires a walking skeleton that proves `fixture -> CLI -> golden -> diff -> correction`.
- `docs/operating-model.md` also treats early classification and agent-readable observability as part of the development method.
- `docs/operating-model.md` §17 requires spike conclusions that bound harness strategy to be recorded normatively before dependent tasks are unblocked.
- `docs/evals.md` relies on explicit goldens, binary pass/fail gates, and exact output or mutation oracles.
- `docs/tasks.md` milestone `M1` is entirely about harness capability before product logic.
- `docs/design.md` favors explicit boundaries and low hidden behavior in test infrastructure.
- `spikes/fs-mutation-path-report.md` (`S3`) establishes the filesystem-behavior constraints that the harness and later `repo_fs` work must preserve on supported platforms.

## Decision

We will:

- use `node:test` as the default test runner;
- implement a bespoke fixture harness in project code rather than delegate fixture semantics to a general-purpose snapshot framework;
- keep goldens explicit on disk and compare success outputs byte-for-byte;
- materialize each fixture into its own temp sandbox;
- capture pre-run and post-run filesystem state for mutation-policy assertions;
- represent harness snapshots in canonical path order, preserving entry kind for every discovered path, exact regular-file bytes, and exact raw symlink targets for comparison artifacts;
- preserve symlink targets verbatim during sandbox materialization rather than relying on default copy behavior that may rewrite relative targets;
- realize unreadable-file and enumeration-failure fixtures through harness-only post-copy setup or injection, not through committed unreadable fixture trees;
- treat native case-collision fixtures as cross-platform sensitive: they must run natively on Linux x86_64, while macOS arm64 may require a synthetic harness path or an explicitly case-sensitive test volume;
- fail fast on invalid manifests, impossible fixture assertions, or missing required artifacts before spawning the CLI under test;
- persist per-run artifacts that make failures inspectable after the run;
- expose readable failure reports, structured phase traces, and phase timings through the harness artifact set;
- treat timeout handling and harness faults as harness failures, not as product exit codes.

## Alternatives considered

### Option A — Vitest or Jest as the primary runner

Pros:

- richer test ergonomics and ecosystem plugins;
- convenient assertion and snapshot features.

Cons:

- more dependency surface before product logic exists;
- snapshot-centric workflows can weaken explicit golden discipline if used loosely;
- unnecessary abstraction for the walking skeleton.

### Option B — Pure shell-based fixture runner

Pros:

- very transparent process execution;
- low language-level abstraction.

Cons:

- weaker reuse for sandbox snapshots, diff reporting, and structured fixture metadata;
- harder to scale into cross-platform deterministic harness behavior.

## Consequences

Positive:

- explicit ownership of fixture manifest validation, sandboxing, mutation checks, and golden comparison;
- explicit ownership of harness observability, including traces, timings, and archived failure evidence;
- explicit ownership of cross-platform filesystem edge handling needed for symlinks, permission faults, mutation snapshots, and case-collision fixtures;
- low dependency surface for the first milestone;
- direct alignment with the contract-first and eval-driven workflow.
- the immediate `M1` harness path no longer depends on a structurally unresolved ADR.

Negative:

- more in-house harness code to maintain;
- less out-of-the-box tooling than a larger test framework.

Risks:

- if the harness abstractions are poorly factored, fixture infrastructure could become harder to evolve than necessary.
- if trace or artifact formats drift too freely, later harness automation may become harder to stabilize.
- if macOS arm64 relies on a synthetic case-collision path, the Linux-native fixture remains mandatory to verify the real filesystem condition in the supported matrix.

## Contract impact

No.

This ADR concerns verification infrastructure, not published CLI behavior.

## Eval impact

Yes.

The harness must enforce the existing oracle rules in `docs/evals.md` without weakening them, especially for exact goldens, empty-stdout failures, and mutation checks.

The harness strategy must also support:

- verbatim symlink preservation for fixtures that exercise unsupported symlink detection;
- harness-only setup for unreadable-file and enumeration-failure fixtures;
- cross-platform handling notes for `fx39_repo_case_collision_in_scope`, with native coverage on Linux x86_64 and an explicit macOS arm64 strategy.

`docs/evals.md` may later reference harness artifacts for diagnostics or release evidence, but those artifacts are not themselves user-facing contract output unless explicitly promoted.

No direct `docs/evals.md` change is introduced by this ADR alone.

## Design impact

`docs/design.md` should reference this ADR from the technology-stack section. The code architecture may add dedicated harness modules outside the product runtime without changing the runtime design itself.

The design should also treat the harness as a first-class development subsystem with:

- fail-fast preflight validation;
- per-run artifact capture;
- structured trace output;
- phase timings;
- readable failure reports.

## Rollback / supersession

This ADR can be superseded if a different runner or harness strategy proves materially safer while preserving explicit goldens, sandbox isolation, and deterministic mutation checks.

## Links

- `docs/design.md`
- `docs/evals.md`
- `docs/operating-model.md`
- `docs/tasks.md`
- `spikes/fs-mutation-path-report.md`
