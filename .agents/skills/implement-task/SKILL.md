---
name: implement-task
description: Implement exactly one explicit task from docs/tasks.md when the user names a task ID (Tn.m, optional lowercase suffix such as T0.0a, or Sn spike). Use for bounded implementation only. Do not use for review, task-plan edits, picking the next task, or requests without an explicit task ID.
---

You are the orchestrator for one target task.

## Intake

1. Identify the task ID from the request. Accepted forms are `Tn.m`, optional
   lowercase suffix, and `Sn`. If no explicit ID is provided, stop and ask.
2. Read `docs/operating-model.md`, then `docs/tasks.md`.
3. Locate `docs/tasks.md` `## Execution State` and the task block headed
   `### <TASK_ID> `.
4. Read `AGENTS.md` as an entry map only. Normative docs win on conflict.

## Authority Coverage

Use `docs/agent-loop.md` Reading Modes:

- `standard`: read only the contract, design, and eval sections referenced by
  the task block.
- `critical`: establish authoritative coverage of the relevant contract,
  design, eval, and accepted ADR authority.

If a task block lacks enough traceability for the selected mode, classify the
gap before patching. Consult `docs/brief.md` only to arbitrate an open scope
question. For a spike, apply `docs/operating-model.md` §17 and produce the
bounded report it requires, not hidden product implementation.

For an explicit process-doc or ADR closure task whose task block names
operating-model or ADR refs instead of product contract/design/eval refs,
classify the pass as process maintenance, identify those operating-model/ADR
refs as the binding authority, and bound the files being changed before
patching.

## Before Editing

State:

- target task and reading mode;
- binding contract/design/eval refs, or operating-model/ADR refs for a
  process-doc or ADR closure task;
- smallest early check and full applicable handoff checks;
- expected patch boundary.

Before the first implementation edit, ensure `docs/tasks.md`
`## Execution State` identifies the target task in `Current active task`.
Apply that routine sync directly if needed. If you touch `docs/tasks.md`, run
`validate-tasks` before returning.

## Mutation Bounds

- Do not modify `docs/contract.md`.
- Do not modify product scope or implement adjacent tasks.
- Do not add behavior without task, contract, and eval traceability.
- Keep patches minimal and limited to code, tests, fixtures, or docs required
  by the target task.
- Preserve stdout/stderr/exit-code and filesystem-mutation discipline.
- Do not commit and do not mark the task `done` from this skill.
- Return `needs_review` only after applicable repo-local static checks pass on
  the post-patch state, or explicitly state that no static check covers the
  touched surface.

If an applicable static check fails only with deterministic formatter or
import-order diagnostics on files already touched by this task, apply the
bounded mechanical correction and rerun that check. Return `blocked` only if
the check still fails, the correction touches unrelated files, or the remaining
diagnostic is not mechanical.

## Delegation

Implementation is local by default. Delegate only when the runtime provides a
fresh task-scoped subagent and delegation materially helps.

If using `spawn_agent`, pass `fork_context: false` and an explicit
`reasoning_effort`. `fork_context: true` is forbidden for delegated
implementation or rework. While a subagent is alive, do not edit files in
parallel in the main agent. Close or wait for the subagent before local edits.

The subagent prompt must name the task, allowed files or components, forbidden
changes, relevant refs, expected checks, expected output, and selected
`reasoning_effort`.

## Blocked Path

Classify every deviation with `docs/operating-model.md` §10 before further
patching. If a structural task-plan change or classified deviation must be
recorded in `docs/tasks.md`, return a bounded handoff for `update-tasks`
instead of broadening this skill.

## Return

1. files changed
2. refs identified before implementation
3. smallest checks selected
4. checks executed
5. implementation result
6. current task state: `needs_review` or `blocked`
7. execution-state sync applied, or bounded handoff for `update-tasks`
8. delegated subagent `reasoning_effort`, if non-default or relevant
