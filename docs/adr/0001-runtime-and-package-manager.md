# ADR-0001: Runtime and package manager

Status: Accepted
Date: 2026-04-18
Owner: AnchorMap maintainers

## Context

AnchorMap CLI needs a stable implementation baseline before `M1`. The project is local-only, deterministic, filesystem-heavy, and contract-driven. The first implementation milestone is the fixture harness, so the chosen stack must keep process execution, filesystem access, and test orchestration explicit.

Relevant constraints:

- `docs/brief.md` keeps the product local, deterministic, and narrow.
- `docs/design.md` requires pinned contract-affecting dependencies and no runtime dependence on network, Git, clock, cache, or environment.
- `docs/evals.md` Gate G requires pinned dependencies, a committed lockfile, and reproducible release inputs.
- `docs/tasks.md` starts with the fixture harness and therefore benefits from a low-magic runtime and test substrate.

This ADR chooses the baseline runtime and package-management stack only. Parser-library selection remains deferred to parser-specific ADRs and spike `S1`.

## Decision

We will implement AnchorMap CLI with:

- Node.js as the runtime, with Node.js `22.x` as the minimum supported major line for v1.0;
- TypeScript as the implementation language;
- `tsc` as the default build step from `src/` to compiled JavaScript in `dist/`;
- CommonJS as the default module system for the compiled CLI entrypoint;
- `npm` as the package manager;
- a committed `package-lock.json` as the normative lockfile for reproducible installs and release audits;
- no direct TypeScript execution in the published product path;
- no bundler as a default requirement for the v1.0 build.

## Alternatives considered

### Option A — Bun or Deno runtime

Pros:

- modern built-in tooling and faster startup in some cases;
- fewer external tools in simple setups.

Cons:

- weaker alignment with the existing Node-oriented ecosystem expected for TypeScript parsing and packaging;
- higher risk of subtle incompatibilities in filesystem, process, or package-management behavior;
- unnecessary platform-risk increase for a contract-first local CLI.

### Option B — `pnpm` as package manager

Pros:

- efficient installs and disk usage;
- strong workspace ergonomics.

Cons:

- adds a package-manager choice that is not required by the mono-package scope;
- introduces extra operational surface for reproducibility and onboarding;
- does not materially improve the v1.0 contract path over `npm`.

### Option C — ESM-first runtime path

Pros:

- aligns with modern JavaScript defaults;
- works well for some contemporary libraries.

Cons:

- more friction around CLI entrypoints, test execution, and tooling interop for a small contract-driven binary;
- higher risk of module-boundary incidental complexity before product behavior is implemented.

## Consequences

Positive:

- minimal runtime surface for process execution, filesystem access, and cross-platform scripting;
- straightforward lockfile story for release Gate G;
- predictable compile-then-run model for the published CLI;
- lower structural dependency count before parser and write-path decisions are finalized.

Negative:

- explicit build step required before running the compiled CLI;
- less convenience than ESM-first or bundler-first setups for some local workflows;
- `npm` workspaces and advanced package-manager features remain intentionally out of scope.

Risks:

- if a later parser or packaging need strongly favors ESM or bundling, this ADR may need supersession;
- the minimum Node line must remain consistent with the release pipeline once `package.json` is introduced.

## Contract impact

No.

This ADR does not change `docs/contract.md`. It constrains implementation and release inputs, not observable behavior.

## Eval impact

Yes.

Required implications:

- release Gate G audit must validate `package-lock.json` and pinned contract-affecting dependencies under the chosen `npm` flow;
- harness and release scripts should assume a compile-then-run product path instead of direct TypeScript execution.

No change to `docs/evals.md` is introduced by this ADR alone.

## Design impact

`docs/design.md` must reference this ADR in the technology-stack section and remain compatible with a Node.js CLI organized around compiled TypeScript modules.

## Rollback / supersession

This decision can be superseded by a later ADR if packaging, parser compatibility, or release reproducibility prove that another runtime, module system, or package manager is materially safer.

## Links

- `docs/brief.md`
- `docs/contract.md`
- `docs/design.md`
- `docs/evals.md`
- `docs/tasks.md`
