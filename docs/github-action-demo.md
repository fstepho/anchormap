# AnchorMap GitHub Action Demo

Status: repo-local demo workflow documentation for the AnchorMap GitHub Action
preview and PR report path.

The public demo repository is
[`fstepho/anchormap-h3-demo`](https://github.com/fstepho/anchormap-h3-demo).
It uses the preview Action tag
`fstepho/anchormap-action@v0-preview.3` and pins `anchormap@1.2.2`. The
runtime Action remains preview-only: no stable release, Marketplace
publication, PR comment automation, or SaaS upload is implied.

## Demo Repository Contents

The demo repository lets a reader understand AnchorMap PR pass/fail behavior
without a call, private source access, or hidden GitHub state. Its preview
workflow base was merged through PR
[#1](https://github.com/fstepho/anchormap-h3-demo/pull/1) and contains:

```text
anchormap.yaml
anchormap.policy.yaml
.github/workflows/anchormap.yml
.anchormap/baseline.scan.json
README.md
docs/anchormap-demo.md
```

The workflow is derived from the inert examples in
[`docs/github-action.md`](github-action.md), pinned to explicit Action and
AnchorMap versions, and installed in the demo repository rather than in this
repository. The baseline scan is an explicit local artifact,
`.anchormap/baseline.scan.json`; AnchorMap must not infer it from Git refs,
GitHub PR metadata, workflow history, caches, network calls, or the clock.

Only real workflow runs and artifacts should be linked as evidence. Do not add
synthetic screenshots or describe workflow runs as completed before they
happen.

## Demo PR Scenarios

The demo repository has four small draft scenario PRs. Each PR description
summarizes the expected signal and points readers to the job summary and
generated workflow artifacts.

| Scenario | PR | Expected result | What it demonstrates |
| --- | --- | --- | --- |
| Clean | [#2](https://github.com/fstepho/anchormap-h3-demo/pull/2) | pass | The supported analysis is clean and the supplied policy passes. |
| New unmapped anchor | [#3](https://github.com/fstepho/anchormap-h3-demo/pull/3) | fail | A new requirement-like anchor was observed without an explicit code mapping. |
| Stale mapping | [#4](https://github.com/fstepho/anchormap-h3-demo/pull/4) | fail | A human mapping exists for an anchor that is not observed in specs. |
| Degraded analysis | [#5](https://github.com/fstepho/anchormap-h3-demo/pull/5) | fail | The scan is still rendered, but the analysis is no longer fully reliable. |

The expected result is the policy interpretation for the demo policy, not a
claim about source-code correctness. A policy failure is a successful policy
evaluation with exit code `5`; it is distinct from a setup failure, invalid
policy, invalid config, missing artifact, or other technical failure.

## Reading The Report

Start with `## Policy violations`.

- `Decision: PASS` means the explicit scan satisfied the explicit policy.
- `Decision: FAIL` means at least one supported policy rule failed.
- Absence of this section means no check artifact was supplied to the report.

Then read `## Summary`.

- `Analysis health: clean` means no degrading scan findings were present.
- `Analysis health: degraded` means at least one degrading finding was present.
- Neither value proves functional correctness, ownership, compliance, or safe
  deletion.

Use `## Change impact` only when the demo PR supplies an explicit baseline scan
and produces `anchormap.diff.json`. This section compares two scan artifacts; it
does not compare Git refs or inspect GitHub PR metadata. If the section is
absent, the report was rendered without diff input.

Use `## Findings` to inspect structural AnchorMap observations. Common demo
signals are:

- `unmapped_anchor`: add or adjust an explicit mapping when the anchor should
  be traced to code.
- `stale_mapping_anchor` or `broken_seed_path`: update the human mapping after
  a file move or remove the obsolete mapping manually.
- degrading findings: inspect the unsupported or unresolved edge before
  trusting coverage.

Use `## Suggested actions` as mechanical next steps only. Suggested actions are
not intelligent recommendations, ownership assignments, compliance guidance, or
deletion advice.

## Baseline Strategy

The demo baseline should be committed or otherwise supplied as an explicit
artifact in the demo repository:

```sh
anchormap scan --json > .anchormap/baseline.scan.json
```

The preview Action receives that path through the `base-scan` input. With
the baseline present, the flow is:

```text
scan -> check -> diff -> report --format markdown
```

Without the baseline, the flow is:

```text
scan -> check -> report --format markdown
```

Both modes are valid. The baseline mode is better for PR demos because it can
show `## Change impact`. The non-baseline mode is simpler, but absence of
`## Change impact` does not prove the PR had no traceability impact.

Refresh the baseline deliberately from a known clean state. Do not let the
workflow fetch the latest `main` artifact, choose a Git ref, or silently update
the baseline as part of PR analysis.

## Demo Policy

A standard demo policy should fail on stale mappings, broken seed paths,
unmapped anchors, degraded analysis, and obviously low coverage:

```yaml
version: 1
fail_on:
  analysis_health: degraded
  finding_kinds:
    - stale_mapping_anchor
    - broken_seed_path
    - unmapped_anchor
thresholds:
  min_covered_product_file_percent: 50
```

To make the degraded-analysis PR a warning-style demo, remove
`analysis_health: degraded` from `fail_on` while keeping the report visible. To
make the demo stricter, add supported finding kinds such as
`untraced_product_file` or use a higher coverage threshold. Keep policy files
inside the closed `version: 1` surface described in
[`docs/policy-examples.md`](policy-examples.md); do not add owners, severities,
waivers, branch names, labels, PR metadata, or expiry fields.

## Operational Follow-Up

The following work remains intentionally outside this repository-local
artifact:

- publish a stable Action release or Marketplace listing;
- create PR comments or richer GitHub integration state.

Keep the demo wording factual: link to real PRs and real artifacts, and avoid
simulating external GitHub state as if a workflow had already run.
