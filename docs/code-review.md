# Code Review Policy

Status: helper note, durable repo-local guidance for fresh Codex review sessions

Scope: one bounded task diff, or one bounded process-maintenance diff, at a time

Precedence: if this file conflicts with `docs/operating-model.md`,
`docs/contract.md`, `docs/design.md`, `docs/evals.md`, `docs/tasks.md`, or an
accepted ADR, the authoritative document wins.

## Purpose

This file captures the repo-specific review criteria that should stay durable
across fresh Codex review sessions. The full review protocol, authorized review
surfaces, `review decision` artifact, and autopilot policy live in
`docs/operating-model.md` §14.2 and §18.1.

## Review Input

Review exactly one task-scoped cumulative diff, or one bounded
process-maintenance diff that does not change runtime behavior.

Identify:

- the target task ID and relevant task block in `docs/tasks.md`, or the
  bounded process-maintenance surface;
- the relevant contract, design, and eval references, or the relevant
  operating-model / ADR references for process maintenance;
- accepted ADRs when the changed surface requires critical authority coverage.

If the review was launched without an explicit task ID, first determine whether
the diff is bounded process maintenance. If it is not, anchor on `docs/tasks.md`
`## Execution State` -> `Current active task`. Stop instead of guessing when no
bounded process surface or usable active task can be identified.

## Review Method

- Review the full cumulative diff for the task or process-maintenance surface,
  not only the latest follow-up.
- Keep the review bounded to the target task or process-maintenance surface.
  Do not propose new product features.
- List the new invariants introduced by the diff.
- Map each new invariant to an existing repo check or to a reviewer-derived
  falsification check.
- If a new invariant remains unchecked, the review is not clean.
- For harness or tooling diffs, pressure-test collision risk, rerun and
  overwrite behavior, isolation between runs, and misleading or incomplete
  archived artifacts.
- For repo-local review/orchestration diffs, pressure-test whether:
  - `AGENTS.md` remains an entry map rather than a competing authority;
  - durable process rules still live in `docs/operating-model.md`,
    `docs/agent-loop.md`, or `docs/code-review.md`;
  - standard mode still identifies contract/design/eval refs before patching;
  - critical surfaces still require authoritative coverage without imposing
    full-document rereading by default;
  - process docs describe stable rules instead of implementation scars;
  - fresh Codex review remains the only bug-finding review engine.
- Treat Biome `noExcessiveLinesPerFile` diagnostics as maintainability review
  signals. Request a bounded split or explicit justification only when file size
  reflects mixed responsibilities or makes review non-local.

## Review Output

Keep the review output findings-focused and easy for the coordinator to route.

Prefer output that exposes:

- the target task ID or process-maintenance surface;
- the review mode when clear from the surface;
- checks or falsification steps actually exercised;
- findings with file and line references when applicable;
- an explicit no-findings statement when the review is clean.

Wait for the final reviewer verdict. Do not classify `tooling problem` from
review silence alone while the review process is still alive.

For a fresh interactive `codex` review session, emit the `review decision`
specified by `docs/operating-model.md` §14.2 after findings and before any code
change. For `codex review`, provide the native findings and verdict; the
coordinator emits the `review decision` in the handoff or PR comment
equivalent.

## Non-Goals

- No style-only review unless style affects the contract, evals, or immediate
  maintainability.
- No second reviewer engine.
- No same-session self-review in place of a fresh review session.
