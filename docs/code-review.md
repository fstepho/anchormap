# Code Review Policy

Status: helper note, durable repo-local guidance for fresh Codex review sessions

Scope: one bounded task diff at a time

Precedence: if this file conflicts with `docs/operating-model.md`,
`docs/contract.md`, `docs/design.md`, `docs/evals.md`, or `docs/tasks.md`, the
normative documents win.

## Purpose

This file captures the repo-specific review criteria that should stay durable
across Codex review sessions.

Keep this guidance here and in `AGENTS.md`, not in ad hoc runtime prompts.

## Review Input

Review exactly one task-scoped cumulative diff.

Read, in order:

1. `docs/operating-model.md`
2. `docs/contract.md`
3. `docs/design.md`
4. `docs/evals.md`
5. `docs/tasks.md`

Then identify:

- the target task ID;
- the relevant task block in `docs/tasks.md`;
- the relevant contract, design, and eval references;
- the accepted ADRs when the diff touches parser, renderer, CLI boundary,
  filesystem mutation, packaging, or test-harness behavior.

If the review was launched without an explicit task ID in the runtime prompt,
use `docs/tasks.md` `## Execution State` -> `Current active task` as the task
anchor. If it is absent, invalid, or ambiguous, stop rather than guess.

## Review Method

- Review the full cumulative diff for the task, not only the latest follow-up.
- Keep the review bounded to the target task. Do not propose new product
  features.
- List the new invariants introduced by the diff.
- Map each new invariant to either:
  - an existing repo check that already covers it; or
  - a reviewer-derived falsification check.
- If a new invariant remains unchecked, the review is not clean.
- For harness or tooling diffs, explicitly pressure-test:
  - collision risk;
  - rerun and overwrite behavior;
  - isolation between runs, fixtures, or summaries;
  - misleading or incomplete archived artifacts.

## Review Output

A fresh Codex review session is the authoritative bug-finding pass.

Keep the review output task-bounded and findings-focused.

Prefer output that makes the following easy to recover:

- the target task ID;
- the review mode when it is clear from the surface;
- the checks or falsification steps actually exercised;
- findings with file and line references when applicable;
- an explicit no-findings statement when the review is clean.

After the findings are available, record a `review decision` before any code
change:

- `clean verdict`
- `actionable findings`
- `blocked`

The `review decision` records repo-local classification, `blocking` /
`non-blocking`, and task-state routing as defined by
`docs/operating-model.md` and `docs/agent-loop.md`.

If the entry surface is a fresh interactive `codex` session, the same session
may emit the `review decision`.

If the entry surface is `codex review`, record the `review decision`
immediately after reading the review output.

## Non-Goals

- No style-only review unless style affects the contract, evals, or immediate
  maintainability.
- No second reviewer engine.
- No same-session self-review in place of a fresh review session.
