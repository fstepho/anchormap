# ADR-0007: Canonical JSON and YAML rendering

Status: Accepted
Date: 2026-04-24
Owner: AnchorMap maintainers

## Context

AnchorMap has two v1.0 byte-for-byte serializer surfaces:

- successful `scan --json` output on `stdout`;
- successful `anchormap.yaml` writes from `init` and `map`.

Both surfaces are release-gated by exact goldens. They must remain stable across
platforms and dependency updates, and they must not use cache, network, Git,
clock, locale, or environment as a source of truth.

`S4` tested whether native or generic serializers could be constrained enough
to own those bytes.

Relevant constraints:

- `docs/contract.md` §§7.5, 12.5, 13.1, 13.7 require exact canonical YAML and
  JSON bytes.
- `docs/design.md` §§5.2, 5.7, 8, and 11 keep rendering separated from
  parsing, normalization, stdout ownership, and atomic commit.
- `docs/evals.md` §§6.1, 6.2, 6.3, Gate B, and Gate G require exact goldens
  and reproducible dependency inputs.
- `docs/operating-model.md` §§8.6, 16, and 17 require ADR closure for
  serializer strategy and any structural serializer dependency.

## Decision

We will own v1.0 contract bytes with project-controlled renderers:

- `render` will implement `scan --json` bytes with a custom JSON string encoder
  and explicit writers for the closed contract object shapes.
- `config_io.writeConfigAtomic` will prepare `anchormap.yaml` bytes with a
  custom closed-shape YAML writer before the atomic `pre_commit` path begins.
- Parser dependencies remain separate from writer dependencies. A YAML parser
  may be used to read `anchormap.yaml` or YAML specs, but that does not make it
  the canonical YAML writer.
- No JSON or YAML serialization dependency will own contract byte surfaces
  unless a later ADR supersedes this decision by proving exact byte
  compatibility and pinning the dependency.

Byte surfaces requiring custom rendering:

- `scan --json` successful `stdout`, including root and nested key order,
  one-line formatting, no spaces outside strings, exact final newline,
  closed-object shape, and the `contract.md` §13.7 string escaping profile.
- `anchormap.yaml` successful writes, including top-level key order, exact
  two-space indentation, omission of empty `ignore_roots`, exact
  `mappings: {}`, sorted sequences, single-quoted strings with doubled
  internal single quotes, no document markers, no trailing blank line, and exact
  final newline.

Byte surfaces that can rely on constrained serializers for v1.0:

- None of the contract byte-for-byte output surfaces.

Non-output parsing may still rely on separately selected, pinned parser
dependencies when their ADRs prove the relevant input profile. Upstream modules
may also sort, normalize, and validate closed models before rendering, but the
final output bytes remain owned by the custom renderers.

## Alternatives considered

### Option A — Native `JSON.stringify` over pre-sorted plain objects

Pros:

- emits compact JSON without spaces by default;
- preserves insertion order for ordinary non-index object keys;
- can produce a final newline when the caller appends one.

Cons:

- hard-codes short escapes for some control characters, while
  `contract.md` §13.7 requires lowercase `\u00xx` escapes for every
  `U+0000..U+001F` control character;
- cannot configure string escaping;
- does not enforce closed-object shape or key order by itself.

### Option B — Generic YAML serializer constrained by options

Pros:

- could reduce writer code if a pinned dependency exactly matched the required
  profile;
- may still be useful as a YAML parser for input surfaces under a parser ADR.

Cons:

- no pinned YAML emitter in the repo has been proven against the exact
  `anchormap.yaml` byte profile;
- generic emitter defaults can drift in quoting, flow style, indentation,
  document markers, empty object rendering, omission rules, or final newlines;
- adding such an emitter would be a structural serialization dependency under
  `docs/operating-model.md` §16.

### Option C — Custom closed-shape renderers

Pros:

- directly owns the byte profiles required by contract and goldens;
- avoids broad serializer dependency behavior for a small, closed output shape;
- keeps parser and writer dependencies separate;
- makes drift visible in focused renderer tests and fixture goldens.

Cons:

- requires project-owned encoder and writer code;
- every allowed output shape must have explicit coverage.

## Consequences

Positive:

- exact JSON and YAML bytes remain auditable in project code;
- dependency upgrades cannot silently change contract output bytes through
  serializer defaults;
- renderer tasks can proceed with a binding strategy from `S4`.

Negative:

- AnchorMap owns more rendering code than it would with generic serializers;
- future schema additions must update explicit writers and goldens.

Risks:

- incomplete renderer coverage could miss a contract shape or scalar edge case;
- a future generic serializer may be attractive, but must not replace these
  writers without a superseding ADR and exact-byte proof.

## Contract impact

No.

This ADR records the implementation strategy for existing contract bytes. It
does not change `docs/contract.md`.

## Eval impact

No eval weakening or fixture change is required.

Existing JSON and YAML byte-for-byte goldens remain the release oracle. Renderer
unit tests should cover representative closed objects and scalar escaping before
fixture integration.

## Design impact

`docs/design.md` must reference this ADR from:

- §2.1 Stack and ADRs;
- §5.2 `config_io`;
- §5.7 `render`;
- §11 Dépendances et reproductibilité.

The design remains compatible with the existing module boundaries: `render`
owns JSON bytes in memory, and `config_io.writeConfigAtomic` owns YAML byte
preparation before atomic write commit.

## Rollback / supersession

This ADR can be superseded if a later spike proves that a pinned serializer
dependency emits every required byte exactly, including scalar escaping,
ordering, omission rules, indentation, empty-object rendering, and final
newline discipline, and if that dependency is covered by exact goldens and Gate
G dependency audit.

## Links

- `docs/contract.md`
- `docs/design.md`
- `docs/evals.md`
- `docs/tasks.md`
- `spikes/canonical-serializer-report.md`
