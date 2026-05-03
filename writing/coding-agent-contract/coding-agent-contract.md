# Your Coding Agent Doesn't Need Better Prompts. It Needs a Contract.

Stopping silent drift with testable boundaries

*How I structured a repo so AI agent drift fails before it ships.*

---

The worst failure mode I see in agentic coding is not broken code. Broken code usually announces itself.

The one that hurts is plausible code: code that passes tests, implements something close to the request, and expands the product surface in a direction nobody approved.

After a few months of fighting that pattern, I stopped trying to tune prompts. The agent did not need one more instruction. The repo needed clearer authority. When behavior is implicit, agents guess. Asking them not to guess is not enough. The repo has to remove the room for guessing.

By "contract," I mean a written, testable description of observable behavior: commands, outputs, exit codes, schemas, determinism rules, and the boundaries of what implementation may change. It is not the whole design. It is the part external consumers can observe and depend on.

A prompt asks the agent to behave. A contract gives the repo a way to reject behavior it never approved.

---

## What quiet drift looks like

I am implementing a `scan --json` command. The spec lists three output keys:

```json
{
  "anchors": [],
  "mappings": [],
  "findings": []
}
```

I ask an agent to implement it. The agent does that, then adds a `meta` key with runtime diagnostics because it looks useful for debugging. The reasoning is understandable. The spec does not forbid it, and diagnostics make the output more informative.

The tests pass. All three expected keys are present and correct. No test checks for extra keys because nobody thought to write that test. A permissive test like this would pass:

```js
expect(result.anchors).toEqual([]);
expect(result.mappings).toEqual([]);
expect(result.findings).toEqual([]);
```

Even if the actual output was:

```json
{
  "anchors": [],
  "mappings": [],
  "findings": [],
  "meta": {
    "cwd": "/Users/me/project",
    "durationMs": 42
  }
}
```

The diff looks clean. Review approves it. It ships.

Three weeks later, a downstream consumer expecting the exact JSON schema starts rejecting responses because the schema has an unexpected field. Or worse, the `meta` key leaks internal path information somewhere it should not.

The agent did what it was asked to do. The repo was the weak point: the boundary existed only in prose, so nothing could enforce it. A closed contract would have caught it:

```js
expect(Object.keys(result)).toEqual([
  "anchors",
  "mappings",
  "findings"
]);
```

Or with JSON Schema:

```json
{
  "type": "object",
  "required": ["anchors", "mappings", "findings"],
  "properties": {
    "anchors": { "type": "array" },
    "mappings": { "type": "array" },
    "findings": { "type": "array" }
  },
  "additionalProperties": false
}
```

In the version I use, `docs/contract.md` says the output schema is closed: no extra keys. `docs/evals.md` validates the JSON byte-for-byte against a golden. Before handoff, `npm run check:goldens` fails because the golden does not include `meta`. The drift is caught before it ships.

![Diagram comparing coding-agent drift with and without a contract. Without a contract, an extra meta field passes permissive tests and ships. With a closed schema and golden check, the same drift is caught before handoff.](./ChatGPT%20Image%20May%202%2C%202026%2C%2008_21_17%20PM.png)

Permissive tests validate what they know to expect. A contract also rejects behavior nobody authorized.

The useful part is the derivation: tests come from an explicit behavioral contract, so the constraint is machine-checkable before the agent can be helpful in the wrong direction. Drift can still happen. It just has to show itself: update the contract, or fail the evals.

---

## The operating rules

The workflow I built in [AnchorMap](https://github.com/fstepho/anchormap) uses three rules, stated at the top of `AGENTS.md`:

> This repo is document-driven. The working mode is `contract-first`, `eval-driven`, `scope-closed`.

**Contract-first** means observable behavior is defined before implementation starts. `docs/contract.md` specifies commands, preconditions, outputs, exit codes, JSON schema, canonical key order, mutation guarantees, and determinism rules. To add or change behavior, change the contract first. If an agent implements behavior that is not in the contract, the workflow treats it as drift.

**Eval-driven** means the contract is verified before implementation is done. `docs/evals.md` defines fixtures, goldens, and release gates derived from `docs/contract.md`. Successful JSON output is compared byte-for-byte. Failure cases require exact exit codes. Determinism is tested. Golden diffs are not accepted as noise. Any divergence is either a defect or a contract change.

**Scope-closed** means agents cannot invent behavior, even when the addition looks harmless or useful. Any observable behavior with no trace back to `contract.md` and `evals.md` gets refused. It is restrictive. That is intentional.

---

## The four-file bootstrap

You do not need the full AnchorMap workflow to get most of the value. This is the smallest version I would copy into a new repo.

`AGENTS.md`: entry map only, not authority.

```md
# Agent instructions

This repo is document-driven.
Working mode: contract-first, eval-driven, scope-closed.

## This file is an entry map. docs/ wins on conflict.

## Work intake

- Product implementation: identify a task in docs/tasks.md first.
- No task ID, no implementation.

## Authority

- docs/contract.md: observable behavior
- docs/evals.md: verification gates
- docs/tasks.md: execution plan and current task state

## Never

- Modify docs/contract.md without explicit instruction.
- Add observable behavior without traceability to docs/contract.md.
- Auto-pick a task or auto-commit unless explicitly asked.
- Fix a failing test before classifying the failure.
```

`docs/contract.md`: observable behavior only, no implementation details.

```md
# Contract

## Commands

### scan

- Exit 0 on success.
- stdout: JSON object with exactly these keys: anchors, mappings, findings.
- No extra keys. Closed schema.
- Exit 1 on error, stdout empty, stderr single-line diagnostic.

## Determinism

- Identical input -> identical output, byte-for-byte.
- No timestamps, PIDs, random IDs, or environment-derived values in output.
```

`docs/evals.md`: how the contract is verified.

```md
# Evals

## Principles

- Contract-first: oracles test observable outputs only.
- Closed objects: goldens validate absence of extra keys.
- No golden drift: any difference is a defect or an explicit contract change.

## Fixtures

- fx01_scan_clean: empty repo, expect exit 0,
  golden: {"anchors":[],"mappings":[],"findings":[]}
- fx02_scan_error: missing config, expect exit 1, stdout empty

## Release gates

- Gate A: all fixtures pass
- Gate B: goldens match byte-for-byte
```

`docs/tasks.md`: execution plan with a live cursor.

```md
# Tasks

## Execution state

- Current active task: None
- Last completed task: None
- Blocked tasks: None
- Open deviations: None

## M1: Core scan command

### T1.1: Implement scan exit codes and JSON schema

Contract refs: contract.md §Commands/scan
Eval refs: evals.md fx01, fx02, Gate A, Gate B
Done when: fx01 and fx02 pass, goldens match, no extra keys in output.
```

With these four files in place, an agent reading `AGENTS.md` knows what to do next: find an explicit task, read the contract before coding, avoid behavior that is not in the contract, and classify failures before fixing them.

Documentation only helps agents if it has authority and if evals can enforce it. Otherwise it is just more context for the agent to reinterpret.

---

## The document hierarchy

Which document answers which question? In many repos, nobody writes that down. That is where agents drift. In AnchorMap, authority is explicit and scoped by domain:

- `docs/contract.md`: observable runtime behavior. If code contradicts it, the code is wrong.
- `docs/evals.md`: verification gates. If a release gate does not pass, the release is not ready.
- `docs/brief.md`: product scope. It arbitrates what v1.0 is trying to prove.
- `docs/design.md`: compatible implementation design. It can change as long as the contract stays satisfied.
- `docs/operating-model.md`: production method, deviation taxonomy, review protocol, and done criteria.
- `docs/tasks.md`: execution plan and current task state.
- `docs/adr/`: locked technical decisions.

`AGENTS.md` is demoted on purpose. It is the entry map, not the source of truth. Many agentic repos treat the instruction file as the highest authority. I do not. Durable product rules live in `docs/`. If `AGENTS.md` conflicts with anything in `docs/`, `docs/` wins, and the file says so.

The mistake is treating `AGENTS.md` as the constitution. I treat it as a signpost.

A repo that relies on one instruction file gives an agent room to drift if it skims the file and stops there. In this setup, `AGENTS.md` only tells the agent where to go next.

---

## The loop

For a product task, I use this loop.

**1. Identify an explicit task.**

   The agent can propose work, but it cannot start product implementation without a task ID in `docs/tasks.md`. This shuts down the "let me just do something useful while I am here" pattern.

**2. Read within bounds.**

   The agent reads the sections explicitly linked to the task, not the entire documentation tree. The goal is not to starve the agent of context. The goal is to stop unrelated context from becoming accidental authority.

   Broader reading is allowed when a concrete failure demands it, or when the diff touches a critical surface like the parser, renderer, contract, or eval machinery.

**3. Declare before patching.**

   Before touching a file, the agent states the target task, binding references, smallest useful check, expected handoff checks, expected patch boundary, and explicit out-of-scope items.

   An agent that cannot declare a clean patch boundary is not ready to edit. A real declaration looks like this:

```text
Task: T7.5: Assemble exact scan JSON output

Binding refs:
- contract.md §13.2 Exact success schema
- contract.md §§13.3-13.7 scan JSON sections and canonical serialization
- evals.md §6.1 Mandatory JSON goldens
- evals.md fx01, fx02, fx09, fx10
- evals.md Gate B

Patch boundary:
- scan result projection
- JSON output assembly
- renderer integration for scan success
- focused scan JSON tests or goldens required by the task

Smallest check:
- run fx10_scan_closed_objects before broadening beyond schema assembly

Handoff checks:
- run B-scan success fixtures
- run JSON golden checks for the touched fixtures

Out of scope:
- human scan output
- semantic JSON comparison
- new JSON keys outside the contract
- diagnostics metadata
- changing scan semantics
```

That declaration changes the interaction. The agent is no longer free-floating in the repo. It has a task, sources of authority, a bounded patch surface, and known refusal conditions.

**4. Implement only the traced surface.**

   The patch covers only the surface tied to the task. Adjacent improvements, obvious cleanups, and useful diagnostics wait for their own task.

**5. Classify failures before fixing them.**

   When something breaks, the instinct is to fix it immediately. The workflow requires naming the failure class first: `contract violation`, `spec ambiguity`, `design gap`, `eval defect`, `product question`, `tooling problem`, or `out-of-scope discovery`.

   The label determines the correct action. Fixing before classifying is how you accidentally weaken a fixture, paper over a spec ambiguity, or turn an out-of-scope discovery into a silent product change.

**6. Submit a bounded diff to fresh review.**

   The review context is separate from the implementation context. If the same session reviews its own patch, it carries the intent, tradeoffs, and partial reasoning that produced the patch. That context makes rationalization easier.

   The rule is separation: review inspects the diff from a clean context and issues a decision before rework begins.

---

## What gets stricter at scale

The four-file bootstrap is enough to start. AnchorMap goes further because the workflow has to handle repeated implementation cycles, fixture diagnosis, task-plan maintenance, and bounded automation. At that point, I tighten these parts.

Review starts from a clean context. In AnchorMap, that means native Codex review on the bounded diff, or a fresh interactive session where review is the first step. In another stack, the mechanism can differ. The rule stays the same: the session that produced the patch does not approve the patch.

Workflow tools do not count as review. AnchorMap has local skills for implementation, fixture diagnosis, task updates, and task validation. They make specific paths repeatable and help produce work, but they cannot approve their own output.

Autopilot is opt-in and bounded. Automation can run the loop, but it cannot blur the boundaries. Each implementation and review still runs in a task-scoped context. The coordinator retains task-level state, not an ever-growing transcript of implementation reasoning. Automation does not relax the contract. It makes the boundaries more important.

---

## When this is overkill

This is not how I structure a weekend prototype or a throwaway script. Exploratory work needs room. Agents need to try things, follow weak signals, and make useful jumps before the product shape is known.

The workflow starts paying for itself when the repo has observable behavior that other people or tools depend on: CLI output, public APIs, migration scripts, generated files, config formats, release gates, or any surface where "almost correct" can become a compatibility problem. The more stable the surface, the more expensive quiet drift becomes.

If people or tools depend on a behavior, agents need explicit authority. The repo should say which document governs each class of decision, how failures are classified, and what "done" means. Leave those implicit and drift will find the gap.

Once agents write product code, this workflow becomes product infrastructure.

---

AnchorMap is a CLI tool for anchor-based dependency mapping in TypeScript repositories. The full workflow documentation lives in the [public repo](https://github.com/fstepho/anchormap) under `docs/`. A follow-up article will cover the fresh review protocol and bounded autopilot in detail.
