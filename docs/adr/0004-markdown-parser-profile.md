# ADR-0004: Markdown parser profile

Status: Accepted
Date: 2026-04-24
Owner: AnchorMap maintainers

## Context

AnchorMap extracts anchors from Markdown specs under the normative
`MARKDOWN_PROFILE = CommonMark 0.30` contract. The implementation needs a
parser that can operate on text already decoded by `repo_fs.readUtf8StrictNoBom`
and expose enough AST information to implement the exact heading-text rules in
`docs/contract.md` section 8.1.

`S1` probed the Markdown parser boundary and found that `commonmark@0.30.0`
matches the CommonMark 0.30 package line and exposes the needed block and inline
node data. The probe also found one required wrapper constraint: Setext headings
and ATX headings are both exposed as `heading` nodes, so the wrapper must filter
ATX headings by inspecting the original source line.

Relevant constraints:

- `docs/contract.md` sections 1.1 and 8.1 require CommonMark 0.30 Markdown,
  UTF-8 strict decoding before parsing, ATX-only heading detection, and exact
  inline text normalization.
- `docs/design.md` sections 5.3 and 7.2 assign spec parsing and anchor
  extraction to `spec_index`.
- `docs/evals.md` sections 5.1 and 5.3 require Markdown profile and
  ATX-vs-Setext fixture coverage.
- `docs/operating-model.md` sections 8.6, 16, and 17 require ADR closure and
  exact dependency pins for structural parser dependencies.

## Decision

We will use `commonmark@0.30.0` as the Markdown input parser.

The `spec_index` wrapper must:

- pass only text already returned by `repo_fs.readUtf8StrictNoBom`;
- construct `new commonmark.Parser({ smart: false })`;
- walk `heading` nodes and accept only headings whose original source line,
  identified through source position, has an ATX opener of up to three leading
  spaces followed by `#`;
- ignore Setext headings even though the parser also exposes them as `heading`
  nodes;
- extract heading inline text by concatenating text literals, code literals,
  ASCII spaces for softbreaks and hardbreaks, recursive inline-container
  children, and empty strings for `html_inline`;
- trim ASCII spaces and collapse runs of ASCII tab, LF, CR, and space to one
  ASCII space before anchor-prefix matching.

## Alternatives considered

### Option A - `commonmark@0.30.0`

Pros:

- directly corresponds to the contracted CommonMark 0.30 profile;
- exposes source positions and the inline node kinds needed by the contract;
- accepts already-decoded strings and does not need filesystem access.

Cons:

- does not distinguish ATX and Setext headings in the AST node type;
- requires wrapper logic over source positions and original source lines.

### Option B - newer `commonmark` latest line

Pros:

- receives newer upstream changes.

Cons:

- no closer match to the frozen CommonMark 0.30 contract profile;
- would increase the surface for profile drift without solving the Setext
  filtering wrapper requirement.

### Option C - project-owned Markdown parser

Pros:

- could implement only the narrow ATX-heading subset AnchorMap needs.

Cons:

- would reimplement a normative grammar dependency without evidence that this
  is safer than a pinned CommonMark parser;
- higher maintenance risk for inline parsing edge cases.

## Consequences

Positive:

- Markdown parsing has a concrete exact dependency pin before spec-index
  implementation.
- The ATX-only contract remains project-owned in the wrapper instead of relying
  on an AST distinction the dependency does not provide.

Negative:

- `spec_index` must keep original source lines available while walking heading
  nodes.
- Tests must cover Setext rejection explicitly.

Risks:

- a future `commonmark` upgrade could change source-position or node traversal
  behavior and must not occur without a superseding ADR and fixture proof.

## Contract impact

No.

This ADR records an implementation choice for the existing CommonMark 0.30
contract. It does not change `docs/contract.md`.

## Eval impact

No eval weakening or fixture change is required.

Existing B-decodage and B-specs coverage remains binding. The implementation
must ensure `fx00i_profile_markdown_commonmark_boundary` and the Markdown
B-spec fixtures prove ATX extraction and Setext rejection.

## Design impact

`docs/design.md` should reference this ADR from:

- section 2.1 Stack and ADRs;
- section 5.3 `spec_index`;
- section 11 Dependances et reproductibilite.

## Rollback / supersession

This decision can be superseded if another parser or a project-owned parser is
proved against the same CommonMark 0.30 and ATX-only fixture boundaries, with an
exact dependency pin if applicable.

## Links

- `docs/contract.md`
- `docs/design.md`
- `docs/evals.md`
- `docs/tasks.md`
- `spikes/parser-profile-report.md`
