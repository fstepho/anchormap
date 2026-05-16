# AnchorMap Marketing Dossier

## Purpose

This folder is the operating dossier for AnchorMap's 4-week non-intrusive
distribution validation.

The objective is to get 3-5 qualified technical interactions, not attention
metrics. A qualified interaction is an issue comment, concrete question,
technical objection, CLI trial, Action trial, or maintainer feedback about fit
for a real TypeScript repository.

## Source Of Truth

- Primary marketing context: `.agents/product-marketing.md`.
- Runtime/product authority remains under `docs/`, especially `docs/contract.md`
  and `docs/evals.md`.
- This dossier must not invent traction, users, testimonials, customers,
  commercial commitments, or metrics.
- This dossier must not introduce claims beyond the public product proof already
  captured in `.agents/product-marketing.md`.

## Canonical Message

AnchorMap flags docs-to-code drift in TypeScript PRs before merge.

Support line:

Runs locally as a CLI or GitHub Action. You define the mappings; AnchorMap
reports unmapped anchors, stale mappings, and degraded analysis without
uploading source.

## Funnel

1. Read one public h3 demo PR.
2. Leave a concrete reaction in the GitHub feedback issue.
3. Try the CLI on one bounded TypeScript slice.
4. Try the GitHub Action preview if the report looks useful.

## Distribution Rules

Allowed:

- GitHub README, docs, issues.
- Dev.to technical article.
- HN Show when the demo story is crisp.
- Reddit only where there is real prior participation and the post is
  community-appropriate.
- Lobsters only for a deeply technical post.
- X and LinkedIn as sober technical notes.

Not allowed:

- Cold outreach, cold DM, or cold email.
- Wild tagging, community spam, hype threads, aggressive personal branding, or
  fake storytelling.
- Enterprise, compliance, proof-of-correctness, or customer claims.
- Vanity-metric framing.

## LinkedIn/X Launch Notes

For first-reaction launch posts, lead with the validation question, not the
product tagline.

Use Dev.to as the durable explainer, but make LinkedIn/X point to the clean h3
demo PR first. The requested reader action is to inspect the report and name one
concrete blocker or objection.

The `social` skill may improve readability, post shape, and character fit. It
must not override this dossier's validation posture.

## Weekly Operating Loop

Time budget: 2-3 hours per week.

1. Improve or publish one durable asset.
2. Distribute it once or twice in acceptable public channels.
3. Ask for one concrete action only.
4. Log every post and every qualified signal in `tracker.md`.
5. Reply to concrete technical questions; do not chase silent readers.
6. At week end, record whether the next asset should stay on plan, clarify the
   message, or reduce friction in the funnel.

## User-Facing Copy Gate

Use this gate before handing off any public article, README pitch,
landing-style section, issue prompt, or social post body.

Skill sequence:

1. `content-strategy` may define the brief, angle, audience, structure, proof
   points, channel, and publication checklist.
2. `copywriting` is required before producing a new reader-facing article,
   README pitch, landing-style section, or social post body.
3. `copy-editing` is required after a reader-facing draft exists and before
   handoff.
4. `social` is required when LinkedIn/X copy is actually drafted, not merely
   listed as a follow-up channel.

File separation:

- `*-article.md`: publishable reader-facing article only.
- `*-post.md`: publishable reader-facing social post only.
- `*-notes.md`: internal brief, skill notes, publication checklist, tracker
  notes, distribution plan references, and operating reminders.

Do not paste or publish from a notes file. Do not mix public copy with internal
planning material in the same file.

Reader-facing copy must not contain internal marketing or planning vocabulary
such as `CTA`, `funnel`, `conversion`, `campaign`, `qualified signal`,
`tracker`, `distribution plan`, `asset`, or `publication checklist`. Express
the requested reader action in plain language.

Before handoff, run:

```sh
scripts/check-marketing-copy.sh <publishable-copy-file>
```

If the check flags risky terms such as `proof`, `compliance`, `users`,
`customers`, `metrics`, `enterprise`, or `AI inference`, leave them only when
they are explicit disclaimers or bounded public proof already present in
`.agents/product-marketing.md`.

## Handoff Checklist

Before ending any turn that changes a marketing asset, publishes something,
updates GitHub state, commits, pushes, or records a signal:

- update `tracker.md` in the same turn;
- update `distribution-plan-4w.md` when an asset moves from missing to done, a
  week changes status, or the next planned move changes;
- record published URLs, issue numbers, and commit SHAs when they exist;
- record `0` qualified interactions explicitly when no signal has arrived;
- keep the weekly decision current: `Continue plan`, `Clarify message`,
  `Improve funnel asset`, `Answer recurring objection`, `Pause distribution`,
  or `Pivot channel`;
- do not call a week complete if the tracker and plan disagree with the work
  just performed.

## Documentation Drift Control

Before handing off any marketing, preview, demo, feedback, launch, or content
copy change, treat repeated wording as a cluster. Name the cluster, search for
old and new wording, classify every hit, patch the bounded surface, then rerun
the same inventory.

Generic command:

```sh
scripts/doc-surface-inventory.sh "<regex for this cluster>" \
  /Users/fstepho/dev/anchormap \
  /Users/fstepho/dev/anchormap-action \
  /Users/fstepho/dev/anchormap-h3-demo
```

For the current week-1 first-reaction cluster, the useful query is:

```sh
scripts/doc-surface-inventory.sh "5-minute|first reaction|Feedback issue|Clean demo PR|anchormap/issues/5|anchormap-h3-demo|docs-to-code drift|spec-to-code traceability drift|Start here|No install" \
  /Users/fstepho/dev/anchormap \
  /Users/fstepho/dev/anchormap-action \
  /Users/fstepho/dev/anchormap-h3-demo
```

Known current week-1 surfaces:

- `/Users/fstepho/dev/anchormap/README.md`
- `/Users/fstepho/dev/anchormap/docs/start-here.md`
- `/Users/fstepho/dev/anchormap/docs/design-partner-preview.md`
- `/Users/fstepho/dev/anchormap/docs/github-action.md`
- `/Users/fstepho/dev/anchormap/docs/github-action-demo.md`
- `/Users/fstepho/dev/anchormap/.github/ISSUE_TEMPLATE/first-reaction.yml`
- `/Users/fstepho/dev/anchormap-action/README.md`
- `/Users/fstepho/dev/anchormap-h3-demo/README.md`

This list is not the rule. The rule is the inventory/classification loop above.
When the topic changes, rebuild the query and the surface list for that topic.

## Files

- `distribution-plan-4w.md`: the 4-week plan, angles, copy drafts, and pivot
  criteria.
- `tracker.md`: execution log, signal log, and weekly decision record.
- `*-article.md`: publishable article body only.
- `*-post.md`: publishable social post body only.
- `*-notes.md`: internal planning notes only.

## Commit Policy

No commit is required for marketing planning changes unless explicitly requested.
Keep this dossier as working material until the user asks to publish, commit, or
turn pieces into public docs.
