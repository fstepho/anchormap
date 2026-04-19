---
name: review-task
description: Review the cumulative diff for a specific task against the normative docs. Use when the user asks for a review pass on a named task (e.g. "review T1.1", "review T0.0a", or "review S3"). Accepted IDs - Tn.m product tasks (optionally with a lowercase suffix) and Sn spike tasks. Do not use for implementation, for picking the next task, or to propose new product features. Invocation - a fresh Codex session. This skill forbids source edits by prose and runs the referenced checks itself.
---

You are the orchestrator for the review pass of the target task.

1. Identify the task ID from the user's request. Accepted forms: `Tn.m` product task (optionally with a lowercase suffix, e.g. `T0.0a`) or `Sn` spike (e.g. `S3`). If no explicit ID is provided, stop and ask.
2. Read, in order:
   - `AGENTS.md`
   - `docs/operating-model.md`
   - `docs/contract.md`
   - `docs/design.md`
   - `docs/evals.md`
3. Read `docs/tasks.md` and locate:
   - the task block under `### <TASK_ID> `
   - the `## Execution State` section for current progress context

Use `## Execution State` for orientation only. Do not switch tasks based on it. The explicit task ID is authoritative.

Review the full cumulative diff for the target task only, against:
- `docs/contract.md`
- `docs/design.md`
- `docs/evals.md`
- `docs/operating-model.md`
- the target task block in `docs/tasks.md`

Execution model:
- this skill must run in a fresh-context session: a new Codex session with no prior conversation history, or a newly spawned subagent when delegation is supported. The prose rules below are the guarantee.
- each review pass uses a new session (or a newly spawned subagent when delegation is used); do not reuse a session or reviewer that previously handled implementation of the target task or an earlier review pass on it
- each review pass must inspect the full cumulative task diff since the start of the target task, not only the latest follow-up delta
- this skill must not edit source files, fixtures, or goldens. Running `git diff`, `git log`, build, test, and the referenced fixtures is expected.
- run the referenced checks yourself during review: invoke the target task's build, test, and fixture commands and report their outcomes as part of the findings
- do not ask the review session (or subagent) to propose new product features
- the orchestrator decides whether follow-up edits are needed
- do not commit until the review findings are addressed and Gate F is satisfied
- if review requires follow-up edits, set the task state to `needs_rework` and emit a structured hand-off (return item 2) describing the required fix scope and files. This skill does not apply edits; the follow-up runs in a subsequent session.
- if a referenced check fails when you run it, or a documented failure case or fixture is not exercised by the diff, return `needs_rework` with the specific failing command or missing fixture
- if review returns bounded in-scope findings, the hand-off must be tight enough that a single follow-up implementation pass in a subsequent session can resolve it without additional user input
- after the follow-up implementation has been applied in that separate session, a new fresh-context reviewer is spawned for a second review before marking the task `done`
- on a second or later review pass, pay extra attention to files changed since the previous review, but still review the full cumulative task diff
- "ready for re-review" is not `done`
- severity alone does not decide `done`
- if only low-severity findings remain, mark the task `done` only if they are explicitly non-blocking and Gate F is satisfied; otherwise keep the task in `needs_rework` or `blocked`
- stop instead of auto-correcting when review finds:
  - spec ambiguity
  - product question
  - out-of-scope discovery
  - any change that would require `docs/contract.md`
  - any broader design or task-plan rewrite
  - a repeated `review -> rework` loop of the same class twice
- the only valid final states from this skill are: `done`, `needs_rework`, `blocked`
- after deciding the final state, record the required `docs/tasks.md` `## Execution State` updates as a structured hand-off (return item 4), to be applied by the orchestrator in a subsequent session. Do not mutate `docs/tasks.md` from this skill. The hand-off must cover:
  - for `done`: clear or replace `Current active task`, set `Last completed task`, append to `Completed tasks recorded here`, and clear blockers that depended on the task
  - for `needs_rework`: keep or restore the task as active and record any explicit deviation in `Open deviations` when applicable
  - for `blocked`: record the blocker in `Blocked tasks` and do not mark the task as completed
- do not auto-pick the next task in the hand-off

Classify each finding with exactly one primary classification from `docs/operating-model.md` §10:
- contract violation
- spec ambiguity
- design gap
- eval defect
- product question
- tooling problem
- out-of-scope discovery

Optional secondary tags may be added for routing only, for example:
- eval-gap
- design-divergence
- task-scope-creep
- mutation-policy
- fixture-golden
- non-blocking-risk

Do not suggest new product features.
Do not rewrite the architecture unless the diff violates the contract or task scope.
Do not request broad refactors unless the current diff prevents the referenced task from satisfying its contract/eval obligations.

Review questions:
- which task is targeted?
- which contract sections are impacted?
- which fixtures should pass?
- did the diff change behavior outside the task?
- did the diff change output, exit codes, or mutation policy?
- did the diff weaken an eval?
- which checks must run to verify this diff, and do they pass when you run them?
- are failures and edge cases covered?
- are known limits documented?
- which findings are blocking vs explicitly non-blocking relative to Gate F?
- if this is a process-doc or ADR task, which operating-model/ADR refs govern the diff, and are the changed files still properly bounded?

Orchestrator return:
1. review findings ordered by severity
2. any required follow-up edits
3. any findings explicitly accepted as non-blocking
4. execution-state update required in `docs/tasks.md`
5. current task state: `done`, `needs_rework`, or `blocked`
