# Troubleshooting The AnchorMap GitHub Action

Status: troubleshooting guide for the future AnchorMap GitHub Action described
by `docs/github-action.md`. The runtime Action is not implemented in this
repository by these docs.

The Action boundary is orchestration over local CLI artifacts:

```text
scan -> check -> optional diff -> report --format markdown
```

Do not debug Action behavior by assuming hidden Git, cache, network, SaaS,
source-code, or GitHub metadata inputs. The expected inputs are explicit files
and workflow inputs.

## `anchormap.yaml` Not Found

`scan` and live `check` mode require a valid `./anchormap.yaml` in the working
directory. A missing, unreadable, or invalid config is a technical CLI failure,
not a policy failure.

Check that the workflow checked out the intended repository and runs AnchorMap
from the directory containing `anchormap.yaml`. If you only want to evaluate an
existing scan artifact, use artifact mode:

```sh
anchormap check --scan anchormap.scan.json --policy anchormap.policy.yaml --json
```

Artifact-mode `check` consumes the supplied scan artifact and policy file. It
does not read the repository or `anchormap.yaml`.

## Policy Missing Or Invalid

The policy path is an explicit input. If the file is absent, unreadable,
non-UTF-8, or outside the closed policy schema, `check` fails as a technical
input error and should not emit a `PolicyResult`.

Use a policy compatible with `docs/policy-examples.md`. Do not add unsupported
keys such as owners, severities, waivers, labels, branch names, or PR metadata.

## Scan Has Findings But Check Passes

`scan` findings are observations. They do not automatically fail CI.

`check` fails only when the supplied policy says a finding kind, degraded
analysis, or threshold violation should fail. If findings are visible but the
policy passes, inspect `anchormap.policy.yaml` and decide whether that finding
kind or threshold belongs in the policy.

## Check Exits `5`

Exit code `5` means policy fail after a valid scan and valid policy. It is not a
technical CLI error.

The Action should still preserve generated artifacts and job summary output when
possible. `fail-on-policy` controls the final workflow result:

- `true`: fail the workflow after artifact and summary handling.
- `false`: expose `policy_exit = 5` without failing for policy alone.

## Action Fails On Node

The future Action has an explicit `node-version` input, defaulting to Node 22.
Use a supported Node version for the pinned AnchorMap package version.

This is setup troubleshooting, not a product-truth signal. Do not infer
traceability results from a Node setup failure.

## No Diff Was Produced

Diff output requires two explicit scan artifacts. The Action produces
`anchormap.diff.json` only when `base-scan` points to a supplied baseline scan.

The Action must not fetch the latest `main` artifact, compare Git refs, or infer
a baseline from GitHub metadata. If there is no `base-scan`, the report will not
contain `## Change impact`.

## Fork PR Has No Comment

PR comments are not enabled by default. Fork PRs should rely on job summary and
workflow artifacts.

Do not switch to `pull_request_target` for the initial setup. Commenting on PRs,
`pull-requests: write`, anti-spam update behavior, and fork restrictions require
later opt-in Action behavior.

## Artifacts Are Absent

Expected local files are produced when their corresponding CLI commands produce
contracted output:

```text
anchormap.scan.json
anchormap.check.json
anchormap.report.md
```

For `anchormap check --json`, a policy failure exits `5` but still emits a valid
`PolicyResult` on `stdout`, so `anchormap.check.json` is expected. A technical
`check` failure emits no `PolicyResult`.

`anchormap.diff.json` is expected only when `base-scan` is supplied and diff
generation succeeds.

If workflow artifacts are absent, check:

- whether the CLI failed before the file was produced;
- whether `upload-artifacts` was set to `false`;
- whether `actions/upload-artifact` ran after artifact generation;
- whether the path points at the generated local files.

Workflow artifact upload is GitHub Actions artifact upload only. It is not
AnchorMap SaaS upload and does not make uploaded artifacts a product source of
truth.

## Report Empty Or Incomplete

`anchormap.report.md` is rendered from explicit scan, check, and optional diff
artifacts.

If `## Policy violations` is absent, no check artifact was supplied to the
report command. If `## Change impact` is absent, no diff artifact was supplied.
If `## Suggested actions` is absent, no mechanical action was derivable from the
supplied artifacts.

An incomplete report is usually an artifact plumbing issue or an earlier
technical failure. It is not evidence of compliance, source-code correctness,
ownership, deletion safety, SARIF upload, SaaS upload, or PR comment creation.
