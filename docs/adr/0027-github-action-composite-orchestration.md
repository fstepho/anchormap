# ADR-0027: GitHub Action composite orchestration

Status: Accepted
Date: 2026-05-15
Owner: AnchorMap maintainers

## Context

The CLI artifact surface is already defined by `ADR-0019` through `ADR-0026`:
`check`, `diff`, `explain`, `report`, `bundle`, scan schema v5, JUnit, and
SARIF are local CLI behaviors with explicit artifact inputs and no SaaS upload.

The GitHub Action / PR preview plan needs a separate authority for the Action
orchestration layer. That layer must not reopen CLI command semantics or make
GitHub, Git, CI metadata, cache, network, clock, or environment values product
sources of truth.

Relevant constraints:

- AnchorMap remains local-first and artifact-first.
- `docs/brief.md` §6.10 allows local CI/PR workflows through CLI artifacts,
  not SaaS upload, server analysis, or a GitHub App.
- `docs/brief.md` §13 keeps `anchormap.yaml` as the only mutable AnchorMap
  persistence and treats policies/artifacts as explicit read-only inputs.
- `ADR-0020` defines exit code `5` as policy failure after successful policy
  evaluation.
- `ADR-0021` defines diff over explicit scan artifacts, not Git refs.
- `ADR-0023` defines the canonical Markdown report.
- `ADR-0024` through `ADR-0026` define later bundle, JUnit, and SARIF CLI
  artifacts, but GHA-1 must not imply those artifacts.

## Decision

We will define the official AnchorMap GitHub Action as a composite action
orchestration layer, preferably in a separate `anchormap-action` repository.
The current `anchormap` repository may contain ADRs, docs, issue templates, and
inert workflow examples for that Action, but it must not treat those repo-local
artifacts as the runtime Action implementation.

GHA-1 orchestration uses:

- a composite `action.yml`;
- a shell script step as the internal runner;
- a pinned `anchormap-version` input;
- an explicit `node-version` input, defaulting to Node 22;
- an explicit policy path input;
- an optional explicit `base-scan` path;
- an `upload-artifacts` input controlling GitHub Actions workflow artifacts;
- a `fail-on-policy` input controlling whether CLI exit code `5` fails the
  workflow.

GHA-1 produces these Action outputs:

- `decision`;
- `analysis_health`;
- `policy_exit`;
- `scan_path`;
- `check_path`;
- `diff_path`, only when an explicit base scan is supplied;
- `report_path`.

GHA-1 orchestration runs only the already-defined CLI flow:

```text
scan -> check -> optional diff -> report --format markdown
```

It always produces, when the corresponding CLI command succeeds:

- `anchormap.scan.json`;
- `anchormap.check.json`;
- `anchormap.report.md`.

It produces `anchormap.diff.json` only when the user supplies an explicit
`base-scan` input. GHA-1 must not fetch the latest `main` artifact, infer a
baseline from Git refs, read CI metadata as product truth, or synthesize a diff
without two explicit scan artifacts.

Exit code `5` is forwarded in a controlled way:

- the shell runner captures the `anchormap check` exit code;
- `policy_exit` records that code;
- artifacts and job summary are still produced when possible;
- if `fail-on-policy` is `true`, the Action exits non-zero after artifact and
  summary handling;
- if `fail-on-policy` is `false`, the Action exposes `policy_exit = 5` without
  failing the workflow for policy alone.

Workflow artifact upload is GitHub Actions orchestration, not an AnchorMap
product upload. It may use `actions/upload-artifact`, but must upload only
explicitly generated local files. The Action must not upload artifacts to a
SaaS, call an AnchorMap server, or require authentication beyond normal GitHub
Actions workflow execution.

The job summary may display the generated Markdown report, but
`anchormap.report.md` remains the canonical Markdown artifact from
`ADR-0023`. Summary formatting must not redefine report semantics.

GHA-1 does not generate `bundle`, JUnit, or SARIF artifacts. Those may be
documented or added later under authorities compatible with `ADR-0024` through
`ADR-0026`, but they are not implicit GHA-1 outputs.

GHA-1 has no PR comment by default. PR comments, `pull-requests: write`, update
vs. create behavior, and fork restrictions require a later opt-in decision.

## Alternatives considered

### Option A - Implement a JavaScript Action in the main repo

Pros:

- Keeps all code in one repository.

Cons:

- Mixes CLI release concerns with integration release concerns.
- Encourages duplicating CLI behavior in Action code.

### Option B - Composite Action over CLI commands

Pros:

- Keeps the Action as orchestration over accepted CLI behavior.
- Makes generated files visible as local workflow artifacts.
- Keeps the runtime implementation replaceable without changing CLI contract.

Cons:

- Requires careful shell handling for exit code `5` and artifact publication.

### Option C - GitHub App or SaaS upload first

Pros:

- Could provide richer PR UX and history sooner.

Cons:

- Violates the current no-SaaS, no-server-analysis, no-upload, and no-GitHub-App
  boundaries.

## Consequences

Positive:

- The Action boundary is explicit and does not duplicate CLI decisions.
- GHA-1 can validate PR workflow usefulness through job summary and workflow
  artifacts.
- Policy failure remains observable without suppressing generated artifacts.

Negative:

- Users must provide a baseline scan explicitly when they want diff output.
- PR comments and richer GitHub integrations remain future opt-in work.

Risks:

- Documentation can accidentally imply that GitHub metadata is AnchorMap
  product truth. Repo-local docs and examples must preserve the explicit-input
  boundary.
- Composite shell behavior can mishandle exit code `5`; Action implementation
  must test policy-fail and technical-fail paths separately when implemented.

## Contract impact

No. This ADR does not change `docs/contract.md` and does not define new CLI
observable behavior. It only governs GitHub Action orchestration over accepted
CLI commands.

## Eval impact

No. This ADR does not require or modify product fixtures, goldens, or release
gates. Future Action-runtime tests belong to the Action implementation surface,
not to existing CLI evals, unless a later accepted change adds repo-local
Action test artifacts explicitly.

## Design impact

No required `docs/design.md` change for the CLI. Repo-local documentation may
reference this ADR when explaining GitHub Action setup, workflow artifacts, job
summary, explicit baseline scans, and default no-PR-comment behavior.

## Rollback / supersession

This ADR can be superseded by a later GitHub Action ADR if the Action adopts
PR comments, JUnit/SARIF orchestration, bundle generation, a GitHub App, or
hosted upload behavior. Any superseding ADR must state whether it changes
`docs/brief.md`, `docs/contract.md`, or `docs/evals.md`.

## Links

- `docs/brief.md` — §6.10, §13
- `docs/github-action-pr-preview-plan.md` — GHA-1 through GHA-5,
  PREVIEW-1 through PREVIEW-3
- `docs/adr/0019-cli-artifact-surface-and-artifact-mode.md`
- `docs/adr/0020-policy-check-and-exit-code-5.md`
- `docs/adr/0021-scan-artifact-diff.md`
- `docs/adr/0023-markdown-report-from-artifacts.md`
- `docs/adr/0024-artifact-bundle-and-ci-metadata-boundary.md`
- `docs/adr/0025-scan-schema-v5-source-locations.md`
- `docs/adr/0026-junit-and-sarif-reports-without-upload.md`
- `docs/tasks.md` — M21
