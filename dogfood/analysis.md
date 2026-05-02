# Dogfood Scan Analysis

This report explains what the reference dogfood scan teaches us about this
repository. It is non-normative: it does not change runtime behavior, product
scope, verification gates, implementation design, or accepted ADRs.

## Quick Read

Dogfood produces two complementary views:

- the strict scan, based on `dogfood/specs`, measures a small curated
  traceability map;
- the exploratory scan, based on `docs`, keeps the repository's real
  documentation noise visible.

The strict scan is therefore not proof of complete repository coverage. It
shows what AnchorMap can make explicit when anchors and mappings are deliberate.

## Strict Scan

Observed state:

- `analysis_health = clean`;
- 11 observed anchors;
- 11 stored mappings;
- no `unmapped_anchor`;
- no `stale_mapping_anchor`;
- no `broken_seed_path`;
- 49 covered files;
- 9 uncovered files emitted as `untraced_product_file`.

The important signal is that uncovered files are visible. The strict scan makes
those files reviewable as traceability gaps instead of mixing them with broad
documentation anchors.

## What The Strict Scan Shows

The strict anchors cover the expected cores:

- `CLI.COMMANDS` traces the CLI boundary;
- `CONFIG.YAML_STATE` traces YAML state and repository reads;
- `SPEC.ANCHOR_DISCOVERY` traces anchor validation and discovery;
- `GRAPH.LOCAL_TS_REACHABILITY` traces the local TypeScript graph;
- `SCAN.COVERAGE_FINDINGS` traces the scan and finding model;
- `RENDER.JSON_CANONICAL` traces canonical JSON rendering;
- `HARNESS.FIXTURE_ORACLES` traces fixture harness oracles;
- `VERIFY.UNIT_BOUNDARIES` traces focused unit-test boundaries;
- `VERIFY.FIXTURE_HARNESS` traces fixture and metamorphic verification;
- `VERIFY.RELEASE_READINESS` traces release-readiness verification;
- `VERIFY.PROCESS_GUARDRAILS` traces repo-local process checks.

The most-covered files are cross-cutting modules:

- `src/domain/anchor-id.ts`: 7 anchors;
- `src/domain/repo-path.ts`: 5 anchors;
- `src/domain/canonical-order.ts`: 5 anchors;
- `src/domain/finding.ts`: 5 anchors;
- `src/domain/scan-result.ts`: 5 anchors.

That remaining overlap is understandable: these modules carry shared types,
validation, ordering, and scan-result shape used by both runtime obligations and
verification boundaries.

## What The Strict Scan Exposes

The 9 `untraced_product_file` findings are the most useful remaining signal.

The strict dogfood map promotes selected focused or boundary-level tests that
directly protect durable obligations. Wider integration-style suites remain
visible as untraced files when using them as seeds would make the strict map
less discriminating.

The remaining untraced files are:

- `src/anchormap.ts`;
- `src/bootstrap.test.ts`;
- `src/cli/commands.test.ts`;
- `src/cli-stub.test.ts`;
- `src/cli-stub.ts`;
- `src/infra/config-io.test.ts`;
- `src/infra/product-files.test.ts`;
- `src/infra/spec-index.test.ts`;
- `src/infra/ts-graph.test.ts`.

This does not mean those files are unused or removable. It means they are not
currently tied to a durable anchor in the strict dogfood map. The remaining
set is intentionally concentrated in thin entrypoints, walking-skeleton stubs,
and wider or deliberately unmapped tests that would make the strict map less
discriminating if they were used as runtime-surface seeds.

The remaining decision is explicit:

- accept that the strict dogfood map now traces the durable verification
  surfaces represented by product, infra, and harness tests;
- treat the remaining entrypoint, stub, and integration-heavy test files as
  outside this reference map unless they are deliberately promoted to a mapped
  surface.

## Exploratory Scan

Observed state:

- `analysis_health = clean`;
- 116 observed anchors under `docs`;
- 0 stored mappings in this temporary scan;
- 116 `unmapped_anchor` findings.

This result is intentionally non-blocking. It shows that `docs` contains many
observable identifiers (`T*`, `M*`, `S*`, `ADR-*`) that are useful as document
structure, but are not a curated runtime traceability map.

The exploratory scan prevents self-deception: the strict scan gives a clean
signal, while the broad scan keeps the real documentation noise visible.

## Conclusion

The reference dogfood scan is useful because it separates three things:

1. what is observed in formal specs;
2. what is intentionally mapped by a human;
3. what remains untraced in the current product tree.

For this repository, it shows that the strict map is healthy but incomplete.
That is a good reference state: clean enough to review, incomplete enough to
keep teaching us something.
