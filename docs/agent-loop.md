# Agent Loop

Status: helper note, non-normative

Scope: repo-local workflow helper for bounded task execution by a human plus
one implementation pass and one fresh review pass, with a single human or
agent coordinating the sequence.

Precedence: if this file conflicts with `docs/operating-model.md`,
`docs/contract.md`, `docs/design.md`, `docs/evals.md`, or `docs/tasks.md`, the
normative documents win.

## Purpose

This file exists only to make the repo-local workflow easier to execute.

It adds:

- an index of the repo-local skills under `.agents/skills/`;
- the minimum local command surface used in the harness phase;
- one compact loop for task execution and review, including adversarial
  falsification of newly introduced invariants;
- an explicit autopilot loop for user-authorized task chaining.

It does not replace the normative process. Use:

- `docs/operating-model.md` for deviation taxonomy, review protocol, and task-level done;
- `docs/tasks.md` for the task plan and the live `## Execution State` cursor.

Do not copy this loop into `AGENTS.md`. `AGENTS.md` should point here for
step-by-step execution details.

## Reading Modes

The workflow has two reading modes.

Use `standard` mode for ordinary bounded implementation tasks:

- read `docs/operating-model.md`;
- read `docs/tasks.md`, including `## Execution State` and the target task block;
- read only the `docs/contract.md`, `docs/design.md`, and `docs/evals.md`
  sections referenced by that task;
- read `docs/brief.md` only if a scope question remains open.

Use `critical` mode when the diff touches parser, renderer, CLI boundary,
filesystem mutation, packaging, test-harness behavior, repo-local
review/orchestration mechanics, `docs/contract.md`, or `docs/evals.md`.
Critical mode requires the full `docs/contract.md`, `docs/design.md`,
`docs/evals.md`, plus the relevant accepted ADRs.

If the target task lacks enough references to support standard mode, classify
the gap before patching instead of guessing.

## Skills

Path-based skill invocation is the portable baseline. On agents that discover
repo-local skills automatically, shorthand such as `$implement-task T1.1` may
also work.

| Skill | Purpose | Path |
|---|---|---|
| `implement-task` | Bounded implementation of one task (`Tn.m` or `Sn`). | `.agents/skills/implement-task/SKILL.md` |
| `diagnose-fixture` | Classification of one fixture failure using the repo taxonomy. | `.agents/skills/diagnose-fixture/SKILL.md` |
| `update-tasks` | Bounded update to `docs/tasks.md` for structural task-plan maintenance or classified deviations. | `.agents/skills/update-tasks/SKILL.md` |
| `validate-tasks` | Structural lint for `docs/tasks.md`; runs `scripts/lint-tasks.sh`. | `.agents/skills/validate-tasks/SKILL.md` |

Review itself is not a repo-local skill. The review engine is Codex in a fresh
review session, guided by `AGENTS.md` and `docs/code-review.md`.

## Recommended Loop

1. Pick exactly one task from `docs/tasks.md`.
2. Ensure `docs/tasks.md` `## Execution State` records that task as the current active task. Apply this routine start-of-task sync directly; do not bounce through `update-tasks` just for cursor alignment.
3. Choose `standard` or `critical` reading mode from the task and intended files, then run `implement-task` for that task. Identify the relevant contract, design, and eval references before patching, then run the smallest relevant check early.
   The optional `npm run workflow:preflight -- --task <TASK_ID>` helper can
   verify the active cursor and traceability references before implementation,
   but its `diff_mode:` line is diff-derived and must not be used as the
   implementation reading-mode authority on a clean worktree. For
   process-maintenance work, use `npm run workflow:preflight -- --process <surface>`.
4. If blocked, classify the deviation before making more changes. Use `update-tasks` only when the block or follow-up requires a structural task-plan edit or a classified deviation entry.
5. Before handoff to review, run the repo-local static checks that apply to the touched files. A targeted regression or fixture rerun does not replace applicable lint, format-check, or type-check coverage.
6. Determine the review mode:
   - `critical` if the diff touches parser, renderer, CLI boundary, filesystem mutation, packaging, test-harness behavior, `docs/contract.md`, `docs/evals.md`, or the repo-local review/orchestration mechanics;
   - `standard` otherwise.
7. Before review, ensure the review surface is bounded:
   - prefer one task per worktree or otherwise one clean cumulative diff per task;
   - for process maintenance, keep the diff limited to the named process surface and verify it does not change runtime behavior;
   - if you plan to use `codex review --uncommitted`, unrelated staged, unstaged, and untracked changes must be absent.
   The optional `npm run workflow:preflight -- --task <TASK_ID> --stage review`
   helper can validate the active cursor, traceability references, bounded diff
   presence, and diff-derived review mode before launching review.
8. Start a fresh Codex review session against the full cumulative bounded diff:
   - `codex review --uncommitted` when the worktree contains only that bounded diff;
   - `codex review --base <branch>` or `codex review --commit <sha>` when that gives a cleaner bounded surface.
   - `codex` interactive when the session is started fresh for review and review is its first work step.
   Keep routine review criteria in `docs/code-review.md`, with only entry
   pointers in `AGENTS.md`; do not depend on ad hoc prompt arguments for the
   normal loop.
   After launch, wait for the final reviewer verdict.
   Do not classify `tooling problem` from review silence alone while the process is still alive.
9. Emit the `review decision` immediately after the review findings and before any code change:
   - `clean verdict`
   - `actionable findings`
   - `blocked`
   On the interactive path, the same fresh review session may emit the `review decision`.
   On the `codex review` path, the loop coordinator emits the `review decision` in the coordinator handoff or PR comment equivalent immediately after reading the review output.
   The `review decision` maps actionable findings to repo classification and `blocking` / `non-blocking` status without inventing new findings or using a second reviewer engine. `docs/tasks.md` records only the resulting task-state or deviation changes when the loop requires them.
10. If the `review decision` yields actionable findings, name the protected invariant and presumed root cause before editing, then apply one bounded follow-up, rerun any static checks still applicable to the touched files, and start a new fresh review session in the same mode. If the invariant is not already owned by the repo docs or an accepted ADR, stop and classify the gap instead of patching.
11. Stop instead of iterating when the `review decision` exposes `spec ambiguity`, `product question`, `out-of-scope discovery`, a required `docs/contract.md` change, or a broader task-plan rewrite.
12. If the clean review is task-scoped, mark the task `done` only when the task-level done conditions in `docs/operating-model.md` §19.1 are satisfied, then apply the routine `docs/tasks.md` completion transition directly before commit or handoff. Use `update-tasks` only when the completion also requires a structural plan change or deviation record.
13. If the clean review is process-maintenance-scoped, do not mark any task `done` and do not apply a `docs/tasks.md` completion transition unless the maintenance explicitly changed the task plan. Hand off for the human commit gate with the reviewed process surface and checks.

## Autopilot Loop

Use this loop only when the user explicitly requests `autopilot` or asks the
agent to chain tasks automatically. The normative rules live in
`docs/operating-model.md` §18.1.

Start the session with `codex -p autopilot` or an equivalent Auto-review
permissions mode. Autopilot is not effective if recurring `codex review`,
`git add`, or `git commit` approvals are routed to the human coordinator.

1. Confirm the current worktree can support an autopilot run:
   - unrelated staged, unstaged, and untracked changes must not prevent a
     task-scoped diff, review surface, or commit;
   - if unrelated work is present and cannot be isolated without guessing,
     stop with `blocked_execution_state`.
2. Read `docs/tasks.md` `## Execution State` and select the next executable
   product task from the cursor and task plan. Do not use Git history, clock,
   cache, network, environment, or a sidecar file to choose the task.
3. Run the normal task loop for exactly that task, including reading mode,
   traceability checks, implementation, applicable checks, fresh review
   session, review decision, and up to five fresh review sessions total for
   that task, initial review included.
4. If `codex review` requests escalation to write its session storage, such as
   `.codex/session`, the configured auto-reviewer should handle the approval.
   If the approval is routed to the human coordinator, denied, or the fresh
   review still cannot launch, stop with a `tooling problem`.
5. On a clean task-scoped review decision, apply the normal `docs/tasks.md`
   completion transition only if `docs/operating-model.md` §19.1 is satisfied.
6. Verify the post-transition diff is still bounded to the completed task, then
   create one automatic commit whose message includes the task ID. If `git add`
   or `git commit` requires approval, the configured auto-reviewer should
   handle it; a human approval prompt means the run is not in effective
   autopilot mode.
7. Repeat from step 2 until there is no next executable product task or a hard
   stop occurs.

Autopilot stops immediately on any hard stop from the normal loop, any required
`docs/contract.md` change, any broader task-plan rewrite, any failed required
check, any non-clean fifth review decision for the task, any
unlaunchable fresh review session, or any Git conflict or commit failure.

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
| `implement-task` | `needs_review` | Determine `standard` vs `critical`, isolate a task-scoped review surface, then start a fresh Codex review session on the full cumulative diff in that mode. |
| `implement-task` | `blocked` with a classified deviation | Run `update-tasks` to record the deviation and task state. If the block is a fixture failure that needs diagnosis, run `diagnose-fixture` next; otherwise stop and hand off. |
| fresh review session | findings emitted | Emit the `review decision` before any code change. |
| review decision | clean verdict for task-scoped diff | Apply the routine `docs/tasks.md` completion transition directly, then hand off for the human commit or handoff gate. Do not auto-commit. A clean verdict is valid only if the review explicitly exercised the new task invariants through existing checks or reviewer-derived falsification checks. |
| review decision | clean verdict for process-maintenance diff | Do not apply a task completion transition. Hand off for the human commit or handoff gate with the reviewed process surface and checks. |
| review decision | actionable findings | Apply one bounded follow-up, then start a new fresh review session on the full cumulative diff in the same mode. |
| review decision | blocked | Stop and hand off with the review classification, evidence, and required escalation. |
| `diagnose-fixture` | classified result returned | Route according to `docs/operating-model.md` §10. Use `update-tasks` only if the diagnosis requires a structural task-plan change or a classified deviation entry in `docs/tasks.md`; otherwise resume implementation directly. |
| `update-tasks` | change applied successfully | Resume the interrupted workflow step. |
| `validate-tasks` | exit `0` | Continue the workflow. |
| `validate-tasks` | exit non-zero | Fix the invalid `docs/tasks.md` edit, then rerun `validate-tasks` before continuing. |
| autopilot review decision | actionable findings before review 5 | Apply one bounded follow-up, rerun applicable checks, then start the next fresh review session on the full cumulative diff. |
| autopilot review decision | actionable findings on review 5 | Stop with `rework_cap_exceeded`; do not continue to the next task. |
| autopilot task completion | clean verdict and §19.1 satisfied | Apply the routine completion transition, verify the task-scoped diff, commit with the task ID, then select the next executable product task. |
| autopilot approval | auto-reviewed and approved | Continue the current `codex review`, `git add`, or `git commit` step. |
| autopilot approval | routed to human, denied, or ineffective | Stop with `tooling problem`; do not continue to the next task. |

### Invariants

- choose `standard` or `critical` before implementation and before launching the fresh review session.
- `critical` review is mandatory for parser, renderer, CLI boundary, filesystem mutation, packaging, test-harness behavior, `docs/contract.md`, `docs/evals.md`, and repo-local review/orchestration changes.
- `critical` implementation reading is mandatory for the same surfaces, and includes full contract/design/evals reading plus relevant accepted ADRs.
- Codex review capabilities are the only bug-finding review engine.
- launch review in its own fresh review session, not as a same-session self-review and not through a wrapper that reparses session files.
- when using `--uncommitted`, the worktree must contain only the current task's cumulative diff or the bounded process-maintenance diff.
- keep routine review criteria durable in `docs/code-review.md`, with only
  entry pointers in `AGENTS.md`.
- when the review is launched without an explicit task ID, the fresh review session must first determine whether the diff is a bounded process-maintenance diff; if so, it reviews that process surface. Otherwise it may anchor on `docs/tasks.md` `## Execution State` -> `Current active task`, or stop if that value is not usable.
- the fresh review session must list the new invariants introduced by the diff and state how each one was verified or falsified before the task is considered done.
- the `review decision` lives in the coordinator handoff or PR comment equivalent, except when a fresh interactive review session emits it directly.
- the `review decision` records repo-local classification and `blocking` / `non-blocking` status from the review findings without inventing additional findings.
- `docs/tasks.md` records only the task-state transition or open-deviation effect of a review decision, not a full decision log.
- for harness or tooling tasks, the fresh review session must actively check for collision, rerun, isolation, and misleading-artifact cases when those risks are introduced by the diff.
- do not classify `tooling problem` from review silence alone while the review process is still running normally.
- no code change is allowed before the `review decision` is explicit.
- a task touching a linted or otherwise statically checked surface is not ready for handoff until those applicable repo-local static checks have been run on the post-patch state and pass.
- Outside the explicit Autopilot Loop, allow at most one bounded `review -> rework -> review` loop per task pass. If the same class of blocking issue comes back again, stop instead of iterating.
- In the explicit Autopilot Loop, allow at most five fresh review sessions per
  task, initial review included. Each rework between reviews must remain
  bounded to the task, name the protected invariant and presumed root cause,
  and rerun applicable checks before the next review.
- routine `docs/tasks.md` execution-state updates may be applied directly by the implementation pass or as the routed effect of a clean `review decision`; `update-tasks` is reserved for structural task-plan maintenance and classified deviations that materially change the task record.
- Do not auto-pick the next task outside the explicit Autopilot Loop. Normal
  task selection remains human-directed.
- Do not auto-commit outside the explicit Autopilot Loop. A green review pass
  is necessary for handoff, not sufficient for commit.

### Hard Stops

Stop and hand back to the human coordinator when any of the following is true:

- the `review decision` or `diagnose-fixture` classifies the issue as `spec ambiguity`
- the `review decision` or `diagnose-fixture` classifies the issue as `product question`
- the `review decision` or `diagnose-fixture` classifies the issue as `out-of-scope discovery`
- the fresh review session cannot derive a credible falsification check for a newly introduced invariant without guessing beyond the repo docs; classify this in the `review decision` as `eval defect` when the verification guidance is missing, or `design gap` when the invariant itself is under-specified
- a suitable fresh review session cannot be launched
- `codex review`, `git add`, or `git commit` requires approval during autopilot
  and the approval is routed to the human coordinator, denied, or ineffective
- the current worktree is not bounded enough for a task-scoped or process-maintenance review surface
- the required fix would need a change to `docs/contract.md`
- the required fix would need a broader task-plan rewrite rather than a bounded task update
- outside the explicit Autopilot Loop, the same class of blocking review
  finding returns after one bounded follow-up
- inside the explicit Autopilot Loop, the fifth review decision for the task is
  not a `clean verdict`

### Human Gates

The coordinator does not decide these alone:

- Task selection: choose the task explicitly from `docs/tasks.md`
- Escalation handling: resolve any hard stop before resuming the loop
- Commit or final handoff: after a clean `review decision`, apply any routine `docs/tasks.md` transition still needed, then let the human decide whether to commit or hand off

In the explicit Autopilot Loop, the user has pre-authorized task selection and
commit for clean task passes. Approval handling for `codex review`, `git add`,
and `git commit` must be routed through the configured auto-reviewer; if approval
is routed to the human coordinator, unavailable, or denied, autopilot stops.

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
- `autopilot_complete`
- `autopilot_blocked`

These labels are shorthand for local coordination only. The normative sources
remain the workflow state vocabulary and deviation taxonomy defined elsewhere.

## Minimal Local Commands

For `T1.7` and later harness work, the minimum local command surface is:

- `npm run lint`
- `npm run test:unit`
- `npm run test:fixtures:all`
- `npm run test:fixtures -- --fixture <fixture-id>`
- `npm run test:fixtures -- --family <family>`
- `npm run check:goldens -- --fixture <fixture-id>`
- `npm run workflow:preflight -- --task <task-id>`
- `npm run workflow:preflight -- --process <surface> --stage review`
- `codex`
- `codex review --uncommitted`
- `codex review --base <branch>`
- `codex review --commit <sha>`
- `git status --short`
- `git add <task-scoped paths>`
- `git commit -m "<TASK_ID>: <summary>"`

Notes:

- `npm test` remains the default full unit-test entrypoint and delegates to `npm run test:unit`.
- do not run `node --test` directly on `src/**/*.test.ts`; the repo-local unit-test path is compile-then-run, so targeted unit reruns must go through `npm run test:unit` or an equivalent compiled `dist/**/*.test.js` target.
- the fixture-runner scripts compile first and then execute the built runner from `dist/`;
- `npm run test:fixtures:all` scans the runnable fixture corpus under `fixtures/`;
- `npm run check:goldens` runs only fixtures whose manifest declares `stdout.kind = "golden"` and fails closed when the selection contains none;
- fixture manifests may point either to the built product CLI when available or to `node dist/cli-stub.js` while product implementation is still in progress.
- `codex` is allowed when started as a fresh interactive review session whose first work step is review.
- `codex review` commands assume repo-specific review criteria live in
  `docs/code-review.md`, with entry pointers from `AGENTS.md`.
- these commands are the minimum starting point for review, not the maximum allowed review surface. A reviewer may add bounded falsification checks when the task introduces new invariants not already stressed by the existing commands.
- when a task touches files covered by `npm run lint`, run `npm run lint` before concluding the implementation pass or marking the review `done`, unless the changed surface is explicitly outside that command's scope.

## Non-Goals

This helper does not:

- pick the next task automatically outside the explicit Autopilot Loop;
- use `git`, `date`, or a sidecar progress file as the source of truth;
- auto-commit on green checks outside the explicit Autopilot Loop;
- replace bounded review with repeated implementation passes;
- modify `docs/contract.md`;
- add product scope.
