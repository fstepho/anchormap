# AnchorMap Policy Examples

Status: self-serve examples for the closed `version: 1` policy surface used by
`anchormap check` and the AnchorMap GitHub Action preview.

Policy files are explicit read-only inputs. AnchorMap does not create, migrate,
rewrite, or infer them from GitHub metadata.

The supported policy object is closed. Use only:

- `version: 1`;
- optional `fail_on.analysis_health: degraded`;
- optional `fail_on.finding_kinds`;
- optional `thresholds.min_covered_product_file_percent`;
- optional `thresholds.max_untraced_product_files`.

Unknown keys, unsupported values, and unreadable policy files are technical
input failures. They are not policy failures and should not be treated as exit
code `5`.

## Evaluate A Policy

Live scan mode:

```sh
anchormap check --policy anchormap.policy.yaml --json > anchormap.check.json
```

Artifact mode:

```sh
anchormap check --scan anchormap.scan.json --policy anchormap.policy.yaml --json > anchormap.check.json
```

Exit code `0` means policy pass. Exit code `5` means a valid scan and valid
policy evaluated to policy fail. Technical failures use the normal CLI error
codes and must not emit fake `PolicyResult` artifacts.

## Permissive Policy

Use this when you want CI visibility while failing only on degraded analysis.

```yaml
version: 1
fail_on:
  analysis_health: degraded
```

## Standard Policy

Use this when stale mappings, broken seeds, unmapped anchors, and very low
coverage should block a PR.

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

## Strict Policy

Use this when every untraced product file should block the policy decision and
the project expects high coverage.

```yaml
version: 1
fail_on:
  analysis_health: degraded
  finding_kinds:
    - stale_mapping_anchor
    - broken_seed_path
    - unmapped_anchor
    - untraced_product_file
thresholds:
  min_covered_product_file_percent: 80
  max_untraced_product_files: 0
```

## Interpreting Pass And Fail

Policy pass means no supported policy rule was violated for the supplied scan.
It does not prove compliance, source-code correctness, ownership, or deletion
safety.

Policy fail means at least one supported policy rule was violated. It is a
successful policy evaluation with exit code `5`, not a CLI technical error.

When the preview Action is used, `fail-on-policy: true` should fail the workflow
after artifact and job-summary handling. `fail-on-policy: false` should expose
`policy_exit = 5` without failing the workflow for policy alone.

## Staying Within The Closed Surface

Do not add fields such as labels, severities, owners, teams, waivers, rule IDs,
branch names, PR metadata, or expiry dates. Those are outside the accepted
policy schema.

If a repo needs rules beyond this surface, treat that as a product or contract
change request rather than a local policy example.
