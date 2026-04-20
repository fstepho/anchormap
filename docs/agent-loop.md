# Agent Loop

Status: helper note, non-normative

Scope: repo-local workflow helper for bounded task execution by a human plus
one or two fresh-context agent passes, coordinated through one orchestrator.

Prevalence: if this file conflicts with `docs/operating-model.md`,
`docs/contract.md`, `docs/design.md`, `docs/evals.md`, or `docs/tasks.md`, the
existing normative documents win.

## Quick start

For one task, end to end:

1. Start an implementation session: `codex`.
2. Sync `docs/tasks.md` `## Execution State` via
   `.agents/skills/update-tasks/SKILL.md` for the target task before
   implementation starts if `Current active task` is not already aligned.
   On agents that expose repo-local skill shorthand, the equivalent is
   `$update-tasks T1.1` for a routine execution-state sync.
3. Use the repo-local skill definition
   `.agents/skills/implement-task/SKILL.md` for `T1.1` (or any `Tn.m` /
   `Sn` ID from `docs/tasks.md`). On agents that expose repo-local skill
   shorthand, the equivalent invocation is `$implement-task T1.1`.
4. Work until the task is implemented or you hit a blocking deviation, and
   run the relevant checks in this implementation session before opening
   review.
5. From the same session, spawn a fresh-context review subagent to run
   `.agents/skills/review-task/SKILL.md` for the same task. On agents
   that expose repo-local skill shorthand, the equivalent invocation is
   `$review-task T1.1` inside the subagent, or `$review-task` when
   `docs/tasks.md` already records the current active task and you want
   the skill to ask for confirmation.
6. If your agent does not support subagent spawning, fall back to: exit
   the session and open a fresh `codex` session, then run the skill
   there.
7. If review returns `needs_rework`, apply the bounded follow-up in the
   main session, then spawn a new fresh-context review subagent for the
   second review pass (fallback: fresh `codex` sessions for both the
   follow-up and the re-review).
8. Before commit: `sh scripts/lint-tasks.sh` (or `$validate-tasks` inside
   Codex) if `docs/tasks.md` changed, then `npm test`.
9. Commit only when every condition in step 11 of the Recommended loop
   below is met.

The rest of this file expands the rationale, roles, and the detailed
per-step protocol.

## Why this exists

This repository already contains the normative process:

- `docs/operating-model.md` defines phases, deviation taxonomy, review
  protocol, and task-level done.
- `docs/tasks.md` defines the executable one-task plan and includes the live
  execution cursor in `## Execution State`.

What the helper adds is a small set of portable Agent Skills that package the
bounded prompts for each step, plus a deterministic LLM-free integrity lint,
without introducing hidden state, a parallel planning system, or a fully
autonomous commit loop.

## Surface

The helper exposes two surfaces:

- **Agent Skills** in `.agents/skills/` — the operational prompts, in the
  Agent Skills format. The `SKILL.md` files themselves are the portable
  workflow surface; some compatible agents (Codex CLI, Claude Code, Cursor,
  etc.) also expose repo-local shorthand such as `$implement-task` after
  discovering those files from the current working directory up to the repo
  root.
- **`scripts/lint-tasks.sh`** — deterministic, no-LLM integrity check on
  `docs/tasks.md`. Takes no arguments. Exits non-zero with one
  `validate: <check>: <detail>` line per issue on stderr. Safe for CI and
  pre-commit hooks.

The normative docs remain authoritative for behavior, verification, scope,
and process.

## Skills

| Skill | Purpose | Invocation |
|---|---|---|
| `implement-task` | Bounded implementation of one task (`Tn.m` product task or `Sn` spike). | `.agents/skills/implement-task/SKILL.md` or `$implement-task T1.1` when shorthand is available |
| `review-task` | Fresh-context review of the current cumulative task-scoped change set for one task. | `.agents/skills/review-task/SKILL.md`, `$review-task T1.1`, or `$review-task` with confirmation of `Current active task` when shorthand is available |
| `diagnose-fixture` | §2.3-driven classification of a fixture failure. | `.agents/skills/diagnose-fixture/SKILL.md` or `$diagnose-fixture fx01_scan_min_clean T7.2` when shorthand is available |
| `update-tasks` | Bounded `docs/tasks.md` update after a classified deviation. | `.agents/skills/update-tasks/SKILL.md` or `$update-tasks T1.1 [T1.2]` when shorthand is available |
| `validate-tasks` | Structural lint on `docs/tasks.md`. Runs `scripts/lint-tasks.sh`. | `.agents/skills/validate-tasks/SKILL.md` or `$validate-tasks` when shorthand is available |

All 5 skills declare an explicit `policy.allow_implicit_invocation` value in
their `agents/openai.yaml`: `false` for the four task-directed skills that
require explicit operator intent (`implement-task`, `review-task`,
`diagnose-fixture`, `update-tasks`) and `true` for `validate-tasks`
(read-only, side-effect free). The policy is
therefore independent of each agent's default skill-policy, and the
workflow described here holds on any agent that honors the field.
For `review-task`, explicit operator intent still includes the confirmed
`Current active task` fallback when no task ID is supplied in the request.

## Recommended roles

- Human orchestrator:
  - picks one executable task;
  - confirms the relevant contract, design, and eval references;
  - decides whether a deviation requires escalation.
- Agent orchestrator:
  - invokes the appropriate skill;
  - frames the task and checks first;
  - implements locally by default;
  - delegates implementation only when that clearly improves a larger or
    riskier task;
  - for each review pass, spawns one new fresh-context review subagent.
- Implementation subagent:
  - implements one task only;
  - keeps the same execution settings as the parent agent when it inherits
    the current thread context;
  - runs the smallest relevant check early;
  - stops on the first blocking failure.
- Review subagent:
  - reviews only against the target task and normative docs;
  - reviews the full current task-scoped change set for each review pass, not
    only the latest follow-up delta;
  - does not edit files;
  - looks first for scope creep, contract drift, eval weakening, and missing
    failure coverage;
  - is not reused after follow-up edits.

Commit is a gate, not a separate role. Commit only after the task satisfies
the task-level done criteria in `docs/operating-model.md` §19.1.

## Recommended loop

1. Pick exactly one task from `docs/tasks.md` (a `Tn.m` product task or an `Sn` spike).
2. Sync `docs/tasks.md` `## Execution State` via `update-tasks` before
   implementation if `Current active task` is not already the target task.
   This routine execution-state sync records that the task is now active;
   all `docs/tasks.md` mutations still go through `update-tasks`.
3. Use `.agents/skills/implement-task/SKILL.md` in your agent for the target
   task. If your agent exposes repo-local skill shorthand, the equivalent is
   `$implement-task T1.1`.
4. Run the smallest relevant check early in this implementation session.
5. If blocked, classify the deviation before making more changes. If the
   classification requires a task-plan update, or if the blocked state must
   be recorded in `docs/tasks.md`, invoke `$update-tasks T1.1`. All
   `docs/tasks.md` mutations go through `update-tasks`.
6. Run `.agents/skills/review-task/SKILL.md` for the target task. Prefer
   spawning a fresh-context review subagent from the main session when
   your agent supports it; fall back to opening a fresh `codex` session
   otherwise. The skill forbids source edits by prose and runs the
   referenced checks itself.
7. Keep the task in exactly one explicit state:
   - `implementing`
   - `needs_review`
   - `needs_rework`
   - `blocked`
   - `done`
8. If review returns `needs_rework` and the findings are bounded and
   in-scope, the orchestrator should do one follow-up implementation pass
   immediately without waiting for user input, then spawn a new
   fresh-context reviewer for a second review of the full current
   task-scoped change set, not only the latest follow-up delta.
9. Stop instead of auto-correcting when the review exposes:
   - `spec ambiguity`
   - `product question`
   - `out-of-scope discovery`
   - a change that would require `docs/contract.md`
   - a broader design or task-plan rewrite
   - the same `review -> rework` loop twice
10. Do not mark the task `done` after implementation alone.
11. Commit only if:
    - the target task objective is complete;
    - the referenced tests and fixtures pass;
    - `sh scripts/lint-tasks.sh` passes;
    - the commit message includes the target task ID;
    - the applicable stdout/stderr/exit code/mutation policy is preserved;
    - no out-of-scope behavior changed;
    - no eval was weakened;
    - any remaining findings are explicitly non-blocking relative to
      `docs/operating-model.md` §19.1.
12. After the final review decision, sync `docs/tasks.md` `## Execution State`
    before commit or handoff via `update-tasks`:
    - if the task is `done`, clear or replace `Current active task`, update
      `Next executable product task after blocker clearance` only when it is
      explicitly known from the blocker/dependency state, set
      `Last completed task`, append to `Completed tasks recorded here`, and
      clear any blocker that depended on this task;
    - if the task is `blocked`, record the blocker in `Blocked tasks` and
      keep the task out of `Last completed task`;
    - if the task is `needs_rework`, keep or restore the task as active and
      record any explicit deviation in `Open deviations` when applicable;
    - do not auto-pick the next task or invent
      `Next executable product task after blocker clearance` while updating
      the cursor.
13. Low severity alone does not justify `done`. A task can finish with only
    remaining `low` findings if, and only if, they are explicitly
    non-blocking.
14. Move to the next task manually. Do not auto-pick from hidden state.

## Non-goals

The helper does not:

- pick the next task automatically;
- use `git`, `date`, or a sidecar progress file as the source of truth;
- auto-commit on green checks;
- replace review with repeated implementation passes;
- modify `docs/contract.md`;
- add product scope;
- provide a second user-facing process layer beyond the skills and the lint
  script.

If implementation is delegated, there must still be only one live
implementation path at a time. The main agent must not edit files in parallel
with a live implementation subagent. If the delegated pass times out, the
main agent should either wait again or close the subagent before resuming
locally.
