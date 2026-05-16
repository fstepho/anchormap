# AnchorMap GitHub Action Setup

## Give a 5-minute first reaction

The primary public entrypoint is the no-install preview, not this setup guide.
AnchorMap flags docs-to-code drift in TypeScript PRs before merge.

- Passing demo PR: https://github.com/fstepho/anchormap-h3-demo/pull/2
- New unmapped anchor: https://github.com/fstepho/anchormap-h3-demo/pull/3
- Stale mapping: https://github.com/fstepho/anchormap-h3-demo/pull/4
- Degraded analysis: https://github.com/fstepho/anchormap-h3-demo/pull/5
- Feedback issue: https://github.com/fstepho/anchormap/issues/5

If you only open one link, start with the passing demo PR. The other three PRs
show failure or warning-style cases:

- New unmapped anchor: a spec-like statement appears without a mapping.
- Stale mapping: a human mapping points to an anchor that is no longer observed.
- Degraded analysis: the report still renders, but analysis trust is reduced.

Negative feedback is useful when it names the blocker.

## The problem

In many TypeScript projects, product docs, API docs, specs, and code change
separately.

During review, it is hard to see whether:

- a new requirement-like statement was added without code mapping;
- an old mapping points to something that no longer exists;
- a PR reduced traceability coverage;
- the report is still reliable enough to trust.

AnchorMap makes those cases visible in CI as local artifacts and a PR-readable
Markdown report.

## Setup Guide

Status: self-serve setup documentation for the AnchorMap GitHub Action preview.
The workflow files in `docs/examples/github-actions/` are inert examples, not
active workflow behavior in this repository.

The current preview runtime lives in
[`fstepho/anchormap-action`](https://github.com/fstepho/anchormap-action) at
preview tag `v0-preview.3`. The public h3 demo PR set lives in
[`fstepho/anchormap-h3-demo`](https://github.com/fstepho/anchormap-h3-demo).
The preview uses `anchormap@1.2.2`. There is no stable Action release or
Marketplace publication yet.

The Action boundary is orchestration over accepted local CLI commands:

```text
scan -> check -> optional diff -> report --format markdown
```

It must not implement AnchorMap business logic, infer repository state from
GitHub metadata, or treat Git, Git refs, CI variables, caches, network, clock,
environment values, or GitHub workflow state as AnchorMap product truth.

## Minimal Workflow

Copy the simple example from
[`docs/examples/github-actions/anchormap-simple.yml`](examples/github-actions/anchormap-simple.yml)
into your own repository as `.github/workflows/anchormap.yml`. The preview
example pins the current Action and npm versions.

For preview testing only, the current tag ref is:

```yaml
uses: fstepho/anchormap-action@v0-preview.3
```

The simple mode runs:

```text
scan + check + report
```

It produces a policy decision, JSON artifacts, a Markdown report artifact, and
a GitHub job summary. It does not produce a diff because no baseline scan is
provided.

## Baseline Workflow

Copy the baseline example from
[`docs/examples/github-actions/anchormap-with-baseline.yml`](examples/github-actions/anchormap-with-baseline.yml)
when you want PR impact from `anchormap diff`.

The baseline mode runs:

```text
scan + check + diff + report
```

The `base-scan` input must point to an explicit scan artifact supplied by the
user, such as `.anchormap/baseline.scan.json`. AnchorMap does not fetch the
latest `main` workflow artifact, compare Git refs, or infer a baseline from CI
state. One deterministic baseline strategy is to generate a scan on `main` and
commit it:

```sh
anchormap scan --json > .anchormap/baseline.scan.json
```

## Inputs

GHA-1 defines these Action inputs:

| Input | Required | Default | Meaning |
| --- | --- | --- | --- |
| `anchormap-version` | yes | none | Pinned npm version of AnchorMap to install. |
| `node-version` | no | `22` | Node.js version used to run AnchorMap. |
| `policy` | no | `anchormap.policy.yaml` | Explicit policy file path. |
| `base-scan` | no | none | Explicit baseline scan artifact for diff mode. |
| `upload-artifacts` | no | `true` | Whether to upload generated files as GitHub workflow artifacts. |
| `fail-on-policy` | no | `true` | Whether policy exit code `5` fails the workflow. |

All files passed through inputs are explicit local inputs. The Action must not
silently create, migrate, or mutate policy files, baseline scans, or other
AnchorMap input artifacts.

## Outputs

GHA-1 exposes these Action outputs:

| Output | Meaning |
| --- | --- |
| `decision` | `pass` or `fail` from the policy result. |
| `analysis_health` | `clean` or `degraded` from the scan result. |
| `policy_exit` | Exit code returned by `anchormap check`. |
| `scan_path` | Path to `anchormap.scan.json`. |
| `check_path` | Path to `anchormap.check.json`. |
| `diff_path` | Path to `anchormap.diff.json` when `base-scan` is supplied. |
| `report_path` | Path to `anchormap.report.md`. |

## Permissions

The default permission boundary is read-only repository contents:

```yaml
permissions:
  contents: read
```

No write token, secret access, SaaS token, GitHub App credential, or external
upload credential is required for GHA-1. Fork PRs should use job summary and
workflow artifacts only.

PR comments are not enabled by default. Do not use `pull_request_target` for
the initial setup. Commenting on PRs, `pull-requests: write`, anti-spam update
behavior, and fork restrictions require a later opt-in decision.

## Artifacts

GHA-1 always attempts to produce these local files when the corresponding CLI
commands succeed:

```text
anchormap.scan.json
anchormap.check.json
anchormap.report.md
```

When `base-scan` is supplied, it also produces:

```text
anchormap.diff.json
```

`upload-artifacts: true` means GitHub Actions may publish those local files
with `actions/upload-artifact` as workflow artifacts. That is GitHub workflow
artifact upload, not AnchorMap SaaS upload. The Action must not upload to an
AnchorMap server, call a SaaS API, or treat uploaded workflow artifacts as a
product source of truth.

GHA-1 does not generate `anchormap.bundle.json`, JUnit, or SARIF artifacts.
Those formats are CLI artifact surfaces for later Action documentation or
runtime work, not implicit outputs of the minimal Action setup.

## Job Summary

The job summary may display the generated Markdown report for convenient PR
reading. The canonical report remains `anchormap.report.md`, produced by:

```sh
anchormap report --scan anchormap.scan.json --check anchormap.check.json --format markdown > anchormap.report.md
```

When `base-scan` is supplied and diff output exists, the report command includes
the explicit diff artifact:

```sh
anchormap report --scan anchormap.scan.json --check anchormap.check.json --diff anchormap.diff.json --format markdown > anchormap.report.md
```

Summary rendering must not redefine report semantics, add hidden analysis, or
claim provenance that is not present in the explicit scan, check, and optional
diff artifacts.

## Policy Exit Code

`anchormap check` uses exit code `5` for policy failure after a valid scan and
valid policy. This is distinct from technical CLI failures.

The Action captures the check exit code in `policy_exit` and should still
produce artifacts and a job summary when possible. Then `fail-on-policy`
controls workflow failure:

| `policy_exit` | `fail-on-policy` | Workflow behavior |
| --- | --- | --- |
| `0` | any | Passes for policy. |
| `5` | `true` | Fails after artifact and summary handling. |
| `5` | `false` | Exposes `policy_exit = 5` without failing for policy alone. |

Technical failures keep their normal non-zero behavior and must not emit fake
machine artifacts.

## Limits

- The Action is implemented outside this repository in `fstepho/anchormap-action`.
- `action.yml`, Action shell scripts, package scripts, and active
  `.github/workflows/*` files are out of scope here.
- No GitHub App, SaaS upload, server analysis, automatic baseline retrieval,
  or PR comment implementation is part of GHA-1.
- Diff output exists only when the user supplies `base-scan`.
- JUnit and SARIF may be documented for later non-GHA-1 Action work, but they
  are not part of the minimal setup.
