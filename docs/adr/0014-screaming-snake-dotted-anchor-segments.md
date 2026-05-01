# ADR-0014: SCREAMING_SNAKE dotted anchor segments

Status: Accepted
Date: 2026-05-01
Owner: AnchorMap maintainers

## Context

AnchorMap's `DOTTED_ID` grammar originally allowed uppercase letters and digits
inside each dotted segment, but rejected underscores. Real supported spec
repositories use rule and policy IDs whose dotted segments are
`SCREAMING_SNAKE`, such as `DOC.README.SECTIONS_MIN`,
`OWN.CODEOWNERS.FILE_SIZE_UNDER_3MB`, and
`REL.PR_TITLE.CONVENTIONAL_COMMITS`.

Relevant constraints:

- `docs/contract.md` section 6.1 owns the accepted `AnchorId` grammar.
- Markdown ATX heading detection and YAML root `id` observation must remain the
  only spec anchor observation surfaces.
- Config mapping keys and `map --anchor` arguments use the same `AnchorId`
  validator.
- Canonical ordering remains binary UTF-8 ordering over validated anchor
  strings.

## Decision

AnchorMap v1.1 accepts underscores inside `DOTTED_ID` segments:

```text
DOTTED_ID = ^[A-Z]([A-Z0-9_]*[A-Z0-9])?(\.[A-Z]([A-Z0-9_]*[A-Z0-9])?)+$
```

This broadens only the formal dotted-anchor grammar. It does not infer anchors
from prose, filenames, links, section numbers, or any unsupported spec position.

## Alternatives considered

### Option A - Keep underscores unsupported

Pros:

- preserves the narrowest original grammar;
- avoids any new fixture or golden updates.

Cons:

- silently drops common stable rule IDs used by supported spec repositories;
- prevents `scan --json` from representing anchors that are already formal and
  human-authored in supported anchor positions.

### Option B - Emit a finding for candidate-shaped unsupported anchors

Pros:

- would make unsupported forms visible without broadening the grammar.

Cons:

- introduces a new observable finding class and analysis semantics;
- still leaves common formal IDs unusable for mappings.

### Option C - Accept SCREAMING_SNAKE dotted segments

Pros:

- supports common policy and rule ID conventions while preserving a closed
  grammar;
- reuses the existing validator, duplicate detection, config, map, and
  canonical-order behavior.

Cons:

- broadens accepted config keys and map arguments;
- requires spec, config, map, duplicate, and canonical-order fixture coverage.

## Consequences

Positive:

- Supported Markdown headings and YAML root `id` values such as
  `DOC.README.SECTIONS_MIN` become observable anchors.
- Existing `DOTTED_ID` anchors without underscores remain valid.

Negative:

- Fixture and golden coverage must be updated before the behavior is considered
  done.

## Contract impact

`docs/contract.md` section 6.1.2 records the planned v1.1 `DOTTED_ID`
extension from `[A-Z][A-Z0-9]*` segments to
`[A-Z]([A-Z0-9_]*[A-Z0-9])?` segments. The active runtime contract remains
unchanged until the implementation task activates the extension.

## Eval impact

The v1.1 fixture matrix must cover:

- Markdown ATX detection for dotted IDs with underscores;
- YAML root `id` detection for dotted IDs with underscores;
- rejected near-misses such as lowercase text or leading underscores;
- duplicate anchors using dotted IDs with underscores;
- config mapping keys and `map --anchor` behavior using dotted IDs with
  underscores;
- canonical ordering across dotted IDs with and without underscores.

## Design impact

`AnchorId` validation must treat underscores as valid inside `DOTTED_ID`
segments. Spec indexing, duplicate detection, mapping validation, and canonical
ordering continue to call the same validator and comparators.

## Rollback / supersession

This ADR can be superseded only by an explicit product and contract change that
narrows or replaces the formal anchor grammar.

## Links

- `docs/brief.md`
- `docs/contract.md`
- `docs/design.md`
- `docs/evals.md`
- `docs/tasks.md`
