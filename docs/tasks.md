# tasks.md

## Status

- Spec freeze candidate: treated as frozen input set for kickoff.
- `operating-model.md` is the process authority for this execution plan.
- This document implements the task planning phase defined by the operating model.
- This document must satisfy Gate D — Tasks ready.
- `contract.md` remains normative for observable CLI behavior.
- `evals.md` remains normative for verification gates.
- No new product scope is introduced here.
- Pre-M1 ADR register lives in `docs/adr/README.md`.
- Pre-M1 stack baseline recorded in `docs/adr/0001-runtime-and-package-manager.md`.
- Kickoff readiness evidence lives in `docs/kickoff-readiness.md`.
- Readiness snapshot for kickoff, verified in `docs/kickoff-readiness.md`:
  - Gate A — Brief prêt: pass.
  - Gate B — Contrat prêt: pass.
  - Gate C — Evals prêtes: pass.
  - Gate D — Tâches prêtes: maintained by this document.
  - Gate E — Implémentation prête à démarrer: pass; the live execution cursor is maintained in `## Execution State`.
- A repository-bootstrap task `T0.0` materializes the accepted Node/npm/TypeScript baseline before code-bearing M1 work; it does not change the first product task identified by kickoff readiness.
- The kickoff snapshot above is historical. Use `## Execution State` as the current operator-maintained execution cursor.

## Execution State

- This section is the live execution cursor for the local task loop.
- Update it on any explicit task-state transition in the local task loop, including task start (`implementing`), `needs_rework`, `blocked`, and task-level done (§19.1).
- Current active task: `None recorded`
- Next executable product task after blocker clearance: `T5.5 — Integrate spec index into `scan` and `map` preconditions`
- Last completed task: `T5.4 — Implement duplicate anchor detection and stable spec index ordering`
- Completed tasks recorded here:
  - `T0.0 — Bootstrap modern Node/npm/TypeScript CLI workspace and Git repo baseline for M1 harness`
  - `T0.0a — Install pinned Biome baseline for local formatting and linting`
  - `T1.1 — Define fixture manifest schema and fixture directory contract`
  - `S3 — Filesystem mutation detection and path behavior report`
  - `T1.2 — Implement sandbox materialization from fixture input`
  - `T1.3 — Execute CLI under test and capture process contract outputs`
  - `T1.4 — Implement stdout, stderr, and golden comparison oracles`
  - `T1.5 — Implement filesystem mutation oracles`
  - `T1.6 — Implement fixture selection, grouping, and result reporting`
  - `T1.7 — Integrate harness into project scripts and CI-ready commands`
  - `T1.8 — Add walking skeleton fixtures for harness proof`
  - `T1.9 — Add documentary consistency checks for agent legibility`
  - `T1.10 — Persist per-run harness artifacts and summaries`
  - `T1.11 — Add structured trace and timing artifacts for fixture runs`
  - `T2.1 — Implement process entrypoint and exact command surface`
  - `T2.2 — Implement option parser for scan`
  - `T2.3 — Implement option parser for init`
  - `T2.4 — Implement option parser for map`
  - `T2.5 — Implement AppError to exit-code and stream discipline`
  - `T2.6 — Enforce CLI validation before unnecessary repo/config access`
  - `T3.1 — Implement AnchorId validation`
  - `T3.2 — Implement RepoPath, UserPathArg, and import candidate normalization`
  - `T3.3 — Implement canonical sorted collections and finding model`
  - `T3.4 — Implement ScanResult view model and analysis_health pure function`
  - `S4 — Canonical serializer profile report`
  - `T0.3 — Record canonical serializer ADR from S4`
  - `T3.5 — Implement canonical JSON renderer`
  - `T3.6 — Implement strict UTF-8 decoding with initial BOM handling`
  - `S1 — Parser profile and duplicate-key compatibility report`
  - `T0.1 — Record parser profile ADRs from S1`
  - `T4.1 — Implement YAML parsing profile for anchormap.yaml`
  - `T4.2 — Implement config schema validation`
  - `T4.3 — Implement config path invariants and root existence validation`
  - `T4.4 — Implement canonical YAML renderer for config`
  - `S2 — Atomic write and cleanup behavior report`
  - `T0.2 — Record atomic write ADR from S2`
  - `T4.5 — Implement atomic config write path`
  - `T4.6 — Implement anchormap init`
  - `T4.7 — Wire config errors into scan and map stubs`
  - `T5.1 — Implement spec file discovery and read failure classification`
  - `T5.2 — Implement Markdown ATX anchor extraction`
  - `T5.3 — Implement YAML spec anchor extraction`
  - `T5.4 — Implement duplicate anchor detection and stable spec index ordering`
- Blocked tasks:
  - `None recorded`
- Open deviations:
  - `None recorded`

## Execution principles

- Implement fixture-first: build the fixture runner before implementing the business engine.
- Implement contract-first: every observable CLI behavior must trace to `contract.md`.
- Keep the runtime deterministic; agent assistance is limited to development workflow and never becomes product behavior.
- Do not implement behavior without an eval, fixture, golden, or explicit gate reference.
- One task must implement one verifiable behavior or one bounded harness capability.
- Keep diffs small and attributable to a single task.
- Do not modify `contract.md` implicitly.
- Do not weaken fixtures or goldens to make code pass.
- Any failing fixture that exposes a confirmed bug becomes a permanent regression case.
- Preserve stdout/stderr/exit-code discipline at the command boundary.
- Preserve the explicit mutation policy: `scan` never writes; failed `init` and `map` leave `anchormap.yaml` byte-identical or absent as initially observed.
- Treat `anchormap.yaml` as the only persisted AnchorMap state.
- Use byte-for-byte comparison for successful `scan --json` and successful YAML writes.
- Use stable diagnostics only where the evals require them; otherwise assert code, stdout, stderr policy, and mutation behavior.
- Run the smallest relevant check as early as possible for the task in progress.
- Stop on the first blocking failure and classify it before broadening the patch.
- Apply the documentary hierarchy: `contract.md` for runtime behavior, `evals.md` for verification, `brief.md` for scope, `design.md` for compatible implementation, `operating-model.md` for production method.
- Treat `AGENTS.md` as an entry-point map only; durable project knowledge must live in `docs/` and `docs/adr/`.
- When an agent or harness failure repeats, encode the missing rule in docs, fixtures, goldens, or tooling instead of relying on a broader prompt.
- Classify any deviation before changing code, tests, fixtures, or docs.
- Do not introduce additional commands, runtimes, languages, workflows, caches, network calls, Git dependencies, or hidden state.

## Milestones overview

| Milestone | Goal | Primary outputs | Main eval coverage | Can start when | Done when |
|---|---|---|---|---|---|
| M1 — Fixture harness | Prove `fixture → CLI → stdout/stderr/exit code → golden → mutation check → diff` before product logic | Fixture schema, runner, sandbox, golden comparison, mutation oracle, selection scripts, stub fixtures | `evals.md` §§4.2, 6, 7; early B-fixture smoke | Documents are available | Harness can run a CLI stub, validate success and failure fixtures, compare goldens byte-for-byte, and detect unexpected mutation |
| M2 — CLI boundary and command discipline | Implement exact command surface and error/output discipline without deep product logic | Entrypoint, parser, option validation, exit-code mapping, stream policy | B-cli `fx68`–`fx76`; priority fixtures `fx72`–`fx75` | M1 done | Unknown commands/options/combinations return `4`; `scan --json` failure has empty stdout; invalid arguments do not access repo/config |
| M3 — Core domain model and canonical rendering | Implement pure types, canonical ordering, path normalization, findings, analysis health, JSON rendering | `AnchorId`, `RepoPath`, findings, sorted collections, `ScanResult`, canonical JSON | Level A; goldens JSON §§6.1; B-scan schema fixtures `fx09`, `fx10` | M1 done; M2 boundary available for integration | Pure unit tests pass and renderer emits contract-shaped one-line JSON with final newline and canonical key order |
| M4 — Config and init | Implement strict config load/validation, canonical YAML, atomic write, and `init` | `config_io`, YAML profile handling, canonical writer, atomic write path, `init` command | B-config `fx43`–`fx53`; B-init `fx54`–`fx58a`; write failure `fx76`; YAML goldens | M1–M3 done | Config errors return `2`; successful `init` writes exact YAML; failed writes leave no partial files |
| M5 — Spec index | Discover and parse supported spec files and observed anchors | `spec_index`, Markdown/YAML parsing, duplicate anchor detection | B-specs `fx11`–`fx22f`; B-decodage spec fixtures `fx00b`, `fx00c`, `fx00f`, `fx00g`, `fx00i`, `fx00j` | M3–M4 done | Spec index is stable, duplicate anchors fail with `3`, and spec fixtures pass |
| M6 — Product file discovery and TypeScript graph | Discover product files and build supported local TS graph with diagnostics | `ts_graph`, product discovery, TypeScript parser, static edge resolution, graph findings | B-graph `fx23`–`fx38e`; B-repo `fx39`–`fx42c`; B-decodage product fixtures | M3–M5 done | Product graph is stable, diagnostics match contract, parse/read failures return `3` |
| M7 — Scan engine | Produce complete contractual `scan --json` output from config, specs, and graph | `scan_engine`, mapping states, reachability, coverage, findings, `analysis_health`, scan command integration | B-scan `fx01`–`fx10`; JSON goldens; B-cli scan fixtures | M3–M6 done | All scan success goldens pass byte-for-byte; scan failures produce no JSON and no mutation |
| M8 — Map command | Implement explicit human mapping creation/replacement with strict validation and atomic rewrite | `map` orchestration, seed validation, replace guard, canonical config update | B-map `fx59`–`fx67d`; B-decodage map fixtures `fx00m`–`fx00o`; YAML goldens | M4–M7 done | `map` creates/replaces only allowed mappings; all failure paths preserve initial config and temp-file absence |
| M9 — Cross-platform, determinism, performance and release gates | Stabilize, measure, and validate without adding product capability | Metamorphic suite, reruns, platform matrix, benchmarks, dependency audit, release reports | C1–C12; Gates A–G; performance `small`/`medium`; reproducibility audit | M1–M8 done | Release gates pass on Linux x86_64 and macOS arm64; performance and reproducibility artifacts are archived |

## Milestone dependency graph

This is a milestone-level dependency graph only. It is not the full execution DAG.

Task-level dependencies, spike blockers, and explicit `Blocks:` sections below remain authoritative for execution order.

```text
M1 Fixture harness
  -> M2 CLI boundary and command discipline
  -> M3 Core domain model and canonical rendering
     -> M4 Config and init
        -> M5 Spec index
           -> M6 Product file discovery and TypeScript graph
              -> M7 Scan engine
                 -> M8 Map command
                    -> M9 Cross-platform, determinism, performance and release gates
```

## M1 — Fixture harness

### T1.1 — Define fixture manifest schema and fixture directory contract

Purpose:
- Define the executable fixture format used by all boundary fixtures.
- Make every fixture self-describing, stable, selectable, and reviewable.

Contract refs:
- `contract.md` — §3.1 Guarantees of v1.0
- `contract.md` — §9 Commands
- `contract.md` — §12.5 Stable outputs
- `contract.md` — §13.1 Machine contract for `scan --json`

Design refs:
- `design.md` — §10 Testability
- `design.md` — §15 Indicative repository structure

Eval refs:
- `evals.md` — §4.2 Level B — Contract boundary fixtures
- `evals.md` — §6 Goldens and exact oracles
- `evals.md` — §7 Regression policy

Operating-model refs:
- `operating-model.md` — §13 Walking skeleton
- `operating-model.md` — §15 Gestion des fixtures et goldens
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T0.0.

Implementation scope:
- Define `manifest.yaml` or equivalent with at least:
  - stable `id`
  - `family`
  - `purpose`
  - `command`
  - `cwd`
  - expected `exit_code`
  - `stdout` oracle: `empty`, `exact`, or `golden`
  - `stderr` oracle: `ignored`, `empty`, `contains`, or `pattern`, only where compatible with `evals.md`
  - filesystem oracle: `no_mutation` or explicit expected files
  - optional fixture tags/groups
  - optional fault-injection marker for test-only code paths
- Define fixture layout for input repo files, expected stdout goldens, expected YAML files, and manifest metadata.
- Reject unsupported manifest fields by default.
- Document how fixture IDs map to `evals.md`.

Out of scope:
- Implementing product behavior.
- Generating real goldens for all product fixtures.
- Adding CLI commands or changing runtime behavior.

Done when:
- A manifest with a missing `id` fails validation.
- A manifest with an unknown top-level key fails validation.
- A manifest with unsupported stdout/stderr/mutation oracle fails validation.
- A minimal success fixture manifest validates.
- A minimal failure fixture manifest validates.
- Fixture IDs are stable strings and can be referenced from runner output.

Suggested verification:
- Run manifest-schema unit tests.
- Run one valid manifest and one intentionally invalid manifest through the harness validator.
- Confirm validation errors include fixture ID when available.

### T1.2 — Implement sandbox materialization from fixture input

Purpose:
- Run every fixture in an isolated temp directory while preserving deterministic repository contents.

Contract refs:
- `contract.md` — §4.1 Determinism
- `contract.md` — §9 Commands, common mutation rule
- `contract.md` — §12.1 Repository root and config
- `contract.md` — §12.3 Discovery scope, readability and guardrails

Design refs:
- `design.md` — §10.2 Boundary tests
- `design.md` — §12 Cross-platform considerations

Eval refs:
- `evals.md` — §4.2 Level B fixture definition
- `evals.md` — §8.12 C12 — No persistent cache and no writes by `scan`
- `evals.md` — §9 Cross-platform matrix

Operating-model refs:
- `operating-model.md` — §12 Stratégie d'implémentation
- `operating-model.md` — §13 Walking skeleton
- `operating-model.md` — §15 Gestion des fixtures et goldens

Dependencies:
- T1.1.
- S3.

Implementation scope:
- Copy fixture repository trees into a fresh tempdir per run.
- Set fixture `cwd` relative to the tempdir.
- Preserve file bytes exactly.
- Support binary/non-UTF-8 fixture payloads where needed by decoding fixtures.
- Capture a pre-run filesystem snapshot with file paths, file types, and bytes.
- Avoid using Git metadata as a fixture oracle.

Out of scope:
- Product file parsing.
- Cross-platform release execution.
- Network or environment isolation beyond what the fixture manifest explicitly controls.

Done when:
- A fixture input file containing arbitrary bytes is copied byte-for-byte.
- Fixture `cwd` resolves inside the sandbox.
- A fixture attempting to set `cwd` outside the sandbox is rejected by the harness.
- Pre-run snapshot records all regular files under the sandboxed repo.
- Tempdirs are unique per fixture run.

Suggested verification:
- Run harness unit tests over fixtures with text and binary files.
- Compare source fixture bytes with sandbox bytes.
- Run two fixtures in parallel or sequentially and confirm sandbox separation.

### T1.3 — Execute CLI under test and capture process contract outputs

Purpose:
- Provide a deterministic process runner that captures exactly what boundary fixtures assert.

Contract refs:
- `contract.md` — §9 Commands
- `contract.md` — §13.1 Machine contract for `scan --json`
- `contract.md` — §13.8 Exit codes
- `contract.md` — §13.9 Exit-code priority

Design refs:
- `design.md` — §5.6 `commands`
- `design.md` — §9 Error policy and exit codes
- `design.md` — §10.2 Boundary tests

Eval refs:
- `evals.md` — §4.2 Level B
- `evals.md` — §5.8 B-cli
- `evals.md` — §11 Gate C — Exit codes, preconditions and priority

Operating-model refs:
- `operating-model.md` — §13 Walking skeleton
- `operating-model.md` — §15 Gestion des fixtures et goldens

Dependencies:
- T1.1.
- T1.2.

Implementation scope:
- Run the configured CLI command as a child process.
- Capture raw `stdout` bytes, raw `stderr` bytes, and numeric exit code.
- Support a CLI stub path or command for early harness testing.
- Enforce a bounded timeout as harness infrastructure, not product behavior.
- Report command, cwd, exit code, stdout length, and stderr length in fixture results.

Out of scope:
- Implementing CLI parser behavior.
- Interpreting product JSON.
- Normalizing stdout/stderr.

Done when:
- A fixture can assert exit code `0`.
- A fixture can assert a non-zero exit code.
- Captured stdout and stderr remain raw bytes until oracle comparison.
- The harness can run a stub CLI that prints deterministic stdout.
- A timed-out process is reported as a harness failure, not as a product exit code.

Suggested verification:
- Run stub success and failure fixtures.
- Verify stdout/stderr bytes with intentional newline and no-newline cases.
- Confirm timeout reporting is readable.

### T1.4 — Implement stdout, stderr, and golden comparison oracles

Purpose:
- Compare observable output exactly where the evals require exactness and flexibly only where allowed.

Contract refs:
- `contract.md` — §3.3 Human terminal outputs out of contract
- `contract.md` — §12.5 Stable outputs
- `contract.md` — §13.1 Machine contract for `scan --json`
- `contract.md` — §13.7 Exact canonical JSON serialization

Design refs:
- `design.md` — §5.7 `render`
- `design.md` — §10.2 Boundary tests

Eval refs:
- `evals.md` — §2 Principles: exact oracles and fail closed
- `evals.md` — §4.2 Level B oracle rules
- `evals.md` — §6.1 Mandatory JSON goldens
- `evals.md` — §6.2 Mandatory YAML goldens

Operating-model refs:
- `operating-model.md` — §13 Walking skeleton
- `operating-model.md` — §15 Gestion des fixtures et goldens

Dependencies:
- T1.3.

Implementation scope:
- Compare `stdout` as:
  - empty bytes
  - exact inline bytes
  - exact golden file bytes
- Compare `stderr` as:
  - ignored
  - empty bytes
  - contains text
  - pattern match
- Enforce `scan --json` success fixtures to require exact stdout golden and empty stderr.
- Enforce `scan --json` failure fixtures to require empty stdout.
- Produce readable byte-level diffs for golden mismatches.
- Show missing final newline and extra final newline distinctly.

Out of scope:
- Automatic golden regeneration.
- JSON semantic comparison as a substitute for byte-for-byte comparison.
- Parsing human output from `init`, `map`, or `scan` without `--json`.

Done when:
- A golden mismatch prints a readable diff.
- A missing final newline is reported.
- `stderr: empty` rejects any stderr byte.
- `stderr: ignored` does not fail on human diagnostic text.
- `scan --json` failure fixture fails if stdout contains `{}` or any non-empty byte sequence.

Suggested verification:
- Run intentional golden mismatch fixtures.
- Run `stderr` empty/ignored fixture checks through manifest-valid fixture paths.
- Run lower-level `stderr` contains/pattern oracle tests directly against the oracle helper.
- Run a `scan --json` failure stub that prints JSON and confirm the fixture fails.

### T1.5 — Implement filesystem mutation oracles

Purpose:
- Verify the mutation contract for `scan`, `init`, and `map`.

Contract refs:
- `contract.md` — §3.1 Guarantees
- `contract.md` — §7.5 Exact canonical YAML writing
- `contract.md` — §9 Commands, common writing rule
- `contract.md` — §9.1.4 `init` observable effect
- `contract.md` — §9.2.4 `map` observable effect

Design refs:
- `design.md` — §5.2 `config_io`
- `design.md` — §8 Single bounded atomic write path
- `design.md` — §10.2 Boundary tests

Eval refs:
- `evals.md` — §4.2 Level B oracle rules
- `evals.md` — §5.7 B-init / B-map
- `evals.md` — §6.2 Mandatory YAML goldens
- `evals.md` — §8.12 C12

Operating-model refs:
- `operating-model.md` — §15 Gestion des fixtures et goldens
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T1.2.
- T1.3.
- T1.4.
- S3.

Implementation scope:
- Compare pre-run and post-run filesystem snapshots.
- Support `no_mutation` for all `scan` fixtures and all failure fixtures that require it.
- Support exact expected final `anchormap.yaml` golden for successful `init` and `map`.
- Support explicit assertion that `anchormap.yaml` remains absent after failed `init`.
- Detect residual temp or auxiliary AnchorMap files after failed writes.
- Report added, removed, changed, and type-changed files.

Out of scope:
- Defining product temp-file names beyond what the implementation exposes for write attempts.
- Enforcing mutation behavior for files outside the sandbox.
- Recovering from failed fixture setup.

Done when:
- A changed file under `no_mutation` fails the fixture.
- A newly created file under `no_mutation` fails the fixture.
- A successful write fixture compares final `anchormap.yaml` byte-for-byte with a golden.
- A failed write fixture fails if any temp/auxiliary AnchorMap file remains.
- Mutation diff lists changed paths in canonical order.

Suggested verification:
- Run stub fixtures that mutate a tracked file, create an unexpected file, and write the expected YAML.
- Confirm all mutation failures produce readable diffs.

### T1.6 — Implement fixture selection, grouping, and result reporting

Purpose:
- Make fixtures executable by ID, family, milestone, and release gate.

Contract refs:
- `contract.md` — §9 Commands
- `contract.md` — §13.8 Exit codes

Design refs:
- `design.md` — §10 Testability
- `design.md` — §11 Dependencies and reproducibility

Eval refs:
- `evals.md` — §5 Corpus minimal obligatoire v1.0
- `evals.md` — §11 Release gates
- `evals.md` — §12 Technical publication checklist

Operating-model refs:
- `operating-model.md` — §12 Stratégie d'implémentation
- `operating-model.md` — §15 Gestion des fixtures et goldens
- `operating-model.md` — §18 Commit et granularité de changement

Dependencies:
- T1.1.
- T1.3.
- T1.4.
- T1.5.

Implementation scope:
- Run a single fixture by ID.
- Run fixtures by family, such as `B-cli`, `B-config`, `B-scan`.
- Run all fixtures.
- Emit a concise pass/fail report with fixture IDs.
- Exit non-zero when any fixture fails.
- Keep report ordering stable.

Out of scope:
- Parallelization as a release requirement.
- Flaky retry behavior.
- HTML or UI reporting.

Done when:
- `fixture-runner --fixture fx68_cli_unknown_command` or equivalent runs only that fixture.
- `fixture-runner --family B-cli` or equivalent runs only B-cli fixtures.
- Result output is stable across two identical runs.
- Runner process exits non-zero if one fixture fails.
- Failed fixture report names the fixture ID and failed oracle.

Suggested verification:
- Create three stub fixtures in two families.
- Run by ID, by family, and all.
- Intentionally fail one fixture and confirm runner exit code and report.

### T1.7 — Integrate harness into project scripts and CI-ready commands

Purpose:
- Provide a stable command surface for developers and agents to run evals.

Contract refs:
- `contract.md` — §4.1 Determinism
- `contract.md` — §12.6 No implicit data

Design refs:
- `design.md` — §10 Testability
- `design.md` — §11 Dependencies and reproducibility

Eval refs:
- `evals.md` — §4 Evaluation levels
- `evals.md` — §11 Release gates
- `evals.md` — §12 Technical publication checklist

Operating-model refs:
- `operating-model.md` — §12 Stratégie d'implémentation
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T1.6.

Implementation scope:
- Add stable scripts such as:
  - unit tests
  - fixture runner all
  - fixture runner by ID/family
  - golden check
- Ensure scripts can target a built CLI binary or a stub CLI.
- Document the minimal local commands an agent must run for a task.

Out of scope:
- Full release CI matrix.
- Performance benchmarks.
- Cross-platform gate execution.

Done when:
- One command runs all current fixtures.
- One command runs a single fixture by ID.
- One command runs unit tests.
- Scripts work against a CLI stub before full implementation exists.
- Script names are documented in the repository.

Suggested verification:
- Run all scripts locally against the stub.
- Confirm no script depends on network, Git metadata, clock, or unstated environment variables as an oracle.

### T1.8 — Add walking skeleton fixtures for harness proof

Purpose:
- Prove the verification loop with a CLI stub or minimal CLI before product implementation.

Contract refs:
- `contract.md` — §9 Commands
- `contract.md` — §13.1 Machine contract for `scan --json`
- `contract.md` — §13.8 Exit codes

Design refs:
- `design.md` — §5.6 `commands`
- `design.md` — §10.2 Boundary tests

Eval refs:
- `evals.md` — §4.2 Level B
- `evals.md` — §6 Goldens and exact oracles

Operating-model refs:
- `operating-model.md` — §12 Stratégie d'implémentation
- `operating-model.md` — §13 Walking skeleton
- `operating-model.md` — §19.2 Jalon

Dependencies:
- T1.1.
- T1.2.
- T1.3.
- T1.4.
- T1.5.
- T1.6.
- T1.7.

Implementation scope:
- Add at least one success fixture with exact stdout golden and empty stderr.
- Add at least one failure fixture with non-zero exit code and empty stdout.
- Add at least one no-mutation fixture.
- Add at least one expected-mutation fixture for a stub write.
- Keep fixtures marked as harness smoke fixtures, not product release fixtures.

Out of scope:
- Claiming product fixture coverage.
- Implementing actual `scan`, `init`, or `map`.

Done when:
- Harness smoke success fixture passes.
- Harness smoke failure fixture passes.
- Harness detects an intentionally broken golden.
- Harness detects an intentionally unexpected mutation.
- The full loop `fixture → CLI stub → stdout/stderr/exit code → golden → mutation check → diff` is demonstrably working.

Suggested verification:
- Run harness smoke family.
- Temporarily corrupt a golden and confirm the diff.
- Temporarily mutate an unexpected file and confirm the mutation oracle fails.

### T1.9 — Add documentary consistency checks for agent legibility

Purpose:
- Make the repository documents mechanically legible and self-consistent for humans and agents.
- Fail fast on broken document references or drift between `tasks.md`, `evals.md`, and the ADR register.

Contract refs:
- `contract.md` — §4.1 Determinism
- `contract.md` — §12.6 No implicit data

Design refs:
- `design.md` — §2.1 Stack and ADRs
- `design.md` — §3 Sources de vérité et frontières
- `design.md` — §10 Testabilité

Eval refs:
- `evals.md` — §2 Principes non négociables des evals
- `evals.md` — §3 Traçabilité contrat → familles d'évals
- `evals.md` — §12 Technical publication checklist

Operating-model refs:
- `operating-model.md` — §3 Hiérarchie des documents
- `operating-model.md` — §9 Règles d'utilisation des agents IA
- `operating-model.md` — §10.6 Tooling problem
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T1.7.

Implementation scope:
- Add a repo-local documentation consistency check.
- Verify that internal markdown links under `docs/` resolve to existing files.
- Verify that ADR files referenced from the ADR register and `design.md` exist.
- Verify that fixture IDs referenced from `tasks.md` exist in `evals.md`.
- Verify that task IDs remain unique and are reported stably.
- Report failures with the exact broken reference and owning document.

Out of scope:
- Parsing or validating runtime contract semantics.
- Rewriting document content automatically.
- Blocking release on prose quality or stylistic preferences.

Done when:
- A broken internal doc link fails the check.
- A missing ADR file referenced by the register or `design.md` fails the check.
- A fixture ID referenced by `tasks.md` but absent from `evals.md` fails the check.
- A duplicate task ID fails the check.
- Output names the exact broken reference and file.
- The check runs from a stable local script.

Suggested verification:
- Run the check on the clean repo and confirm pass.
- Break one internal markdown link and confirm the exact failure.
- Add one fake fixture ID to `tasks.md` and confirm the check fails.

### T1.10 — Persist per-run harness artifacts and summaries

Purpose:
- Make each fixture run inspectable after execution by humans and agents.
- Preserve the minimal evidence needed to diagnose a failure without replaying it blindly.

Contract refs:
- `contract.md` — §4.1 Determinism
- `contract.md` — §12.5 Stable outputs
- `contract.md` — §12.6 No implicit data

Design refs:
- `design.md` — §10.2 Tests de frontière
- `design.md` — §10.3 Harness de fixtures et observabilité
- `design.md` — §11 Dépendances et reproductibilité

Eval refs:
- `evals.md` — §2 Principes non négociables des evals
- `evals.md` — §4.2 Level B — Contract boundary fixtures
- `evals.md` — §12 Technical publication checklist

Operating-model refs:
- `operating-model.md` — §2.3 Observabilité lisible par agent
- `operating-model.md` — §10.6 Tooling problem
- `operating-model.md` — §15 Gestion des fixtures et goldens

Dependencies:
- T1.3.
- T1.4.
- T1.5.
- T1.6.

Implementation scope:
- Create a stable per-run artifact directory for fixture executions.
- Persist run metadata including fixture ID, command, cwd, exit code, oracle results, and pass/fail status.
- Persist actual and expected `stdout` / `stderr` payloads when applicable.
- Persist filesystem before/after snapshots or equivalent diff artifacts when applicable.
- Emit a short human-readable run summary referencing the artifact set.

Out of scope:
- User-facing CLI debug commands.
- Long-term artifact retention policy outside the repo-local harness.
- Production telemetry.

Done when:
- A fixture run creates a dedicated artifact directory.
- The artifact set records fixture ID, command, cwd, exit code, and pass/fail status.
- A golden mismatch stores both actual and expected outputs.
- A mutation failure stores before/after or equivalent diff evidence.
- A short summary points to the failing oracle and artifact paths.

Suggested verification:
- Run one passing fixture and confirm its artifact set exists.
- Run one failing golden fixture and confirm actual/expected outputs are persisted.
- Run one failing mutation fixture and confirm diff artifacts are persisted.

### T1.11 — Add structured trace and timing artifacts for fixture runs

Purpose:
- Make fixture runs legible at the phase level without requiring ad hoc debugging.
- Prepare later determinism and performance gates to consume stable phase-level evidence.

Contract refs:
- `contract.md` — §4.1 Determinism
- `contract.md` — §12.6 No implicit data

Design refs:
- `design.md` — §4 Vue d'ensemble du système
- `design.md` — §10.3 Harness de fixtures et observabilité
- `design.md` — §13 Complexité et budgets

Eval refs:
- `evals.md` — §4.3 Niveau C — Tests métamorphiques et d'isolation
- `evals.md` — §4.5 Niveau E — Performance et ressources
- `evals.md` — Gate D
- `evals.md` — Gate F

Operating-model refs:
- `operating-model.md` — §2.3 Observabilité lisible par agent
- `operating-model.md` — §10.6 Tooling problem
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T1.10.

Implementation scope:
- Add structured phase trace events to fixture artifacts.
- Add per-run total duration and per-phase timings to fixture artifacts.
- Define a stable minimal phase vocabulary for harness and CLI boundary work.
- Ensure trace and timing output are optional harness observability surfaces, not runtime sources of truth.

Out of scope:
- Requiring OpenTelemetry or external tracing infrastructure.
- Turning traces into user-facing contract output.
- Performance optimization work itself.

Done when:
- A fixture run can persist structured phase events.
- A fixture run can persist total runtime and per-phase durations.
- At least the phases `cli.parse`, `config.load`, `spec.index`, `ts.graph`, `scan.evaluate`, `render`, `fs.write`, and `exit` are representable when relevant.
- A failing run summary can point to the last failing phase when trace data exists.

Suggested verification:
- Run one config-failure fixture and confirm the trace stops at the expected phase.
- Run one success fixture and confirm timings include total duration and non-negative phase durations.
- Confirm trace/timing artifacts do not change command exit semantics.

## M2 — CLI boundary and command discipline

### T2.1 — Implement process entrypoint and exact command surface

Purpose:
- Expose only the three v1.0 commands and reject every other command.

Contract refs:
- `contract.md` — §9 Commands
- `contract.md` — §13.8 Exit codes
- `contract.md` — §13.9 Exit-code priority

Design refs:
- `design.md` — §5.6 `commands`
- `design.md` — §9 Error policy and exit codes
- `design.md` — §15 Indicative repository structure

Eval refs:
- `evals.md` — `fx68_cli_unknown_command`
- `evals.md` — §5.8 B-cli
- `evals.md` — Gate C

Operating-model refs:
- `operating-model.md` — §9 Règles d'utilisation des agents IA
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T1.7.

Implementation scope:
- Add executable CLI entrypoint.
- Dispatch exactly `init`, `map`, and `scan`.
- Reject missing command and unknown commands as usage errors.
- Return exit code `4` for unknown commands.
- Do not read `anchormap.yaml` or repository files before command validity is established.

Out of scope:
- Implementing command business logic.
- Adding help/version commands unless already required elsewhere, which it is not.

Done when:
- `anchormap unknown` exits `4`.
- Unknown command does not read `./anchormap.yaml`.
- Unknown command does not mutate the filesystem.
- B-cli fixture `fx68_cli_unknown_command` passes.

Suggested verification:
- Run `fx68_cli_unknown_command`.
- Run a harness fixture with a missing config and unknown command and confirm exit `4`.

### T2.2 — Implement option parser for `scan`

Purpose:
- Enforce the supported `scan` forms and stream policy boundary.

Contract refs:
- `contract.md` — §9.3.2 `scan` supported forms
- `contract.md` — §9 Commands, unknown options/combinations
- `contract.md` — §13.1 Machine contract for `scan --json`
- `contract.md` — §13.8 Exit codes

Design refs:
- `design.md` — §5.6 `commands`
- `design.md` — §9.4 Classification by command — `scan`
- `design.md` — §9.6 `scan --json`

Eval refs:
- `evals.md` — `fx69_cli_unknown_option`
- `evals.md` — `fx70_cli_invalid_option_combination`
- `evals.md` — `fx71_cli_scan_option_order_invariant`
- `evals.md` — `fx71a_cli_scan_human_success`
- `evals.md` — `fx71d_cli_scan_human_invalid_args_code4`

Operating-model refs:
- `operating-model.md` — §12 Stratégie d'implémentation
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T2.1.

Implementation scope:
- Accept `anchormap scan`.
- Accept `anchormap scan --json`.
- Reject unknown scan options with exit `4`.
- Reject unsupported combinations with exit `4`.
- Preserve option-order invariance for supported options.
- Separate machine-readable `scan --json` mode from human `scan` mode.

Out of scope:
- Producing real scan output.
- Reading config or repository contents.
- Defining human output text.

Done when:
- `anchormap scan --unknown` exits `4`.
- Unsupported scan option combinations exit `4`.
- For `scan --json` failures caused by invalid options, stdout is empty.
- Human `scan` invalid-args fixture exits `4` with no mutation.
- `fx69_cli_unknown_option`, `fx70_cli_invalid_option_combination`, and `fx71d_cli_scan_human_invalid_args_code4` pass for the parser boundary.

Suggested verification:
- Run B-cli scan parser fixtures.
- Add parser unit tests for option order and invalid combinations.

### T2.3 — Implement option parser for `init`

Purpose:
- Validate `init` argument shape before filesystem mutation or business execution.

Contract refs:
- `contract.md` — §9.1.2 `init` supported form
- `contract.md` — §9.1.3 `init` rules
- `contract.md` — §13.8 Exit codes
- `contract.md` — §13.9 Exit-code priority

Design refs:
- `design.md` — §4.3 Pipeline logical de `init`
- `design.md` — §5.6 `commands`
- `design.md` — §9.4 Classification by command — `init`

Eval refs:
- `evals.md` — `fx56_init_invalid_args`
- `evals.md` — `fx58a_init_option_order_invariant`
- `evals.md` — §5.7 B-init / B-map

Operating-model refs:
- `operating-model.md` — §12 Stratégie d'implémentation
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T2.1.

Implementation scope:
- Require exactly one `--root`.
- Require at least one `--spec-root`.
- Accept zero or more `--ignore-root`.
- Reject unknown options and missing option values.
- Preserve option-order invariance.
- Return structured parsed arguments for later config/init tasks.

Out of scope:
- Path canonicalization beyond raw parser shape.
- Checking directory existence.
- Writing `anchormap.yaml`.

Done when:
- Missing `--root` exits `4`.
- Missing `--spec-root` exits `4`.
- Duplicate `--root` exits `4`.
- Unknown init option exits `4`.
- Invalid init args do not create `anchormap.yaml`.
- `fx56_init_invalid_args` passes for parser-covered cases.

Suggested verification:
- Run parser unit tests for all supported and unsupported `init` forms.
- Run `fx56_init_invalid_args`.

### T2.4 — Implement option parser for `map`

Purpose:
- Validate `map` argument shape and replace flag semantics at the CLI boundary.

Contract refs:
- `contract.md` — §9.2.2 `map` supported form
- `contract.md` — §9.2.3 `map` rules
- `contract.md` — §13.8 Exit codes
- `contract.md` — §13.9 Exit-code priority

Design refs:
- `design.md` — §4.2 Pipeline logical de `map`
- `design.md` — §5.6 `commands`
- `design.md` — §9.4 Classification by command — `map`

Eval refs:
- `evals.md` — `fx63_map_invalid_anchor_argument`
- `evals.md` — `fx66_map_duplicate_seed_argument`
- `evals.md` — `fx67_map_option_order_invariant`
- `evals.md` — §5.7 B-init / B-map

Operating-model refs:
- `operating-model.md` — §12 Stratégie d'implémentation
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T2.1.
- T3.1 for final anchor format validation.
- T3.2 for final seed path normalization and duplicate detection.

Implementation scope:
- Require exactly one `--anchor`.
- Require at least one `--seed`.
- Accept optional flag `--replace` without value.
- Reject unknown options, missing option values, duplicate `--anchor`, and invalid flag values.
- Preserve option-order invariance.
- Return structured parsed arguments for later map orchestration.

Out of scope:
- Checking whether anchor exists in specs.
- Checking whether seeds exist.
- Loading config.
- Writing config.

Done when:
- Missing `--anchor` exits `4`.
- Missing `--seed` exits `4`.
- Duplicate `--anchor` exits `4`.
- `--replace` with a value exits `4`.
- Unknown map option exits `4`.
- Invalid map arguments do not read or write `anchormap.yaml`.

Suggested verification:
- Run map parser unit tests.
- Run B-map parser fixtures after T3.1 and T3.2 are integrated.

### T2.5 — Implement AppError to exit-code and stream discipline

Purpose:
- Centralize code classification and stdout/stderr behavior at the command boundary.

Contract refs:
- `contract.md` — §13.1 Machine contract for `scan --json`
- `contract.md` — §13.8 Exit codes
- `contract.md` — §13.9 Exit-code priority
- `contract.md` — §3.3 Human terminal outputs out of contract

Design refs:
- `design.md` — §5.6 `commands`
- `design.md` — §6.7 `AppError`
- `design.md` — §9 Error policy and exit codes
- `design.md` — §9.6 `scan --json`

Eval refs:
- `evals.md` — `fx71b_cli_scan_human_config_error_code2`
- `evals.md` — `fx71c_cli_scan_human_repo_error_code3`
- `evals.md` — `fx71e_cli_scan_human_internal_error_code1`
- `evals.md` — `fx75_cli_internal_error_code_1`
- `evals.md` — Gate C

Operating-model refs:
- `operating-model.md` — §10 Taxonomie des écarts
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T2.1.
- T2.2.

Implementation scope:
- Define command-boundary mapping:
  - `UsageError` → `4`
  - `ConfigError` → `2`
  - `UnsupportedRepoError` → `3`
  - `WriteError` → `1`
  - `InternalError` → `1`
- Enforce `scan --json` success: stdout JSON, stderr empty.
- Enforce `scan --json` failure: stdout empty, stderr optional human line.
- Ensure human-output commands do not rely on stable text or parser-visible diagnostics.
- Add test-only deterministic internal error injection only if needed to cover code `1`.

Out of scope:
- Product-specific error creation inside config/spec/graph modules.
- Stable human diagnostic wording.
- Changing exit-code priority rules.

Done when:
- Each AppError kind maps to the expected exit code.
- `scan --json` error path writes no stdout bytes.
- `scan --json` success path rejects non-empty stderr.
- Internal error fixture can exercise exit `1` without product scope change.
- B-cli code `1` fixture path is testable.

Suggested verification:
- Run unit tests for AppError mapping.
- Run `fx75_cli_internal_error_code_1` once the test-only injection is available.
- Run scan JSON failure fixture with stderr ignored and stdout empty.

### T2.6 — Enforce CLI validation before unnecessary repo/config access

Purpose:
- Preserve exit-code priority and avoid reading repository state when arguments already determine exit `4`.

Contract refs:
- `contract.md` — §9 Commands
- `contract.md` — §12.1 Repository root and config
- `contract.md` — §13.9 Exit-code priority

Design refs:
- `design.md` — §5.6 `commands`
- `design.md` — §9.3 Contractual priority
- `design.md` — §9.4 Classification by command

Eval refs:
- `evals.md` — `fx72_cli_priority_4_over_2`
- `evals.md` — `fx73_cli_priority_2_over_3`
- `evals.md` — `fx74_cli_priority_3_over_1`
- `evals.md` — Gate C

Operating-model refs:
- `operating-model.md` — §8 Politique de changement
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T2.2.
- T2.3.
- T2.4.
- T2.5.

Implementation scope:
- Ensure invalid CLI arguments return `4` before config reads.
- Ensure config errors return `2` before repo analysis errors.
- Ensure repo analysis errors return `3` before later internal failures.
- Add test instrumentation or fixture setup that proves the ordering without relying on human stderr text.

Out of scope:
- Implementing config/spec/graph business logic.
- Changing module error kinds after they are emitted.

Done when:
- `fx72` has a runnable stub-backed priority fixture that proves invalid args plus missing config return `4` before any config or repo access.
- `fx73` has a runnable stub-backed priority fixture that proves config error returns `2` before repo analysis.
- `fx74` has a runnable stub-backed priority fixture that proves repo analysis error returns `3` before later internal-error injection is evaluated.
- Each priority fixture asserts exit code, stdout/stderr policy, and no mutation through the harness.

Suggested verification:
- Run priority parser fixtures with stubs.
- Check access-spy logs for config, repo, and later internal-error boundaries.

## M3 — Core domain model and canonical rendering

### T3.1 — Implement `AnchorId` validation

Purpose:
- Provide a single validated representation of supported anchor IDs.

Contract refs:
- `contract.md` — §6.1 Anchor ID
- `contract.md` — §8 Anchor detection
- `contract.md` — §9.2.3 `map` rules
- `contract.md` — §11.2 Field normalization

Design refs:
- `design.md` — §6.1 Types minimum
- `design.md` — §6.2 `AnchorId`
- `design.md` — §7.2 Spec indexing

Eval refs:
- `evals.md` — §4.1 Level A
- `evals.md` — `fx11_specs_markdown_atx_short_id`
- `evals.md` — `fx12_specs_markdown_atx_dotted_id`
- `evals.md` — `fx63_map_invalid_anchor_argument`

Operating-model refs:
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T1.7.

Implementation scope:
- Validate `SHORT_ID = ^[A-Z]+-[0-9]{3}$`.
- Validate `DOTTED_ID = ^[A-Z][A-Z0-9]*(\.[A-Z][A-Z0-9]*)+$`.
- Reject every other form.
- Expose an opaque `AnchorId` value to downstream modules.
- Add pure unit tests for valid and invalid examples.

Out of scope:
- Extracting anchors from Markdown or YAML.
- Checking anchor existence in specs.
- Inferring anchors from prose.

Done when:
- `US-001`, `FR-014`, and `DOC.README.PRESENT` validate.
- Lowercase, malformed numbers, trailing punctuation, empty strings, and mixed unsupported forms reject.
- Invalid anchor text returns a typed validation failure from the validator.
- No module can construct an unchecked anchor except through test-only helpers.

Suggested verification:
- Run `AnchorId` unit tests.
- Verify invalid examples return the typed validation failure expected by command parsers.

### T3.2 — Implement `RepoPath`, `UserPathArg`, and import candidate normalization

Purpose:
- Centralize canonical path handling and binary-order comparison.

Contract refs:
- `contract.md` — §7.3 Config schema invariants
- `contract.md` — §7.4 Path invariants
- `contract.md` — §9 Commands, path argument normalization
- `contract.md` — §10.2 Candidate resolution
- `contract.md` — §12.2 Canonical path model

Design refs:
- `design.md` — §5.1 `repo_fs`
- `design.md` — §6.3 `RepoPath`
- `design.md` — §7.1 File discovery
- `design.md` — §7.4 TypeScript graph construction

Eval refs:
- `evals.md` — §4.1 Level A
- `evals.md` — `fx50_config_absolute_path`
- `evals.md` — `fx51_config_dotdot_path`
- `evals.md` — `fx58_init_duplicate_normalized_roots`
- `evals.md` — `fx66_map_duplicate_seed_argument`
- `evals.md` — `fx38_graph_outside_repo_root_candidate`

Operating-model refs:
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T1.7.

Implementation scope:
- Implement `RepoPath` validation:
  - POSIX `/` separators only
  - relative only
  - no trailing slash
  - no empty, `.`, or `..` segment
  - no control characters
- Implement CLI `UserPathArg -> RepoPath` normalization exactly.
- Implement lexical import candidate normalization from importer directory and relative specifier.
- Implement binary UTF-8 lexicographic comparator.
- Add pure unit tests for accepted, normalized, and rejected paths.

Out of scope:
- Filesystem existence checks.
- Symlink detection.
- Platform-specific path expansion.
- Resolving TypeScript aliases.

Done when:
- `./src//core/` normalizes to `src/core`.
- Empty, absolute, backslash, control-character, `.`, and `..` paths reject.
- Duplicate normalized roots/seeds can be detected by callers.
- Import candidate resolving above repo root returns “outside root / nonexistent” representation.
- Comparators are locale-independent in tests.

Suggested verification:
- Run path normalization unit tests.
- Run parser-level duplicate root/seed fixtures after M4/M8 integration.

### T3.3 — Implement canonical sorted collections and finding model

Purpose:
- Provide pure deduplication and canonical ordering for all derived collections and findings.

Contract refs:
- `contract.md` — §4.7 Canonical order and comparison
- `contract.md` — §11 Findings
- `contract.md` — §13.6 `findings`
- `contract.md` — §13.7 Exact canonical JSON serialization

Design refs:
- `design.md` — §6.6 `Finding`
- `design.md` — §7.7 Business findings
- `design.md` — §7.8 `analysis_health`
- `design.md` — §5.5 `scan_engine`

Eval refs:
- `evals.md` — §4.1 Level A
- `evals.md` — `fx09_scan_findings_canonical_order`
- `evals.md` — `fx10_scan_closed_objects`
- `evals.md` — `fx35_graph_duplicate_findings_dedup`

Operating-model refs:
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T3.1.
- T3.2.

Implementation scope:
- Define all normative finding kinds and fields.
- Deduplicate findings by exact tuple from `contract.md` §11.3.
- Sort findings by `kind` and normative fields.
- Sort anchor IDs and repo paths using binary UTF-8 order.
- Prevent extra finding fields in typed construction.

Out of scope:
- Emitting findings from product logic.
- Deciding `analysis_health` from unfinalized findings.
- Rendering JSON bytes.

Done when:
- Duplicate findings collapse to one.
- Findings with different fields remain distinct.
- Canonical finding order matches `contract.md` §11.6.
- Unit tests cover every finding kind and key order expectation.
- `fx35_graph_duplicate_findings_dedup` has a pure-unit equivalent before graph integration.

Suggested verification:
- Run finding model unit tests.
- Run canonical order fixture once scan output assembly exists.

### T3.4 — Implement `ScanResult` view model and `analysis_health` pure function

Purpose:
- Represent closed output views without hidden state.

Contract refs:
- `contract.md` — §4.8 No hidden normative state
- `contract.md` — §6.10 `analysis_health`
- `contract.md` — §13.2 Exact success schema
- `contract.md` — §§13.3–13.6 Output sections

Design refs:
- `design.md` — §6.5 Derived output views
- `design.md` — §6.6 `Finding`
- `design.md` — §7.8 Calculate `analysis_health`

Eval refs:
- `evals.md` — §4.1 Level A
- `evals.md` — `fx01_scan_min_clean`
- `evals.md` — `fx04_scan_stale_mapping`
- `evals.md` — `fx05_scan_broken_seed`
- `evals.md` — `fx10_scan_closed_objects`

Operating-model refs:
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T3.1.
- T3.2.
- T3.3.

Implementation scope:
- Define closed in-memory views:
  - config view
  - observed anchor view
  - stored mapping view
  - file view
  - findings array
- Implement `analysis_health = degraded` iff final findings include degrading kinds.
- Ensure unmapped and untraced findings alone do not degrade health.
- Add unit tests using synthetic findings and views.

Out of scope:
- Building views from real repository input.
- Rendering JSON.
- Traversing dependency graph.

Done when:
- `analysis_health` is `clean` for no findings.
- `analysis_health` is `clean` for only `unmapped_anchor` and/or `untraced_product_file`.
- `analysis_health` is `degraded` for each degrading finding kind.
- Output view types contain no fields outside the contract.

Suggested verification:
- Run pure `ScanResult` and `analysis_health` unit tests.

### T3.5 — Implement canonical JSON renderer

Purpose:
- Emit success `scan --json` bytes exactly as specified.

Contract refs:
- `contract.md` — §12.5 Stable outputs
- `contract.md` — §13.2 Exact success schema
- `contract.md` — §§13.3–13.6 JSON sections
- `contract.md` — §13.7 Exact canonical JSON serialization

Design refs:
- `design.md` — §5.7 `render`
- `design.md` — §6.5 Derived output views
- `design.md` — §10.1 Module tests

Eval refs:
- `evals.md` — §4.1 Level A
- `evals.md` — §6.1 Mandatory JSON goldens
- `evals.md` — `fx09_scan_findings_canonical_order`
- `evals.md` — `fx10_scan_closed_objects`
- `evals.md` — Gate B

Operating-model refs:
- `operating-model.md` — §15 Gestion des fixtures et goldens
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T3.3.
- T3.4.
- S4.

Implementation scope:
- Render one-line JSON with a single final `\n`.
- Emit root keys in exact contract order.
- Emit nested keys in exact contract order.
- Emit sorted map keys and arrays as already-normalized inputs.
- Escape strings exactly per `contract.md` §13.7.
- Emit UTF-8 without BOM.
- Add renderer unit goldens for representative `ScanResult` objects.

Out of scope:
- Sorting or deduplicating inside renderer.
- Reading files.
- Writing stdout directly.

Done when:
- Renderer output has no spaces outside strings.
- Renderer output ends with exactly one newline.
- Root and nested key order match contract.
- Control characters escape as lowercase `\u00xx`.
- `/` is not escaped.
- Unit goldens pass byte-for-byte.

Suggested verification:
- Run JSON renderer unit tests.
- Run a fixture using a synthetic scan result once command integration exists.

### T3.6 — Implement strict UTF-8 decoding with initial BOM handling

Purpose:
- Provide the shared byte-to-text boundary used by config, specs, and product files.

Contract refs:
- `contract.md` — §1.1 Normative grammar profiles
- `contract.md` — §8 Anchor detection
- `contract.md` — §10.5 Parse failures
- `contract.md` — §12.3 Discovery scope, readability and guardrails

Design refs:
- `design.md` — §5.1 `repo_fs`
- `design.md` — §7.0 Normative reading and decoding
- `design.md` — §10.1 Module tests

Eval refs:
- `evals.md` — §4.1 Level A
- `evals.md` — §5.1 B-decodage
- `evals.md` — `fx00a_decode_config_bom_success`
- `evals.md` — `fx00e_decode_config_non_utf8`
- `evals.md` — `fx00h_decode_product_non_utf8`

Operating-model refs:
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T1.7.

Implementation scope:
- Decode byte buffers as strict UTF-8.
- Reject invalid UTF-8 byte sequences.
- Remove exactly one initial U+FEFF if present after decoding.
- Preserve all other bytes/content, including newlines and later U+FEFF.
- Expose errors for callers to classify as config or unsupported repo.

Out of scope:
- Reading bytes from filesystem.
- Applying Unicode normalization.
- Applying newline normalization.
- Parser profile selection.

Done when:
- Initial BOM before valid text is removed.
- A second BOM character not at the first position is preserved.
- Invalid UTF-8 rejects.
- Newline bytes are preserved.
- Unit tests cover config/spec/product caller classification hooks without choosing exit codes inside the decoder.

Suggested verification:
- Run decoder unit tests.
- Run B-decodage fixtures after M4–M6 integration.

## M4 — Config and init

### T4.1 — Implement YAML parsing profile for `anchormap.yaml`

Purpose:
- Load `anchormap.yaml` as strict YAML input with contract-compliant failure classification.

Contract refs:
- `contract.md` — §1.1 Normative grammar profiles
- `contract.md` — §7.3 Schema invariants
- `contract.md` — §12.1 Repository root and config
- `contract.md` — §12.3 Config failure classification
- `contract.md` — §13.8 Exit codes

Design refs:
- `design.md` — §5.2 `config_io`
- `design.md` — §7.0 Normative reading and decoding
- `design.md` — §9.4 Classification by command
- `design.md` — §10.1 Module tests

Eval refs:
- `evals.md` — `fx43_config_missing_file`
- `evals.md` — `fx43a_config_unreadable_file`
- `evals.md` — `fx43b_config_non_utf8`
- `evals.md` — `fx43c_config_yaml_invalid`
- `evals.md` — `fx43d_config_yaml_multidoc`
- `evals.md` — `fx43e_config_root_not_mapping`
- `evals.md` — `fx43f_config_duplicate_keys`
- `evals.md` — `fx43g_config_bom_initial_success`

Operating-model refs:
- `operating-model.md` — §16 Politique de dépendances
- `operating-model.md` — §17 Politique de spikes
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T3.2.
- T3.6.
- S1.

Implementation scope:
- Read exactly `./anchormap.yaml` from process cwd.
- Decode via strict UTF-8/BOM boundary.
- Parse according to YAML 1.2.2-compatible selected parser behavior.
- Reject invalid YAML, multi-document YAML, root non-mapping, and duplicate keys.
- Return `ConfigError` for every config-load failure.
- Add module tests for parser failure classes.

Out of scope:
- Full schema validation.
- YAML canonical writing.
- Parent-directory config search.

Done when:
- Missing config returns `ConfigError`.
- Non-UTF-8 config returns `ConfigError`.
- YAML invalid, multidoc, root-non-mapping, and duplicate-key inputs return `ConfigError`.
- Parser-covered inputs corresponding to `fx43` through `fx43g` are represented by runnable config-loader tests.

Suggested verification:
- Run config parser unit tests.
- Run config-loader tests using fixture-shaped inputs for load-level failures.

### T4.2 — Implement config schema validation

Purpose:
- Convert parsed YAML into a normalized `Config` model and reject invalid schema.

Contract refs:
- `contract.md` — §7.2 Minimal schema
- `contract.md` — §7.3 Schema invariants
- `contract.md` — §12.2 Canonical path model
- `contract.md` — §13.2 `config` output object

Design refs:
- `design.md` — §5.2 `config_io`
- `design.md` — §6.1 Types minimum
- `design.md` — §9.4 Classification by command

Eval refs:
- `evals.md` — `fx44_config_invalid_schema`
- `evals.md` — `fx45_config_unknown_field`
- `evals.md` — `fx46_config_version_not_1`
- `evals.md` — `fx47_config_empty_spec_roots`
- `evals.md` — `fx48_config_seed_files_empty`
- `evals.md` — `fx49_config_seed_files_duplicated`

Operating-model refs:
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T3.1.
- T3.2.
- T4.1.

Implementation scope:
- Validate required fields:
  - `version: 1`
  - `product_root`
  - non-empty `spec_roots`
- Validate optional fields:
  - `ignore_roots`
  - `mappings`
- Reject unknown fields.
- Validate `mappings[anchor].seed_files` shape.
- Reject empty and duplicate `seed_files`.
- Validate mapping keys as supported anchor IDs.
- Normalize config paths using `RepoPath` rules.

Out of scope:
- Checking root existence.
- Checking root overlap.
- Checking seed existence.
- Writing canonical YAML.

Done when:
- Unknown top-level config field returns `ConfigError`.
- `version != 1` returns `ConfigError`.
- Empty `spec_roots` returns `ConfigError`.
- Empty or duplicated `seed_files` returns `ConfigError`.
- Invalid mapping anchor key returns `ConfigError`.
- Unit tests cover every schema invariant in `contract.md` §7.3 that does not require filesystem state.

Suggested verification:
- Run config schema unit tests.
- Run `fx44` through `fx49`.

### T4.3 — Implement config path invariants and root existence validation

Purpose:
- Enforce repository-root-relative config path constraints.

Contract refs:
- `contract.md` — §7.4 Path invariants
- `contract.md` — §12.1 Repository root and config
- `contract.md` — §12.2 Canonical path model
- `contract.md` — §12.3 Config failure classification

Design refs:
- `design.md` — §5.1 `repo_fs`
- `design.md` — §5.2 `config_io`
- `design.md` — §7.1 File discovery
- `design.md` — §9.4 Classification by command

Eval refs:
- `evals.md` — `fx50_config_absolute_path`
- `evals.md` — `fx51_config_dotdot_path`
- `evals.md` — `fx52_config_roots_overlap`
- `evals.md` — `fx53_config_ignore_root_outside_product_root`
- `evals.md` — `fx42_repo_no_parent_search_for_config`

Operating-model refs:
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T3.2.
- T4.2.

Implementation scope:
- Validate `product_root` exists and is a directory.
- Validate each `spec_root` exists and is a directory.
- Validate existing `ignore_roots` are under `product_root`.
- Reject absolute, dot-dot, non-canonical, duplicated, and overlapping roots.
- Enforce exact `./anchormap.yaml` lookup with no parent search.
- Classify config invariant failures as `ConfigError`.

Out of scope:
- Recursive spec/product discovery.
- Symlink/case-collision checks in subtrees.
- Seed existence checks during scan.

Done when:
- Missing parent config is not discovered from a subdirectory.
- Overlapping `spec_roots` or `ignore_roots` return code `2`.
- Existing `ignore_root` outside `product_root` returns code `2`.
- Absolute and `..` config paths return code `2`.
- `fx50` through `fx53` and `fx42` pass.

Suggested verification:
- Run B-config path fixtures.
- Add unit tests for overlap relation using canonical `RepoPath`.

### T4.4 — Implement canonical YAML renderer for config

Purpose:
- Produce exact canonical `anchormap.yaml` bytes for `init` and `map`.

Contract refs:
- `contract.md` — §7.5 Exact canonical writing
- `contract.md` — §9.1.4 `init` observable effect
- `contract.md` — §9.2.4 `map` observable effect
- `contract.md` — §12.5 Stable outputs

Design refs:
- `design.md` — §5.2 `config_io`
- `design.md` — §8.2 Write phases
- `design.md` — §10.1 Module tests

Eval refs:
- `evals.md` — §6.2 Mandatory YAML goldens
- `evals.md` — `fx54_init_success_minimal`
- `evals.md` — `fx59_map_create`
- `evals.md` — `fx61_map_replace_ok`
- `evals.md` — `fx62_map_replace_create_if_absent`

Operating-model refs:
- `operating-model.md` — §15 Gestion des fixtures et goldens
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T3.1.
- T3.2.
- T4.2.
- S4.

Implementation scope:
- Render top-level key order exactly.
- Sort `spec_roots`, `ignore_roots`, mapping anchors, and `seed_files`.
- Omit `ignore_roots` if absent or empty.
- Always emit `mappings`, including `mappings: {}`.
- Emit UTF-8 without BOM and with exactly one final `\n`.
- Implement single-quote escaping by doubling internal single quotes.

Out of scope:
- Preserving comments.
- Preserving original YAML formatting.
- Writing bytes to disk.

Done when:
- Minimal config renders with `mappings: {}`.
- Non-empty mappings render in exact indentation and key order.
- Empty `ignore_roots` is omitted.
- Single quotes inside path strings are doubled.
- YAML renderer unit goldens pass byte-for-byte.

Suggested verification:
- Run YAML renderer unit tests.
- Compare rendered bytes against B-init/B-map goldens after command integration.

### T4.5 — Implement atomic config write path

Purpose:
- Provide the only bounded mutation path for `anchormap.yaml`.

Contract refs:
- `contract.md` — §3.1 Guarantees
- `contract.md` — §9 Commands, common writing rule
- `contract.md` — §9.1.4 `init` observable effect
- `contract.md` — §9.2.4 `map` observable effect
- `contract.md` — §13.8 Exit codes

Design refs:
- `design.md` — §5.2 `config_io`
- `design.md` — §8 Single bounded atomic write path
- `design.md` — §9.5 Writing command rule
- `design.md` — §10.2 Boundary tests

Eval refs:
- `evals.md` — `fx76_cli_write_failure_code_1`
- `evals.md` — §5.7 B-init / B-map
- `evals.md` — §6.2 Mandatory YAML goldens
- `evals.md` — Gate C

Operating-model refs:
- `operating-model.md` — §15 Gestion des fixtures et goldens
- `operating-model.md` — §16 Politique de dépendances
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T4.4.
- S2.

Implementation scope:
- Implement `config_io.writeConfigAtomic`.
- Serialize complete YAML in memory before touching disk.
- Create a same-directory temp file exclusively.
- Retry bounded temp-name candidates on `EEXIST` without deleting the
  colliding path, using decimal counters `0` through `99` inclusive.
- Return `WriteError` after bounded temp-candidate exhaustion without mutating
  the target or non-owned collision paths.
- Write bytes, flush runtime buffers, fsync temp file where supported, close descriptor.
- Rename temp file to `anchormap.yaml` as the commit boundary.
- On pre-commit failure, close descriptor, remove temp file, verify removal, and return `WriteError`.
- Ensure no faillible step after successful rename can turn success into failure.

Out of scope:
- Directory fsync after commit.
- Multiple persisted files.
- Partial patching of YAML.

Done when:
- Successful write produces exact YAML bytes.
- Injected failure before temp creation leaves initial state unchanged.
- Injected failure after temp creation leaves initial state unchanged and no temp file.
- Injected failure before rename returns `WriteError` that the command layer can classify as exit `1`.
- `EEXIST` on an exclusive temp-file candidate retries the next bounded
  candidate in the `0` through `99` range and never deletes or truncates the
  colliding path.
- Exhausting all 100 bounded temp-file candidates returns `WriteError`,
  preserves the initial target state, and preserves every non-owned collision
  path exactly.
- Cleanup tests distinguish attempt-owned temp files from unrelated
  pre-existing collision files and delete only the attempt-owned path.
- No code path reports failure after the rename commit boundary has succeeded.
- Atomic write tests cover the write-failure class required by `fx76_cli_write_failure_code_1`.

Suggested verification:
- Run atomic write unit tests with fault injection.
- Run atomic write unit tests that force `EEXIST` retry, bounded candidate
  exhaustion, and exact non-owned collision-path preservation.
- Run a write-failure harness fixture against the write-path boundary.
- Run mutation oracle against failed write attempts.

### T4.6 — Implement `anchormap init`

Purpose:
- Create the initial config exactly once in canonical YAML form.

Contract refs:
- `contract.md` — §9.1 `anchormap init`
- `contract.md` — §7.5 Exact canonical writing
- `contract.md` — §12.1 Repository root and config
- `contract.md` — §13.8 Exit codes

Design refs:
- `design.md` — §4.3 Pipeline logical de `init`
- `design.md` — §5.6 `commands`
- `design.md` — §8 Single bounded atomic write path
- `design.md` — §9.4 Classification by command — `init`

Eval refs:
- `evals.md` — `fx54_init_success_minimal`
- `evals.md` — `fx55_init_create_only`
- `evals.md` — `fx56_init_invalid_args`
- `evals.md` — `fx57_init_missing_required_dirs`
- `evals.md` — `fx58_init_duplicate_normalized_roots`
- `evals.md` — `fx58a_init_option_order_invariant`

Operating-model refs:
- `operating-model.md` — §12 Stratégie d'implémentation
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T2.3.
- T3.2.
- T4.4.
- T4.5.

Implementation scope:
- Normalize `--root`, `--spec-root`, and `--ignore-root`.
- Reject duplicate normalized `spec_roots` or `ignore_roots`.
- Enforce create-only: existing `./anchormap.yaml` exits `4`.
- Verify product root and spec roots exist and are directories.
- Verify existing ignore roots are under product root.
- Build config with empty mappings.
- Write via `config_io.writeConfigAtomic`.
- Do not scan, parse specs, parse TS, or write derived data.

Out of scope:
- Replacing existing config.
- Preserving comments.
- Creating directories.
- Validating product files.

Done when:
- Minimal valid `init` writes exact canonical YAML.
- Existing `anchormap.yaml` causes exit `4` and byte-identical file.
- Missing required directories cause exit `4` and no file write.
- Duplicate normalized roots cause exit `4`.
- Option order does not change output bytes.
- `fx54` through `fx58a` pass.

Suggested verification:
- Run B-init fixtures.
- Run mutation oracle on all failing `init` fixtures.

### T4.7 — Wire config errors into `scan` and `map` stubs

Purpose:
- Ensure config loading failures are observable through commands before full scan/map logic exists.

Contract refs:
- `contract.md` — §12.1 Repository root and config
- `contract.md` — §12.3 Config failure classification
- `contract.md` — §13.1 Machine contract for `scan --json`
- `contract.md` — §13.8 Exit codes

Design refs:
- `design.md` — §4.1 Pipeline logical de `scan`
- `design.md` — §4.2 Pipeline logical de `map`
- `design.md` — §5.6 `commands`
- `design.md` — §9.4 Classification by command

Eval refs:
- `evals.md` — `fx43_config_missing_file`
- `evals.md` — `fx67a_map_config_missing_or_invalid_code2`
- `evals.md` — `fx71b_cli_scan_human_config_error_code2`
- `evals.md` — Gate C

Operating-model refs:
- `operating-model.md` — §12 Stratégie d'implémentation
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T2.5.
- T4.1.
- T4.2.
- T4.3.

Implementation scope:
- Integrate `config_io.loadConfig` into `scan` and `map` command stubs.
- Return code `2` for absent or invalid `anchormap.yaml`.
- Ensure `scan --json` config error has empty stdout.
- Ensure `map` config error preserves absent or byte-identical config and leaves no temp file.

Out of scope:
- Full scan output.
- Map anchor/seed validation.
- Spec or product analysis.

Done when:
- `scan --json` with missing config exits `2` and stdout is empty.
- `scan` without `--json` with missing config exits `2` and does not mutate files.
- `map` with invalid config exits `2` and preserves config bytes.
- `fx43_config_missing_file`, `fx67a_map_config_missing_or_invalid_code2`, and `fx71b_cli_scan_human_config_error_code2` pass for config-covered cases.

Suggested verification:
- Run B-config missing/invalid fixtures.
- Run B-cli human scan config error fixture.
- Run B-map config error fixture.

## M5 — Spec index

### T5.1 — Implement spec file discovery and read failure classification

Purpose:
- Discover supported spec files under configured roots and classify read/decode failures as repository errors.

Contract refs:
- `contract.md` — §8 Anchor detection
- `contract.md` — §12.3 Discovery scope, readability and guardrails
- `contract.md` — §13.8 Exit codes

Design refs:
- `design.md` — §5.1 `repo_fs`
- `design.md` — §5.3 `spec_index`
- `design.md` — §7.1 File discovery
- `design.md` — §7.2 Spec indexing

Eval refs:
- `evals.md` — `fx22a_specs_markdown_unreadable`
- `evals.md` — `fx22b_specs_markdown_non_utf8`
- `evals.md` — `fx22d_specs_yaml_unreadable`
- `evals.md` — `fx22e_specs_yaml_non_utf8`
- `evals.md` — `fx42b_repo_spec_root_enumeration_failure`

Operating-model refs:
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T3.2.
- T3.6.
- T4.3.

Implementation scope:
- Walk each `spec_root` recursively.
- Filter files by `.md`, `.yml`, `.yaml`.
- Read through strict UTF-8/BOM boundary.
- Detect required spec-root enumeration failures.
- Detect symlinks, case collisions, and non-canonical paths in inspected spec subtrees if they are found during walk.
- Return `UnsupportedRepoError` for spec read/decode/discovery failures.

Out of scope:
- Parsing Markdown/YAML content.
- Product file discovery.
- Recursive scanning outside `spec_roots`.

Done when:
- Unreadable Markdown spec exits `3`.
- Non-UTF-8 Markdown spec exits `3`.
- Unreadable YAML spec exits `3`.
- Non-UTF-8 YAML spec exits `3`.
- Spec-root enumeration failure exits `3`.
- `scan --json` failure stdout is empty for these cases.

Suggested verification:
- Run relevant B-spec and B-repo fixtures.
- Run discovery unit tests with stable sorted output.

### T5.2 — Implement Markdown ATX anchor extraction

Purpose:
- Detect supported anchors only from CommonMark ATX headings.

Contract refs:
- `contract.md` — §1.1 `MARKDOWN_PROFILE`
- `contract.md` — §6.1 Anchor ID
- `contract.md` — §8.1 Markdown

Design refs:
- `design.md` — §5.3 `spec_index`
- `design.md` — §7.2 Spec indexing
- `design.md` — §10.1 Module tests

Eval refs:
- `evals.md` — `fx00b_decode_markdown_bom_success`
- `evals.md` — `fx00i_profile_markdown_commonmark_boundary`
- `evals.md` — `fx11_specs_markdown_atx_short_id`
- `evals.md` — `fx12_specs_markdown_atx_dotted_id`
- `evals.md` — `fx13_specs_markdown_suffix_rules`
- `evals.md` — `fx14_specs_markdown_setext_ignored`
- `evals.md` — `fx15_specs_markdown_anchor_not_prefix`
- `evals.md` — `fx22c_specs_markdown_bom_initial`

Operating-model refs:
- `operating-model.md` — §16 Politique de dépendances
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T3.1.
- T5.1.
- S1.

Implementation scope:
- Parse Markdown according to selected CommonMark 0.30-compatible behavior.
- Inspect only ATX headings levels 1 through 6.
- Build inline heading text according to contract:
  - text nodes literal text
  - code span literal text
  - soft/hard break as ASCII space
  - inline containers as child concatenation
  - HTML inline as empty string
- Trim ASCII spaces and collapse ASCII whitespace sequences.
- Detect supported anchor only at prefix followed by end, space, `:`, or `-`.

Out of scope:
- Setext headings.
- Prose scanning outside headings.
- Inferring anchors from text later in heading.

Done when:
- SHORT_ID and DOTTED_ID anchors in ATX headings are detected.
- Setext headings are ignored.
- Anchor not at prefix is ignored.
- Suffix rules match exactly.
- Markdown BOM initial fixture passes.
- Markdown parser dependency/version is documented or locked.

Suggested verification:
- Run Markdown spec fixtures.
- Run unit tests for inline text extraction cases.

### T5.3 — Implement YAML spec anchor extraction

Purpose:
- Detect anchors from root-level YAML `id` only and reject invalid YAML specs.

Contract refs:
- `contract.md` — §1.1 `YAML_PROFILE`
- `contract.md` — §6.1 Anchor ID
- `contract.md` — §8.2 YAML
- `contract.md` — §12.3 Discovery scope and YAML spec failures

Design refs:
- `design.md` — §5.3 `spec_index`
- `design.md` — §7.2 Spec indexing
- `design.md` — §10.1 Module tests

Eval refs:
- `evals.md` — `fx00c_decode_yaml_spec_bom_success`
- `evals.md` — `fx00g_decode_yaml_spec_non_utf8`
- `evals.md` — `fx00j_profile_yaml_1_2_2_boundary`
- `evals.md` — `fx16_specs_yaml_root_id`
- `evals.md` — `fx17_specs_yaml_nested_id_ignored`
- `evals.md` — `fx18_specs_yaml_valid_no_id`
- `evals.md` — `fx20_specs_yaml_invalid`
- `evals.md` — `fx21_specs_yaml_multidoc`
- `evals.md` — `fx22_specs_yaml_duplicate_keys`
- `evals.md` — `fx22f_specs_yaml_bom_initial`

Operating-model refs:
- `operating-model.md` — §16 Politique de dépendances
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T3.1.
- T5.1.
- S1.

Implementation scope:
- Parse `.yml` and `.yaml` specs as single-document YAML.
- Reject invalid YAML, multi-document YAML, and duplicate keys.
- If root is a mapping and exact root key `id` is a scalar string with valid anchor format, emit one occurrence.
- Ignore nested `id`.
- Ignore valid YAML with no root `id`.
- Return `UnsupportedRepoError` for invalid YAML spec inputs.

Out of scope:
- Interpreting title or other YAML fields.
- Reading config YAML through this code path unless shared parser is already abstracted.
- Accepting duplicate keys.

Done when:
- Root `id` detects anchor.
- Nested `id` is ignored.
- Valid YAML without `id` is ignored.
- Invalid/multidoc/duplicate-key YAML spec exits `3`.
- YAML spec BOM initial fixture passes.

Suggested verification:
- Run YAML spec fixtures.
- Run parser unit tests for duplicate keys and multidoc.

### T5.4 — Implement duplicate anchor detection and stable spec index ordering

Purpose:
- Produce a deterministic spec index and reject duplicate anchors.

Contract refs:
- `contract.md` — §8.3 Duplicates
- `contract.md` — §13.3 `observed_anchors`
- `contract.md` — §13.7 Canonical JSON serialization

Design refs:
- `design.md` — §5.3 `spec_index`
- `design.md` — §7.2 Spec indexing
- `design.md` — §10.1 Module tests

Eval refs:
- `evals.md` — `fx19_specs_duplicate_anchor`
- `evals.md` — §6.1 Mandatory JSON goldens
- `evals.md` — C1 filesystem order invariance
- `evals.md` — C3 spec noise invariance

Operating-model refs:
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T5.2.
- T5.3.

Implementation scope:
- Insert observed anchors into a deterministic map keyed by `AnchorId`.
- Reject duplicate anchor across all spec files with `UnsupportedRepoError`.
- Preserve `spec_path` as canonical `RepoPath`.
- Expose observed anchors in canonical key order to scan assembly.
- Ensure valid spec files without anchors do not affect the index.

Out of scope:
- Mapping state calculation.
- Findings generation.
- JSON rendering.

Done when:
- Duplicate anchor in two spec files exits `3`.
- Duplicate anchor within one spec file exits `3`.
- Observed anchors are sorted by anchor ID when projected.
- Adding valid spec noise without anchors does not change observed anchors.
- `fx19_specs_duplicate_anchor` passes.

Suggested verification:
- Run duplicate anchor fixture.
- Run spec index unit tests with permuted file order.

### T5.5 — Integrate spec index into `scan` and `map` preconditions

Purpose:
- Make spec indexing observable through command behavior before full graph/scan completion.

Contract refs:
- `contract.md` — §9.2.3 `map` rules
- `contract.md` — §9.3.3 What scan computes
- `contract.md` — §12.3 Read failure classification
- `contract.md` — §13.8 Exit codes

Design refs:
- `design.md` — §4.1 Pipeline logical de `scan`
- `design.md` — §4.2 Pipeline logical de `map`
- `design.md` — §5.3 `spec_index`
- `design.md` — §9.4 Classification by command

Eval refs:
- `evals.md` — `fx64_map_anchor_not_observed`
- `evals.md` — `fx67b_map_spec_read_or_decode_failure_code3`
- `evals.md` — `fx00m_map_decode_spec_non_utf8_no_mutation`
- `evals.md` — B-specs `fx11`–`fx22f`

Operating-model refs:
- `operating-model.md` — §12 Stratégie d'implémentation
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T4.7.
- T5.4.

Implementation scope:
- Call `buildSpecIndex` from `scan`.
- Call `buildSpecIndex` from `map` after config validation and replace guard.
- For `map`, reject anchor not present in current specs with exit `4`.
- Preserve `anchormap.yaml` on all spec-index failures during `map`.
- Keep spec findings out of YAML.

Out of scope:
- Full product graph validation.
- Full scan JSON assembly beyond observed anchors.
- Auto-creating mappings from observed anchors.

Done when:
- `map --anchor` absent from specs exits `4` and preserves config.
- Spec read/decode failure during `map` exits `3` and preserves config.
- `scan --json` spec failures exit `3` and stdout is empty.
- Stub-backed fixtures for `fx64`, `fx67b`, and `fx00m` pass with map validation boundaries supplied by test stubs.

Suggested verification:
- Run map anchor-not-observed and spec read/decode fixtures with stubs for later map validation.
- Run B-spec fixtures through `scan --json`.

## M6 — Product file discovery and TypeScript graph

### T6.1 — Implement product file discovery and repository guardrails

Purpose:
- Discover exactly the supported product files and reject inspected repository forms that are out of support.

Contract refs:
- `contract.md` — §5 Supported repositories
- `contract.md` — §6.5 Product file
- `contract.md` — §7.4 Config path invariants
- `contract.md` — §12.3 Discovery scope, readability and guardrails

Design refs:
- `design.md` — §5.1 `repo_fs`
- `design.md` — §5.4 `ts_graph`
- `design.md` — §7.1 File discovery
- `design.md` — §7.3 Product file discovery
- `design.md` — §12 Cross-platform considerations

Eval refs:
- `evals.md` — `fx39_repo_case_collision_in_scope`
- `evals.md` — `fx40_repo_symlink_in_scope`
- `evals.md` — `fx41_repo_noise_outside_scope_ignored`
- `evals.md` — `fx42a_repo_product_root_enumeration_failure`
- `evals.md` — `fx42c_repo_noncanonical_path_in_scope`
- `evals.md` — C1 filesystem order invariance

Operating-model refs:
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T3.2.
- T4.3.
- S3.

Implementation scope:
- Recursively walk `product_root`.
- Exclude `ignore_roots`.
- Retain only `.ts` files.
- Exclude `.d.ts`, `.tsx`, and `.js`.
- Detect symlinks in inspected trees.
- Detect case collisions in inspected trees.
- Detect non-canonical paths in scope.
- Ignore noise outside `product_root` and `spec_roots`.
- Return sorted `product_files`.

Out of scope:
- Reading product file contents.
- Parsing TypeScript.
- Supporting JavaScript, TSX, declaration files, aliases, or monorepo traversal.

Done when:
- Product discovery returns sorted canonical `.ts` files only.
- Files under `ignore_roots` are excluded.
- `.d.ts`, `.tsx`, and `.js` files are not product files.
- Symlink and case-collision fixtures exit `3`.
- Noise outside inspected roots does not change output.
- `fx39`, `fx40`, `fx41`, `fx42a`, and `fx42c` pass.

Suggested verification:
- Run B-repo fixtures.
- Run product discovery unit tests with permuted filesystem order.

### T6.2 — Implement TypeScript product file read/decode/parse validation

Purpose:
- Enforce the normative TypeScript parse boundary for all product files.

Contract refs:
- `contract.md` — §1.1 `TS_PROFILE`
- `contract.md` — §5.1 Supported form
- `contract.md` — §10.5 Parse failures
- `contract.md` — §12.3 Product file read failure classification

Design refs:
- `design.md` — §5.4 `ts_graph`
- `design.md` — §7.0 Normative reading and decoding
- `design.md` — §7.4 TypeScript graph construction
- `design.md` — §10.1 Module tests

Eval refs:
- `evals.md` — `fx00d_decode_product_bom_success`
- `evals.md` — `fx00h_decode_product_non_utf8`
- `evals.md` — `fx00k_profile_ts_5_4_boundary`
- `evals.md` — `fx00l_profile_ts_jsx_rejected_in_ts`
- `evals.md` — `fx37_graph_parse_failure`
- `evals.md` — `fx38a_graph_product_file_unreadable`
- `evals.md` — `fx38b_graph_product_file_non_utf8`
- `evals.md` — `fx38c_graph_product_file_bom_initial`
- `evals.md` — `fx38d_graph_ts_profile_jsx_rejected`

Operating-model refs:
- `operating-model.md` — §16 Politique de dépendances
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T3.6.
- T6.1.
- S1.

Implementation scope:
- Read every discovered product file through strict UTF-8/BOM boundary.
- Parse with TypeScript 5.4.0-compatible parser settings:
  - `ScriptKind.TS`
  - module goal
  - no JSX support
- Treat any syntax diagnostics as `UnsupportedRepoError`.
- Return parsed source files or extracted syntax input to graph builder.

Out of scope:
- Type checking.
- Resolving TypeScript project config.
- Accepting JSX in `.ts`.
- Supporting `.tsx`.

Done when:
- Product BOM initial fixture succeeds.
- Non-UTF-8 product file exits `3`.
- Unreadable product file exits `3`.
- TS syntax error exits `3`.
- JSX in `.ts` exits `3`.
- Parser dependency/version is pinned or locked.

Suggested verification:
- Run product decode and parse fixtures.
- Run parser unit tests over minimal valid and invalid `.ts`.

### T6.3 — Extract supported static imports/exports and ignore non-relative imports

Purpose:
- Identify only the supported TypeScript syntax forms that can create local edges.

Contract refs:
- `contract.md` — §5.3 Non-relative imports
- `contract.md` — §10.1 Supported syntax forms
- `contract.md` — §10.3 What does not produce a supported local dependency
- `contract.md` — §11.1 Findings types

Design refs:
- `design.md` — §5.4 `ts_graph`
- `design.md` — §7.4 TypeScript graph construction
- `design.md` — §10.1 Module tests

Eval refs:
- `evals.md` — `fx23_graph_import_relative_ts`
- `evals.md` — `fx24_graph_import_type`
- `evals.md` — `fx25_graph_import_side_effect`
- `evals.md` — `fx26_graph_reexport`
- `evals.md` — `fx34_graph_non_relative_import_ignored`
- `evals.md` — C5 external imports

Operating-model refs:
- `operating-model.md` — §11 Contrôle du scope
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T6.2.

Implementation scope:
- Extract `ImportDeclaration` with string-literal specifiers.
- Extract `ExportDeclaration` with string-literal specifiers.
- Include `import type`, side-effect imports, `export * from`, `export {}` from, and `export type {}` from.
- Treat relative specifiers as those starting with `./` or `../`, not empty, and not containing backslash.
- Ignore non-relative specifiers without finding or edge.

Out of scope:
- CommonJS `require`.
- Dynamic `import()`.
- Computed specifiers.
- Alias/baseUrl/path resolution.
- Type checking.

Done when:
- Supported import/export fixtures produce expected edge inputs.
- Non-relative import fixture produces no edge and no finding.
- Backslash-containing specifier is not treated as a v1.0 relative specifier and produces no supported edge and no finding.
- External import metamorphic test C5 has no graph effect.

Suggested verification:
- Run B-graph fixtures `fx23`–`fx26` and `fx34` after resolution integration.
- Run syntax extraction unit tests.

### T6.4 — Implement local candidate resolution and classification

Purpose:
- Convert supported local syntax occurrences into supported edges or graph findings.

Contract refs:
- `contract.md` — §5.4 Candidates outside repository root
- `contract.md` — §10.2 Candidates and classification order
- `contract.md` — §10.3 What does not produce a supported local dependency
- `contract.md` — §11 Findings

Design refs:
- `design.md` — §5.4 `ts_graph`
- `design.md` — §7.4 TypeScript graph construction
- `design.md` — §6.6 `Finding`

Eval refs:
- `evals.md` — `fx27_graph_resolution_ts_over_index`
- `evals.md` — `fx28_graph_resolution_index_fallback`
- `evals.md` — `fx29_graph_unresolved_static_edge`
- `evals.md` — `fx30_graph_out_of_scope_static_edge`
- `evals.md` — `fx31_graph_unsupported_local_target`
- `evals.md` — `fx38_graph_outside_repo_root_candidate`
- `evals.md` — `fx38e_graph_required_existence_test_failure`
- `evals.md` — C6 unsupported extension conversion

Operating-model refs:
- `operating-model.md` — §11 Contrôle du scope
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T3.2.
- T3.3.
- T6.3.

Implementation scope:
- Build candidate lists exactly for:
  - specifier ending `.ts` and not `.d.ts`
  - specifier ending `.tsx`, `.js`, `.d.ts`
  - extensionless specifier
  - unsupported explicit extension or trailing slash
- Apply classification order:
  1. first existing supported target under product root and outside ignore roots
  2. first existing out-of-scope target
  3. first existing unsupported local target
  4. unresolved
- Treat candidates outside repository root as nonexistent.
- Emit exact findings with exact fields.
- Perform required finite existence tests and classify test failures as `UnsupportedRepoError`.

Out of scope:
- Resolving aliases.
- Directory package resolution beyond `index.ts`.
- Multiple target reporting per occurrence.
- Runtime module resolution.

Done when:
- `<path>.ts` wins over `<path>/index.ts`.
- `<path>/index.ts` is used when `<path>.ts` is absent.
- Unsupported target fixture emits `unsupported_local_target`.
- Out-of-scope target fixture emits `out_of_scope_static_edge`.
- Unresolved fixture emits `unresolved_static_edge`.
- Outside-root candidate behaves as nonexistent.
- Existence-test failure exits `3`.

Suggested verification:
- Run B-graph resolution fixtures.
- Run unit tests for each candidate list and classification branch.

### T6.5 — Recognize unsupported local `require` and dynamic `import`

Purpose:
- Emit explicit degradation findings for local syntaxes recognized but unsupported.

Contract refs:
- `contract.md` — §10.4 Recognized but unsupported forms
- `contract.md` — §11.1 Findings types
- `contract.md` — §11.5 Effect on `analysis_health`

Design refs:
- `design.md` — §5.4 `ts_graph`
- `design.md` — §7.4 TypeScript graph construction
- `design.md` — §7.8 Calculate `analysis_health`

Eval refs:
- `evals.md` — `fx32_graph_require_local`
- `evals.md` — `fx33_graph_dynamic_import_local`
- `evals.md` — `fx09_scan_findings_canonical_order`

Operating-model refs:
- `operating-model.md` — §11 Contrôle du scope
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T6.2.
- T3.3.

Implementation scope:
- Recognize `require("./x")` with local relative string literal.
- Recognize `import("./x")` with local relative string literal.
- Emit `unsupported_static_edge` with `syntax_kind = require_call` or `dynamic_import`.
- Do not resolve candidates for these forms.
- Do not create supported graph edges for these forms.

Out of scope:
- Recognizing arbitrary dynamic or computed forms.
- Supporting CommonJS as a graph edge.
- Emitting findings for non-relative `require` or dynamic import.

Done when:
- Local `require("./x")` fixture emits one `unsupported_static_edge`.
- Local `import("./x")` fixture emits one `unsupported_static_edge`.
- These forms never add `supported_local_targets`.
- Non-relative variants do not produce local findings unless otherwise covered by contract.

Suggested verification:
- Run `fx32_graph_require_local` and `fx33_graph_dynamic_import_local`.
- Run graph extraction unit tests.

### T6.6 — Build normalized `ProductGraph`

Purpose:
- Return stable product graph data and graph findings for scan and map validation.

Contract refs:
- `contract.md` — §6.9 `supported_local_targets`
- `contract.md` — §10 Static local dependencies
- `contract.md` — §11.3 Finding uniqueness
- `contract.md` — §11.6 Canonical sorting

Design refs:
- `design.md` — §5.4 `ts_graph`
- `design.md` — §7.4 TypeScript graph construction
- `design.md` — §13 Complexity and budgets

Eval refs:
- `evals.md` — `fx35_graph_duplicate_findings_dedup`
- `evals.md` — `fx36_graph_cycle`
- `evals.md` — §6.1 Mandatory JSON goldens
- `evals.md` — C1 filesystem order invariance

Operating-model refs:
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T6.1.
- T6.2.
- T6.3.
- T6.4.
- T6.5.

Implementation scope:
- Build `ProductGraph` with:
  - sorted `productFiles`
  - `edgesByImporter` as sorted/deduplicated target sets
  - sorted/deduplicated `graphFindings`
- Preserve all product files in graph, including files with no outgoing supported targets.
- Ensure cycles are represented without recursion failure.
- Ensure duplicate syntax occurrences do not duplicate supported target entries.

Out of scope:
- Reachability calculation.
- Mapping validation.
- Scan output assembly.

Done when:
- Duplicate supported targets per importer appear once.
- Duplicate findings appear once.
- A synthetic cyclic graph input builds a finite `ProductGraph` without recursion failure.
- Graph output order is stable across permuted discovery order.
- Pure `ProductGraph` tests cover the duplicate-dedup and cycle cases required by `fx35` and `fx36`.

Suggested verification:
- Run graph unit tests.
- Run pure graph-boundary tests for duplicate findings and cyclic dependencies.

### T6.7 — Integrate product graph into `scan` and `map` validation path

Purpose:
- Make product discovery and graph validation observable through command behavior.

Contract refs:
- `contract.md` — §9.2.3 `map` rules
- `contract.md` — §9.3.3 What scan computes
- `contract.md` — §10.5 Parse failures
- `contract.md` — §12.3 Read failure classification
- `contract.md` — §13.8 Exit codes

Design refs:
- `design.md` — §4.1 Pipeline logical de `scan`
- `design.md` — §4.2 Pipeline logical de `map`
- `design.md` — §5.4 `ts_graph`
- `design.md` — §9.4 Classification by command

Eval refs:
- `evals.md` — `fx67c_map_product_read_decode_or_parse_failure_code3`
- `evals.md` — `fx67d_map_required_existence_test_failure_code3`
- `evals.md` — `fx00n_map_decode_product_non_utf8_no_mutation`
- `evals.md` — B-graph `fx23`–`fx38e`
- `evals.md` — B-repo `fx39`–`fx42c`

Operating-model refs:
- `operating-model.md` — §12 Stratégie d'implémentation
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T5.5.
- T6.6.

Implementation scope:
- Call `discoverProductFiles` and `buildProductGraph` from `scan`.
- Call them from `map` before commit to validate repository product files.
- Ensure graph findings do not affect `map` exit code.
- Ensure product read/decode/parse failures during `map` preserve config.
- Ensure `scan` product failures return `3` with empty stdout for `--json`.

Out of scope:
- Full scan reachability and coverage.
- Map YAML mutation.
- Emitting graph findings from `map`.

Done when:
- Product non-UTF-8 during `map` exits `3` and config is byte-identical.
- Product parse failure during `scan --json` exits `3` with empty stdout.
- Required existence test failure exits `3`.
- B-graph and B-repo error fixtures reach the correct command-level behavior.

Suggested verification:
- Run `fx67c`, `fx67d`, and product decode map fixtures.
- Run B-graph failure fixtures.

## M7 — Scan engine

### T7.1 — Implement scan orchestration without mutation

Purpose:
- Execute the full scan pipeline and guarantee that `scan` never writes.

Contract refs:
- `contract.md` — §3.1 Guarantees
- `contract.md` — §9.3 `anchormap scan`
- `contract.md` — §12.1 Repository root and config
- `contract.md` — §13.1 Machine contract for `scan --json`

Design refs:
- `design.md` — §4.1 Pipeline logical de `scan`
- `design.md` — §5.6 `commands`
- `design.md` — §5.7 `render`
- `design.md` — §9.4 Classification by command — `scan`

Eval refs:
- `evals.md` — §5.2 B-scan
- `evals.md` — `fx71a_cli_scan_human_success`
- `evals.md` — C12 no persistent cache and no writes by `scan`

Operating-model refs:
- `operating-model.md` — §12 Stratégie d'implémentation
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T4.7.
- T5.5.
- T6.7.

Implementation scope:
- Wire `scan` command to:
  - load config
  - build spec index
  - discover product files
  - build product graph
  - run scan engine
  - render JSON for `--json`
  - render non-contract human output for `scan`
- Verify no code path writes repository files.
- Preserve stdout/stderr behavior for `scan --json`.

Out of scope:
- Implementing scan-engine internals.
- Defining stable human output for `scan`.

Done when:
- With a stubbed successful `ScanResult`, `scan --json` writes only stdout.
- With a stubbed successful `ScanResult`, `scan --json` has empty stderr.
- With a stubbed successful `ScanResult`, human `scan` exits `0` and has no mutation.
- Scan orchestration tests prove no repository write path is called.
- Current scan orchestration fixtures use the mutation oracle.

Suggested verification:
- Run scan orchestration smoke fixtures with a stubbed successful `ScanResult`.
- Run mutation oracle on scan success and failure fixtures.

### T7.2 — Implement mapping state validation and mapping findings

Purpose:
- Classify stored mappings as `usable`, `invalid`, or `stale` and emit required findings.

Contract refs:
- `contract.md` — §6.6 Mapping exploitable
- `contract.md` — §6.11 Mapping states
- `contract.md` — §11.4 Finding emission rules
- `contract.md` — §13.3 `observed_anchors`
- `contract.md` — §13.4 `stored_mappings`

Design refs:
- `design.md` — §5.5 `scan_engine`
- `design.md` — §7.5 Mapping validation
- `design.md` — §6.5 Derived output views

Eval refs:
- `evals.md` — `fx01_scan_min_clean`
- `evals.md` — `fx03_scan_unmapped_anchor`
- `evals.md` — `fx04_scan_stale_mapping`
- `evals.md` — `fx05_scan_broken_seed`
- `evals.md` — `fx08_scan_no_untraced_without_usable_mapping`

Operating-model refs:
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T3.3.
- T3.4.
- T5.4.
- T6.1.

Implementation scope:
- For each stored mapping:
  - state `stale` if anchor not observed
  - state `invalid` if any seed missing or not admissible product file
  - state `usable` otherwise
- For stale mapping, emit exactly one `stale_mapping_anchor` and no `broken_seed_path`.
- For invalid mapping, emit `broken_seed_path` per invalid seed.
- For observed anchors, set `mapping_state` to `absent`, `usable`, or `invalid`.
- Set `reached_files` to `[]` for non-usable mappings.

Out of scope:
- Reachability traversal.
- `untraced_product_file`.
- Graph edge findings.

Done when:
- Usable mapping case has `observed_anchors.mapping_state = usable` and `stored_mappings.state = usable`.
- Unmapped anchor case emits `unmapped_anchor`.
- Stale mapping case emits exactly one `stale_mapping_anchor` as a degrading finding input.
- Broken seed case emits `broken_seed_path`.
- Stale mapping with bad seeds does not emit `broken_seed_path`.

Suggested verification:
- Run scan-engine pure unit tests for mapping states.
- Run fixture-shaped mapping-state cases for `fx01`, `fx03`, `fx04`, `fx05`, and `fx08` inputs.

### T7.3 — Implement deterministic reachability and coverage calculation

Purpose:
- Compute `reached_files` and `covering_anchor_ids` from usable mappings and supported graph edges.

Contract refs:
- `contract.md` — §6.7 `reached_files`
- `contract.md` — §6.8 `covering_anchor_ids`
- `contract.md` — §9.3.4 Mapping contribution
- `contract.md` — §9.3.5 Calculation of reached files and covering anchors
- `contract.md` — §13.4 `stored_mappings`
- `contract.md` — §13.5 `files`

Design refs:
- `design.md` — §5.5 `scan_engine`
- `design.md` — §7.6 Closure calculation
- `design.md` — §13 Complexity and budgets

Eval refs:
- `evals.md` — `fx01_scan_min_clean`
- `evals.md` — `fx02_scan_two_anchors_overlap`
- `evals.md` — `fx06_scan_clean_untraced`
- `evals.md` — `fx23_graph_import_relative_ts`
- `evals.md` — `fx36_graph_cycle`

Operating-model refs:
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T7.2.
- T6.6.

Implementation scope:
- For each usable mapping, traverse from sorted seed files.
- Follow only `supported_local_targets`.
- Stay within discovered product files.
- Use deterministic BFS as specified by design.
- Include seed files in `reached_files`.
- Sort final `reached_files`.
- Accumulate and sort `covering_anchor_ids` per file.
- Handle cycles without infinite loops.

Out of scope:
- Runtime reachability.
- Symbol-level analysis.
- Call graph.

Done when:
- Minimal clean scan reaches seed file.
- Overlapping anchor fixture has sorted covering anchor IDs.
- Cycle fixture terminates and emits stable closure.
- Non-usable mappings contribute no reached files or coverage.
- `stored_mappings[*].reached_files` and `files[*].covering_anchor_ids` are sorted.

Suggested verification:
- Run pure scan-engine closure unit tests.
- Run B-scan `fx01`, `fx02`, `fx06`, and B-graph cycle fixture.

### T7.4 — Implement business findings and `analysis_health`

Purpose:
- Produce final scan findings and health exactly as contracted.

Contract refs:
- `contract.md` — §6.10 `analysis_health`
- `contract.md` — §9.3.6 Rule on `untraced_product_file`
- `contract.md` — §11 Findings
- `contract.md` — §13.6 `findings`

Design refs:
- `design.md` — §5.5 `scan_engine`
- `design.md` — §7.7 Business findings
- `design.md` — §7.8 Calculate `analysis_health`

Eval refs:
- `evals.md` — `fx03_scan_unmapped_anchor`
- `evals.md` — `fx06_scan_clean_untraced`
- `evals.md` — `fx06a_scan_unmapped_anchor_suppresses_untraced`
- `evals.md` — `fx07_scan_degraded_suppresses_untraced`
- `evals.md` — `fx08_scan_no_untraced_without_usable_mapping`
- `evals.md` — `fx09_scan_findings_canonical_order`

Operating-model refs:
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T3.3.
- T3.4.
- T7.2.
- T7.3.
- T6.6.

Implementation scope:
- Merge mapping findings and graph findings.
- Add `unmapped_anchor` for observed anchors with absent mapping.
- Add `untraced_product_file` only when:
  - final analysis is otherwise clean
  - at least one usable mapping exists
  - all observed anchors have usable mappings
  - product file has empty coverage
- Suppress `untraced_product_file` on degraded analysis.
- Deduplicate and sort final findings.
- Compute `analysis_health` from final findings.

Out of scope:
- Adding any dead-code wording.
- Emitting untraced findings when unmapped anchors exist.
- Emitting health signals not backed by contracted findings.

Done when:
- Unmapped anchor does not degrade `analysis_health`.
- Stale/broken/graph degradation findings set `analysis_health = degraded`.
- Clean untraced fixture emits exact `untraced_product_file`.
- Unmapped anchor suppresses untraced.
- Degraded analysis suppresses untraced.
- Findings are sorted and key-ordered by renderer.

Suggested verification:
- Run B-scan fixtures `fx03`, `fx06`, `fx06a`, `fx07`, `fx08`, `fx09`.
- Run pure unit tests for each untraced precondition.

### T7.5 — Assemble exact scan JSON output

Purpose:
- Project `ScanResult` into the exact JSON schema and canonical byte output.

Contract refs:
- `contract.md` — §13.2 Exact success schema
- `contract.md` — §13.3 `observed_anchors`
- `contract.md` — §13.4 `stored_mappings`
- `contract.md` — §13.5 `files`
- `contract.md` — §13.6 `findings`
- `contract.md` — §13.7 Exact canonical JSON serialization

Design refs:
- `design.md` — §5.5 `scan_engine`
- `design.md` — §5.7 `render`
- `design.md` — §6.5 Derived output views

Eval refs:
- `evals.md` — §6.1 Mandatory JSON goldens
- `evals.md` — `fx01_scan_min_clean`
- `evals.md` — `fx02_scan_two_anchors_overlap`
- `evals.md` — `fx09_scan_findings_canonical_order`
- `evals.md` — `fx10_scan_closed_objects`
- `evals.md` — Gate B

Operating-model refs:
- `operating-model.md` — §15 Gestion des fixtures et goldens
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T3.5.
- T7.4.

Implementation scope:
- Build root object with exact keys and values.
- Include `config.ignore_roots` as `[]` when absent/empty.
- Include all `observed_anchors`, `stored_mappings`, and `files`, including empty maps.
- Include all product files, including files with no targets or coverage.
- Ensure no extra keys appear.
- Render with canonical JSON renderer.

Out of scope:
- Human output formatting.
- Semantic JSON comparison.
- Adding version fields outside `schema_version`.

Done when:
- Minimal clean golden passes byte-for-byte.
- Closed object fixture detects no extra fields.
- Key and collection order fixture passes.
- All successful `scan --json` fixtures use exact stdout golden and empty stderr.

Suggested verification:
- Run B-scan success fixtures.
- Run JSON schema closed-object tests.

### T7.6 — Implement scan failure behavior and human scan modes

Purpose:
- Ensure scan error paths and human mode observe only contracted behavior.

Contract refs:
- `contract.md` — §3.3 Human terminal outputs out of contract
- `contract.md` — §9.3.7 Output
- `contract.md` — §13.1 Machine contract for `scan --json`
- `contract.md` — §13.8 Exit codes
- `contract.md` — §13.9 Exit-code priority

Design refs:
- `design.md` — §5.6 `commands`
- `design.md` — §5.7 `render`
- `design.md` — §9.4 Classification by command — `scan`
- `design.md` — §9.6 `scan --json`

Eval refs:
- `evals.md` — `fx71b_cli_scan_human_config_error_code2`
- `evals.md` — `fx71c_cli_scan_human_repo_error_code3`
- `evals.md` — `fx71d_cli_scan_human_invalid_args_code4`
- `evals.md` — `fx71e_cli_scan_human_internal_error_code1`
- `evals.md` — B-config/spec/graph/repo failure fixtures
- `evals.md` — Gate C

Operating-model refs:
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T2.5.
- T7.1.
- T7.5.

Implementation scope:
- For `scan --json` failures, write empty stdout and optional stderr.
- For `scan` without `--json`, return exact code and no mutation; do not oracle human text.
- Preserve priority `4 > 2 > 3 > 1`.
- Use internal error injection path for code `1` fixtures if needed.

Out of scope:
- Stable human output.
- Changing error diagnostics to satisfy fixtures.
- Recovering from unsupported repo failures.

Done when:
- Human scan success fixture exits `0`.
- Human scan config/repo/invalid/internal fixtures exit `2`, `3`, `4`, `1` respectively.
- `scan --json` failures across config/spec/graph/repo have empty stdout.
- No scan failure mutates repository files.

Suggested verification:
- Run B-cli human scan fixtures.
- Run all B-config, B-specs, B-graph, and B-repo failure fixtures.

### T7.7 — Complete B-scan fixture family and JSON goldens

Purpose:
- Close scan coverage against all essential schema states.

Contract refs:
- `contract.md` — §6 Truth model
- `contract.md` — §9.3 `scan`
- `contract.md` — §11 Findings
- `contract.md` — §13 JSON and exit codes

Design refs:
- `design.md` — §5.5 `scan_engine`
- `design.md` — §5.7 `render`
- `design.md` — §10.2 Boundary tests

Eval refs:
- `evals.md` — B-scan `fx01`–`fx10`
- `evals.md` — §6.1 Mandatory JSON goldens
- `evals.md` — Gate A
- `evals.md` — Gate B

Operating-model refs:
- `operating-model.md` — §15 Gestion des fixtures et goldens
- `operating-model.md` — §19.2 Jalon

Dependencies:
- T7.1.
- T7.2.
- T7.3.
- T7.4.
- T7.5.
- T7.6.

Implementation scope:
- Author or complete manifests and goldens for `fx01` through `fx10`.
- Ensure each fixture asserts:
  - exit code
  - stdout golden for success
  - empty stderr for `scan --json` success
  - no mutation
- Cover essential states listed in `evals.md` §5.2.
- Keep fixture inputs minimal and contract-focused.

Out of scope:
- Expanding scan coverage beyond required fixtures unless fixing a confirmed regression.
- Updating goldens without classification.

Done when:
- `fx01` through `fx10` pass.
- Every B-scan success fixture has versioned exact JSON golden.
- Golden outputs contain no extra keys.
- B-scan fixtures cover all essential schema states listed in `evals.md` §5.2.

Suggested verification:
- Run fixture family `B-scan`.
- Run golden checker.
- Run closed-object validation over all scan goldens.

## M8 — Map command

### T8.1 — Implement raw map argument semantic validation

Purpose:
- Enforce `map` argument semantics that require no config or repository I/O.

Contract refs:
- `contract.md` — §6.1 Anchor ID
- `contract.md` — §9.2.2 `map` supported form
- `contract.md` — §9.2.3 `map` rules
- `contract.md` — §12.2.2 User path argument normalization
- `contract.md` — §13.8 Exit codes

Design refs:
- `design.md` — §4.2 Pipeline logical de `map`
- `design.md` — §5.6 `commands`
- `design.md` — §9.4 Classification by command — `map`

Eval refs:
- `evals.md` — `fx63_map_invalid_anchor_argument`
- `evals.md` — `fx65_map_invalid_seed` raw seed-shape cases
- `evals.md` — `fx66_map_duplicate_seed_argument`
- `evals.md` — `fx67_map_option_order_invariant`
- `evals.md` — Gate C

Operating-model refs:
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T2.4.
- T3.1.
- T3.2.

Implementation scope:
- Validate anchor format.
- Normalize every seed path as a CLI user path argument.
- Reject duplicate seeds after normalization.
- Reject seed paths that cannot be converted into a valid `RepoPath` argument, including empty, absolute, backslash-containing, control-character, dot, and dot-dot paths.
- Reject unsupported `map` option shapes before any config or repository access.

Out of scope:
- Loading config.
- Checking `product_root` or `ignore_roots`.
- Checking seed existence or membership in discovered product files.
- Checking anchor existence in specs.
- Discovering product files.
- Writing YAML.

Done when:
- Invalid anchor exits `4` and does not read or write `anchormap.yaml`.
- Duplicate normalized seeds exit `4` and do not read or write `anchormap.yaml`.
- Invalid raw seed path exits `4` and does not read or write `anchormap.yaml`.
- Equivalent valid argument orderings produce the same normalized command model.
- No repository or config I/O occurs if raw arguments already determine exit `4`.

Suggested verification:
- Run raw map argument fixtures.
- Run parser/semantic unit tests for seed normalization and option-order normalization.
- Use test instrumentation to prove config and repository readers are not invoked on raw argument failure.

### T8.2 — Enforce map config load, seed preconditions, and replace guard priority

Purpose:
- Apply config validation and all config-dependent map preconditions before spec indexing, product discovery, or product graph analysis.

Contract refs:
- `contract.md` — §6.4 Seed file
- `contract.md` — §6.5 Product file
- `contract.md` — §7 `anchormap.yaml`
- `contract.md` — §9.2.3 `map` rules
- `contract.md` — §9.2.4 `map` observable effect
- `contract.md` — §12.3 Config failure classification and repository read failures
- `contract.md` — §13.9 Exit-code priority

Design refs:
- `design.md` — §4.2 Pipeline logical de `map`
- `design.md` — §5.2 `config_io`
- `design.md` — §5.6 `commands`
- `design.md` — §9.4 Classification by command — `map`

Eval refs:
- `evals.md` — `fx60_map_replace_guard`
- `evals.md` — `fx65_map_invalid_seed` config-dependent and existence cases
- `evals.md` — `fx67a_map_config_missing_or_invalid_code2`
- `evals.md` — `fx67d_map_required_existence_test_failure_code3`
- `evals.md` — `fx72_cli_priority_4_over_2`
- `evals.md` — Gate C

Operating-model refs:
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T4.7.
- T8.1.

Implementation scope:
- Load and validate config after raw argument validation.
- If config is missing/invalid and raw arguments are otherwise valid, return `2`.
- If mapping exists and `--replace` is absent, return `4`.
- Validate every normalized seed against the loaded config before spec indexing:
  - seed must be lexically under `product_root`;
  - seed must be outside `ignore_roots`;
  - seed must have admissible product-file shape: `.ts`, not `.d.ts`, not `.tsx`, not `.js`;
  - seed must exist as a file through a bounded point existence test.
- Return `4` for seed absence or config-decidable seed precondition failure.
- Return `3` if a required bounded existence test cannot be performed.
- Ensure replace-guard and seed-precondition failures occur before spec indexing, product discovery, product graph build, or YAML write.
- Preserve config on every failure.

Out of scope:
- Anchor existence validation against current specs.
- Discovery-set membership validation for product files.
- YAML rewriting.

Done when:
- Existing mapping without `--replace` exits `4`.
- Replace guard failure does not index specs, discover product files, build the product graph, or write YAML.
- Missing/invalid config exits `2` when raw arguments are valid.
- Seed outside `product_root`, under `ignore_roots`, inadmissible by product-file shape, absent, or not a file exits `4`.
- Required seed existence-test failure exits `3`.
- Seed-precondition failure does not index specs, discover product files, build the product graph, or write YAML.
- `anchormap.yaml` is byte-identical on all failures.
- `fx60_map_replace_guard`, `fx65_map_invalid_seed`, `fx67a_map_config_missing_or_invalid_code2`, and `fx67d_map_required_existence_test_failure_code3` pass for the cases owned by this task.

Suggested verification:
- Run B-map replace/config/seed-precondition fixtures.
- Use test instrumentation to prove spec indexing and product graph are not invoked on replace guard or seed-precondition failure.
- Run mutation oracle over all T8.2 failure fixtures.

### T8.3 — Validate map anchor and discovered product-file membership before commit

Purpose:
- Ensure `map` writes only mappings valid against current observed anchors and discovered product files.

Contract refs:
- `contract.md` — §6.4 Seed file
- `contract.md` — §6.5 Product file
- `contract.md` — §9.2.3 `map` rules
- `contract.md` — §10.5 Parse failures
- `contract.md` — §12.3 Read failure classification
- `contract.md` — §13.9 Exit-code priority

Design refs:
- `design.md` — §4.2 Pipeline logical de `map`
- `design.md` — §7.5 Mapping validation
- `design.md` — §9.4 Classification by command — `map`
- `design.md` — §10.2 Boundary tests

Eval refs:
- `evals.md` — `fx64_map_anchor_not_observed`
- `evals.md` — `fx65_map_invalid_seed` discovery-membership cases
- `evals.md` — `fx67b_map_spec_read_or_decode_failure_code3`
- `evals.md` — `fx67c_map_product_read_decode_or_parse_failure_code3`
- `evals.md` — `fx00m_map_decode_spec_non_utf8_no_mutation`
- `evals.md` — `fx00n_map_decode_product_non_utf8_no_mutation`

Operating-model refs:
- `operating-model.md` — §12 Stratégie d'implémentation
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T5.5.
- T6.7.
- T8.2.

Implementation scope:
- Build current spec index only after T8.2 preconditions have passed.
- Reject provided anchor if absent from current specs with exit `4`.
- Discover product files.
- Reject any seed that is not present in the discovered product-file set with exit `4`.
- Build product graph before commit to force product read/decode/parse and required existence checks.
- On spec/product repository failures, exit `3` and preserve config.
- Ignore graph findings for map output and YAML.

Out of scope:
- Raw or config-dependent seed preconditions owned by T8.1 and T8.2.
- Emitting scan JSON.
- Persisting graph findings.
- Auto-suggesting seeds.

Done when:
- Anchor absent exits `4` and config unchanged.
- Seed absent from the discovered product-file set exits `4` and config unchanged.
- Spec read/decode failure exits `3` and config unchanged.
- Product read/decode/parse failure exits `3` and config unchanged.
- No map failure leaves temp files.
- Spec indexing is not invoked for a seed precondition failure already owned by T8.2.

Suggested verification:
- Run B-map validation fixtures `fx64`, `fx65`, `fx67b`, and `fx67c`.
- Run decode map fixtures `fx00m`, `fx00n`.
- Use test instrumentation to prove T8.2 precondition failures prevent spec indexing.

### T8.4 — Implement map create and replace YAML mutation

Purpose:
- Persist the explicit human mapping exactly and canonically.

Contract refs:
- `contract.md` — §6.3 Mapping
- `contract.md` — §7.5 Exact canonical writing
- `contract.md` — §9.2 `anchormap map`
- `contract.md` — §12.5 Stable outputs

Design refs:
- `design.md` — §4.2 Pipeline logical de `map`
- `design.md` — §5.2 `config_io`
- `design.md` — §8 Single bounded atomic write path
- `design.md` — §9.4 Classification by command — `map`

Eval refs:
- `evals.md` — `fx59_map_create`
- `evals.md` — `fx61_map_replace_ok`
- `evals.md` — `fx62_map_replace_create_if_absent`
- `evals.md` — §6.2 Mandatory YAML goldens

Operating-model refs:
- `operating-model.md` — §15 Gestion des fixtures et goldens
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T8.3.
- T4.5.

Implementation scope:
- If mapping absent, create `mappings[anchor]`.
- If mapping exists and `--replace` is present, replace exactly that mapping.
- If `--replace` is present and mapping absent, create it.
- Sort seed files canonically in rendered YAML.
- Preserve other mappings semantically, allowing canonical reorder.
- Write only through `config_io.writeConfigAtomic`.

Out of scope:
- Deleting mappings.
- Appending duplicate seeds.
- Preserving user comments or formatting.
- Running scan after write.

Done when:
- Valid map create writes exact YAML golden.
- Valid map replace writes exact YAML golden.
- `--replace` with absent mapping creates mapping.
- No derived data is written to YAML.
- Other mappings remain semantically identical.
- `fx59`, `fx61`, and `fx62` pass.

Suggested verification:
- Run B-map success fixtures.
- Run YAML golden checker.

### T8.5 — Enforce map failure non-mutation and atomic-write failure behavior

Purpose:
- Close all failure paths for `map` so config state is preserved.

Contract refs:
- `contract.md` — §3.1 Guarantees
- `contract.md` — §9 Commands, common writing rule
- `contract.md` — §9.2.4 `map` observable effect
- `contract.md` — §13.8 Exit codes

Design refs:
- `design.md` — §8 Single bounded atomic write path
- `design.md` — §9.5 Writing command rule
- `design.md` — §10.2 Boundary tests

Eval refs:
- `evals.md` — `fx60_map_replace_guard`
- `evals.md` — `fx63_map_invalid_anchor_argument`
- `evals.md` — `fx64_map_anchor_not_observed`
- `evals.md` — `fx65_map_invalid_seed`
- `evals.md` — `fx66_map_duplicate_seed_argument`
- `evals.md` — `fx67a`–`fx67d`
- `evals.md` — `fx76_cli_write_failure_code_1`
- `evals.md` — `fx00o_map_decode_config_non_utf8_no_mutation`

Operating-model refs:
- `operating-model.md` — §15 Gestion des fixtures et goldens
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T8.1.
- T8.2.
- T8.3.
- T8.4.
- T4.5.
- S2.

Implementation scope:
- Verify every non-zero `map` outcome leaves `anchormap.yaml` byte-identical or absent as initially observed.
- Verify no temp/auxiliary AnchorMap file remains after failure.
- Exercise write failure injection for `map`.
- Preserve code priority across argument, config, repo, write, and internal failures.

Out of scope:
- Changing diagnostics wording.
- Best-effort partial writes.
- Recovering by rewriting config after a failed precondition.

Done when:
- All `map` failure fixtures assert no mutation and pass.
- Write failure during map exits `1`, leaves initial config unchanged, and leaves no temp file.
- Config non-UTF-8 during map exits `2` and config bytes unchanged.
- Product/spec non-UTF-8 during map exits `3` and config bytes unchanged.

Suggested verification:
- Run all B-map failure fixtures.
- Run write fault-injection fixture for map.
- Run fixture mutation oracle in strict mode.

### T8.6 — Complete B-map fixture family and YAML goldens

Purpose:
- Close `map` command fixture coverage against `evals.md`.

Contract refs:
- `contract.md` — §7 `anchormap.yaml`
- `contract.md` — §9.2 `anchormap map`
- `contract.md` — §13.8 Exit codes
- `contract.md` — §13.9 Exit-code priority

Design refs:
- `design.md` — §4.2 Pipeline logical de `map`
- `design.md` — §8 Single bounded atomic write path
- `design.md` — §10.2 Boundary tests

Eval refs:
- `evals.md` — B-map `fx59`–`fx67d`
- `evals.md` — §6.2 Mandatory YAML goldens
- `evals.md` — Gate A
- `evals.md` — Gate C

Operating-model refs:
- `operating-model.md` — §15 Gestion des fixtures et goldens
- `operating-model.md` — §19.2 Jalon

Dependencies:
- T8.1.
- T8.2.
- T8.3.
- T8.4.
- T8.5.

Implementation scope:
- Author or complete manifests and goldens for `fx59` through `fx67d`.
- Ensure every success fixture has exact YAML golden.
- Ensure every failure fixture asserts no mutation and no residual temp files.
- Ensure option-order fixture checks byte-identical final YAML where applicable.

Out of scope:
- Adding delete or list mapping commands.
- Adding auto-suggested mappings.
- Weakening YAML exactness.

Done when:
- `fx59` through `fx67d` pass.
- Every successful map fixture has a versioned YAML golden.
- Every failed map fixture proves initial config byte identity.
- B-map contributes to release Gate A and release Gate C.

Suggested verification:
- Run fixture family `B-map`.
- Run YAML golden checker.
- Run mutation oracle across all B-map fixtures.

## M9 — Cross-platform, determinism, performance and release gates

### T9.1 — Implement metamorphic tests C1 through C6

Purpose:
- Verify deterministic invariants under controlled input transformations.

Contract refs:
- `contract.md` — §4.1 Determinism
- `contract.md` — §4.7 Canonical order and comparison
- `contract.md` — §5.3 Non-relative imports
- `contract.md` — §7.5 Exact canonical YAML writing
- `contract.md` — §9.3.6 Rule on `untraced_product_file`
- `contract.md` — §10 Static local dependencies

Design refs:
- `design.md` — §10.2 Boundary tests
- `design.md` — §12 Cross-platform considerations
- `design.md` — §13 Complexity and budgets

Eval refs:
- `evals.md` — C1 filesystem order invariance
- `evals.md` — C2 YAML editorial reorder invariance
- `evals.md` — C3 spec noise invariance
- `evals.md` — C4 seed movement
- `evals.md` — C5 external import addition
- `evals.md` — C6 unsupported extension conversion
- `evals.md` — Gate D

Operating-model refs:
- `operating-model.md` — §19.2 Jalon

Dependencies:
- M7 done.
- M8 done for YAML-write metamorphic checks.

Implementation scope:
- Add test generators or paired fixtures for C1–C6.
- Compare scan stdout byte-for-byte where expected.
- Compare YAML output byte-for-byte for `init`/`map` where expected.
- Assert exact expected changes for C4 and C6.
- Keep transformations within v1.0 scope.

Out of scope:
- Random fuzzing as a release gate.
- Testing unsupported languages or aliases.
- Adding product behavior to satisfy metamorphic tests.

Done when:
- C1 through C6 pass.
- Each metamorphic test reports baseline fixture, transformed fixture, and oracle.
- Expected-no-change cases compare bytes exactly.
- Expected-change cases assert only the contracted differences.

Suggested verification:
- Run metamorphic suite subset C1–C6.
- Re-run with different filesystem enumeration order if the harness supports it.

### T9.2 — Implement determinism and isolation tests C7 through C12

Purpose:
- Verify repeatability and absence of hidden sources of truth.

Contract refs:
- `contract.md` — §4.1 Determinism
- `contract.md` — §12.5 Stable outputs
- `contract.md` — §12.6 No implicit data
- `contract.md` — §13.7 Exact canonical JSON serialization

Design refs:
- `design.md` — §2 Design constraints
- `design.md` — §10.2 Boundary tests
- `design.md` — §11 Dependencies and reproducibility
- `design.md` — §12 Cross-platform considerations

Eval refs:
- `evals.md` — C7 deterministic reruns
- `evals.md` — C8 locale independence
- `evals.md` — C9 Git independence
- `evals.md` — C10 time and timezone independence
- `evals.md` — C11 no network/environment source of truth
- `evals.md` — C12 no persistent cache and no writes by `scan`
- `evals.md` — Gate D

Operating-model refs:
- `operating-model.md` — §19.2 Jalon

Dependencies:
- T9.1.

Implementation scope:
- Run 20 process-isolated reruns for each successful `scan --json` fixture.
- Run representative corpus under required locales.
- Run with and without Git metadata.
- Run under different time/timezone settings where harness supports it.
- Run with network blocked or test environment proving no network is required.
- Run with non-contract environment variables changed.
- Monitor repository and cache-sandbox mutation for `scan`.

Out of scope:
- Depending on live network state.
- Using real clock data as an oracle.
- Adding persistent cache.

Done when:
- C7 through C12 pass.
- Rerun outputs are byte-identical.
- Locale changes do not alter order or bytes.
- Git metadata changes do not alter output.
- Time/timezone changes do not alter output.
- No scan creates repository files or required persistent cache.

Suggested verification:
- Run metamorphic/isolation suite C7–C12.
- Inspect mutation reports for C12.

### T9.3 — Execute supported cross-platform matrix

Purpose:
- Prove release behavior on the exact v1.0 supported platforms.

Contract refs:
- `contract.md` — §12.4 Supported platforms
- `contract.md` — §12.5 Stable outputs
- `contract.md` — §4.1 Determinism

Design refs:
- `design.md` — §12 Cross-platform considerations
- `design.md` — §11 Dependencies and reproducibility
- `design.md` — §8 Single bounded atomic write path

Eval refs:
- `evals.md` — §9 Cross-platform matrix
- `evals.md` — Gate E — Cross-platform
- `evals.md` — §12 Technical publication checklist

Operating-model refs:
- `operating-model.md` — §19.3 Release candidate

Dependencies:
- T9.2.
- S2.
- S3.

Implementation scope:
- Run required suite on Linux x86_64.
- Run required suite on macOS arm64.
- Re-run or confirm the atomic write cleanup and rename-boundary probe on native Linux x86_64.
- Compare JSON and YAML goldens byte-for-byte to versioned references.
- Archive platform-specific reports.
- Fail release on any divergence in sort order, paths, newline, encoding, mutation, or exit code.

Out of scope:
- Claiming Windows support.
- Adjusting contract for platform-specific behavior.
- Accepting separate platform goldens.

Done when:
- 100% of Level B fixtures pass on Linux x86_64.
- 100% of Level B fixtures pass on macOS arm64.
- 100% of C1–C12 pass on both platforms.
- Native Linux x86_64 atomic write cleanup and rename-boundary evidence is recorded.
- Golden bytes are identical across supported platforms.
- Cross-platform reports are archived.

Suggested verification:
- Run platform CI matrix or equivalent controlled platform jobs.
- Compare report artifact checksums.

### T9.4 — Implement release performance benchmarks

Purpose:
- Validate v1.0 performance and resource budgets without changing product behavior.

Contract refs:
- `contract.md` — §4.1 Determinism
- `contract.md` — §12.6 No implicit data

Design refs:
- `design.md` — §13 Complexity and budgets
- `design.md` — §11 Dependencies and reproducibility

Eval refs:
- `evals.md` — §10 Performance and resources
- `evals.md` — Gate F — Performance
- `evals.md` — §12 Technical publication checklist

Operating-model refs:
- `operating-model.md` — §19.3 Release candidate

Dependencies:
- T9.2.
- S5.

Implementation scope:
- Create versioned benchmark corpora:
  - `small`: 200 product files, 50 anchors, 1,500 supported edges
  - `medium`: 1,000 product files, 200 anchors, 8,000 supported edges
  - `large`: 5,000 product files, 500 anchors, 40,000 supported edges, informational only
- Measure release build with:
  - 5 warm-up runs
  - 30 measured process-separated runs
  - wall-clock p95
  - peak RSS
  - documented reference machine per supported platform
- Archive benchmark reports.

Out of scope:
- Optimizations that change observable output.
- Making `large` a release gate.
- Using instrumentation that changes CLI behavior.

Done when:
- `small` p95 <= 400 ms and RSS <= 120 MiB.
- `medium` p95 <= 2.0 s and RSS <= 300 MiB.
- `large` benchmark is executed and archived but excluded from pass/fail.
- Measurement protocol is documented in the report.
- release Gate F can be evaluated from artifacts.

Suggested verification:
- Run benchmark command on release build.
- Inspect report for warm-up count, measured count, p95, RSS, platform, and corpus version.

### T9.5 — Implement dependency pinning and reproducibility audit

Purpose:
- Ensure published behavior depends on locked structural dependencies.

Contract refs:
- `contract.md` — §1.1 Normative grammar profiles
- `contract.md` — §4.1 Determinism
- `contract.md` — §12.6 No implicit data

Design refs:
- `design.md` — §11 Dependencies and reproducibility
- `design.md` — §2 Design constraints

Eval refs:
- `evals.md` — §4.6 Level F — Release reproducibility audit
- `evals.md` — Gate G — Release reproducibility
- `evals.md` — §12 Technical publication checklist

Operating-model refs:
- `operating-model.md` — §16 Politique de dépendances
- `operating-model.md` — §19.3 Release candidate

Dependencies:
- S1.
- M1–M8 done.

Implementation scope:
- Pin or lock dependencies affecting:
  - Markdown parsing
  - YAML parsing
  - TypeScript parsing
  - filesystem enumeration
  - JSON serialization
  - YAML canonical writing
  - CLI parsing
  - fixture harness
- Reject floating semver ranges for contract-affecting dependencies in published build inputs.
- Verify lockfile presence and consistency.
- Verify versioned goldens correspond to release candidate.
- Archive dependency audit report.

Out of scope:
- Adding new parser dependencies after release gating without a spike.
- Runtime network dependency.
- Ignoring lockfile drift.

Done when:
- Audit fails if a contract-affecting dependency uses a floating range.
- Audit fails if lockfile is absent or out of sync.
- Audit reports exact parser versions used by the release candidate.
- release Gate G dependency checks pass.

Suggested verification:
- Run reproducibility audit script.
- Intentionally introduce a floating range in a branch and confirm audit fails.

### T9.6 — Implement release gate aggregator and publication checklist artifacts

Purpose:
- Produce a single release-candidate verdict from all required evals.

Contract refs:
- `contract.md` — §3.1 Guarantees
- `contract.md` — §12.4 Supported platforms
- `contract.md` — §13 JSON and exit codes

Design refs:
- `design.md` — §10 Testability
- `design.md` — §11 Dependencies and reproducibility
- `design.md` — §12 Cross-platform considerations
- `design.md` — §13 Complexity and budgets

Eval refs:
- `evals.md` — §11 Gates A–G
- `evals.md` — §12 Technical publication checklist
- `evals.md` — §7 Regression policy

Operating-model refs:
- `operating-model.md` — §19.3 Release candidate
- `operating-model.md` — §10 Taxonomie des écarts

Dependencies:
- T9.1.
- T9.2.
- T9.3.
- T9.4.
- T9.5.

Implementation scope:
- Aggregate results for:
  - Level B fixtures
  - JSON and YAML goldens
  - exit-code and priority fixtures
  - C1–C12
  - cross-platform matrix
  - performance `small` and `medium`
  - informational `large`
  - dependency audit
- Produce a release report with pass/fail per release Gate A through release Gate G.
- Archive:
  - fixture report
  - metamorphic report
  - cross-platform reports
  - performance reports
  - dependency audit
  - list of golden diffs with classification if any

Out of scope:
- Changing acceptance criteria.
- Adding marketing/release notes.
- Treating warnings as pass/fail unless defined by `evals.md`.

Done when:
- release Gate A through release Gate G each have explicit pass/fail.
- Release verdict is fail if any gate fails.
- Reports are deterministic and versioned as release artifacts.
- Any golden diff is classified before acceptance.
- No blocking release artifact is missing from the checklist.

Suggested verification:
- Run release gate aggregator on a passing local candidate.
- Run it with one intentionally failing fixture and confirm release verdict fails.

### T9.7 — Run entropy review and repository drift audit

Purpose:
- Remove agent-generated drift before release without changing product scope.
- Detect duplication, obsolete docs, weak fixtures, and unresolved ADR/design/tasks drift.

Contract refs:
- `contract.md` — §4.1 Determinism
- `contract.md` — §4.8 Aucun état normatif caché
- `contract.md` — §12.6 Aucune donnée implicite

Design refs:
- `design.md` — §3 Sources de vérité et frontières
- `design.md` — §10 Testabilité
- `design.md` — §11 Dépendances et reproductibilité

Eval refs:
- `evals.md` — §2 Principes non négociables des evals
- `evals.md` — §7 Regression policy
- `evals.md` — §11 Gates A–G

Operating-model refs:
- `operating-model.md` — §10 Taxonomie des écarts
- `operating-model.md` — §14 Protocole de review
- `operating-model.md` — §19.3 Release candidate

Dependencies:
- T1.9.
- T9.6.

Implementation scope:
- Run a bounded entropy review on code, fixtures, goldens, ADRs, and process docs.
- Check for duplicated helpers, obsolete docs, stale ADR references, weak or redundant fixtures, and unresolved deviation notes.
- Confirm that repo-local consistency checks required by M1 remain green.
- Classify each finding with exactly one primary classification from `docs/operating-model.md` §10.
- Record the follow-up disposition separately for each finding, for example `fix now`, `process-doc update`, `defer`, or `no action`.
- Archive the review result as a release artifact.

Out of scope:
- Broad refactors for style alone.
- Re-opening product scope.
- Weakening gates or accepting golden drift without classification.

Done when:
- An entropy review artifact exists for the release candidate.
- Each review finding has an explicit primary classification and an explicit follow-up disposition.
- No unclassified drift remains in the release candidate review set.
- The release verdict references the entropy review artifact.

Suggested verification:
- Run the entropy review on a passing candidate.
- Introduce one intentional stale doc or duplicate helper and confirm the review records it explicitly.

## Technical spikes

### S1 — Parser profile and duplicate-key compatibility report

Question:
- Which concrete Markdown, YAML, and TypeScript parser setup satisfies the normative profiles and duplicate-key requirements without implicit decoding or unsupported behavior?

Contract refs:
- `contract.md` — §1.1 Profils grammaticaux normatifs v1.0
- `contract.md` — §7 `anchormap.yaml`
- `contract.md` — §8 Détection des anchors
- `contract.md` — §10.1 Formes syntaxiques supportées
- `contract.md` — §10.5 Parse failures
- `contract.md` — §12.3 Portée de découverte, lisibilité et garde-fous

Design refs:
- `design.md` — §5.2 `config_io`
- `design.md` — §5.3 `spec_index`
- `design.md` — §5.4 `ts_graph`
- `design.md` — §7.0 Lecture et décodage normatifs
- `design.md` — §11 Dépendances et reproductibilité

Eval refs:
- `evals.md` — §5.1 Famille B-decodage
- `evals.md` — §5.3 Famille B-specs
- `evals.md` — §5.4 Famille B-graph
- `evals.md` — Gate A
- `evals.md` — Gate G

Operating-model refs:
- `operating-model.md` — §16 Politique de dépendances
- `operating-model.md` — §17 Politique de spikes
- `operating-model.md` — §19.1 Tâche

Dependencies:
- None.

Why now:
- Parser behavior affects `MARKDOWN_PROFILE`, `YAML_PROFILE`, `TS_PROFILE`, duplicate key rejection, JSX rejection, and all scan goldens.

Protocol:
- Evaluate candidate Markdown, YAML, and TypeScript parser versions with throwaway probes only.
- Probe at least the normative profile boundaries needed by config, specs, and product `.ts` parsing.
- Record observed behavior, wrapper requirements, version pins, and any incompatible behavior.
- Do not change production parser behavior in this spike.

Must answer:
- Can the Markdown parser expose ATX headings and inline text sufficiently for `contract.md` §8.1?
- Can the YAML parser enforce YAML 1.2.2-compatible parsing, single-document input, and duplicate-key rejection for config and spec YAML?
- Can the TypeScript parser run as TypeScript 5.4.0 with `ScriptKind.TS`, module goal, and no JSX?
- Which versions must be pinned or locked?

Output:
- `spikes/parser-profile-report.md`
- Include selected dependencies, exact versions, observed edge cases, required wrapper behavior, result, decision, and consequences for design, contract, evals, or tasks.

Done when:
- `spikes/parser-profile-report.md` exists.
- The report answers every `Must answer` item.
- The report names exact dependency versions or states that no compatible dependency was found.
- The report states the observed result and selected parser profile decision.
- The report lists consequences for design, contract, evals, and tasks, using `None` where no consequence exists.
- No production behavior is introduced by the spike itself.

Blocks:
- T4.1
- T5.2
- T5.3
- T6.2
- T9.5

Required closure after result:
- T0.1 — Record parser profile ADRs from `S1`

### S2 — Atomic write and cleanup behavior report

Question:
- Can the selected filesystem/write implementation provide the required same-directory temp write, pre-commit cleanup, and rename boundary for implementation work, with macOS arm64 observed directly and native Linux x86_64 proof retained for the release cross-platform gate?

Contract refs:
- `contract.md` — §7.5 Écriture canonique exacte
- `contract.md` — §9.1 `anchormap init`
- `contract.md` — §9.2 `anchormap map`
- `contract.md` — §12.5 Sorties stables
- `contract.md` — §13.8 Codes de sortie

Design refs:
- `design.md` — §5.2 `config_io`
- `design.md` — §8 Chemin d’écriture unique, borné et atomique
- `design.md` — §9.5 Règle spécifique aux commandes d’écriture
- `design.md` — §12 Considérations cross-platform

Eval refs:
- `evals.md` — §5.7 Famille B-init / B-map
- `evals.md` — §6.2 Goldens YAML obligatoires
- `evals.md` — §8.12 C12 — Absence de cache persistant et d'écriture par `scan`
- `evals.md` — §9 Matrice cross-platform obligatoire
- `evals.md` — Gate D

Operating-model refs:
- `operating-model.md` — §17 Politique de spikes
- `operating-model.md` — §19.1 Tâche

Dependencies:
- None.

Why now:
- Failed `init` and `map` must leave `anchormap.yaml` byte-identical or absent and leave no auxiliary file.

Protocol:
- Build a throwaway write-path probe using same-directory temp files and bounded fault-injection points.
- Run the probe on macOS arm64.
- Run or document Linux amd64 container/POSIX evidence sufficient to select the implementation strategy before `T4.5`; native Linux x86_64 verification remains required by `T9.3`.
- Record cleanup behavior before commit, at commit boundary, and after simulated failures.
- Do not change production write behavior in this spike.

Must answer:
- How is the temp file named and reserved exclusively?
- Which pre-commit steps can be fault-injected?
- Can cleanup synchronously remove and verify temp-file absence?
- Is there any post-rename fallible step in the intended implementation path?

Output:
- `spikes/atomic-write-report.md`
- Include fault-injection points, platform notes, result, decision, and consequences for design, contract, evals, or tasks.

Done when:
- `spikes/atomic-write-report.md` exists.
- The report answers every `Must answer` item.
- The report identifies the exact write boundary and cleanup verification method.
- The report states the observed macOS arm64 result, the Linux amd64 container/POSIX evidence used for pre-implementation selection, and the native Linux x86_64 verification still required by `T9.3`.
- The report lists consequences for design, contract, evals, and tasks, using `None` where no consequence exists.
- No production write path is introduced by the spike itself.

Blocks:
- T4.5
- T8.5
- T9.3

Required closure after result:
- T0.2 — Record atomic write ADR from `S2`

### S3 — Filesystem mutation detection and path behavior report

Question:
- Can the harness and `repo_fs` reliably detect mutation, symlinks, case collisions, and non-canonical paths on supported platforms?

Contract refs:
- `contract.md` — §4.1 Déterminisme
- `contract.md` — §5 Dépôts supportés
- `contract.md` — §9 Commands, common mutation rule
- `contract.md` — §12.2 Modèle canonique des chemins
- `contract.md` — §12.3 Portée de découverte, lisibilité et garde-fous
- `contract.md` — §12.4 Plateformes supportées

Design refs:
- `design.md` — §5.1 `repo_fs`
- `design.md` — §7.1 Découverte de fichiers
- `design.md` — §10.2 Tests de frontière
- `design.md` — §12 Considérations cross-platform

Eval refs:
- `evals.md` — §4.2 Niveau B — Contract fixtures de frontière
- `evals.md` — §5.5 Famille B-repo
- `evals.md` — §8.7 C7 — Reruns déterministes
- `evals.md` — §8.9 C9 — Indépendance à Git
- `evals.md` — §8.12 C12 — Absence de cache persistant et d'écriture par `scan`
- `evals.md` — §9 Matrice cross-platform obligatoire

Operating-model refs:
- `operating-model.md` — §15 Gestion des fixtures et goldens
- `operating-model.md` — §17 Politique de spikes
- `operating-model.md` — §19.1 Tâche

Dependencies:
- None.

Why now:
- M1 mutation oracles and M6 repository guardrails depend on stable filesystem behavior.

Protocol:
- Build throwaway probes for byte snapshots, symlink detection, case-collision detection, non-canonical paths, unreadable files, and enumeration failures.
- Run or document probe outcomes on supported platforms.
- Record any platform-specific limitation and its consequence for harness tasks or `repo_fs` tasks.
- Do not change production repository traversal behavior in this spike.

Must answer:
- How are pre/post snapshots represented byte-for-byte?
- How are symlinks detected without following unsupported paths?
- How are case collisions detected consistently?
- How are unreadable files and enumeration failures simulated in fixtures?

Output:
- `spikes/fs-mutation-path-report.md`
- Include probe cases, platform outcomes, result, decision, and consequences for design, contract, evals, or tasks.

Done when:
- `spikes/fs-mutation-path-report.md` exists.
- The report answers every `Must answer` item.
- The report states the snapshot representation and unsupported-path detection strategy.
- The report identifies how each required filesystem failure mode can be fixture-tested or states the precise insufficiency.
- The report states the observed result and decision.
- The report lists consequences for design, contract, evals, and tasks, using `None` where no consequence exists.
- No production repository traversal behavior is introduced by the spike itself.

Blocks:
- T1.2
- T1.5
- T6.1
- T9.3

### S4 — Canonical serializer profile report

Question:
- Is a custom renderer required for exact JSON and YAML bytes, or can selected serializers be constrained safely?

Contract refs:
- `contract.md` — §7.5 Écriture canonique exacte
- `contract.md` — §12.5 Sorties stables
- `contract.md` — §13.1 Périmètre du contrat machine
- `contract.md` — §13.7 Sérialisation JSON canonique exacte

Design refs:
- `design.md` — §5.2 `config_io`
- `design.md` — §5.7 `render`
- `design.md` — §8 Chemin d’écriture unique, borné et atomique
- `design.md` — §11 Dépendances et reproductibilité

Eval refs:
- `evals.md` — §6.1 Goldens JSON obligatoires
- `evals.md` — §6.2 Goldens YAML obligatoires
- `evals.md` — §6.3 Stabilité des goldens
- `evals.md` — Gate B
- `evals.md` — Gate G

Operating-model refs:
- `operating-model.md` — §15 Gestion des fixtures et goldens
- `operating-model.md` — §16 Politique de dépendances
- `operating-model.md` — §17 Politique de spikes
- `operating-model.md` — §19.1 Tâche

Dependencies:
- None.

Why now:
- `scan --json` and `anchormap.yaml` writes are byte-for-byte contract surfaces.

Protocol:
- Compare candidate JSON and YAML serialization approaches against minimal exact byte goldens.
- Probe JSON key order, whitespace, final newline, string escaping, and closed-object behavior.
- Probe YAML key order, quoting, indentation, omission rules, and final newline.
- Record whether each byte surface requires custom rendering or a constrained serializer wrapper.
- Do not change production rendering behavior in this spike.

Must answer:
- Can JSON string escaping be controlled exactly as `contract.md` §13.7 requires?
- Can YAML rendering match exact quotes, indentation, key order, omission rules, and final newline?
- Which parts must be implemented manually to avoid serializer drift?

Output:
- `spikes/canonical-serializer-report.md`
- Include serializer candidates, byte comparisons, result, decision, and consequences for design, contract, evals, or tasks.

Done when:
- `spikes/canonical-serializer-report.md` exists.
- The report answers every `Must answer` item.
- The report states whether JSON, YAML, or both require custom rendering.
- The report includes at least one exact byte comparison for JSON and one for YAML.
- The report states the observed result and decision.
- The report lists consequences for design, contract, evals, and tasks, using `None` where no consequence exists.
- No production renderer behavior is introduced by the spike itself.

Blocks:
- T3.5
- T4.4

Required closure after result:
- T0.3 — Record canonical serializer ADR from `S4`

### S5 — Release benchmark feasibility baseline

Question:
- Does the straightforward design meet the `small` and `medium` p95/RSS budgets before optimization?

Contract refs:
- `contract.md` — §4.1 Déterminisme
- `contract.md` — §4.8 Aucun état normatif caché
- `contract.md` — §12.5 Sorties stables
- `contract.md` — §12.6 Aucune donnée implicite

Design refs:
- `design.md` — §7.6 Calcul des fermetures
- `design.md` — §11 Dépendances et reproductibilité
- `design.md` — §13 Complexité et budgets

Eval refs:
- `evals.md` — §8.12 C12 — Absence de cache persistant et d'écriture par `scan`
- `evals.md` — §10 Performance et ressources
- `evals.md` — Gate F
- `evals.md` — Gate G

Operating-model refs:
- `operating-model.md` — §17 Politique de spikes
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T7.7.

Why now:
- The design allows a naïve closure algorithm only if `evals.md` performance budgets hold.

Protocol:
- Run the `evals.md` §10.1 performance protocol on the benchmark corpus with the straightforward implementation.
- Record cold-start and measured-run results separately.
- Capture p95 wall-clock time and RSS for `small` and `medium`.
- Record informational `large` results if the corpus is available.
- Do not introduce optimization or caching behavior in this spike.

Must answer:
- What are cold-start and measured-run baselines on the benchmark corpus?
- Is TypeScript parsing the dominant cost?
- Is any optimization needed while preserving observable order and no persistent cache?

Output:
- `bench/baseline-report.md`
- Include benchmark corpus identifiers, measurement environment, results, decision, and consequences for design, contract, evals, or tasks.

Done when:
- `bench/baseline-report.md` exists.
- The report answers every `Must answer` item.
- The report states pass/fail against `small` and `medium` budgets.
- The report separates measured-run data from cold-start observations.
- The report states the observed result and decision.
- The report lists consequences for design, contract, evals, and tasks, using `None` where no consequence exists.
- No optimization, cache, or product behavior change is introduced by the spike itself.

Blocks:
- T9.4
- Any performance-motivated implementation change after M7

### S6 — Module boundary policy and enforcement report

Question:
- Which module import boundaries can be enforced mechanically from the current design without introducing new architecture?

Contract refs:
- `contract.md` — §4.1 Déterminisme
- `contract.md` — §4.8 Aucun état normatif caché
- `contract.md` — §12.6 Aucune donnée implicite

Design refs:
- `design.md` — §3 Sources de vérité et frontières
- `design.md` — §4 Vue d'ensemble du système
- `design.md` — §5 Découpage en modules
- `design.md` — §10 Testabilité

Eval refs:
- `evals.md` — §2 Principes non négociables des evals
- `evals.md` — §3 Traçabilité contrat → familles d'évals
- `evals.md` — Gate D — Determinism and isolation

Operating-model refs:
- `operating-model.md` — §10.3 Design gap
- `operating-model.md` — §17 Politique de spikes
- `operating-model.md` — §19.1 Tâche

Dependencies:
- None.

Why now:
- Repeated agent-generated patches can blur module ownership before boundary rules are made mechanically checkable.

Protocol:
- Derive a candidate allowed-import matrix from `design.md` only.
- Mark each module edge as allowed, forbidden, or ambiguous.
- Evaluate at least one repo-local enforcement approach with no network or hidden state.
- Record ambiguities as design gaps instead of guessing new boundaries.
- Do not change production imports in this spike.

Must answer:
- Which module boundaries are explicit today?
- Which module boundaries remain ambiguous and need design clarification?
- Which repo-local enforcement mechanism is sufficient?
- Which later task should own the final boundary check?

Output:
- `spikes/module-boundary-report.md`
- Include candidate matrix, ambiguities, enforcement options, result, decision, and consequences for design, evals, or tasks.

Done when:
- `spikes/module-boundary-report.md` exists.
- The report answers every `Must answer` item.
- The report distinguishes explicit boundaries from ambiguous ones.
- The report names at least one viable enforcement mechanism or explains why none is currently sufficient.
- The report lists consequences for design, evals, and tasks, using `None` where no consequence exists.
- No production import graph is changed by the spike itself.

Blocks:
- Any future task that claims mechanical module-boundary enforcement.

## Process closure tasks

These are process-doc or repository-bootstrap tasks. They are outside the product milestone graph above and exist to close spike results or bootstrap assumptions into normative repository state.

### T0.0 — Bootstrap modern Node/npm/TypeScript CLI workspace and Git repo baseline for M1 harness

Purpose:
- Materialize the minimal executable repository baseline required to implement and run M1 harness tasks under accepted ADRs.
- Introduce modern, pinned CLI tooling, project metadata, and Git repo baseline without introducing product behavior or unresolved parser, renderer, or packaging choices.

Contract refs:
- `contract.md` — §4.1 Determinism
- `contract.md` — §12.6 No implicit data

Design refs:
- `design.md` — §2 Contraintes de conception
- `design.md` — §2.1 Stack and ADRs
- `design.md` — §10 Testabilité
- `design.md` — §11 Dépendances et reproductibilité
- `design.md` — §15 Structure de dépôt indicative

Eval refs:
- `evals.md` — §4.6 Niveau F — Audit de reproductibilité de release
- `evals.md` — Gate G — Reproductibilité de release

Operating-model refs:
- `operating-model.md` — §10.6 Tooling problem
- `operating-model.md` — §16 Politique de dépendances
- `operating-model.md` — §18 Commit et granularité de changement
- `operating-model.md` — §19.1 Tâche

Dependencies:
- None.

Implementation scope:
- Add a minimal `package.json` aligned with `ADR-0001`.
- Record stable bootstrap metadata required for local execution:
  - `name`
  - `private`
  - `version`
  - `packageManager`
  - `engines.node`
- Record basic repository metadata needed for a modern CLI workspace, including at least:
  - `description`
  - `repository`
- Add a committed `package-lock.json`.
- Add a minimal `tsconfig.json` compatible with the compile-to-CommonJS `dist/` path selected by `ADR-0001`.
- Add only the minimum modern, non-prerelease, exact-version dependencies required to compile repo-local TypeScript and run repo-local tests for M1 bootstrap work.
- Record the exact selected bootstrap dependency versions in the task output and justify any intentional lag from the current stable line at bootstrap time.
- Add only the minimum bootstrap scripts needed to run build and test commands locally; defer harness-facing script surface to `T1.7`.
- Add the minimal Git repo baseline required for deterministic local development:
  - `.gitignore` entries for Node/TypeScript/build and harness-temp artifacts
  - `.gitattributes` only if needed to stabilize line endings or text treatment for versioned goldens and docs
- Ensure the bootstrap remains compatible with `ADR-0003` and does not preempt parser-specific, serializer-specific, write-path, or packaging ADR decisions.

Out of scope:
- Installing or configuring Biome.
- Adding Markdown, YAML, TypeScript-parser, canonical-serializer, atomic-write, or packaging dependencies before their dedicated ADR closure.
- Adding published-package metadata such as `bin`, `exports`, `files`, or release publication config.
- Adding Git hooks, release automation, Git-derived versioning, or any runtime dependency on Git state.
- Implementing CLI product behavior, fixture semantics, or release CI.

Done when:
- `package.json`, `package-lock.json`, and `tsconfig.json` exist.
- `package.json` records the accepted runtime/package-manager baseline, marks the repository private, and contains the agreed bootstrap metadata.
- All bootstrap dependencies are exact or lock-backed and compatible with the determinism policy.
- The selected bootstrap dependency versions are listed explicitly in the task result with rationale for any non-latest choice.
- A minimal local build command succeeds against the bootstrap workspace.
- A minimal local test command succeeds against the bootstrap workspace.
- The repository contains the minimal Git baseline files needed for deterministic local development.
- No parser-selection, packaging, or formatter-install decision has been smuggled into the bootstrap patch.

Suggested verification:
- Run the bootstrap build command.
- Run the bootstrap test command.
- Verify that the committed lockfile is in sync with `package.json`.
- Confirm that Biome, parser libraries, packaging metadata, and Git-derived runtime behavior were not introduced by the bootstrap patch.

### T0.0a — Install pinned Biome baseline for local formatting and linting

Purpose:
- Materialize the accepted `ADR-0010` formatting/linting baseline as repo-local tooling.
- Keep the installation deterministic, exact-versioned, and isolated from product runtime and harness semantics.

Contract refs:
- `contract.md` — §4.1 Determinism
- `contract.md` — §12.6 No implicit data

Design refs:
- `design.md` — §2 Contraintes de conception
- `design.md` — §2.1 Stack and ADRs
- `design.md` — §11 Dépendances et reproductibilité

Eval refs:
- `evals.md` — §4.6 Niveau F — Audit de reproductibilité de release
- `evals.md` — Gate G — Reproductibilité de release

Operating-model refs:
- `operating-model.md` — §10.6 Tooling problem
- `operating-model.md` — §16 Politique de dépendances
- `operating-model.md` — §18 Commit et granularité de changement
- `operating-model.md` — §19.1 Tâche

Dependencies:
- T0.0.

Implementation scope:
- Add exact-version Biome as a development dependency with a committed lockfile update.
- Add a minimal `biome.json` owned by the repository.
- Add only the minimum local scripts needed to run format/lint/check over repo-local source and config files.
- Keep the Biome baseline independent from Git hooks, CI, editor integration, parser decisions, and product runtime behavior.

Out of scope:
- Reformatting the whole repository opportunistically.
- Adding Git hooks, CI jobs, editor settings, or release automation.
- Expanding lint policy beyond a minimal repo-local baseline.
- Changing any product, harness, parser, serializer, or packaging behavior.

Done when:
- `package.json` and `package-lock.json` include an exact-version Biome dependency.
- A minimal `biome.json` exists.
- Local Biome scripts exist for check and write flows.
- The Biome check command succeeds on the bounded repo-local targets.
- No runtime, harness, or contract behavior changes.

Suggested verification:
- Run the Biome check command.
- Re-run the local bootstrap test command to confirm no regression.

### T0.1 — Record parser profile ADRs from `S1`

Purpose:
- Convert the selected parser profile result of `S1` into binding ADR decisions before parser-dependent implementation proceeds.

Operating-model refs:
- `operating-model.md` — §8.6 Architectural Decision Records
- `operating-model.md` — §16 Politique de dépendances
- `operating-model.md` — §17 Politique de spikes
- `operating-model.md` — §19.1 Tâche

Dependencies:
- S1.

Implementation scope:
- Create or update `ADR-0004`, `ADR-0005`, and `ADR-0006` from the result of `S1`.
- Record exact versions, wrapper constraints, and any rejected alternatives required by the selected parser setup.
- Update `design.md` and `tasks.md` if the selected parser setup changes the implementation path or invalidates an assumption.

Out of scope:
- Implementing parser-dependent product behavior.
- Relaxing any parser-related eval.

Done when:
- `ADR-0004`, `ADR-0005`, and `ADR-0006` exist or are updated.
- Each ADR has an explicit status.
- Any consequence for design or tasks is reflected in repository docs.
- Parser-dependent tasks are no longer blocked on undocumented parser choice.

### T0.2 — Record atomic write ADR from `S2`

Purpose:
- Convert the selected same-directory temp-write and commit-boundary result of `S2` into a binding write-path ADR.

Operating-model refs:
- `operating-model.md` — §8.6 Architectural Decision Records
- `operating-model.md` — §17 Politique de spikes
- `operating-model.md` — §19.1 Tâche

Dependencies:
- S2.

Implementation scope:
- Create or update `ADR-0008` from the result of `S2`.
- Record the temp-file strategy, cleanup verification method, and post-rename boundary rules.
- Update `design.md` and `tasks.md` if the selected write path changes the implementation path or test strategy.

Out of scope:
- Implementing the production write path.
- Weakening mutation guarantees for `init` or `map`.

Done when:
- `ADR-0008` exists or is updated.
- The ADR has an explicit status.
- Any consequence for design or tasks is reflected in repository docs.
- Write-path tasks are no longer blocked on undocumented atomic-write strategy.

### T0.3 — Record canonical serializer ADR from `S4`

Purpose:
- Convert the serializer decision of `S4` into a binding ADR before canonical JSON and YAML rendering work proceeds.

Operating-model refs:
- `operating-model.md` — §8.6 Architectural Decision Records
- `operating-model.md` — §16 Politique de dépendances
- `operating-model.md` — §17 Politique de spikes
- `operating-model.md` — §19.1 Tâche

Dependencies:
- S4.

Implementation scope:
- Create or update `ADR-0007` from the result of `S4`.
- Record which byte surfaces require custom rendering and which can rely on constrained serializers.
- Update `design.md` and `tasks.md` if the selected serializer strategy changes the implementation path.

Out of scope:
- Implementing the renderer.
- Weakening byte-for-byte output guarantees.

Done when:
- `ADR-0007` exists or is updated.
- The ADR has an explicit status.
- Any consequence for design or tasks is reflected in repository docs.
- Renderer tasks are no longer blocked on undocumented serializer strategy.

## Global verification matrix

| Eval / fixture / gate | Covered by task | Milestone | Verification type | Notes |
|---|---|---:|---|---|
| Level A unit invariants | T3.1–T3.6, T4.1–T4.4, T6.2–T6.6 | M3–M6 | unit | Anchor IDs, paths, decoding, parsers, canonical order, findings, renderers |
| Fixture manifest requirements | T1.1–T1.8 | M1 | harness | Stable IDs, command, cwd, exit, stdout/stderr, mutation oracle |
| JSON goldens §6.1 | T1.4, T3.5, T7.5, T7.7 | M1, M3, M7 | golden | Byte-for-byte stdout for successful `scan --json` |
| YAML goldens §6.2 | T1.5, T4.4, T4.6, T8.4, T8.6 | M1, M4, M8 | golden | Byte-for-byte final `anchormap.yaml` |
| Golden stability §6.3 | T1.4, T1.6, T9.6 | M1, M9 | gate | No automatic golden drift |
| `fx00a_decode_config_bom_success` | T3.6, T4.1, T7.5 | M3, M4, M7 | fixture | Config BOM ignored before parsing |
| `fx00b`, `fx00f`, `fx00i` Markdown decode/profile | T3.6, T5.1, T5.2 | M3, M5 | fixture | Markdown strict UTF-8, BOM, CommonMark boundary |
| `fx00c`, `fx00g`, `fx00j` YAML spec decode/profile | T3.6, T5.1, T5.3 | M3, M5 | fixture | YAML spec strict UTF-8, BOM, YAML profile |
| `fx00d`, `fx00h`, `fx00k`, `fx00l` product decode/profile | T3.6, T6.2 | M3, M6 | fixture | Product BOM, non-UTF-8, TS profile, JSX rejection |
| `fx00e_config_non_utf8` | T3.6, T4.1, T4.7 | M3, M4 | fixture | Config non-UTF-8 returns `2` |
| `fx00m_map_decode_spec_non_utf8_no_mutation` | T5.5, T8.3, T8.5 | M5, M8 | fixture | Map spec decode failure returns `3`, no mutation |
| `fx00n_map_decode_product_non_utf8_no_mutation` | T6.7, T8.3, T8.5 | M6, M8 | fixture | Map product decode failure returns `3`, no mutation |
| `fx00o_map_decode_config_non_utf8_no_mutation` | T4.7, T8.5 | M4, M8 | fixture | Map config decode failure returns `2`, no mutation |
| B-scan `fx01`–`fx02` | T7.2, T7.3, T7.5, T7.7 | M7 | fixture/golden | Usable mappings, overlap, coverage |
| B-scan `fx03`–`fx05` | T7.2, T7.4, T7.7 | M7 | fixture/golden | Unmapped, stale, broken seed states |
| B-scan `fx06`, `fx06a`, `fx07`, `fx08` | T7.3, T7.4, T7.7 | M7 | fixture/golden | `untraced_product_file` preconditions and suppression |
| B-scan `fx09`, `fx10` | T3.3, T3.5, T7.5, T7.7 | M3, M7 | fixture/golden | Finding order and closed objects |
| B-specs `fx11`–`fx15` | T5.2, T5.4, T5.5 | M5 | fixture | Markdown anchor detection rules |
| B-specs `fx16`–`fx18` | T5.3, T5.4, T5.5 | M5 | fixture | YAML root `id` behavior |
| B-specs `fx19`–`fx22` | T5.3, T5.4, T5.5 | M5 | fixture | Duplicate anchors and invalid YAML specs |
| B-specs `fx22a`–`fx22f` | T5.1, T5.2, T5.3, T5.5 | M5 | fixture | Spec read/decode/BOM failures and successes |
| B-graph `fx23`–`fx26` | T6.3, T6.4, T6.6 | M6 | fixture/golden | Supported import/export syntax |
| B-graph `fx27`–`fx31` | T6.4, T6.6 | M6 | fixture/golden | Resolution priority and classified diagnostics |
| B-graph `fx32`–`fx33` | T6.5, T6.6 | M6 | fixture/golden | Unsupported local `require` and dynamic import |
| B-graph `fx34` | T6.3, T6.6 | M6 | fixture/golden | Non-relative imports ignored |
| B-graph `fx35`–`fx36` | T3.3, T6.6, T7.3 | M6, M7 | fixture/golden | Finding dedup and graph cycles |
| B-graph `fx37`–`fx38e` | T6.2, T6.4, T6.7 | M6 | fixture | Parse failures, outside-root candidates, existence-test failures |
| B-repo `fx39`–`fx42c` | T4.3, T5.1, T6.1, T6.7 | M4–M6 | fixture | Case collisions, symlinks, no parent search, enumeration failures |
| B-config `fx43`–`fx43g` | T4.1, T4.7 | M4 | fixture | Missing/unreadable/non-UTF-8/invalid/multidoc/root/duplicate/BOM config |
| B-config `fx44`–`fx49` | T4.2, T4.7 | M4 | fixture | Schema, unknown fields, version, spec roots, seed list invariants |
| B-config `fx50`–`fx53` | T4.3, T4.7 | M4 | fixture | Path invariants and root relationships |
| B-init `fx54`–`fx58a` | T2.3, T4.4, T4.5, T4.6 | M2, M4 | fixture/golden | Init success, create-only, args, dirs, duplicate roots, option order |
| B-map `fx59`–`fx62` | T8.2, T8.3, T8.4, T8.6 | M8 | fixture/golden | Create, replace guard, replace OK, replace creates if absent |
| B-map `fx63`–`fx67` | T8.1, T8.2, T8.3, T8.5, T8.6 | M8 | fixture | Anchor/seed validation and option order |
| B-map `fx67a`–`fx67d` | T4.7, T5.5, T6.7, T8.2, T8.3, T8.5 | M4–M8 | fixture | Config/spec/product/existence failures with no mutation |
| B-cli `fx68`–`fx70` | T2.1, T2.2, T2.5 | M2 | fixture | Unknown command, unknown option, invalid combinations |
| B-cli `fx71`, `fx71a`–`fx71e` | T2.2, T2.5, T7.1, T7.6 | M2, M7 | fixture | Scan option order and human scan modes |
| B-cli `fx72`–`fx75` | T2.5, T2.6, T4.7, T6.7, T7.6 | M2–M7 | fixture | Exit-code priority and internal error |
| B-cli `fx76` | T4.5, T8.5 | M4, M8 | fixture | Atomic write failure exits `1`, no partial mutation |
| C1 filesystem order invariance | T1.6, T6.1, T7.5, T9.1 | M1, M6, M7, M9 | metamorphic | Stable ordering independent of FS enumeration |
| C2 YAML editorial reorder invariance | T4.1, T4.4, T8.4, T9.1 | M4, M8, M9 | metamorphic | Same config semantics, canonical output after map |
| C3 spec noise invariance | T5.2, T5.3, T5.4, T9.1 | M5, M9 | metamorphic | No anchor from unsupported spec noise |
| C4 seed movement | T7.2, T7.4, T9.1 | M7, M9 | metamorphic | Broken seed degradation, no silent mapping mutation |
| C5 external import addition | T6.3, T9.1 | M6, M9 | metamorphic | Non-relative imports ignored |
| C6 unsupported extension conversion | T6.4, T7.4, T9.1 | M6, M7, M9 | metamorphic | Edge removed, unsupported target finding appears |
| C7 deterministic reruns | T1.6, T7.5, T9.2 | M1, M7, M9 | metamorphic | 20 process-separated identical outputs |
| C8 locale independence | T3.2, T3.3, T9.2 | M3, M9 | isolation | Binary UTF-8 order, locale-independent |
| C9 Git independence | T9.2 | M9 | isolation | Git metadata not source of truth |
| C10 time/timezone independence | T9.2 | M9 | isolation | No clock or timezone source of truth |
| C11 no network/env source of truth | T9.2 | M9 | isolation | No network required, env changes do not alter output |
| C12 no cache and no scan writes | T1.5, T7.1, T9.2 | M1, M7, M9 | isolation | Scan leaves no repo/cache artifacts |
| Cross-platform matrix §9 | T9.3 | M9 | gate | Linux x86_64 and macOS arm64 |
| Performance `small` and `medium` | T9.4 | M9 | benchmark | Release gate; p95/RSS budgets |
| Performance `large` | T9.4 | M9 | benchmark | Informational only, archived |
| release Gate A — Observable contract coverage | T9.6 | M9 | release gate | 100% Level B fixtures |
| release Gate B — Schema/goldens/canonical order | T3.5, T4.4, T7.5, T8.6, T9.6 | M3–M9 | release gate | JSON/YAML byte-for-byte |
| release Gate C — Exit codes/preconditions/priority | T2.5, T2.6, T4.5, T7.6, T8.1, T8.2, T8.3, T8.5, T9.6 | M2–M9 | release gate | Codes `0`–`4`, priority fixtures |
| release Gate D — Determinism and isolation | T9.1, T9.2, T9.6 | M9 | release gate | C1–C12 |
| release Gate E — Cross-platform | T9.3, T9.6 | M9 | release gate | Required suite on both supported platforms |
| release Gate F — Performance | T9.4, T9.6 | M9 | release gate | `small` and `medium` budgets |
| release Gate G — Release reproducibility | T9.5, T9.6 | M9 | release gate | Pinned deps, lockfile, goldens versioned |

## Agent execution protocol

The authoritative agent workflow lives in the Agent Skills under
`.agents/skills/` (`implement-task`, `diagnose-fixture`, `update-tasks`,
`validate-tasks`), in `docs/agent-loop.md`, and in `docs/code-review.md`.
Native review findings come from `codex review`, not from a repo-local review
skill or a wrapper that reparses Codex session files. The bounded deterministic
lint lives at `scripts/lint-tasks.sh`.

Do not duplicate or re-derive the agent prompts in this file. Any change to
execution protocol must go through the skills, `docs/agent-loop.md`, or
`docs/code-review.md`.
Routine `## Execution State` cursor updates may be handled directly by the
active implementation pass or review decision; use `update-tasks` for
structural plan maintenance and classified deviations.

## Blocking questions

None.
