# ADR-0006: TypeScript parser and graph subset

Status: Accepted
Date: 2026-04-24
Owner: AnchorMap maintainers

## Context

AnchorMap builds a local product graph from `.ts` files. The product is new,
has no legacy user base, and does not need to emulate an older TypeScript
project fleet.

The useful invariant is not an old parser line. The useful invariant is an exact
parser dependency pin so parse acceptance, syntax diagnostics, and graph
extraction remain reproducible across installs and release candidates.

Relevant constraints:

- `docs/contract.md` section 1.1 defines `TS_PROFILE`.
- `docs/design.md` sections 5.4 and 7.4 assign TypeScript parsing and graph
  extraction to `ts_graph`.
- `docs/evals.md` requires parser-profile, JSX rejection, graph,
  parse-failure, and exact-version audit coverage.
- `docs/operating-model.md` sections 16 and 17 require exact dependency pins for
  structural parser dependencies.

## Decision

We will use `typescript@6.0.3` as the exact TypeScript parser dependency for
the v1.0 TypeScript parser profile.

The same exact TypeScript package is used by the project build and by the
runtime parser dependency. AnchorMap does not maintain separate "compiler
TypeScript" and "product parser TypeScript" versions.

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

## Alternatives considered

### Option A - `typescript@6.0.3`

Pros:

- already the project TypeScript version before product parsing was introduced;
- keeps build-time and runtime parser behavior aligned;
- exact package pin preserves reproducibility;
- avoids starting a new product on an obsolete parser line without a legacy
  compatibility reason.

Cons:

- future TypeScript upgrades remain contract-affecting and require fixtures and
  release audit proof.

### Option B - TypeScript 5.4 line

Pros:

- would be a conservative historical parser profile.

Cons:

- no current product, user, or legacy-fleet requirement justifies it;
- creates split TypeScript versions if the project build stays modern;
- rejects or diagnoses newer syntax according to an older parser line.

### Option C - floating latest TypeScript

Pros:

- lowest maintenance during dependency upgrades.

Cons:

- not reproducible enough for a contract-driven parser boundary;
- parse acceptance and syntax diagnostics could drift without an explicit
  contract change.

## Consequences

Positive:

- `ts_graph` has a concrete exact parser pin before graph implementation.
- The no-JSX and parse-diagnostic boundaries are enforceable with the compiler
  API.
- Build-time and runtime TypeScript versions stay aligned.
- The graph subset remains intentionally smaller than the full TypeScript module
  system.

Negative:

- Future TypeScript upgrades require an explicit ADR/contract update.
- `ts_graph` must explicitly traverse call expressions for recognized
  unsupported local edges.

Risks:

- If a fixture later exposes a TypeScript 6.0.3 parser behavior that is too
  permissive or too strict for AnchorMap, this ADR or the contract must be
  revisited before changing behavior.

## Contract impact

Yes.

`docs/contract.md` section 1.1 names `typescript@6.0.3` as the exact
`TS_PROFILE` parser API for v1.0.

## Eval impact

No eval weakening is required.

Existing B-decodage, B-graph, Gate A, and Gate G coverage remains binding.
`fx00k_profile_ts_5_4_boundary` remains a stable fixture ID, but its semantic
purpose is the pinned TypeScript parser boundary, not a TypeScript 5.4
compatibility promise. JSX rejection fixtures, parse-failure fixtures, and the
release reproducibility audit must assert the exact `typescript@6.0.3`
dependency selected here.

## Design impact

`docs/design.md` should reference this ADR from:

- section 2.1 Stack and ADRs;
- section 5.4 `ts_graph`;
- section 11 Dependances et reproductibilite.

## Rollback / supersession

This decision can be superseded if the product deliberately targets another
exact TypeScript parser profile.

## Links

- `docs/contract.md`
- `docs/design.md`
- `docs/evals.md`
- `docs/tasks.md`
- `spikes/parser-profile-report.md`
