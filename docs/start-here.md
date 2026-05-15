# AnchorMap in 5 minutes

AnchorMap is a local-first CLI and GitHub Action for TypeScript repositories.

It detects when Markdown/YAML specs and TypeScript code drift apart in pull
requests.

## The problem

In many TypeScript projects, product/API/spec documents change separately from
code.

During review, it is hard to see whether:

- a new requirement-like statement was added without code mapping;
- an old mapping points to something that no longer exists;
- a PR reduced traceability coverage;
- the report is still reliable enough to trust.

AnchorMap makes those cases visible in CI as local artifacts and a PR-readable
Markdown report.

## No install path

Read one demo PR:

- Clean: https://github.com/fstepho/anchormap-h3-demo/pull/2
- New unmapped anchor: https://github.com/fstepho/anchormap-h3-demo/pull/3
- Stale mapping: https://github.com/fstepho/anchormap-h3-demo/pull/4
- Degraded analysis: https://github.com/fstepho/anchormap-h3-demo/pull/5

Then leave a first reaction:

https://github.com/fstepho/anchormap/issues/5

## Install path

Use:

```yaml
uses: fstepho/anchormap-action@v0-preview.3
with:
  anchormap-version: "1.2.2"
```

Full setup:

https://github.com/fstepho/anchormap/blob/main/docs/github-action.md

## Boundaries

No source upload.
No SaaS account.
No GitHub App.
No PR comments by default.
