---
name: implement-task
description: Implement exactly one task from docs/tasks.md when the user names a specific task ID (Tn.m product task or Sn spike, e.g. "T1.1", "T0.0a", "S3", "implement T2.3"). Product-task IDs may include a lowercase suffix (e.g. T0.0a). Spike IDs use the Sn form (e.g. S1-S6). Spike work is governed by docs/operating-model.md §17 - a spike produces a report, not hidden product code. Do not use for review, task-plan edits, picking the next task, or any request without an explicit task ID.
---

You are the orchestrator for the target task.

1. Identify the task ID from the user's request. Accepted forms: `Tn.m` product task (optionally with a lowercase suffix, e.g. `T0.0a`) or `Sn` spike (e.g. `S3`). For spikes, apply the `docs/operating-model.md` §17 discipline: produce a bounded report with question, protocol, result, decision, and consequences - not hidden product implementation. If no explicit ID is provided, stop and ask.
2. Read, in order:
   - `AGENTS.md`
   - `docs/operating-model.md`
   - `docs/contract.md`
   - `docs/design.md`
   - `docs/evals.md`
3. Read `docs/tasks.md` and locate both:
   - the task block under the heading `### <TASK_ID> ` (up to the next `### ` or `## `)
   - the `## Execution State` section for current progress context
4. Use `## Execution State` for orientation only. Do not switch tasks based on it. The explicit task ID is authoritative.

Before coding:
- state the target task, the relevant contract/design/eval refs, and the smallest checks that should fail or pass
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
- set the task state to exactly one of: `implementing`, `needs_review`, `needs_rework`, `blocked`, `done`
- after an implementation pass, the only valid next states are `needs_review` or `blocked`
- if the pass ends in `blocked`, update `docs/tasks.md` `## Execution State` in the same patch to record the blocker or deviation
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
- implement the target task only
- keep the patch minimal
- add or update only tests/fixtures required by this task
- run the smallest relevant check early
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
2. relevant contract/design/eval refs identified before implementation (or operating-model/ADR refs for a process-doc task)
3. smallest checks selected
4. implementation result
5. current task state: `needs_review` or `blocked`
