# ADR-0006: TypeScript parser and graph subset

Status: Accepted
Date: 2026-04-24
Owner: AnchorMap maintainers

## Context

AnchorMap builds a local product graph from `.ts` files using the contracted
`TS_PROFILE = TypeScript 5.4.0 parser`, with `ScriptKind.TS`, module-oriented
import/export extraction, and no JSX. Every discovered `product_file` must parse
with zero syntax diagnostics before graph extraction can proceed.

`S1` probed the TypeScript 5.4 line and found:

- the npm registry did not provide a stable `typescript@5.4.0` package;
- stable 5.4-line packages observed were `5.4.2`, `5.4.3`, `5.4.4`, and
  `5.4.5`;
- `typescript@5.4.5` exposes the compiler API needed for `ScriptKind.TS`
  parsing, syntax diagnostics, import/export declarations, call-expression
  traversal, and string-literal module specifiers;
- JSX is rejected in `.ts` when parsed with `ScriptKind.TS`;
- `createSourceFile` does not expose a separate module-goal parser switch, so
  AnchorMap owns the graph extraction profile over TypeScript source files.

Relevant constraints:

- `docs/contract.md` sections 1.1, 10.1, 10.4, 10.5, and 12.3 require the
  TypeScript parser profile, supported import/export forms, recognized
  unsupported local `require` and dynamic `import`, parse-failure behavior, and
  bounded existence checks.
- `docs/design.md` sections 5.4 and 7.4 assign TypeScript parsing and graph
  extraction to `ts_graph`.
- `docs/evals.md` sections 5.1, 5.4, Gate A, and Gate G require TypeScript
  profile, JSX rejection, graph, parse-failure, and exact-version audit
  coverage.
- `docs/operating-model.md` sections 8.6, 16, and 17 require ADR closure and
  exact dependency pins for structural parser dependencies.

## Decision

We will use `typescript@5.4.5` as the exact TypeScript parser dependency for
the v1.0 TypeScript 5.4 parser profile.

The `ts_graph` wrapper must:

- pass only text already returned by `repo_fs.readUtf8StrictNoBom`;
- parse each `product_file` with
  `ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)`;
- never parse product files with `ScriptKind.TSX`;
- treat any non-empty `sourceFile.parseDiagnostics` as a parse failure;
- extract supported edges only from `ImportDeclaration` and
  `ExportDeclaration` nodes with relative string-literal module specifiers;
- explicitly traverse call expressions to recognize local `require("./x")` and
  `import("./x")` as `unsupported_static_edge`;
- ignore non-relative package specifiers;
- keep resolution, candidate ordering, and finding classification project-owned
  according to `docs/contract.md` section 10.2.

Compatibility reasoning for the TypeScript 5.4.0 gap:

- The contract phrase is `TS_PROFILE = TypeScript 5.4.0 parser`, not an npm
  package coordinate.
- `S1` found no stable npm package that can be pinned literally as
  `typescript@5.4.0`.
- The selected `typescript@5.4.5` package is an exact pin on the stable
  TypeScript 5.4 release line and is the newest stable 5.4-line parser observed
  by `S1`.
- The wrapper preserves the contracted profile boundaries that matter to
  AnchorMap: strict pre-decoding, `ScriptKind.TS`, no JSX, syntax-diagnostic
  failure, supported import/export declaration extraction, explicit
  unsupported local `require` and dynamic `import`, and project-owned
  resolution.
- Gate G must audit the exact `typescript@5.4.5` pin and fixtures must cover
  the TypeScript 5.4 boundary. No floating 5.4 range is allowed.

This ADR therefore treats `typescript@5.4.5` as the concrete available package
implementation of the contracted TypeScript 5.4 parser profile without changing
`docs/contract.md`. If maintainers require the contract to name the exact npm
package version instead of the TypeScript 5.4 parser profile, this ADR must be
superseded together with an explicit contract change.

## Alternatives considered

### Option A - `typescript@5.4.5`

Pros:

- exact stable package pin on the TypeScript 5.4 line;
- exposes the required compiler API;
- rejects JSX in `.ts` under `ScriptKind.TS`;
- keeps graph extraction and resolution behavior project-owned.

Cons:

- the package version is not literally `5.4.0`;
- module-goal behavior is represented by AnchorMap's extraction profile rather
  than a separate `createSourceFile` parser option.

### Option B - literal `typescript@5.4.0`

Pros:

- would exactly mirror the version number in `docs/contract.md` section 1.1 if
  it existed as a stable npm package.

Cons:

- `S1` found no stable npm package with this version;
- cannot be pinned in `package.json` and `package-lock.json` as a release input.

### Option C - newer TypeScript line

Pros:

- newer parser fixes and ecosystem alignment.

Cons:

- would no longer be a TypeScript 5.4 parser-profile implementation;
- higher risk of parse and diagnostic drift against v1.0 fixtures;
- requires a superseding contract and ADR decision.

## Consequences

Positive:

- `ts_graph` has a concrete exact parser pin before graph implementation.
- The no-JSX and parse-diagnostic boundaries are enforceable with the compiler
  API.
- The graph subset remains intentionally smaller than the full TypeScript
  module system.

Negative:

- The project must document and audit the `5.4.0` contract wording versus the
  `5.4.5` package pin.
- `ts_graph` must explicitly traverse call expressions for recognized
  unsupported local edges.

Risks:

- If a fixture later exposes a TypeScript 5.4 patch-level diagnostic difference
  that matters to the contract, the ADR or contract must be revisited before
  changing behavior.
- Future TypeScript upgrades are contract-affecting and require a superseding
  ADR plus fixture and Gate G proof.

## Contract impact

No.

This ADR records a concrete package implementation for the existing TypeScript
5.4 parser profile. It does not change `docs/contract.md`.

No hard stop remains for T0.1 as long as `TS_PROFILE` is interpreted as the
TypeScript 5.4 parser profile and not as a literal npm package coordinate. A
hard stop would remain only if maintainers require `docs/contract.md` to name
the exact npm package version; that would be a contract change outside this
task's scope.

## Eval impact

No eval weakening is required.

Existing B-decodage, B-graph, Gate A, and Gate G coverage remains binding.
`fx00k_profile_ts_5_4_boundary`, JSX rejection fixtures, parse-failure
fixtures, and the release reproducibility audit must assert the exact
`typescript@5.4.5` dependency selected here.

## Design impact

`docs/design.md` should reference this ADR from:

- section 2.1 Stack and ADRs;
- section 5.4 `ts_graph`;
- section 11 Dependances et reproductibilite.

## Rollback / supersession

This decision can be superseded if the contract changes to another exact
TypeScript parser profile or if another package version is proved safer while
preserving the same observable graph and parse-failure behavior.

## Links

- `docs/contract.md`
- `docs/design.md`
- `docs/evals.md`
- `docs/tasks.md`
- `spikes/parser-profile-report.md`
