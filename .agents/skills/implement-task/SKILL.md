---
name: implement-task
description: Implement exactly one task from docs/tasks.md when the user names a specific task ID (Tn.m product task or Sn spike, e.g. "T1.1", "T0.0a", "S3", "implement T2.3"). Product-task IDs may include a lowercase suffix (e.g. T0.0a). Spike IDs use the Sn form (e.g. S1-S6). Spike work is governed by docs/operating-model.md §17 - a spike produces a report, not hidden product code. Do not use for review, task-plan edits, picking the next task, or any request without an explicit task ID.
---

You are the orchestrator for the target task.

1. Identify the task ID from the user's request. Accepted forms: `Tn.m` product task (optionally with a lowercase suffix, e.g. `T0.0a`) or `Sn` spike (e.g. `S3`). For spikes, apply the `docs/operating-model.md` §17 discipline: produce a bounded report with question, protocol, result, decision, and consequences - not hidden product implementation. If no explicit ID is provided, stop and ask.
2. Read, in order:
   - `docs/operating-model.md`
   - `docs/contract.md`
   - `docs/design.md`
   - `docs/evals.md`
3. Read `docs/tasks.md` and locate both:
   - the task block under the heading `### <TASK_ID> ` (up to the next `### ` or `## `)
   - the `## Execution State` section for current progress context
4. Read `AGENTS.md` as an entry-point map only. If it conflicts with the normative docs above, the normative docs win.
5. If a scope question remains open after the required reading, consult `docs/brief.md` to arbitrate product scope. Do not use it to invent behavior.
6. If the task or bounded files touch parser, renderer, CLI, filesystem mutation, packaging, or test-harness behavior, read the relevant accepted ADRs in `docs/adr/` before editing. Accepted ADRs are binding unless the task is explicitly about updating that ADR surface.
7. Use `## Execution State` for orientation only. Do not switch tasks based on it. The explicit task ID is authoritative.
8. Before the first implementation edit, ensure `docs/tasks.md` `## Execution State` identifies the target task in `Current active task`. Apply this routine start-of-task sync directly in the same bounded patch; do not bounce to `update-tasks` just for cursor alignment. If you edit `docs/tasks.md`, run `validate-tasks` before returning.

Before coding:
- state the target task, the relevant contract/design/eval refs, and the smallest checks that should fail or pass
- state which repo-local static checks apply to the files you expect to touch, and which of them must pass before you return `needs_review`
- state any `docs/brief.md` or `docs/adr/` refs used for scope or architectural binding when they are applicable to the task
- if this is a process-doc or ADR task and the task block does not name contract/design/eval refs, identify the relevant operating-model and ADR refs instead, classify the change as process maintenance, and bound the files being changed

Execution model:
- keep `docs/tasks.md` and the normative docs as the only source of truth
- do not create a parallel planning system
- implementation is local in the main agent by default
- delegate only if the task is large or risky enough that a bounded subagent materially improves the result
- if delegating, spawn at most one implementation subagent, keep the same sandbox and approval settings, and restrict work to the target task
- if an implementation subagent is alive, do not edit files in parallel in the main agent
- if a subagent times out, either wait again or close it before making local edits
- do not spawn a reviewer yet
- do not commit from any implementation pass
- if a delegated subagent hits a blocking issue, have it return a single classified deviation before more edits are attempted
- treat the broader workflow state vocabulary as exactly: `implementing`, `needs_review`, `needs_rework`, `blocked`, `done`
- for this skill's own final output, the only valid next states after an implementation pass are `needs_review` or `blocked`
- do not return `needs_review` until the repo-local static checks applicable to the touched files have been run on the post-patch state and pass; when no such check exists for that surface, say so explicitly
- routine `docs/tasks.md` execution-state edits for start-of-task alignment may be applied directly here
- if the pass ends in `blocked` because of a structural task-plan problem or a classified deviation that must be recorded in `docs/tasks.md`, return a bounded hand-off for `update-tasks`; do not broaden scope by editing the task plan from this skill
- do not mark the task `done` from this skill

Constraints:
- do not modify `docs/contract.md`
- do not modify product scope
- do not implement adjacent tasks
- do not add behavior not required by the task
- keep the patch minimal
- add or update only tests/fixtures required by this task
- preserve stdout/stderr/exit code discipline
- preserve mutation policy
- preserve the documentary hierarchy:
  - `contract.md` for observable behavior
  - `evals.md` for verification gates and fixtures
  - `brief.md` for scope
  - `design.md` for compatible implementation
  - `operating-model.md` for production method
- if a deviation is found, classify it before changing code, fixtures, or docs, using the `docs/operating-model.md` §10 taxonomy

Delegated-subagent contract (if used):
- the subagent prompt must satisfy `docs/operating-model.md` §9.3 and include:
  - the current phase
  - the target task
  - the allowed files or targeted components
  - the forbidden changes
  - the relevant contract sections
  - any relevant `docs/brief.md` or accepted ADR refs when they materially bound scope or implementation strategy
  - the expected fixtures or tests
  - the expected output format
  - the allowed freedom level
- implement the target task only
- keep the patch minimal
- add or update only tests/fixtures required by this task
- run the smallest relevant check early
- rerun the repo-local static checks applicable to the touched files before returning success to the orchestrator
- stop on the first blocking failure
- return to the orchestrator with:
  1. files changed
  2. behavior implemented
  3. tests/fixtures run
  4. risks
  5. any spec ambiguity encountered
  6. classification of any deviation per `docs/operating-model.md` §10

Orchestrator return:
1. files changed
2. relevant contract/design/eval refs identified before implementation, plus any `docs/brief.md` or ADR refs used for scope or architectural binding (or operating-model/ADR refs for a process-doc task)
3. smallest checks selected
4. implementation result
5. current task state: `needs_review` or `blocked`
6. execution-state update applied directly in `docs/tasks.md`, or bounded hand-off for `update-tasks` when structural task-plan maintenance is still required
