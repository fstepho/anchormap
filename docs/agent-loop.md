# Agent Loop

Status: helper note, non-normative

Scope: repo-local operator checklist for bounded task execution, fresh review,
limited rework routing, and explicit user-authorized autopilot.

Precedence: if this file conflicts with `docs/operating-model.md`,
`docs/contract.md`, `docs/design.md`, `docs/evals.md`, `docs/tasks.md`, or an
accepted ADR, the authoritative document wins.

## Purpose

This file makes the process executable without becoming the process authority.
Use:

- `docs/operating-model.md` for deviation taxonomy, review protocol,
  autopilot policy, and done definitions;
- `docs/tasks.md` for the task plan and live `## Execution State` cursor;
- `docs/code-review.md` for durable reviewer criteria;
- `.agents/skills/*/SKILL.md` for skill-specific mutation bounds.

Review itself is not a repo-local skill. The authorized bug-finding review
surface is fresh Codex review as defined by `docs/operating-model.md` §14.2.

## Reading Modes

Use `standard` mode for ordinary bounded implementation tasks:

- read `docs/operating-model.md`;
- read `docs/tasks.md`, including `## Execution State` and the target task
  block;
- read only the `docs/contract.md`, `docs/design.md`, and `docs/evals.md`
  sections referenced by that task;
- read `docs/brief.md` only if a scope question remains open.

Use `critical` mode when the diff touches parser, renderer, CLI boundary,
filesystem mutation, packaging, test-harness behavior, repo-local
review/orchestration mechanics, `docs/contract.md`, or `docs/evals.md`.
Critical mode requires authoritative coverage of the relevant contract, design,
eval, and accepted ADR authority. Full-document reading is appropriate only
when the changed surface or a concrete failure makes targeted coverage
insufficient.

Before editing, state the target task or process surface, binding references,
expected checks, and patch boundary. Broaden reading only when new evidence
requires it, such as a missing reference, failing check, review finding, or
conflict between authorities.

## Skills

Path-based skill invocation is the portable baseline. On agents that discover
repo-local skills automatically, shorthand such as `$implement-task T1.1` may
also work.

| Skill | Purpose | Path |
|---|---|---|
| `implement-task` | Bounded implementation of one explicit task ID. | `.agents/skills/implement-task/SKILL.md` |
| `diagnose-fixture` | Classification of one fixture failure. | `.agents/skills/diagnose-fixture/SKILL.md` |
| `update-tasks` | Bounded structural `docs/tasks.md` maintenance or classified deviation recording. | `.agents/skills/update-tasks/SKILL.md` |
| `validate-tasks` | Structural lint for `docs/tasks.md`; runs `scripts/lint-tasks.sh`. | `.agents/skills/validate-tasks/SKILL.md` |

## Task Cursor Ownership

| Change | Owner |
|---|---|
| Start-of-task cursor alignment | `implement-task`, directly in the same bounded patch |
| Clean task completion after review | coordinator, as the routed effect of the `review decision` |
| Structural task split, regrouping, dependency update, or classified deviation entry | `update-tasks` |
| Validation after any `docs/tasks.md` edit | `validate-tasks` |

Do not use `update-tasks` for routine cursor movement. Do not record full
review decisions in `docs/tasks.md`; only record durable task-state or
deviation effects required by `docs/operating-model.md`.

## Recommended Loop

1. Select exactly one explicit task, or name one bounded process-maintenance
   surface.
2. Choose `standard` or `critical` reading mode, identify the binding
   references, state the smallest useful checks, and patch only within the
   named surface.
3. Run the smallest relevant check early. Before handoff, run the repo-local
   static checks applicable to the touched files.
4. If blocked, classify the deviation with `docs/operating-model.md` §10 before
   broadening the patch. Use `update-tasks` only when the task plan itself must
   change.
5. Before review, verify the review surface is bounded to one task-scoped
   cumulative diff or one bounded process-maintenance diff that does not change
   runtime behavior.
6. Launch a fresh Codex review session on the full cumulative bounded diff.
   Use the authorized surfaces and review mode rules from
   `docs/operating-model.md` §14.2, and use `docs/code-review.md` for reviewer
   criteria.
7. Emit the `review decision` immediately after review findings and before any
   code change. Use the artifact shape and routing rules from
   `docs/operating-model.md` §14.2.
8. If the decision is `actionable findings`, name the protected invariant and
   presumed root cause, apply one bounded follow-up, rerun applicable checks,
   and start a new fresh review session on the cumulative diff.
9. Stop instead of iterating when the decision exposes `spec ambiguity`,
   `product question`, `out-of-scope discovery`, a required
   `docs/contract.md` change, a broader task-plan rewrite, or the same blocking
   finding class after one bounded follow-up outside autopilot.
10. For a clean task-scoped review, apply the routine `docs/tasks.md`
    completion transition only when `docs/operating-model.md` §19.1 is
    satisfied. For clean process maintenance, do not mark any task done unless
    the maintenance explicitly changed the task plan.

## Autopilot Checklist

Use only when the user explicitly requests `autopilot` or automatic task
chaining. The complete policy is `docs/operating-model.md` §18.1.

Operator checklist:

1. Start from an effective autopilot session, or equivalent Auto-review
   permissions for recurring `codex review`, `git add`, and `git commit`
   approvals:

   ```sh
   codex -p autopilot \
     --sandbox workspace-write \
     --ask-for-approval on-request \
     --add-dir <USER_HOME>/.codex \
     -c approvals_reviewer='"auto_review"' \
     -c sandbox_workspace_write.network_access=true \
     -c mcp_servers.context7.enabled=false
   ```

   On macOS, if native `codex review` reports `sandbox-exec`,
   `sandbox_apply`, `Operation not permitted`, or cannot inspect changes, treat
   that review as invalid even with exit 0; retry once only if the local
   approval policy permits targeted execution of the same native review command,
   then stop as `tooling problem` if the retry is denied or still ineffective.
2. Keep the coordinator context-thin: select tasks, launch fresh
   implementation/rework/review sessions, route decisions, apply transitions,
   and commit clean task diffs.
3. Select the next executable item only from `docs/tasks.md`
   `## Execution State`, `Dependencies`, `Blocks`, and
   `Required closure after result`.
4. Launch each implementation or rework in a fresh task-scoped Codex session.
   If using `spawn_agent`, pass `fork_context: false` and an explicit
   `reasoning_effort`. `fork_context: true` is forbidden for autopilot
   implementation or rework.
5. Use native `codex review --uncommitted`, `codex review --base <branch>`, or
   `codex review --commit <sha>` for fresh review through the bounded-footer
   command form below. Autopilot may run up to five fresh review sessions total
   for one task.
6. Retain across tasks only compact state allowed by §18.1: task ID, checks,
   verdict, findings count, finding titles and locations, review decision, stop
   reason, commit SHA, and next cursor.
7. Stop on any hard stop from §18.1 instead of letting the coordinator inspect
   full task context, full diffs, implementation logs, or full review
   transcripts.

## Review Command Surface

Native review commands:

- `codex review --uncommitted`
- `codex review --base <branch>`
- `codex review --commit <sha>`
- fresh interactive `codex` when review is its first work step

On macOS, a `codex review` launched from an already sandboxed coordinator can
fail to inspect any changes because the review session cannot apply its own
Seatbelt sandbox. The failure may still exit 0. Invalid footer signals include
`sandbox-exec`, `sandbox_apply`, `Operation not permitted`, or a statement that
no staged, unstaged, or untracked changes could be inspected because shell
commands failed before execution. The documented in-session retry is the same
native `codex review` command, launched through a targeted approval or prefix
rule that lets the command run outside the coordinator sandbox while preserving
the review session's normal sandbox. Use the matching `--base <branch>` or
`--commit <sha>` form when the worktree is not exactly the bounded review
surface. If the retry is denied or still cannot inspect the diff, stop as
`tooling problem`; do not keep trying variants from the coordinator. Do not read
the full transcript in the coordinator except for tooling diagnosis after
stopping.

Autopilot must redirect native `codex review` stdout/stderr to a temporary file
outside the repository and show only a bounded footer to the coordinator:

```sh
review_log="$(mktemp "/tmp/anchormap-codex-review.XXXXXX")"
codex review --uncommitted >"$review_log" 2>&1
review_rc=$?
printf 'review_log: %s\nreview_exit: %s\nreview_footer:\n' "$review_log" "$review_rc"
tail -n 220 "$review_log"
exit "$review_rc"
```

This is still native `codex review`; it must not become a wrapper, parser,
session-file reader, synthesized verdict, or second reviewer engine.

## Routing Shortcuts

| Result | Next action |
|---|---|
| implementation handoff `needs_review` | isolate the bounded cumulative diff and launch fresh review |
| implementation handoff `blocked` | classify under §10, then update `docs/tasks.md` only if the block must be recorded there |
| review findings emitted | emit `review decision` before any code change |
| `clean verdict` task diff | apply completion only if §19.1 is satisfied |
| `clean verdict` process diff | hand off without task completion transition |
| `actionable findings` | one bounded follow-up, applicable checks, fresh review |
| `blocked` | stop with classification, evidence, and required escalation |
| autopilot approval routed to human, denied, or ineffective | stop with `tooling problem` |

## Universal Hard Stops

Stop and hand back when continuing would require guessing, changing product
scope, changing `docs/contract.md`, broadening the task plan, using a non-Codex
review engine, reviewing an unbounded diff, ignoring a still-failing applicable
check, or violating the fresh-session/autopilot constraints in
`docs/operating-model.md` §14.2 and §18.1.

Short local labels such as `done`, `needs_rework_applied`,
`blocked_execution_state`, `rework_cap_exceeded`, `human_gate_commit`,
`autopilot_complete`, and `autopilot_blocked` are coordination shorthand only;
the normative vocabulary remains in `docs/operating-model.md`.

## Minimal Local Commands

For harness and process work, the common command surface is:

- `npm run lint`
- `npm run test:unit`
- `npm run test:product`
- `npm run test:harness`
- `npm run test:docs`
- `npm run test:fixtures:all`
- `npm run test:fixtures -- --fixture <fixture-id>`
- `npm run test:fixtures -- --family <family>`
- `npm run check:goldens -- --fixture <fixture-id>`
- `npm run workflow:preflight -- --task <task-id>`
- `npm run workflow:preflight -- --process <surface> --stage review`
- `codex`
- `codex -p autopilot ...` (see `## Autopilot Checklist` for the effective
  startup command)
- `codex review --uncommitted`
- `codex review --base <branch>`
- `codex review --commit <sha>`
- `git status --short`
- `git add <task-scoped paths>`
- `git commit -m "<TASK_ID>: <summary>"`

`npm run test:docs` is the targeted check for repo-local process-doc tooling,
package-script surface changes, command-surface guidance, agent-skill guidance,
and docs consistency fixtures. Routine `docs/tasks.md` cursor or state edits
use `validate-tasks`; they do not require `npm run test:docs` unless the same
patch changes process-doc tooling or command-surface guidance.

Targeted commands speed up iteration but do not replace the full applicable
handoff checks for the touched surface.

## Non-Goals

This helper does not:

- pick the next task automatically outside explicit autopilot;
- use Git, clock, cache, network, environment, or sidecar state as the source
  of truth;
- auto-commit outside explicit autopilot;
- replace fresh Codex review;
- modify `docs/contract.md`;
- add product scope.
