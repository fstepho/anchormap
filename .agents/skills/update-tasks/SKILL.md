---
name: update-tasks
description: Update docs/tasks.md for a classified deviation or structural §8.4 task-plan maintenance such as a split, regrouping, dependency update, or explicit plan reshaping. Do not use for routine cursor movement, implementation, review, or product-scope changes.
---

Update `docs/tasks.md` only.

## Intake

1. Identify affected task IDs. Accepted forms are `Tn.m`, optional lowercase
   suffix, and `Sn`. If none are provided, stop and ask.
2. Read `docs/operating-model.md` §8.4, §10, and the done rule relevant to the
   change.
3. Read `docs/tasks.md`, including `## Execution State` and each affected task
   block.
4. Read `AGENTS.md` as an entry map only. Normative docs win on conflict.
5. Read only the contract, design, eval, brief, or accepted ADR sections needed
   to preserve traceability for the requested task-plan change.

## Allowed Surface

Use this skill for structural task-plan edits and classified deviations that
materially change the task record. Routine start, rework, blocked, or done
cursor transitions belong to `implement-task` or the coordinator after a
`review decision`.

Update `## Execution State` in the same patch only when the structural change
or deviation requires it.

## Classification

For a classified deviation, use exactly one primary label from
`docs/operating-model.md` §10 and state whether it is blocking or non-blocking
relative to the applicable done definition.

For a routine structural edit that is not a deviation, state:
`no deviation, routine §8.4 task edit`.

If the classification is `spec ambiguity`, `product question`, or
`out-of-scope discovery`, record only the bounded deviation needed for routing
and stop.

## Constraints

- Do not modify any file except `docs/tasks.md`.
- Do not modify `docs/contract.md`.
- Do not add product scope or runtime behavior.
- Keep existing task IDs stable unless a split is required.
- Preserve dependency, contract, design, and eval traceability.
- Keep spikes separate from production tasks.

## Return

1. changed task IDs
2. reason for change and primary classification or routine §8.4 note
3. updated dependencies
4. updated verification references
5. remaining risks
6. `Open deviations` entry when applicable, using the repo lintable shape
7. execution-state cursor changes, if any
