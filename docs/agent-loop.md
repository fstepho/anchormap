# Agent Loop

Status: helper note, non-normative

Scope: repo-local workflow helper for bounded task execution by a human plus
one implementation pass and one fresh-context review pass, with a single human
or agent coordinating the sequence.

Precedence: if this file conflicts with `docs/operating-model.md`,
`docs/contract.md`, `docs/design.md`, `docs/evals.md`, or `docs/tasks.md`, the
normative documents win.

## Purpose

This file exists only to make the repo-local workflow easier to execute.

It adds:

- an index of the repo-local skills under `.agents/skills/`;
- the minimum local command surface used in the harness phase;
- one compact loop for task execution and review.

It does not replace the normative process. Use:

- `docs/operating-model.md` for deviation taxonomy, review protocol, and task-level done;
- `docs/tasks.md` for the task plan and the live `## Execution State` cursor.

## Skills

Path-based skill invocation is the portable baseline. On agents that discover
repo-local skills automatically, shorthand such as `$implement-task T1.1` may
also work.

| Skill | Purpose | Path |
|---|---|---|
| `implement-task` | Bounded implementation of one task (`Tn.m` or `Sn`). | `.agents/skills/implement-task/SKILL.md` |
| `review-task` | Fresh-context review of the cumulative task-scoped diff for one task. | `.agents/skills/review-task/SKILL.md` |
| `diagnose-fixture` | Classification of one fixture failure using the repo taxonomy. | `.agents/skills/diagnose-fixture/SKILL.md` |
| `update-tasks` | Bounded update to `docs/tasks.md` after a classified deviation or explicit task-state transition. | `.agents/skills/update-tasks/SKILL.md` |
| `validate-tasks` | Structural lint for `docs/tasks.md`; runs `scripts/lint-tasks.sh`. | `.agents/skills/validate-tasks/SKILL.md` |

## Recommended Loop

1. Pick exactly one task from `docs/tasks.md`.
2. Ensure `docs/tasks.md` `## Execution State` records that task as the current active task. Use `update-tasks` when the cursor is not already aligned.
3. Run `implement-task` for that task. Identify the relevant contract, design, and eval references before patching, then run the smallest relevant check early.
4. If blocked, classify the deviation before making more changes. Update `docs/tasks.md` through `update-tasks` only when the task state or deviation record must change.
5. Run `review-task` against the full cumulative task-scoped diff. Prefer a fresh-context review pass; if your agent cannot spawn one, use a fresh session.
6. If review returns `needs_rework`, apply one bounded follow-up and then run a new fresh-context review pass on the full cumulative diff.
7. Stop instead of iterating when review exposes `spec ambiguity`, `product question`, `out-of-scope discovery`, a required `docs/contract.md` change, or a broader task-plan rewrite.
8. Mark the task `done` only when the task-level done conditions in `docs/operating-model.md` §19.1 are satisfied, then sync `docs/tasks.md` through `update-tasks` before commit or handoff.

## Minimal Local Commands

For `T1.7` and later harness work, the minimum local command surface is:

- `npm run test:unit`
- `npm run test:fixtures:all`
- `npm run test:fixtures -- --fixture <fixture-id>`
- `npm run test:fixtures -- --family <family>`
- `npm run check:goldens -- --fixture <fixture-id>`

Notes:

- `npm test` remains the default full unit-test entrypoint and delegates to `npm run test:unit`.
- the fixture-runner scripts compile first and then execute the built runner from `dist/`;
- `npm run test:fixtures:all` scans the runnable fixture corpus under `fixtures/`;
- fixture manifests may point either to the built product CLI when available or to `node dist/cli-stub.js` while product implementation is still in progress.

## Non-Goals

This helper does not:

- pick the next task automatically;
- use `git`, `date`, or a sidecar progress file as the source of truth;
- auto-commit on green checks;
- replace bounded review with repeated implementation passes;
- modify `docs/contract.md`;
- add product scope.
