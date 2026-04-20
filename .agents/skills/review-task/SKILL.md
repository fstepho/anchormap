---
name: review-task
description: Review the current cumulative task-scoped change set for a specific task against the normative docs. Use when the user asks for a review pass on a named task (e.g. "review T1.1", "review T0.0a", or "review S3"), or asks to review the current active task. Accepted IDs - Tn.m product tasks (optionally with a lowercase suffix) and Sn spike tasks. If no task ID is provided, propose `docs/tasks.md` `## Execution State` -> `Current active task` for explicit confirmation before proceeding. Do not use for implementation, for picking the next task, or to propose new product features. Invocation - a newly spawned subagent when available, otherwise a fresh Codex session. This skill forbids source edits by prose and runs the referenced checks itself.
---

You are the orchestrator for the review pass of the target task.

1. Identify the task ID from the user's request. Accepted forms: `Tn.m` product task (optionally with a lowercase suffix, e.g. `T0.0a`) or `Sn` spike (e.g. `S3`). If the user did not provide one, read `## Execution State` in `docs/tasks.md` and propose the `Current active task` value for confirmation; wait for an explicit "yes" or a different ID before proceeding. If `Current active task` is empty, absent, ambiguous, or does not contain a valid task ID, stop and ask. Once confirmed, treat that task ID as the explicit target for the rest of the skill.
2. Read, in order:
   - `docs/operating-model.md`
   - `docs/contract.md`
   - `docs/design.md`
   - `docs/evals.md`
3. Read `docs/tasks.md` and locate:
   - the task block under `### <TASK_ID> `
   - the `## Execution State` section for current progress context
4. Read `AGENTS.md` as an entry-point map only. If it conflicts with the normative docs above, the normative docs win.
5. If a scope question remains open after the required reading, consult `docs/brief.md` to arbitrate product scope. Do not use it to invent behavior.
6. If the reviewed change touches parser, renderer, CLI, filesystem mutation, packaging, or test-harness behavior, read the relevant accepted ADRs in `docs/adr/` before concluding. Accepted ADRs are binding unless the reviewed change is explicitly about updating that ADR surface.

Use `## Execution State` for orientation only. Do not switch tasks based on it. The explicit task ID is authoritative.

Review the full current task-scoped change set for the target task only, against:
- `docs/contract.md`
- `docs/design.md`
- `docs/evals.md`
- `docs/operating-model.md`
- the target task block in `docs/tasks.md`

Execution model:
- this skill must run in a fresh context. Prefer a newly spawned subagent when delegation is supported; fall back to a new Codex session with no prior conversation history otherwise. The prose rules below are the guarantee.
- each review pass uses a fresh context; do not reuse a session or reviewer that previously handled implementation of the target task or an earlier review pass on it
- each review pass must inspect the full current task-scoped change set present in the workspace for the target task, not only the latest follow-up delta from the previous pass
- use `docs/tasks.md`, the target task block, and the bounded files/components of the task as the authoritative scope surface; `git diff` or `git log` may be used as inspection aids only, never as the authoritative definition of task start or task scope
- this skill must not edit source files, fixtures, or goldens. Running build, test, the referenced fixtures, and inspection commands such as `git diff` is expected when helpful.
- run the referenced checks yourself during review and report their outcomes as part of the findings
- when the task block or repo docs already name concrete commands, use those commands
- when the task block provides only `Suggested verification:` prose, derive the smallest concrete repo-local checks from that prose plus the referenced fixtures/tests, and label them as reviewer-derived checks rather than normative task text
- if no concrete repo-local check can be derived without guessing beyond the repo docs, stop and return `blocked`; classify as `eval defect` when verification guidance is missing or insufficient, or as `spec ambiguity` when the expected behavior itself is underdefined
- do not ask the review session (or subagent) to propose new product features
- the orchestrator decides whether follow-up edits are needed
- do not commit until the review findings are addressed and the task-level done conditions in `docs/operating-model.md` §19.1 are satisfied
- if review requires follow-up edits, set the task state to `needs_rework` and emit a structured hand-off (return item 2) describing the required fix scope and files. This skill does not apply edits; the orchestrator applies the follow-up.
- if a referenced check fails when you run it, or a documented failure case or fixture is not exercised by the diff, return `needs_rework` with the specific failing command or missing fixture
- if review returns bounded in-scope findings, the hand-off must be tight enough that a single follow-up implementation pass can resolve it without additional user input
- after the follow-up implementation has been applied, a new fresh-context reviewer is spawned for a second review before marking the task `done`
- on a second or later review pass, pay extra attention to files changed since the previous review, but still review the full current task-scoped change set
- "ready for re-review" is not `done`
- severity alone does not decide `done`
- if only low-severity findings remain, mark the task `done` only if they are explicitly non-blocking and the task-level done conditions in `docs/operating-model.md` §19.1 are satisfied; otherwise keep the task in `needs_rework` or `blocked`
- stop instead of auto-correcting when review finds:
  - spec ambiguity
  - product question
  - out-of-scope discovery
  - any change that would require `docs/contract.md`
  - any broader design or task-plan rewrite
  - a repeated `review -> rework` loop of the same class twice
- the only valid final states from this skill are: `done`, `needs_rework`, `blocked`
- after deciding the final state, record the required `docs/tasks.md` `## Execution State` updates as a structured hand-off (return item 4), to be applied by the orchestrator. Do not mutate `docs/tasks.md` from this skill. The hand-off must cover:
  - for `done`: clear or replace `Current active task`, update `Next executable product task after blocker clearance` only when it is explicitly determined by the task plan or blocker state, set `Last completed task`, append to `Completed tasks recorded here`, and clear blockers that depended on the task
  - for `needs_rework`: keep or restore the task as active, leave `Next executable product task after blocker clearance` unchanged unless the deviation explicitly changes it, and record any explicit deviation in `Open deviations` when applicable
  - for `blocked`: record the blocker in `Blocked tasks`, leave `Next executable product task after blocker clearance` unchanged unless the blocker explicitly changes it, and do not mark the task as completed
- do not auto-pick the next task or invent `Next executable product task after blocker clearance` in the hand-off

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
- which accepted ADRs bind the diff when it touches parser, renderer, CLI, filesystem mutation, packaging, or test-harness behavior?
- did the diff weaken an eval?
- which checks must run to verify this diff, and do they pass when you run them?
- are failures and edge cases covered?
- are known limits documented?
- which findings are blocking vs explicitly non-blocking relative to `docs/operating-model.md` §19.1?
- if this is a process-doc or ADR task, which operating-model/ADR refs govern the diff, and are the changed files still properly bounded?

Orchestrator return:
1. review findings ordered by severity; each finding must include its primary classification and a `blocking` or `non-blocking` status relative to `docs/operating-model.md` §19.1
2. any required follow-up edits
3. any findings explicitly accepted as non-blocking
4. execution-state update required in `docs/tasks.md`
5. current task state: `done`, `needs_rework`, or `blocked`
