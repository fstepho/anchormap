# AnchorMap PR Report

Status: self-serve interpretation guide for the future AnchorMap GitHub Action
job summary and `anchormap.report.md` workflow artifact.

The PR report is the Markdown output of:

```sh
anchormap report --scan anchormap.scan.json --check anchormap.check.json --format markdown
```

When an explicit baseline scan is supplied and `anchormap.diff.json` exists, the
report command may also receive `--diff anchormap.diff.json`.

The report is an artifact view over explicit AnchorMap artifacts. It does not
rescan the repository, read Git metadata, inspect CI state, upload to SaaS,
upload SARIF, or create PR comments by default.

## Where It Appears

The future Action may show the generated Markdown in the GitHub job summary and
may upload `anchormap.report.md` as a GitHub Actions workflow artifact.

The job summary is a display surface. The canonical Markdown artifact remains
`anchormap.report.md`, and summary rendering must not add hidden analysis or
change report semantics.

PR comments are not enabled by default. A comment flow would require later
opt-in Action behavior and additional permissions.

## Summary

`## Summary` is always present. It reports the scan-level traceability shape:

- analysis health;
- observed anchors;
- usable mappings;
- covered product files and coverage percent;
- total scan findings.

`Analysis health: clean` means AnchorMap completed the supported analysis
without degrading findings. It is not a functional correctness result.

`Analysis health: degraded` means at least one degrading finding was present.
It does not identify ownership or prove source-code behavior by itself.

## Policy Violations

`## Policy violations` appears when a `PolicyResult` artifact from
`anchormap check` is supplied.

The first line is `Decision: PASS` or `Decision: FAIL`:

- `PASS` means the supplied scan satisfied the supplied policy.
- `FAIL` means at least one supported policy rule was violated.

Policy failure is separate from technical failure. `anchormap check` exits with
code `5` when a valid scan and valid policy evaluate to a failing policy
decision. With the Action, `fail-on-policy` controls whether that policy exit
code fails the workflow after artifacts and the job summary are handled.

Missing, unreadable, or invalid policy input is not a policy failure. It is a
technical input failure and should not be interpreted as `Decision: FAIL`.

## Change Impact

`## Change impact` appears only when a diff artifact is supplied. The diff is
computed from two explicit scan artifacts, not from Git refs or GitHub PR
metadata.

Use this section to see structural PR impact such as:

- comparability;
- analysis health change;
- anchors and mappings added or removed;
- files added or removed;
- files that became covered or lost coverage;
- findings added or removed.

If the section is absent, no diff artifact was supplied. Absence of this section
does not prove that the PR has no traceability impact; it only means the report
was rendered without an explicit baseline scan and diff.

## Findings

`## Findings` is always present. It lists scan findings as canonical JSON lines,
or `- none` when the scan has no findings.

Findings are structural AnchorMap observations. They are not proof of ownership,
dead code, safe deletion, or source-code behavior outside the supported
traceability model.

## Suggested Actions

`## Suggested actions` appears only when AnchorMap can derive mechanical next
steps from actionable scan findings or diff lost-coverage signals.

Examples include adding a missing mapping, fixing or removing a broken seed,
inspecting an unsupported edge, or inspecting a file that lost coverage.

Policy violations do not create suggested actions by themselves. A policy-only
failure, such as a coverage threshold failure or degraded analysis-health
failure, can fail the check without producing `## Suggested actions` unless the
scan findings or diff also contain an actionable signal.

Suggested actions are mechanical. They are not intelligent recommendations,
compliance instructions, ownership assignments, or deletion guidance.

## What It Does Not Prove

The report does not prove:

- compliance with product, security, regulatory, or business requirements;
- source-code correctness;
- source-code provenance;
- that supplied artifacts came from the same run;
- code ownership;
- dead code;
- safe deletion;
- that no unmodeled code path exists;
- that SARIF was uploaded;
- that any AnchorMap SaaS, server, dashboard, or GitHub App received data;
- that a PR comment was created.

AnchorMap reports local traceability artifacts only. Treat the report as a
deterministic PR-readable summary of the explicit scan, check, and optional diff
artifacts that were supplied to the renderer.
