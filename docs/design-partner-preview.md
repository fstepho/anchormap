# AnchorMap Design Partner Preview

Status: self-serve preview guide for teams trying the future AnchorMap GitHub
Action and PR report workflow.

AnchorMap helps TypeScript teams detect spec-to-code traceability drift in PRs.
The preview is self-serve, local-first, and does not require uploading source
code.

This preview does not create a GitHub App, hosted dashboard, SaaS upload path,
or manual onboarding program. The repository contains docs and feedback
templates only; it does not configure external GitHub labels, open issues, or
collect telemetry.

## Who This Is For

This preview is for teams with:

- TypeScript repositories;
- Markdown or YAML specs, or a willingness to create them;
- GitHub Actions workflows;
- interest in PR-level traceability checks;
- willingness to share structured feedback without sharing private source code.

It is not a fit when the expected outcome is source-code upload, AI mapping,
manual audit support, ownership inference, deletion guidance, or proof of
functional correctness.

## What You Get

The preview path is based on local AnchorMap CLI artifacts:

- local scan output;
- policy check output;
- optional explicit scan-vs-scan diff output;
- Markdown PR report output;
- GitHub job summary and workflow artifacts when the future Action publishes
  generated local files;
- no AnchorMap SaaS upload and no source-code upload.

The Action setup described in `docs/github-action.md` is orchestration over:

```text
scan -> check -> optional diff -> report --format markdown
```

It must not treat Git refs, GitHub PR metadata, caches, network calls, clocks,
environment values, or workflow state as AnchorMap product truth.

## What We Ask

If you try the preview:

1. Run it on at least one active TypeScript repository.
2. Inspect at least three PR reports, or as many as your repo naturally
   produces during the preview.
3. Open one feedback issue using the relevant issue template.
4. Share only sanitized artifacts or snippets.
5. Say whether no-source-upload is important for adoption.
6. Say whether history, multi-PR comparison, dashboard, or GitHub App behavior
   would be valuable later.

This preview is self-serve. No onboarding call is required. No source-code
access is requested.

## Setup

1. Install AnchorMap locally for the repository under test.
2. Add `anchormap.yaml` with explicit `product_root` and `spec_roots`.
3. Add `anchormap.policy.yaml` using `docs/policy-examples.md`.
4. Add an inert workflow derived from `docs/github-action.md` to your own
   repository, replacing placeholder versions with pinned versions.
5. Open a PR and inspect the job summary plus generated artifacts.

Use `docs/troubleshooting-github-action.md` if setup fails before a report is
produced. Use `docs/pr-report.md` when the report is produced but a section is
hard to interpret.

## Sanitized Report Guidance

Feedback should avoid private source content. Prefer sharing:

- the report section name;
- finding kinds;
- aggregate counts;
- policy YAML with private paths or names replaced;
- redacted workflow YAML;
- command names and exit codes;
- artifact filenames;
- short report snippets with source paths, anchor names, and organization names
  replaced by placeholders.

Do not attach private repository source files, proprietary specs, secrets,
tokens, customer data, internal URLs, or full workflow logs containing secrets.

AnchorMap scan v5 source locations are closed coordinates and do not include
source snippets. Preserve that boundary when sharing feedback.

## Feedback

Use the issue template that best matches the feedback:

- design partner feedback for the overall preview experience;
- Action installation problem for setup or workflow failures;
- confusing report for unclear report sections;
- policy request for missing or hard-to-tune policy controls.

Useful feedback answers these questions:

- Was the first report understandable?
- Did the signal affect a review or merge decision?
- Was the policy easy to tune?
- Was the report too noisy?
- Was no-source-upload important?
- Would multi-PR history or a dashboard be valuable?
- Would a GitHub App be preferable to workflow artifacts?

## Operational Follow-Up

Suggested labels for maintainers to create outside this repo-local patch:

```text
preview
design-partner
github-action
pr-report
policy
onboarding
false-positive
docs
blocked
saas-signal
```

The issue templates do not require those labels to exist. Label creation,
partner recruiting, triage operations, and any external GitHub state remain
manual operational follow-up.
