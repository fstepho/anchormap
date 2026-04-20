---
name: update-tasks
description: Update docs/tasks.md for a classified deviation on one or more tasks, or for a routine §8.4 task edit (split, regrouping, dependency update). Accepted task IDs - Tn.m product tasks (optionally with a lowercase suffix, e.g. T0.0a) and Sn spike tasks (e.g. S3). Use when the user asks to record a deviation, split a task, update task dependencies, or sync the execution-state cursor for explicit task IDs, including marking a task active at task start and applying review hand-offs. Do not use to implement, review, or add product scope.
---

Update `docs/tasks.md` only, for the bounded change below.

This is the only skill that edits `docs/tasks.md`, including `## Execution State`
updates handed off from `implement-task` or `review-task`.

1. Identify the affected task ID(s) from the user's request. Accepted forms: `Tn.m` product task (optionally with a lowercase suffix, e.g. `T0.0a`) or `Sn` spike (e.g. `S3`). If no explicit IDs are provided, stop and ask. A pure execution-state sync still requires the affected task IDs to be explicit.
2. Read, in order:
   - `docs/operating-model.md` (especially §8.4 and §10)
   - `docs/contract.md`
   - `docs/design.md`
   - `docs/evals.md`
3. Read `docs/tasks.md`. Locate:
   - each affected task block under `### <TASK_ID> `
   - the `## Execution State` section
4. Read `AGENTS.md` as an entry-point map only. If it conflicts with the normative docs above, the normative docs win.
5. If a scope question remains open after the required reading, consult `docs/brief.md` to arbitrate product scope. Do not use it to invent behavior.
6. If the requested tasks update changes planning around parser, renderer, CLI, filesystem mutation, packaging, or test-harness behavior, or records a deviation against an accepted ADR, read the relevant accepted ADRs in `docs/adr/` before editing `docs/tasks.md`.

Use `## Execution State` to understand current progress, blocked work, and completed work. The execution cursor must be updated in the same patch whenever this deviation changes task state. Routine execution-state syncs are also allowed when the operator begins explicit work on a task and needs to set `Current active task` before implementation starts. Do not auto-pick the next task or invent `Next executable product task after blocker clearance`; change that field only when the blocker/dependency state makes the value explicit.

If this change is a classified deviation, classify it with exactly one primary classification from `docs/operating-model.md` §10:
- contract violation
- spec ambiguity
- design gap
- eval defect
- product question
- tooling problem
- out-of-scope discovery

Indicate separately whether the deviation is blocking or non-blocking relative to the task-level done definition (`docs/operating-model.md` §19.1) for each affected task.

If this change is a routine task edit under `docs/operating-model.md` §8.4 (split, regrouping, dependency update) and not a classified deviation, state `no deviation, routine §8.4 task edit` instead of a §10 class, skip return item 6, and include return item 7 only if the execution-state cursor changes.

If this change is only a routine execution-state sync and not a classified deviation, state `no deviation, routine execution-state sync` instead of a §10 class, skip return item 6, and use return item 7 to describe the cursor update. This includes setting `Current active task` to an explicit task ID when the operator starts implementation work on that task.

Constraints:
- do not modify `docs/contract.md`
- do not add product scope
- do not introduce new behavior without contract/eval traceability
- keep existing task IDs stable unless a task must be split
- if a task is split, preserve dependency traceability
- spikes must remain separate from production tasks
- if the classification is spec ambiguity, product question, or out-of-scope discovery, stop and do not modify the tasks beyond recording the deviation

Return:
1. changed task IDs
2. reason for change, with the primary classification from §10
3. updated dependencies
4. updated verification references
5. remaining risks
6. `Open deviations` entry to append under `## Execution State` when this is a classified deviation, placed as an indented bullet (two-space indent) directly under `- Open deviations:`. Replace the `- None recorded` placeholder if it is the only existing entry. The entry must contain at least one affected task ID so that `scripts/lint-tasks.sh` does not flag it. Entry shape:
   `<task_id> — <classification §10> — <blocking|non-blocking> — <short summary> — refs: <contract/design/eval/operating-model refs>`
7. Execution-state cursor updates required alongside this change when the cursor changes:
   - `Current active task`
   - `Next executable product task after blocker clearance` (only if explicitly known from the blocker/dependency change; never auto-pick)
   - `Last completed task` (only if a task became done as a side effect)
   - `Blocked tasks` (add or clear)
   - `Open deviations` (append the entry from step 6 when applicable)
