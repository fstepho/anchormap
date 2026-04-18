# ADR-0010: Source formatting and linting tool

Status: Accepted
Date: 2026-04-18
Owner: AnchorMap maintainers

## Context

AnchorMap needs an explicit project-owned decision for source formatting and linting before repository bootstrap grows beyond the current document-only state.

Relevant constraints:

- `docs/design.md` records stack and tooling decisions through ADR references;
- `docs/operating-model.md` requires an ADR for a structural dependency or tooling choice that is costly to reverse;
- `docs/evals.md` Gate G requires pinned, reproducible dependencies once they enter the repository;
- the current repository is still pre-implementation and must not gain implicit runtime or harness behavior from this decision alone;
- the user requested that Biome be chosen, but not put in place yet.

## Decision

We will use Biome as the project's source formatting and linting tool when repository bootstrap reaches the point where formatter/linter tooling is introduced.

This decision is documentation-only at this stage. It does not by itself:

- add `package.json`;
- add `package-lock.json`;
- add `biome.json` or `biome.jsonc`;
- add npm scripts, hooks, CI jobs, or editor integration;
- change product runtime behavior, CLI behavior, or fixture behavior.

Any future repository change that actually installs or configures Biome must keep the dependency pinned or locked and remain compatible with the reproducibility rules already defined by the project.

## Alternatives considered

### Option A — No formatter/linter decision yet

Pros:

- zero immediate repository churn;
- avoids choosing tooling before bootstrap starts.

Cons:

- leaves an avoidable stack gap unresolved;
- delays alignment on developer tooling conventions.

### Option B — ESLint plus Prettier

Pros:

- widely used split-tool setup;
- large ecosystem.

Cons:

- larger tooling surface;
- more overlap between tools;
- less aligned with the project's preference for narrow, explicit infrastructure.

## Consequences

Positive:

- the project now has a documented formatting/linting direction;
- later bootstrap work can reference an accepted decision instead of reopening the tool choice;
- the choice stays separate from product behavior and contract docs.

Negative:

- the repo still has no active formatter/linter until a later implementation step adds it;
- a future bootstrap patch will still need to decide exact version, config, scripts, and integration points.

Risks:

- if Biome later proves incompatible with a release or harness constraint, this ADR will need supersession;
- a future implementation patch could accidentally broaden scope if it mixes tool installation with unrelated product work.

## Contract impact

No.

This ADR does not change `docs/contract.md`. It selects a development-tooling direction only.

## Eval impact

No immediate eval change.

When Biome is actually introduced into the repository, the implementation must remain compatible with:

- `docs/evals.md` §4.6 Level F — Release reproducibility audit;
- `docs/evals.md` Gate G — Reproductibility de release.

## Design impact

`docs/design.md` should reference this ADR from the stack/tooling section.

No other design change is required until Biome is actually installed or configured.

## Rollback / supersession

This decision can be superseded by a later ADR if another formatting/linting approach is shown to be materially safer or simpler for the project's determinism and maintenance constraints.

## Links

- `docs/design.md`
- `docs/evals.md`
- `docs/operating-model.md`
- `docs/tasks.md`
