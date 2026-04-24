# S4 — Canonical serializer profile report

## Scope

- Task: `S4 — Canonical serializer profile report`
- Change type: `spike`
- Files changed: this report
- Production behavior changed: `None`

This spike is bounded by:

- `contract.md` — §§7.5, 12.5, 13.1, 13.7
- `design.md` — §§5.2, 5.7, 8, 11
- `evals.md` — §§6.1, 6.2, 6.3, Gate B, Gate G
- `operating-model.md` — §§15, 16, 17, 19.1

## Question

Is a custom renderer required for exact JSON and YAML bytes, or can selected
serializers be constrained safely?

## Probe protocol

Throwaway probes were run with:

- Node `v22.19.0`
- Host platform `darwin arm64`
- No network access
- No new dependencies installed

Probe cases:

1. JSON object key order, whitespace, final newline, and closed-object shape.
2. JSON string escaping for `"`, `\`, `/`, non-ASCII characters, control
   characters, and isolated surrogates.
3. YAML canonical byte shape for key order, indentation, single quotes,
   omission of empty `ignore_roots`, `mappings: {}`, sorted arrays, and final
   newline.
4. Dependency surface implied by any serializer that would affect JSON or YAML
   contract bytes.

No production renderer behavior was introduced by this spike.

## Serializer candidates

### Candidate A — Native `JSON.stringify` over pre-sorted plain objects

Observed strengths:

- Emits compact one-line JSON with no spaces by default.
- Preserves insertion order for ordinary non-index object keys.
- Appending `\n` produces the required final newline.
- Escapes `"` as `\"`, `\` as `\\`, and isolated surrogate `U+D800` as
  `\ud800`.
- Does not escape `/`.

Observed blockers:

- Control characters with short JSON escapes are rendered as `\b`, `\t`, `\n`,
  `\f`, and `\r`, but `contract.md` §13.7 requires every `U+0000..U+001F`
  control character to be escaped as `\u00xx` with lowercase hex.
- String escaping is not configurable.
- Closed-object enforcement and canonical key order still depend on the caller
  constructing exactly the allowed object shape.

Result: suitable only as an oracle for some delimiters and object punctuation;
not suitable as the contract serializer.

### Candidate B — Custom JSON renderer with custom string encoder

Observed strengths:

- Can render the exact root and nested key order from `contract.md` §13.7.
- Can render exactly one line and append exactly one final `\n`.
- Can reject or fail on unexpected object shapes before bytes are emitted.
- Can implement the exact string escaping profile, including `\u00xx` for all
  controls, lowercase surrogate escapes, no escaping for `/`, and direct UTF-8
  for all other characters.

Observed blockers:

- Requires explicit implementation and byte-for-byte golden coverage.

Result: required for `scan --json`.

### Candidate C — Generic YAML serializer constrained by options

Observed strengths:

- A YAML dependency could parse input YAML for `config_io`, but parsing and
  writing are different contract surfaces.

Observed blockers:

- The current package has no pinned YAML serializer dependency.
- Any introduced YAML emitter would be a structural dependency under
  `operating-model.md` §16 and `design.md` §11.
- The contract requires an intentionally narrow emitter profile:
  top-level key order, exact two-space indentation, no document markers, no
  trailing blank line, omission of empty `ignore_roots`, mandatory
  `mappings: {}`, single quotes on every rendered string, and only one escape
  rule inside those single quotes.
- A generic YAML emitter is broader than this surface and would need exact
  option coverage plus goldens for every scalar and collection shape. Without
  that, serializer upgrades or defaults can drift in quoting, flow/block style,
  empty-object rendering, indentation, and document markers.

Result: not acceptable as the `anchormap.yaml` writer unless a later ADR proves
one exact pinned emitter profile. S4 found no such existing constrained
serializer in the repo.

### Candidate D — Custom YAML renderer for the closed `Config` shape

Observed strengths:

- The contract YAML shape is small and closed.
- Can render each line in the exact order required by `contract.md` §7.5.
- Can omit `ignore_roots` only when absent or empty.
- Can render `mappings: {}` exactly for empty mappings.
- Can implement the complete single-quote rule with no generic YAML style
  decisions.

Observed blockers:

- Requires explicit implementation and byte-for-byte golden coverage.

Result: required for `anchormap.yaml` writes.

## Exact byte comparisons

### JSON comparison

Input probe string:

```text
"\b\t\n\f\r"
```

`JSON.stringify` observed bytes:

```text
225c625c745c6e5c665c72220a
```

`JSON.stringify` observed text:

```json
"\b\t\n\f\r"
```

Required contract bytes for the same JSON string plus final newline:

```text
225c75303030385c75303030395c75303030615c75303030635c7530303064220a
```

Required contract text:

```json
"\u0008\u0009\u000a\u000c\u000d"
```

Result:

- `JSON.stringify` does not satisfy `contract.md` §13.7 for control
  characters with short JSON escapes.
- Because JavaScript does not expose a `JSON.stringify` escaping profile option,
  exact JSON requires a custom string encoder.

Positive JSON shape probe:

```json
{"schema_version":1,"config":{"version":1,"product_root":"src","spec_roots":["specs"],"ignore_roots":[]},"analysis_health":"clean","observed_anchors":{"A.B":{"spec_path":"specs/a.md","mapping_state":"absent"}},"stored_mappings":{},"files":{"src/index.ts":{"covering_anchor_ids":[],"supported_local_targets":[]}},"findings":[]}
```

Observed bytes with final newline:

```text
7b22736368656d615f76657273696f6e223a312c22636f6e666967223a7b2276657273696f6e223a312c2270726f647563745f726f6f74223a22737263222c22737065635f726f6f7473223a5b227370656373225d2c2269676e6f72655f726f6f7473223a5b5d7d2c22616e616c797369735f6865616c7468223a22636c65616e222c226f627365727665645f616e63686f7273223a7b22412e42223a7b22737065635f70617468223a2273706563732f612e6d64222c226d617070696e675f7374617465223a22616273656e74227d7d2c2273746f7265645f6d617070696e6773223a7b7d2c2266696c6573223a7b227372632f696e6465782e7473223a7b22636f766572696e675f616e63686f725f696473223a5b5d2c22737570706f727465645f6c6f63616c5f74617267657473223a5b5d7d7d2c2266696e64696e6773223a5b5d7d0a
```

This shape is compatible only when the model is already closed, normalized, and
inserted in canonical order. It does not remove the string-escaping blocker.

### YAML comparison

Canonical YAML required for a minimal config:

```yaml
version: 1
product_root: 'src'
spec_roots:
  - 'specs'
mappings: {}
```

Required bytes:

```text
76657273696f6e3a20310a70726f647563745f726f6f743a2027737263270a737065635f726f6f74733a0a20202d20277370656373270a6d617070696e67733a207b7d0a
```

Canonical YAML required for sorted paths, sorted anchors, omitted empty
`ignore_roots`, and single-quote escaping:

```yaml
version: 1
product_root: 'app''s/src'
spec_roots:
  - 'docs/a'
  - 'docs/z'
mappings:
  'A.ONE':
    seed_files:
      - 'src/a.ts'
      - 'src/z.ts'
```

Required bytes:

```text
76657273696f6e3a20310a70726f647563745f726f6f743a20276170702727732f737263270a737065635f726f6f74733a0a20202d2027646f63732f61270a20202d2027646f63732f7a270a6d617070696e67733a0a202027412e4f4e45273a0a20202020736565645f66696c65733a0a2020202020202d20277372632f612e7473270a2020202020202d20277372632f7a2e7473270a
```

Result:

- The YAML output profile is smaller than YAML as a general language.
- Exact rendering is most safely implemented as a custom closed-shape renderer
  owned by `config_io.writeConfigAtomic`.
- A generic YAML emitter must not own this byte surface unless a later ADR
  proves exact behavior for all required lines and pins the dependency.

## Must-answer summary

### Can JSON string escaping be controlled exactly as `contract.md` §13.7 requires?

Not with native `JSON.stringify`.

`JSON.stringify` hard-codes short escapes for `U+0008`, `U+0009`, `U+000A`,
`U+000C`, and `U+000D`. The contract requires `\u0008`, `\u0009`, `\u000a`,
`\u000c`, and `\u000d`. Because the escaping profile is not configurable, JSON
requires a custom string encoder. The surrounding JSON renderer should also own
closed-object shape and key order rather than trusting arbitrary object
construction.

### Can YAML rendering match exact quotes, indentation, key order, omission rules, and final newline?

Yes, but only as a custom closed-shape renderer or as a future pinned serializer
profile proven by ADR and goldens.

For S4, no existing constrained YAML serializer is present in the repo. The
contract YAML shape is small enough that manual rendering is lower risk than
introducing a broad emitter whose defaults can affect quote style, flow style,
document markers, indentation, empty objects, or final newlines.

### Which parts must be implemented manually to avoid serializer drift?

Manual implementation is required for:

- JSON string escaping.
- JSON root and nested key order.
- JSON closed-object rendering for every contract object.
- JSON final newline discipline.
- YAML top-level key order.
- YAML omission of empty `ignore_roots`.
- YAML `mappings: {}` for empty mappings.
- YAML sorted sequence emission.
- YAML single-quoted string rendering with only `''` for internal `'`.
- YAML indentation and final newline discipline.

Upstream modules may still sort, normalize, and validate models before render,
as required by `design.md` §§5.2 and 5.7. The renderers should not use cache,
clock, network, Git, or environment state as byte sources.

## Result

Both byte surfaces require custom rendering for v1.0.

- JSON requires a custom renderer because native JSON serialization cannot be
  constrained to the exact control-character escape profile.
- YAML requires a custom closed-shape renderer because no current pinned
  serializer profile has been proven to emit the exact `anchormap.yaml` bytes.
- Parser dependencies remain separate from writer dependencies. A YAML parser
  may still be used for reading `anchormap.yaml`, but it must not imply that the
  same dependency owns canonical writing.

## Decision

Adopt these constraints for the tasks blocked by S4:

1. `render` should implement `scan --json` bytes with a custom string encoder
   and explicit contract-object writers.
2. `config_io.writeConfigAtomic` should implement `anchormap.yaml` bytes with a
   custom closed-shape YAML writer before the atomic pre-commit path begins.
3. Do not introduce a JSON or YAML serialization dependency for contract bytes
   unless a future ADR proves exact byte compatibility and pins the dependency.
4. Keep byte-for-byte JSON and YAML goldens as the release oracle for all
   serializer surfaces.

## Consequences

### Design

- `design.md` consequence: `render` should be interpreted as a custom canonical
  JSON byte renderer, not a wrapper around `JSON.stringify`.
- `design.md` consequence: `config_io` should own a custom closed-shape YAML
  writer for `anchormap.yaml` writes.

### Contract

- None.

### Evals

- None. Existing JSON and YAML byte-for-byte golden requirements are sufficient.

### Tasks

- `T3.5` should implement custom JSON rendering, including custom string
  escaping.
- `T4.4` should implement custom YAML rendering in `config_io`, not rely on a
  generic YAML emitter for canonical bytes.
- `T0.3` must record the S4 decision in an ADR before unblocking the dependent
  renderer tasks.
