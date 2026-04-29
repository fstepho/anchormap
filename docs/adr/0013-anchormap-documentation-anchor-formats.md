# ADR-0013: AnchorMap documentation anchor formats

Status: Accepted
Date: 2026-04-29
Owner: AnchorMap maintainers

## Context

AnchorMap v1.0 detects only `SHORT_ID` and `DOTTED_ID` anchors. The AnchorMap
repository itself already uses stable documentation identifiers such as
`T10.6`, `T0.0a`, `M10`, `S5`, and `ADR-0012`, but those identifiers are not
valid v1.0 anchors.

Relevant constraints:

- `docs/contract.md` section 6.1 owns the accepted `AnchorId` grammar.
- `docs/design.md` keeps `AnchorId` validation at input boundaries.
- `docs/evals.md` owns boundary fixtures for Markdown/YAML spec detection,
  config mapping keys, map arguments, duplicates, and canonical ordering.
- `ADR-0004` and `ADR-0005` keep Markdown and YAML parser profiles unchanged.

## Decision

AnchorMap v1.1 should support a closed set of repository-documentation anchor
formats in addition to the v1.0 `SHORT_ID` and `DOTTED_ID` formats:

- task IDs: `T<major>.<minor>` with an optional lowercase suffix, for example
  `T10.6` and `T0.0a`;
- milestone IDs: `M<number>`, for example `M10`;
- spike IDs: `S<number>`, for example `S5`;
- ADR IDs: `ADR-` followed by four digits, for example `ADR-0012`.

This changes only `AnchorId` validation. It does not change the supported
Markdown or YAML parser profiles, does not infer anchors from prose, and does
not create mappings or ownership links automatically.

## Alternatives considered

### Option A - Keep v1.0 anchor formats only

Pros:

- preserves the smallest already released grammar;
- avoids any risk of accepting accidental documentation labels.

Cons:

- prevents AnchorMap from dogfooding stable IDs already used by its own durable
  docs.

### Option B - Add a closed repository-documentation grammar

Pros:

- covers task, milestone, spike, and ADR IDs without semantic inference;
- keeps detection at the existing Markdown/YAML anchor positions;
- preserves deterministic validation and canonical ordering.

Cons:

- broadens the accepted `AnchorId` grammar and therefore affects config keys,
  map arguments, duplicate detection, and sorted outputs.

### Option C - Accept arbitrary heading labels or references

Pros:

- would detect more informal documentation conventions.

Cons:

- turns AnchorMap into a prose/interlink inference tool;
- weakens the formal-anchor boundary and risks false positives.

## Consequences

Positive:

- AnchorMap can trace repositories whose durable specs use task-like,
  milestone-like, spike-like, or ADR-like IDs.
- The v1.1 implementation has an exact grammar before code changes begin.

Negative:

- The v1.1 implementation must update spec, config, map, duplicate, and
  canonical-order fixtures because valid inputs and sorted outputs can change.

Risks:

- Users may expect all headings or references to become anchors. Documentation
  and fixtures must keep the feature framed as a closed grammar in existing
  anchor positions only.

## Contract impact

Yes, for v1.1 only.

`docs/contract.md` now records the planned v1.1 documentation anchor grammar in
section 6.1.1. The v1.0 `AnchorId` grammar remains unchanged until the
implementation task deliberately activates the extension.

## Eval impact

The v1.1 fixtures must cover:

- Markdown ATX detection for task, task-suffix, milestone, spike, and ADR IDs;
- YAML root `id` detection for the same accepted shapes;
- rejected near-misses;
- duplicate anchors using the new shapes;
- config mapping keys using the new shapes;
- `map --anchor` success, invalid-argument, and valid-but-unobserved cases;
- canonical ordering across old and new anchor formats.

## Design impact

`AnchorId` validation must add the closed grammar branches when the v1.1
extension is activated. Spec indexing, duplicate detection, mapping validation,
and canonical ordering continue to call the same validator and comparators.

## Rollback / supersession

This ADR can be superseded if AnchorMap later chooses a broader or narrower
formal anchor language through an explicit product and contract change.

## Links

- `docs/brief.md`
- `docs/contract.md`
- `docs/design.md`
- `docs/evals.md`
- `docs/adr/0004-markdown-parser-profile.md`
- `docs/adr/0005-yaml-parser-and-config-input-profile.md`
- `docs/tasks.md`
