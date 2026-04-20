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

## Orchestrator Routing

This section is a local routing aid for the recommended loop. It is not a
normative contract and does not override:

- `docs/operating-model.md`
- `docs/tasks.md`
- the skill-specific rules in `.agents/skills/*/SKILL.md`

Use it to route the next action after each skill result, not to redefine the
skills themselves.

### Routing Table

| Step just completed | Result | Next action |
|---|---|---|
| `implement-task` | `needs_review` | Run `review-task` on the full cumulative task-scoped diff in a fresh context. |
| `implement-task` | `blocked` because `docs/tasks.md` execution state is out of sync | Run `update-tasks` for the routine execution-state sync, then resume from the interrupted step. |
| `implement-task` | `blocked` with a classified deviation | Run `update-tasks` to record the deviation and task state. If the block is a fixture failure that needs diagnosis, run `diagnose-fixture` next; otherwise stop and hand off. |
| `review-task` | `done` | Run `update-tasks` to apply the review hand-off to `docs/tasks.md`, then hand off for the human commit or handoff gate. Do not auto-commit. |
| `review-task` | `needs_rework` | Apply one bounded follow-up, then run a new fresh-context `review-task` pass on the full cumulative diff. |
| `review-task` | `blocked` | Stop and hand off with the review classification, evidence, and required escalation. |
| `diagnose-fixture` | classified result returned | Route according to `docs/operating-model.md` §10. Record any required task-state or deviation update through `update-tasks` before resuming implementation. |
| `update-tasks` | change applied successfully | Resume the interrupted workflow step. |
| `validate-tasks` | exit `0` | Continue the workflow. |
| `validate-tasks` | exit non-zero | Classify the issue, apply any required `docs/tasks.md` change through `update-tasks`, then rerun `validate-tasks` before continuing. |

### Invariants

- `review-task` always runs in a fresh context. Follow the rule from `.agents/skills/review-task/SKILL.md`; do not reuse the implementation session or a previous reviewer session.
- Allow at most one bounded `review -> rework -> review` loop per task pass. If the same class of blocking issue comes back again, stop instead of iterating.
- `update-tasks` is the only path that edits `docs/tasks.md`, including routine execution-state syncs and classified deviations.
- Do not auto-pick the next task. Task selection remains human-directed.
- Do not auto-commit. A green review pass is necessary for handoff, not sufficient for commit.

### Hard Stops

Stop and hand back to the human coordinator when any of the following is true:

- `review-task` or `diagnose-fixture` classifies the issue as `spec ambiguity`
- `review-task` or `diagnose-fixture` classifies the issue as `product question`
- `review-task` or `diagnose-fixture` classifies the issue as `out-of-scope discovery`
- the required fix would need a change to `docs/contract.md`
- the required fix would need a broader task-plan rewrite rather than a bounded task update
- the same class of blocking review finding returns after one bounded follow-up

### Human Gates

The coordinator does not decide these alone:

- Task selection: choose the task explicitly from `docs/tasks.md`
- Escalation handling: resolve any hard stop before resuming the loop
- Commit or final handoff: after `review-task` returns `done`, sync `docs/tasks.md` as needed, then let the human decide whether to commit or hand off

### Local Stop Labels

When a handoff benefits from a short label, the following local labels are
recommended:

- `done`
- `needs_rework_applied`
- `rework_cap_exceeded`
- `escalation_spec_ambiguity`
- `escalation_product_question`
- `escalation_out_of_scope`
- `escalation_contract_change`
- `blocked_execution_state`
- `human_gate_commit`
- `human_gate_task_selection`

These labels are shorthand for local coordination only. The normative sources
remain the workflow state vocabulary and deviation taxonomy defined elsewhere.

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
