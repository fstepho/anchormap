# S1 — Parser profile and duplicate-key compatibility report

## Scope

- Task: `S1 — Parser profile and duplicate-key compatibility report`
- Change type: `spike`
- Files changed: this report
- Production behavior changed: `None`

Supersession note:

- The original S1 TypeScript probe investigated the TypeScript 5.4 line because
  the contract named that profile at the time.
- `ADR-0006` now selects `typescript@6.0.3` as the exact product parser pin for
  the same wrapper boundary: `ScriptKind.TS`, module-oriented graph extraction,
  no JSX, and fatal syntax diagnostics.

This spike is bounded by:

- `contract.md` — §§1.1, 7, 8, 10.1, 10.5, 12.3
- `design.md` — §§5.2, 5.3, 5.4, 7.0, 11
- `evals.md` — §§5.1, 5.3, 5.4, Gate A, Gate G
- `operating-model.md` — §§16, 17, 19.1

## Question

Which concrete Markdown, YAML, and TypeScript parser setup satisfies the
normative profiles and duplicate-key requirements without implicit decoding or
unsupported behavior?

## Probe Protocol

Throwaway probes were run with:

- Node `v22.19.0`
- Host platform `darwin arm64`
- Throwaway install root: `/tmp`
- Network used only for npm metadata and throwaway package installation
- No repo `package.json`, lockfile, source, fixture, or production dependency
  changes

Probe dependencies:

- `commonmark@0.30.0`
- `yaml@2.8.3`
- `typescript@5.4.5` for the historical TypeScript 5.4 probe, superseded by
  `typescript@6.0.3` in `ADR-0006`

Metadata also observed:

- `commonmark@0.31.2` is the current npm `latest`, but `commonmark@0.30.0`
  exists and matches the contract's CommonMark 0.30 profile more directly.
- The npm `typescript` package had no stable `5.4.0` release. That gap is no
  longer active because the contract now names the exact package pin.

Probe cases:

1. Markdown ATX heading parsing, Setext heading parsing, inline text,
   code spans, HTML inline, and source positions.
2. YAML 1.2 parsing, root mappings, non-mapping roots, duplicate root keys,
   duplicate nested keys, multi-document streams, and explicit YAML version
   directives.
3. Pinned TypeScript parsing with `ScriptKind.TS`, supported import/export
   declarations, recognized-but-unsupported `require` and dynamic `import`,
   and JSX rejection in `.ts`.

No production parser behavior was introduced by this spike.

## Selected Dependencies

### Markdown

Selected dependency:

- `commonmark@0.30.0`

Reason:

- It is the exact package line corresponding to `MARKDOWN_PROFILE =
  CommonMark 0.30`.
- It exposes a parsed AST with `heading`, `text`, `code`, `softbreak`,
  `linebreak`, inline container, and `html_inline` nodes.
- It accepts already-decoded strings and does not need filesystem access.

Observed behavior:

- ATX headings parse as `heading` nodes with `level` and source position.
- Setext headings also parse as `heading` nodes.
- The node shape does not expose whether a heading originated from ATX or
  Setext syntax.
- `text` and `code` inline nodes expose literal text.
- `softbreak` and `linebreak` are distinguishable node types and can be
  converted to a single ASCII space by the wrapper.
- Inline container nodes can be traversed recursively.
- HTML inline tag nodes are exposed as `html_inline`; literal text between
  tags remains ordinary text, so only the HTML nodes themselves should
  contribute an empty string.
- Source positions are available for block nodes.

Required wrapper behavior:

1. Construct `new commonmark.Parser({ smart: false })`.
2. Pass only text already returned by `repo_fs.readUtf8StrictNoBom`.
3. Walk `heading` nodes and reject Setext headings by checking the original
   source line at `sourcepos[0]` for an ATX opener: up to three spaces followed
   by `#`.
4. Extract inline text exactly as `contract.md` §8.1 defines:
   - text literal for `text`;
   - code literal for `code`;
   - ASCII space for `softbreak` and `linebreak`;
   - recursive child concatenation for inline containers;
   - empty string for `html_inline`.
5. Trim ASCII spaces and collapse runs of ASCII tab, LF, CR, and space to one
   ASCII space before anchor-prefix matching.

Result:

- Compatible with wrapper constraints.

### YAML

Selected dependency:

- `yaml@2.8.3`

Reason:

- It supports YAML 1.2 parsing, document APIs, AST inspection, parse errors,
  and duplicate-key diagnostics.
- It has no external runtime dependencies.
- It accepts already-decoded strings and does not need filesystem access.

Observed behavior:

- `YAML.parseAllDocuments(input, { version: "1.2", uniqueKeys: true })`
  returns document objects with `errors` and `warnings`.
- Duplicate keys are reported as `DUPLICATE_KEY` errors, including nested
  duplicate keys.
- If a document with duplicate keys is converted with `toJSON()` anyway, the
  later key wins. The wrapper must therefore reject any `doc.errors` before
  reading values.
- Multi-document input returns more than one document and must be rejected by
  the wrapper.
- YAML 1.2 booleans behave as expected for the relevant boundary: `yes`
  remains a string while `true` is a boolean.
- An explicit `%YAML 1.1` directive changed behavior in the probe: `yes: yes`
  became `{ true: true }` even when the parser option set `version: "1.2"`.

Required wrapper behavior:

1. Parse with `parseAllDocuments(text, { version: "1.2", uniqueKeys: true })`.
2. Pass only text already returned by `repo_fs.readUtf8StrictNoBom`.
3. Reject if the returned document count is not exactly one.
4. Reject if `doc.errors.length > 0`; do this before converting or reading
   values.
5. Reject explicit YAML directives that select a non-1.2 version.
6. For `anchormap.yaml`, require a root mapping before schema validation and
   classify all parse/profile/schema failures as `ConfigError`.
7. For spec YAML, require valid single-document YAML without duplicate keys;
   only root mappings with a scalar `id` value can produce an anchor.
8. Use this dependency only for input parsing. It is not the canonical YAML
   writer; `ADR-0007` keeps writes on the custom closed-shape renderer path.

Result:

- Compatible with wrapper constraints for YAML 1.2 input and duplicate-key
  rejection.
- The dependency does not prove exact YAML 1.2.2 wording by itself; the ADR
  closure should record the project profile as YAML 1.2-compatible parsing
  with explicit rejection of non-1.2 directives.

### TypeScript

Selected dependency:

- `typescript@6.0.3`

Reason:

- It is the project TypeScript version selected by `ADR-0006`.
- It keeps build-time TypeScript and runtime parser TypeScript aligned.
- It exposes the compiler API needed for `ScriptKind.TS` parsing,
  `parseDiagnostics`, import/export declarations, call expressions, string
  literal specifiers, and source traversal.

Observed behavior:

- `ts.version` reports `6.0.3`.
- `ts.createSourceFile("x.ts", text, ts.ScriptTarget.Latest, true,
  ts.ScriptKind.TS)` parses supported forms with zero syntax diagnostics:
  - `import type { A } from "./a"`
  - `import "./side"`
  - `export * from "../b"`
  - `export type { C } from "./c"`
- Supported `ImportDeclaration` and `ExportDeclaration` nodes expose
  `moduleSpecifier.text` for string-literal specifiers.
- `require("./x")` and `import("./y")` parse without syntax diagnostics as
  expressions inside statements; they are not import/export declarations and
  must be recognized by explicit traversal.
- JSX in `ScriptKind.TS` produced syntax diagnostics, while the same text in
  `ScriptKind.TSX` produced none. This supports the required no-JSX profile
  when `.ts` files are parsed as `ScriptKind.TS`.
- The compiler API does not expose a separate `module goal` switch on
  `createSourceFile`; import/export syntax is parsed in the source file and the
  wrapper owns the graph extraction profile.

Required wrapper behavior:

1. Pin the TypeScript parser dependency exactly.
2. Pass only text already returned by `repo_fs.readUtf8StrictNoBom`.
3. Parse every `product_file` with `ScriptKind.TS`, not `TSX`.
4. Treat any non-empty `sourceFile.parseDiagnostics` as a parse failure for
   `contract.md` §10.5.
5. Extract only `ImportDeclaration` and `ExportDeclaration` with relative
   string-literal module specifiers as supported edges.
6. Separately traverse call expressions to recognize local
   `require("./x")` and `import("./x")` as `unsupported_static_edge`.
7. Ignore non-relative package specifiers.

Result:

- Compatible with the required TypeScript parser behavior under the exact
  product parser pin selected by `ADR-0006`.

## Must-Answer Summary

### Can the Markdown parser expose ATX headings and inline text sufficiently for `contract.md` §8.1?

Yes, with wrapper filtering.

`commonmark@0.30.0` exposes headings and all needed inline nodes, but it does
not distinguish ATX from Setext headings in the AST. The wrapper must use
source positions plus the original source line to admit only ATX headings.

### Can the YAML parser enforce YAML 1.2.2-compatible parsing, single-document input, and duplicate-key rejection for config and spec YAML?

Yes, with wrapper rejection rules.

`yaml@2.8.3` can parse in a YAML 1.2 mode and reports duplicate keys as errors
when `uniqueKeys: true` is set. The wrapper must reject any parse errors,
reject multi-document streams by document count, reject non-1.2 directives, and
validate the root shape before schema or anchor extraction.

The dependency should be recorded as YAML 1.2-compatible input parsing rather
than proof of exact YAML 1.2.2 conformance unless the ADR closure adds a
stronger external conformance citation.

### Can the pinned TypeScript parser run with `ScriptKind.TS`, module goal, and no JSX?

Yes.

`typescript@6.0.3` runs with `ScriptKind.TS`, exposes the needed AST, and
rejects JSX in `.ts` through parse diagnostics.

The wrapper can satisfy the no-JSX and syntax-diagnostic requirements with
`ScriptKind.TS`. The `module goal` requirement should be recorded in the ADR as
the graph extraction profile over a TypeScript source file, because
`createSourceFile` does not provide a separate module-goal parser option.

### Which versions must be pinned or locked?

Recommended exact pins for the parser ADR closure:

- `commonmark`: `0.30.0`
- `yaml`: `2.8.3`
- `typescript`: `6.0.3`

## Result

Partial yes.

- Markdown: compatible with `commonmark@0.30.0` plus an ATX-source-line
  wrapper.
- YAML: compatible with `yaml@2.8.3` plus single-document, parse-error,
  duplicate-key, root-shape, and non-1.2-directive rejection.
- TypeScript: compatible with `typescript@6.0.3` as the exact product parser
  pin selected by `ADR-0006`.

## Decision

Adopt the following parser profile decisions for ADR closure:

1. Use `commonmark@0.30.0` for Markdown input parsing.
2. Use `yaml@2.8.3` for YAML input parsing only.
3. Use a custom closed-shape YAML writer for output, as already decided by
   `ADR-0007`; do not use `yaml` as the `anchormap.yaml` writer.
4. Use `typescript@6.0.3` as the exact TypeScript parser pin.
5. Keep all parser dependencies as exact pins and require `package-lock.json`
   consistency for Gate G.

## Consequences

### Contract

- `contract.md` §1.1 now names `typescript@6.0.3` as the exact `TS_PROFILE`
  parser API.
- No Markdown or YAML contract relaxation is required by this spike.

### Design

- `spec_index` must wrap `commonmark` to filter Setext headings by source line;
  AST heading type alone is insufficient.
- `config_io` and `spec_index` must inspect YAML document errors and document
  count before converting values.
- `config_io` and `spec_index` must reject explicit non-1.2 YAML directives.
- `ts_graph` must use the TypeScript compiler API directly over already
  decoded text and treat parse diagnostics as fatal.
- `ts_graph` must explicitly traverse call expressions for `require` and
  dynamic `import`; they are not discovered through import/export declaration
  extraction.

### Evals

- Existing B-decodage, B-specs, B-graph, Gate A, and Gate G coverage remains
  relevant.
- `fx00i_profile_markdown_commonmark_boundary` and B-spec Markdown fixtures
  should include an ATX-vs-Setext boundary that proves the wrapper filters
  Setext despite the parser producing `heading` nodes for both.
- `fx00j_profile_yaml_1_2_2_boundary` should include a non-1.2 directive or
  equivalent profile boundary so wrapper rejection is covered.
- `fx00k_profile_ts_5_4_boundary` remains a stable fixture ID, but the fixture
  or Gate G audit should assert the exact `typescript@6.0.3` parser version.

### Tasks

- `T0.1` must record parser ADRs before parser-dependent implementation
  proceeds.
- `T4.1`, `T5.2`, `T5.3`, `T6.2`, and `T9.5` remain blocked until the parser
  ADR closure is accepted.
- The task-scoped review diff includes the coordinator-maintained
  `docs/tasks.md` execution cursor transition for active task `S1`; this spike
  report does not introduce any additional task-plan or product-scope change.

### ADR

- Required closure remains: `T0.1 — Record parser profile ADRs from S1`.
- ADRs should record exact pins, wrapper constraints, rejected alternatives,
  and the separation between YAML input parsing and canonical YAML output
  rendering.
