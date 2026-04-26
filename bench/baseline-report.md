# S5 — Release benchmark feasibility baseline

## Scope

- Task: `S5 — Release benchmark feasibility baseline`
- Change type: `spike`
- Files changed: this report
- Production behavior changed: `None`

This spike is bounded by:

- `contract.md` — §§4.1, 4.8, 12.5, 12.6
- `design.md` — §§7.6, 11, 13
- `evals.md` — §§8.12, 10, Gate F, Gate G
- `operating-model.md` — §§10, 17, 19.1
- accepted ADRs relevant to this surface: `ADR-0001`, `ADR-0003`,
  `ADR-0006`, `ADR-0010`

No `docs/contract.md` change, optimization, cache, product behavior, or
release-gate weakening was introduced by this spike.

## Question

Does the straightforward design meet the `small` and `medium` p95/RSS budgets
before optimization?

## Protocol Required By The Task

`evals.md` §10.1 requires:

- release build
- documented reference machine per supported platform
- versioned benchmark corpus
- 5 warm-up runs, not counted
- 30 measured runs in separate processes
- wall-clock p95 from process launch to exit
- peak RSS for the process
- no instrumentation that changes CLI behavior
- no undocumented significant concurrent load

`evals.md` §10.2 defines the release budgets:

| Corpus | Required shape | p95 budget | RSS budget |
| --- | --- | --- | --- |
| `small` | 200 product files, 50 anchors, 1,500 supported edges | <= 400 ms | <= 120 MiB |
| `medium` | 1,000 product files, 200 anchors, 8,000 supported edges | <= 2.0 s | <= 300 MiB |
| `large` | 5,000 product files, 500 anchors, 40,000 supported edges | informational | informational |

## Repository Probe

The spike first checked whether the required benchmark corpus or benchmark
tooling already exists.

Observed repository state:

- `bench/`: absent before this report was added.
- `package.json`: no `bench`, `benchmark`, `performance`, or `perf` script.
- `fixtures/`: contains contract and metamorphic fixture families, but no
  versioned `small`, `medium`, or `large` benchmark corpus.
- `src/` and `scripts/`: no benchmark runner for the §10.1 protocol.

The required benchmark corpus and benchmark tooling are therefore not available
in the repository at S5 time.

## Measurement Environment

Measurement host available during this spike:

- platform: macOS arm64 workspace
- runtime declared by project: Node.js `>=22.0.0`
- package manager declared by project: `npm@11.11.1`
- product parser pin: `typescript@6.0.3`

No compliant S5 benchmark measurement was run because the required versioned
benchmark corpus and runner do not exist. Running ad hoc scans over B/C
fixtures would not satisfy `evals.md` §10.1 and would create misleading
evidence for Gate F.

## Results

### Cold-start observations

No compliant cold-start baseline is available.

Reason:

- there is no versioned `small`, `medium`, or `large` benchmark corpus;
- there is no benchmark command that performs 5 warm-up runs and 30 measured
  process-separated runs;
- there is no peak-RSS capture path for the benchmark process.

### Measured-run data

No compliant measured-run data is available.

| Corpus | p95 wall-clock | Peak RSS | Budget verdict |
| --- | --- | --- | --- |
| `small` | Not measured | Not measured | Fail |
| `medium` | Not measured | Not measured | Fail |
| `large` | Not measured | Not measured | Not available; informational only |

The `small` and `medium` budgets fail S5 because the required evidence cannot
be produced from the current repository state. This is a measurement
infrastructure failure, not evidence that the implementation exceeds the p95 or
RSS limits.

## Must-answer Summary

### What are cold-start and measured-run baselines on the benchmark corpus?

No baseline can be reported. The benchmark corpus required by `evals.md` §10.1
and S5 is absent, so the budget verdict is fail for both gated corpora.

### Is TypeScript parsing the dominant cost?

Unknown. The repo has the pinned `typescript@6.0.3` parser dependency and the
straightforward graph implementation, but there is no benchmark corpus or
runner that separates cold-start, TypeScript parsing, graph construction,
closure calculation, and rendering costs. Any claim about dominant cost would
be speculative.

### Is any optimization needed while preserving observable order and no persistent cache?

Unknown. No optimization is justified by S5 evidence. The design remains on
the straightforward path from `design.md` §13 until a compliant benchmark
shows that `small` or `medium` exceeds budget.

If optimization later becomes necessary, `design.md` §13 allows only approaches
that are pure in memory, preserve observable order, and introduce no new source
of truth. Persistent cache remains forbidden by `contract.md` §§4.1 and 12.6
and by `evals.md` §8.12.

## Classified Gap

Primary classification: `tooling problem` under `operating-model.md` §10.6.

Blocking condition:

- Gate F cannot be evaluated because the repository lacks the required
  versioned benchmark corpus and benchmark runner.

This is not a product behavior failure and not evidence that the
straightforward design misses the budgets. It is an absence of required release
measurement infrastructure.

## Decision

Do not introduce optimization, caching, product behavior, or release-gate
changes from S5.

Treat T9.4 as the executable closure for this result. T9.4 should create the
versioned corpora and runner, then execute the §10.1 protocol and archive the
reports required for Gate F.

## Consequences

### Design

- None for runtime design.
- The straightforward closure design in `design.md` §7.6 and complexity note in
  §13 remain unchanged pending compliant benchmark evidence.

### Contract

- None.

### Evals

- None to the normative Gate F budgets.
- Release Gate F remains not evaluable until T9.4 creates and runs compliant
  benchmark artifacts.

### Tasks

- T9.4 must include the first versioned `small`, `medium`, and informational
  `large` corpora plus a benchmark runner that records 5 warm-up runs, 30
  measured process-separated runs, p95 wall-clock time, peak RSS, corpus
  identifiers, platform, Node/npm versions, and release-build identity.
- No S5 follow-up ADR is required because this spike did not select, reject, or
  alter a structural dependency or architecture strategy.
