# Agent Instructions

This repo is document-driven. The working mode is `contract-first`, `eval-driven`, `scope-closed`.

## Required Reading At The Start Of Each Task

Read in this order:

1. `docs/operating-model.md`
2. `docs/contract.md`
3. `docs/design.md`
4. `docs/evals.md`
5. `docs/tasks.md`

Do not start coding until you have identified:

- the target task in `docs/tasks.md`;
- the relevant sections of `docs/contract.md`;
- the relevant sections of `docs/design.md`;
- the relevant fixtures, eval families, or gates in `docs/evals.md`.

When present, use `## Execution State` in `docs/tasks.md` as the live execution
cursor for current task, completed tasks, blocked tasks, and open deviations.
Use it for orientation only: the explicit task requested by the user or by the
helper prompt remains authoritative.

If a scope question remains open after that reading, consult `docs/brief.md` to arbitrate product scope. Do not use it to invent behavior.

## Operational Authority

Use the document hierarchy defined in `docs/operating-model.md`.

- `docs/contract.md` is authoritative for observable behavior.
- `docs/evals.md` is authoritative for verification gates, fixtures, and goldens.
- `docs/design.md` guides implementation as long as it stays compatible with the contract and evals.
- `docs/tasks.md` defines the one-task execution plan and contains the live execution cursor in `## Execution State`.
- `docs/operating-model.md` defines the production method, change policy, deviation taxonomy, review protocol, and done definitions.
- `docs/brief.md` is used only to arbitrate product scope when a scope question remains open after the required reading.

## ADRs

Read `docs/adr/` before changing parser, renderer, CLI, filesystem mutation, packaging, or test-harness behavior.

Accepted ADRs are binding.

Do not introduce a core dependency or strategy that contradicts an accepted ADR.
Do not replace a parser, renderer, CLI approach, packaging approach, or fixture-harness strategy without creating or updating the corresponding ADR.
If a change would supersede an accepted ADR, classify the deviation first and then update the affected ADR, `docs/design.md`, and `docs/tasks.md` as needed.

## Repo Execution Rules

- Treat each request as a bounded task, ideally a `Tn.m` identifier from `docs/tasks.md`.
- If a request spans multiple tasks, split it and handle only one task at a time.
- Use `docs/tasks.md` `## Execution State` to understand repo progress and blockers, but do not auto-pick or switch tasks unless the user explicitly asks.
- Before any patch, state which task is targeted and which contract, design, and eval sections bound the change.
- If a request is process-doc maintenance rather than a product task, classify the deviation first and bound the files being changed.
- Separate problem diagnosis from fix direction: recommendations must align with the patch intent and should complete a clean replacement rather than reintroduce fallback or legacy paths without explicit justification.
- Do not modify `docs/contract.md` without explicit instruction.
- Do not expand scope, weaken `docs/evals.md`, or introduce observable behavior without explicit traceability to `docs/contract.md` and `docs/evals.md`.
- Do not use cache, network, Git, clock, or environment as a source of truth.

## Orchestration Authority

Under the repo-local workflow, Codex review capabilities are the only
authorized bug-finding review engine.

Keep repo-specific review criteria durable in `docs/code-review.md` and
reference them from this file rather than passing ad hoc review prompts.

Do not substitute a repo-local review skill, a wrapper-parsed transcript, a
same-session self-review, or a second reviewer engine for Codex review. If a
suitable fresh review session cannot be launched, stop at the human commit or
handoff gate and classify the failure as `tooling problem`.

## Fresh Review Session

A fresh review session is a Codex session dedicated to reviewing exactly one
task-scoped cumulative diff.

Accepted entry surfaces:

- `codex review --uncommitted`
- `codex review --base <branch>`
- `codex review --commit <sha>`
- a fresh interactive `codex` session whose first work step is review

Keep the review bounded to one task and follow `docs/code-review.md` for
review-scoped guidance.

After the review findings are available, record a `review decision` before any
code change:

- `clean verdict`
- `actionable findings`
- `blocked`

The `review decision` records repo-local classification, `blocking` /
`non-blocking`, and task-state routing as defined by `docs/agent-loop.md` and
`docs/operating-model.md`.

The `review decision` does not add new findings and does not act as a second
reviewer engine.

## Fail-Fast Rules

Work in small, verifiable steps.

Before implementation work:

- identify the task ID in `docs/tasks.md`;
- identify the relevant contract sections;
- identify the relevant fixtures, eval families, or gates;
- state the smallest checks that should fail or pass.

During implementation:

- run the smallest relevant check as early as possible;
- run that check through the repo-local command surface defined by `package.json` and `docs/agent-loop.md`, not through an ad hoc direct source-file invocation when the repo already defines the test/build entrypoint;
- for unit tests in this repo, do not use `node --test src/**/*.test.ts`; use `npm test`, `npm run test:unit`, or a compiled `dist/**/*.test.js` target reached through the same compile-then-run model;
- stop on the first blocking failure;
- classify failures before changing more code;
- do not guess expected behavior;
- do not broaden scope to make a failing check pass.

## Observability Rules

The fixture harness is the primary observability surface.

For fixture failures, inspect:

- exit code;
- `stdout`;
- `stderr`;
- golden diff;
- filesystem mutation diff;
- trace output;
- timing output;
- fixture manifest.

Do not retry blindly. If the same class of failure repeats, propose an improvement to the harness, docs, fixtures, or ADRs.

## Mandatory Deviation Classification

Use the taxonomy from `docs/operating-model.md`:

- contract violation;
- spec ambiguity;
- design gap;
- eval defect;
- product question;
- tooling problem;
- out-of-scope discovery.

Expected actions:

- `spec ambiguity`: stop on the ambiguous point and ask for explicit clarification;
- `product question` or `out-of-scope discovery`: do not implement the feature;
- `eval defect`: fix the eval without weakening verification;
- `contract violation`: fix the implementation, not the contract for convenience.

## Minimum Done Definition For A Task

Apply `docs/operating-model.md` §19.1 as the task-level done definition.

A task is not done unless:

- the target task is fully satisfied;
- the referenced contract sections are respected;
- the relevant tests and fixtures pass;
- the applicable `stdout` / `stderr` / exit code / mutation policies are preserved;
- no out-of-scope behavior changed;
- no eval was weakened.
