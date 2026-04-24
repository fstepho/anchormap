# ADR-0005: YAML parser and config input profile

Status: Accepted
Date: 2026-04-24
Owner: AnchorMap maintainers

## Context

AnchorMap consumes YAML in two input roles:

- `anchormap.yaml`, which is configuration and persisted mapping state;
- spec YAML files discovered under `spec_roots`, where only a root scalar `id`
  can produce an anchor.

Both inputs are governed by `YAML_PROFILE = YAML 1.2.2`, must be decoded by
`repo_fs.readUtf8StrictNoBom` before parsing, must reject multi-document input
where forbidden, and must reject duplicate keys. YAML output is a separate
byte-for-byte surface already owned by `ADR-0007`; the input parser selected
here must not become the canonical YAML writer.

`S1` probed `yaml@2.8.3` and found that it supports YAML 1.2-compatible
parsing, document APIs, parse errors, and duplicate-key diagnostics with
`uniqueKeys: true`. The probe also found that explicit non-1.2 directives must
be rejected by the wrapper.

Relevant constraints:

- `docs/contract.md` sections 1.1, 7, 8.2, and 12.3 require YAML profile
  parsing, single-document validation, root-shape handling, duplicate-key
  rejection, and source-specific error classification.
- `docs/design.md` sections 5.2, 5.3, and 7.2 assign YAML config loading to
  `config_io` and YAML spec parsing to `spec_index`.
- `docs/evals.md` sections 5.1, 5.3, 5.6, Gate A, and Gate G require YAML
  profile, duplicate-key, config, and reproducibility coverage.
- `docs/operating-model.md` sections 8.6, 16, and 17 require ADR closure and
  exact dependency pins for structural parser dependencies.

## Decision

We will use `yaml@2.8.3` as the YAML input parser for `anchormap.yaml` and YAML
spec files.

The input wrapper must:

- pass only text already returned by `repo_fs.readUtf8StrictNoBom`;
- parse with `YAML.parseAllDocuments(text, { version: "1.2", uniqueKeys: true })`;
- reject input unless exactly one document is returned;
- reject any `doc.errors` before converting or reading values;
- reject duplicate-key diagnostics, including nested duplicate keys;
- reject explicit YAML directives that select a non-1.2 version;
- for `anchormap.yaml`, require a root mapping before schema validation and
  classify parse, profile, duplicate-key, root-shape, schema, and invariant
  failures as `ConfigError`;
- for spec YAML, require valid single-document YAML without duplicate keys, and
  produce an anchor only from a root mapping with an exact scalar `id` value.

This dependency is selected for input parsing only. `ADR-0007` remains binding:
`yaml` is not the canonical `anchormap.yaml` writer.

Compatibility note:

- The project contract names `YAML_PROFILE = YAML 1.2.2`.
- `S1` proved the selected dependency and wrapper against the YAML boundaries
  AnchorMap depends on, including YAML 1.2 mode, duplicate-key diagnostics,
  single-document rejection, and non-1.2 directive rejection.
- This ADR therefore records a YAML 1.2-compatible implementation of the
  contracted AnchorMap YAML input profile. If a future requirement demands a
  broader third-party YAML 1.2.2 conformance claim beyond AnchorMap's tested
  profile boundaries, this ADR must be superseded or supported by an external
  conformance decision.

## Alternatives considered

### Option A - `yaml@2.8.3`

Pros:

- supports document-level APIs needed for single-document checks;
- reports duplicate keys with `uniqueKeys: true`;
- accepts already-decoded strings and has no external runtime dependencies;
- is compatible with the narrow AnchorMap YAML input profile when wrapped.

Cons:

- does not by itself prove every possible YAML 1.2.2 conformance edge;
- explicit non-1.2 directives must be rejected by project code;
- conversion APIs must not be called before parse errors are rejected.

### Option B - generic YAML parser plus emitter

Pros:

- could reduce the number of YAML-related dependencies if one library owned
  both read and write paths.

Cons:

- violates the separation selected by `ADR-0007` unless a superseding exact-byte
  renderer decision is made;
- output emitter defaults could drift from the canonical YAML write contract.

### Option C - project-owned YAML parser

Pros:

- could target only the narrow config and spec shapes AnchorMap consumes.

Cons:

- duplicate-key, scalar, collection, and directive behavior is easy to get
  subtly wrong;
- higher implementation and maintenance risk than a pinned parser with wrapper
  rejection rules.

## Consequences

Positive:

- YAML input parsing has a concrete exact dependency pin.
- Duplicate-key rejection is enforced before value conversion.
- YAML input parsing and canonical YAML output remain separate architectural
  decisions.

Negative:

- `config_io` and `spec_index` must inspect document count, errors, and
  directive/profile state before reading values.
- Fixture coverage must include the wrapper boundaries, not just successful
  YAML examples.

Risks:

- future dependency upgrades could change diagnostics or directive handling and
  must not occur without a superseding ADR and fixture proof.

## Contract impact

No.

This ADR records the implementation strategy for the existing YAML input
contract. It does not change `docs/contract.md`.

## Eval impact

No eval weakening is required.

Existing B-decodage, B-specs, B-config, Gate A, and Gate G coverage remains
binding. YAML profile fixtures should cover duplicate-key rejection,
multi-document rejection, and non-1.2 directive rejection.

## Design impact

`docs/design.md` should reference this ADR from:

- section 2.1 Stack and ADRs;
- section 5.2 `config_io`;
- section 5.3 `spec_index`;
- section 11 Dependances et reproductibilite.

## Rollback / supersession

This decision can be superseded if another pinned YAML input parser, or a
project-owned parser, is proved against the same YAML profile, duplicate-key,
single-document, directive, and source-specific classification boundaries.

## Links

- `docs/contract.md`
- `docs/design.md`
- `docs/evals.md`
- `docs/tasks.md`
- `docs/adr/0007-canonical-json-and-yaml-rendering.md`
- `spikes/parser-profile-report.md`
