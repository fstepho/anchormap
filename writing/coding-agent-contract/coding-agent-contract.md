# Your Coding Agent Doesn't Need Better Prompts. It Needs a Contract.

*How I structured a repo to make AI agent drift visible before it ships.*

---

The most dangerous failure mode I've seen in agentic coding workflows is not broken code. Broken code is at least visible.

The dangerous failure is plausible code: code that passes tests, implements something close to the request, and quietly expands the product surface in a direction nobody approved.

No bug. No crash. Just drift.

After a few months of fighting this, I stopped trying to write better prompts. The issue wasn't that the agent needed another instruction. The issue was that the repo didn't make authority clear enough. When behavior is implicit, agents fill gaps. The fix is not to ask them to stop doing that. The fix is to remove the gaps.

By "contract," I don't mean a legal document or a heavyweight framework. I mean a written, testable description of observable behavior: commands, outputs, exit codes, schemas, determinism rules, and the boundaries of what implementation is allowed to change. It is not the full design. It is the part external consumers can observe and rely on.

Prompts tell the agent how to behave. Contracts tell the repo how to reject behavior it did not authorize.

---

## What quiet drift actually looks like

I'm implementing a `scan --json` command. The spec says the output should have three keys:

```json
{
  "anchors": [],
  "mappings": [],
  "findings": []
}
```

I ask an agent to implement it. The agent implements it correctly, but also adds a `meta` key with runtime diagnostics, because it seemed useful for debugging. The agent's implicit reasoning is understandable: the spec doesn't forbid it, and it makes the output more informative.

The tests pass. All three expected keys are present and correct. No test checks for the absence of extra keys, because nobody thought to write that test. A permissive test like this would pass:

```ts
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

The diff looks clean. Code review approves it. The feature ships.

Three weeks later, a downstream consumer expecting the exact JSON schema starts rejecting responses because the schema has an unexpected field. Or worse: the `meta` key leaks internal path information somewhere it shouldn't.

The bug was not that the agent failed to implement the request. The bug was that the repo never made the boundary machine-checkable. A closed contract would have caught it:

```ts
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

With structure, `docs/contract.md` explicitly lists the output schema as closed: no extra keys allowed. `docs/evals.md` validates byte-for-byte against a golden. Before handoff, `npm run check:goldens` fails because the golden doesn't include `meta`. The drift is caught before it ships.

![Diagram comparing coding-agent drift with and without a contract. Without a contract, an extra meta field passes permissive tests and ships. With a closed schema and golden check, the same drift is caught before handoff.](./ChatGPT%20Image%20May%202%2C%202026%2C%2008_21_17%20PM.png)

*Permissive tests validate what they know to expect. A contract also rejects behavior nobody authorized.*

The difference is not just "more tests." It's a repo where tests are derived from an explicit behavioral contract, so the constraint is machine-checkable before the agent has a chance to be helpful in the wrong direction. This does not make drift impossible. It makes drift visible: either the contract changes explicitly, or the evals fail.

---

## The three principles

The workflow I built in [AnchorMap](https://github.com/fstepho/anchormap) runs on three principles, stated at the top of `AGENTS.md`:

> This repo is document-driven. The working mode is `contract-first`, `eval-driven`, `scope-closed`.

**Contract-first** means observable behavior is defined before implementation begins. `docs/contract.md` specifies commands, preconditions, outputs, exit codes, JSON schema, canonical key order, mutation guarantees, and determinism rules. If you want to add or change a behavior, you change the contract first. If an agent implements something that isn't in the contract, the workflow treats it as drift, not initiative.

**Eval-driven** means the contract is verified before implementation is considered done. `docs/evals.md` defines fixtures, goldens, and release gates derived directly from `docs/contract.md`. Successful JSON output is compared byte-for-byte. Failure cases require exact exit codes. Determinism is tested. Golden diffs are never accepted as noise. Any divergence is either classified as a defect or requires an explicit contract change first.

**Scope-closed** means agents cannot invent behavior. Not because they're trying to help. Not by inference. Not because something "seems right." Any observable behavior without traceability to `contract.md` and `evals.md` gets refused. This sounds restrictive. It is. That's the point.

---

## Copy this pattern: the minimal four-file bootstrap

You don't need the full AnchorMap workflow to get most of the benefit. This is the smallest version that works: the four files I wish someone had handed me at the start.

**`AGENTS.md`**: entry map only, not authority:
```markdown
# Agent Instructions

This repo is document-driven.
Working mode: contract-first, eval-driven, scope-closed.

## This file is an entry map. docs/ wins on conflict.

## Work intake

- Product implementation → identify a task in docs/tasks.md first.
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

**`docs/contract.md`**: observable behavior only, no implementation details:
```markdown
# Contract

## Commands

### scan

- Exit 0 on success.
- stdout: JSON object with exactly these keys: anchors, mappings, findings.
- No extra keys. Closed schema.
- Exit 1 on error, stdout empty, stderr single-line diagnostic.

## Determinism

- Identical input → identical output, byte-for-byte.
- No timestamps, PIDs, random IDs, or environment-derived values in output.
```

**`docs/evals.md`**: how the contract is verified:
```markdown
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

**`docs/tasks.md`**: execution plan with a live cursor:
```markdown
# Tasks

## Execution State

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

With these four files in place, an agent reading `AGENTS.md` knows immediately: find an explicit task first, read the contract before coding, don't add behavior that isn't in the contract, classify failures before fixing them. That's most of the anti-drift value with a fraction of the setup.

Documentation only helps agents when it is authoritative, scoped, and executable through evals. Otherwise it's just more context for the agent to reinterpret.

---

## The document hierarchy

Which documents are authoritative for what? In most repos, this is implicit. That is exactly why agents drift. In AnchorMap, authority is explicit and domain-scoped. Each document owns a specific class of questions:

- `docs/contract.md`: observable runtime behavior. If code contradicts it, the code is wrong.
- `docs/evals.md`: verification gates. If a release gate doesn't pass, the release isn't ready.
- `docs/brief.md`: product scope. It arbitrates what v1.0 is trying to prove.
- `docs/design.md`: compatible implementation design. It can change as long as the contract stays satisfied.
- `docs/operating-model.md`: production method, deviation taxonomy, review protocol, and done criteria.
- `docs/tasks.md`: execution plan and current task state.
- `docs/adr/`: locked technical decisions.

**`AGENTS.md` is explicitly demoted.** It's the entry map, not the authority. That sounds counterintuitive. Many agentic repos treat the instruction file as the highest authority. I don't. Durable product rules live in `docs/`. If `AGENTS.md` conflicts with anything in `docs/`, `docs/` wins, and the file says so.

The mistake is treating `AGENTS.md` as the constitution. I treat it as a signpost.

A repo that relies on a single instruction file gives an agent enough room to drift if it skims that file and stops there. In this setup, an agent that reads `AGENTS.md` only learns where to go next.

---

## The loop

For a product task, the loop has six moves.

**1. Identify an explicit task.** The agent can propose work, but it cannot start product implementation without a task ID in `docs/tasks.md`. This shuts down the "let me just do something useful while I'm here" pattern.

**2. Read within bounds, not as little as possible.** The agent reads the sections explicitly linked to the task, not the entire documentation tree. The goal is not to starve the agent of context. It is to prevent unrelated context from becoming accidental authority. Broader reading is allowed when a concrete failure demands it, or when the diff touches a critical surface like the parser, renderer, contract, or eval machinery.

**3. Declare before patching.** Before touching a file, the agent states the target task, binding references, smallest useful check, expected handoff checks, expected patch boundary, and explicit out-of-scope items. An agent that can't declare a clean patch boundary isn't ready to edit. This is the most effective anti-drift guardrail in the workflow. A real declaration looks like this:

```text
Task: T7.5: Assemble exact scan JSON output

Binding refs:
- contract.md §13.2 Exact success schema
- contract.md §§13.3–13.7 scan JSON sections and canonical serialization
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

**4. Implement only the traced surface.** Not the adjacent improvement it noticed. Not the cleanup that seems obvious. Not the extra diagnostic that might be useful. If something outside scope needs to change, it needs its own task.

**5. Classify failures before fixing them.** When something breaks, the instinct is to fix it immediately. The workflow requires naming the failure class first: `contract violation`, `spec ambiguity`, `design gap`, `eval defect`, `product question`, `tooling problem`, `out-of-scope discovery`. The label determines the correct action. Fixing before classifying is how you accidentally weaken a fixture, paper over a spec ambiguity, or turn an out-of-scope discovery into a silent product change.

**6. Submit a bounded diff to fresh review.** The review context is separate from the implementation context. Same-session review gives the model the intent, tradeoffs, and partial reasoning that produced the patch. That is exactly the context that makes it easier to rationalize the change instead of challenging it. The invariant isn't a specific tool. It's separation: review must inspect the diff from a clean context and issue a decision before rework begins.

---

## What gets stricter when the workflow scales

The four-file bootstrap is enough to start. AnchorMap goes further because the workflow also handles repeated implementation cycles, fixture diagnosis, task-plan maintenance, and bounded automation. Three constraints become important at that point.

**Review starts from a clean context.** In AnchorMap, that means native Codex review on the bounded diff, or a fresh interactive session where review is the first step. In another stack, the mechanism can differ. The rule is the same: the session that produced the patch doesn't approve the patch.

**Workflow tools don't count as review.** AnchorMap has local skills for implementation, fixture diagnosis, task updates, and task validation. They make specific paths repeatable and they can help produce work. They can't approve their own output.

**Autopilot is opt-in and bounded.** Automation can run the loop, but it can't blur the boundaries. Each implementation and review still runs in a task-scoped context. The coordinator retains task-level state, not an ever-growing transcript of implementation reasoning. Automation doesn't relax the contract. It makes the boundaries more important.

---

## When this is overkill

This is not how I would structure a weekend prototype or a throwaway script. For exploratory work, agents need room: to try things, follow weak signals, make useful jumps before the shape of the product is known.

The workflow starts paying for itself when the repo has observable behavior that other people or tools depend on: CLI output, public APIs, migration scripts, generated files, config formats, release gates, anything where "almost correct" can become a compatibility problem. The more stable the surface, the more expensive quiet drift becomes.

For product behavior that people depend on, agents need clear authority. A repo that tells an agent which document governs each class of decision, how failures must be classified, and what "done" means will produce more consistent, traceable, reviewable output. A repo that leaves those questions implicit invites drift.

For agent-written code, the workflow is not process overhead. It is part of the product.

---

*AnchorMap is a CLI tool for anchor-based dependency mapping in TypeScript repositories. The full workflow documentation lives in the [public repo](https://github.com/fstepho/anchormap) under `docs/`. A follow-up article will cover the fresh review protocol and bounded autopilot in detail.*
