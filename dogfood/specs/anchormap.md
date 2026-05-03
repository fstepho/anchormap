# AnchorMap dogfood trace specs

This file is a non-normative dogfood trace spec. Runtime behavior remains owned
by `docs/contract.md`, compatible implementation design remains owned by
`docs/design.md`, verification remains owned by `docs/evals.md`, and accepted
technical decisions remain owned by `docs/adr/`.

## CLI.COMMANDS - Command boundary

Non-normative dogfood trace spec.

Authority: `docs/contract.md` §§9, 12, 13; `docs/design.md` §§5.6, 9.4; `docs/evals.md` B-cli.

## CONFIG.YAML_STATE - Config and persisted state

Non-normative dogfood trace spec.

Authority: `docs/contract.md` §7; `docs/design.md` §§5.2, 8; `docs/adr/0005-yaml-parser-and-config-input-profile.md`; `docs/adr/0008-atomic-config-write-path.md`.

## SPEC.ANCHOR_DISCOVERY - Spec anchor discovery

Non-normative dogfood trace spec.

Authority: `docs/contract.md` §§6.1, 8; `docs/design.md` §§5.3, 7.2; `docs/evals.md` B-specs; `docs/adr/0013-anchormap-documentation-anchor-formats.md`; `docs/adr/0014-screaming-snake-dotted-anchor-segments.md`.

## GRAPH.LOCAL_TS_REACHABILITY - Local TypeScript reachability

Non-normative dogfood trace spec.

Authority: `docs/contract.md` §10; `docs/design.md` §§5.4, 7.4; `docs/evals.md` B-graph; `docs/adr/0006-typescript-parser-and-graph-subset.md`; `docs/adr/0012-typescript-esm-js-specifier-source-resolution.md`.

## SCAN.COVERAGE_FINDINGS - Coverage and findings

Non-normative dogfood trace spec.

Authority: `docs/contract.md` §§6.6-6.11, 9.3, 11, 13.3-13.6; `docs/design.md` §§5.5, 7.5-7.8; `docs/evals.md` B-scan.

## SCAN.TRACEABILITY_METRICS - Traceability metrics

Non-normative dogfood trace spec.

Authority: `docs/contract.md` §§6.12, 13.5.1, 13.7; `docs/design.md` §7.6.1; `docs/evals.md` B-scan `fx10a_scan_traceability_metrics_fanout`.

## RENDER.JSON_CANONICAL - Canonical JSON rendering

Non-normative dogfood trace spec.

Authority: `docs/contract.md` §13.7; `docs/design.md` §§5.7, 6.5; `docs/evals.md` §6.1; `docs/adr/0007-canonical-json-and-yaml-rendering.md`.

## HARNESS.FIXTURE_ORACLES - Fixture harness oracles

Non-normative dogfood trace spec.

Authority: `docs/evals.md` §§4.2, 6, 7; `docs/design.md` §10; `docs/adr/0003-test-runner-and-fixture-harness.md`.

## VERIFY.UNIT_BOUNDARIES - Unit verification boundaries

Non-normative dogfood trace spec.

Authority: `docs/evals.md` Level A; `docs/operating-model.md` §§2.2, 19.1.

## VERIFY.FIXTURE_HARNESS - Fixture and metamorphic verification

Non-normative dogfood trace spec.

Authority: `docs/evals.md` §§4.2, 6, 8; `docs/adr/0003-test-runner-and-fixture-harness.md`.

## VERIFY.RELEASE_READINESS - Release readiness verification

Non-normative dogfood trace spec.

Authority: `docs/evals.md` Gates A-G; `docs/release-runbook.md`; `docs/adr/0009-packaging-and-distribution.md`.

## VERIFY.PROCESS_GUARDRAILS - Repo-local process guardrails

Non-normative dogfood trace spec.

Authority: `docs/operating-model.md`; `docs/agent-loop.md`; `docs/code-review.md`.
