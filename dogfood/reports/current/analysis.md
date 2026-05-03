# Dogfood Scan Analysis

This report explains what the reference dogfood scan teaches us about this
repository. It is non-normative: it does not change runtime behavior, product
scope, verification gates, implementation design, or accepted ADRs.

## Reader Message

This report should not read as "AnchorMap dogfoods itself, therefore the
repository is covered." The intended message is narrower:

AnchorMap is useful when it keeps three states separate:

- formal anchors that can be observed in specs;
- mappings that were deliberately curated by a human;
- product files that are directly traced, only broadly shared, or still
  untraced.

The strict scan is clean but deliberately incomplete. That is the reference
posture: it shows that the curated map is internally coherent, while keeping 9
product files visible outside the map.

The schema v2 output qualifies coverage. A reader can distinguish direct
seeding, focused single-anchor coverage, broad cross-cutting overlap, and
missing traceability without a repo-specific interpretation layer.

The exploratory scan is the counterweight. It shows that broad documentation
discovery can generate many formal identifiers without creating a useful runtime
trace map. This is why AnchorMap reports structural traceability, not ownership,
conformance, dead code, or safe deletion.

## Quick Read

Dogfood produces two complementary views:

- the strict scan, based on `dogfood/specs`, measures a small curated
  traceability map;
- the exploratory scan, based on `docs`, keeps the repository's real
  documentation noise visible.

The strict scan is therefore not proof of complete repository coverage. It
shows what AnchorMap can make explicit when anchors and mappings are deliberate.

## Traceability Metrics

The strict scan reports these specificity signals:

- direct seeding is visible (`35 / 58` product files);
- selective coverage is visible (`23` single-cover files);
- cross-cutting overlap is visible (`26` multi-cover files);
- traceability gaps are visible (`9` uncovered files).

These metrics stay inside AnchorMap's product boundary: structural
traceability, not ownership, conformance, dead code, or safe deletion.

## Strict Scan

Observed state:

- `schema_version = 2`;
- `analysis_health = clean`;
- 12 observed anchors;
- 12 stored mappings;
- no `unmapped_anchor`;
- no `stale_mapping_anchor`;
- no `broken_seed_path`;
- 58 product files;
- 49 covered files;
- 9 uncovered files emitted as `untraced_product_file`.

Traceability metrics:

- 35 directly seeded product files;
- 23 single-cover product files;
- 26 multi-cover product files.

The important signal is that uncovered files are visible. The strict scan makes
those files reviewable as traceability gaps instead of mixing them with broad
documentation anchors.

## What The Strict Scan Shows

The strict anchors cover the expected cores:

- `CLI.COMMANDS` traces the executable CLI boundary from `src/anchormap.ts`
  and command argument parsing;
- `CONFIG.YAML_STATE` traces YAML state and repository reads;
- `SPEC.ANCHOR_DISCOVERY` traces anchor validation and discovery;
- `GRAPH.LOCAL_TS_REACHABILITY` traces the local TypeScript graph;
- `SCAN.COVERAGE_FINDINGS` traces the scan and finding model;
- `SCAN.TRACEABILITY_METRICS` traces the schema v2 metrics model without
  claiming the renderer as a direct seed;
- `RENDER.JSON_CANONICAL` traces canonical JSON rendering;
- `HARNESS.FIXTURE_ORACLES` traces fixture harness oracles;
- `VERIFY.UNIT_BOUNDARIES` traces focused unit-test boundaries;
- `VERIFY.FIXTURE_HARNESS` traces fixture and metamorphic verification;
- `VERIFY.RELEASE_READINESS` traces release-readiness verification;
- `VERIFY.PROCESS_GUARDRAILS` traces repo-local process checks.

The most-covered files are cross-cutting modules:

- `src/domain/anchor-id.ts`: 8 anchors;
- `src/domain/repo-path.ts`: 7 anchors;
- `src/domain/canonical-order.ts`: 7 anchors;
- `src/domain/finding.ts`: 7 anchors;
- `src/domain/scan-result.ts`: 7 anchors;
- `src/render/render-json.ts`: 7 anchors.

That overlap is understandable: these modules carry shared types, validation,
ordering, rendering, and scan-result shape used by both runtime obligations,
the CLI entrypoint, and verification boundaries. The useful part is not that
overlap exists; it is that the scan makes the overlap measurable instead of
hiding it behind a single covered / uncovered bit.

The CLI anchor is intentionally broad because it starts at the executable
entrypoint. That breadth is useful signal, not noise: it shows the runtime path
from command invocation into config, spec indexing, graph construction, scan
evaluation, and rendering.

## What The Strict Scan Exposes

The 9 `untraced_product_file` findings are the clearest gap signal.

The strict dogfood map promotes selected focused or boundary-level tests that
directly protect durable obligations. Wider integration-style suites remain
visible as untraced files when using them as seeds would make the strict map
less discriminating.

The untraced files are:

- `src/bootstrap.test.ts`;
- `src/bootstrap.ts`;
- `src/cli/commands.test.ts`;
- `src/cli-stub.test.ts`;
- `src/cli-stub.ts`;
- `src/infra/config-io.test.ts`;
- `src/infra/product-files.test.ts`;
- `src/infra/spec-index.test.ts`;
- `src/infra/ts-graph.test.ts`.

This does not mean those files are unused or removable. It means they are not
tied to a durable anchor in the strict dogfood map. The set is concentrated in
thin entrypoints, walking-skeleton stubs, and wider or deliberately unmapped
tests that would make the strict map less discriminating if they were used as
runtime-surface seeds.

The useful interpretation is:

- the strict dogfood map traces durable runtime and verification surfaces;
- entrypoint, stub, and integration-heavy test files outside the map remain
  visible as traceability gaps.

## Exploratory Scan

Observed state:

- `schema_version = 2`;
- `analysis_health = clean`;
- 121 observed anchors under `docs`;
- 0 stored mappings in this temporary scan;
- 121 `unmapped_anchor` findings.

This result is intentionally non-blocking. It shows that `docs` contains many
observable identifiers (`T*`, `M*`, `S*`, `ADR-*`) that are useful as document
structure, but are not a curated runtime traceability map.

The exploratory scan qualifies the strict scan: the strict map gives a clean
curated signal, while the broad docs scan keeps documentation noise visible.

## Conclusion

The reference dogfood scan is useful because it separates three things:

1. what is observed in formal specs;
2. what is intentionally mapped by a human;
3. what is untraced in the scanned product tree.

For this repository, it shows that the strict map is healthy, intentionally
incomplete, and interpretable. That is a useful dogfood state: clean enough to
review, incomplete enough to expose gaps, and explicit enough to avoid
overclaiming what structural coverage means.
