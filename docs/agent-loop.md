# Agent Loop

Status: helper note, non-normative

Scope: repo-local workflow helper for bounded task execution by a human plus one
or two fresh-context agent passes, coordinated through one orchestrator.

Prevalence: if this file conflicts with `docs/operating-model.md`,
`docs/contract.md`, `docs/design.md`, `docs/evals.md`, or `docs/tasks.md`, the
existing normative documents win.

## Why this exists

This repository already contains the normative process:

- `docs/operating-model.md` defines phases, deviation taxonomy, review protocol,
  and task-level done.
- `docs/tasks.md` defines the executable one-task plan and includes bounded
  agent prompt templates.

What was missing was a small repo-local helper that makes those prompts easy to
reuse without introducing a separate PRD system, hidden state, or a fully
autonomous commit loop.

## Recommended roles

- Human orchestrator:
  - picks one executable task;
  - confirms the relevant contract, design, and eval references;
  - decides whether a deviation requires escalation.
- Agent orchestrator:
  - uses the helper output as the single task-loop entrypoint;
  - frames the task and checks first;
  - implements locally by default;
  - delegates implementation only when that clearly improves a larger or riskier
    task;
  - for each review pass, spawns one new fresh-context review subagent.
- Implementation subagent:
  - implements one task only;
  - keeps the same execution settings as the parent agent when it inherits the
    current thread context;
  - runs the smallest relevant check early;
  - stops on the first blocking failure.
- Review subagent:
  - reviews only against the target task and normative docs;
  - reviews the full cumulative task diff for each review pass, not only the
    latest follow-up delta;
  - does not edit files;
  - looks first for scope creep, contract drift, eval weakening, and missing
    failure coverage;
  - is not reused after follow-up edits.

Commit is a gate, not a separate role. Commit only after the task satisfies the
task-level done criteria in `docs/operating-model.md` section 19.1.

## Recommended loop

1. Pick exactly one task `Tn.m` from `docs/tasks.md`.
2. Generate the implementation prompt:

```sh
sh scripts/task-loop.sh implement T1.1
```

3. Run the smallest relevant check early.
4. If blocked, classify the deviation before making more changes.
   If the classification requires a task-plan update, generate the bounded
   prompt with:

```sh
sh scripts/task-loop.sh update T1.1
```

5. Generate the review prompt:

```sh
sh scripts/task-loop.sh review T1.1
```

6. Keep the task in one explicit state:
   - `implementing`
   - `needs_review`
   - `needs_rework`
   - `blocked`
   - `done`
7. If review returns `needs_rework` and the findings are bounded and in-scope,
   the orchestrator should do one follow-up implementation pass immediately
   without waiting for user input, then spawn a new fresh-context reviewer for
   a second review of the full cumulative task diff.
8. Stop instead of auto-correcting when the review exposes:
   - `spec ambiguity`
   - `product question`
   - `out-of-scope discovery`
   - a change that would require `docs/contract.md`
   - a broader design or task-plan rewrite
   - the same `review -> rework` loop twice
9. Do not mark the task done after implementation alone.
10. Commit only if:
   - the target task objective is complete;
   - the referenced tests and fixtures pass;
   - the applicable stdout/stderr/exit code/mutation policy is preserved;
   - no out-of-scope behavior changed;
   - no eval was weakened;
   - any remaining findings are explicitly non-blocking relative to Gate F.
11. Low severity alone does not justify `done`. A task can finish with only
    remaining `low` findings if, and only if, they are explicitly non-blocking.
12. Move to the next task manually. Do not auto-pick from hidden state.

## Single path

This repository should expose one process path only:

- `docs/tasks.md` is the execution source of truth.
- `scripts/task-loop.sh` is the single operational entrypoint for the local
  agent loop.
- The normative docs remain authoritative for behavior, verification, scope,
  and process.

Subagent spawning is an internal execution detail of that single path. It is
not a second workflow surface.

Do not introduce a second user-facing process layer such as:

- a separate skill system with overlapping commands;
- a separate workflow file that can drift from `scripts/task-loop.sh`;
- a sidecar state file that decides what to do next;
- a PRD-derived loop that competes with `docs/tasks.md`.

If the helper evolves, it should stay behind the same entrypoint and keep the
same responsibility split:

- `docs/tasks.md` says what task to execute.
- `scripts/task-loop.sh` prints how to execute the bounded loop for that task.
- The agent performs the work inside the existing documentary hierarchy.

If implementation is delegated, there must still be only one live
implementation path at a time. The main agent must not edit files in parallel
with a live implementation subagent. If the delegated pass times out, the main
agent should either wait again or close the subagent before resuming locally.

## Helper commands

Print the raw task block:

```sh
sh scripts/task-loop.sh brief T1.1
```

Print the recommended loop for one task:

```sh
sh scripts/task-loop.sh loop T1.1
```

Print a bounded implementation prompt:

```sh
sh scripts/task-loop.sh implement T1.1
```

Print a bounded diff-review prompt:

```sh
sh scripts/task-loop.sh review T1.1
```

Print a bounded fixture-failure analysis prompt:

```sh
sh scripts/task-loop.sh fixture fx01_scan_min_clean T7.2
```

Print a bounded `tasks.md` update prompt after a classified deviation:

```sh
sh scripts/task-loop.sh update T1.1
```

## Non-goals

This helper does not:

- pick the next task automatically;
- use `git`, `date`, or a sidecar progress file as the source of truth;
- auto-commit on green checks;
- replace review with repeated implementation passes;
- modify `docs/contract.md`;
- add product scope.
