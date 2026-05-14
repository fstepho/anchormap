# TSX Adoption Corpus

This directory is non-contractual adoption evidence for AnchorMap TSX support.

It is not a Level B fixture family, not a golden oracle, and not a release gate.
The contractual TSX behavior remains covered by `docs/contract.md`,
`docs/evals.md`, and the fixture families referenced by `docs/tasks.md`.

The corpus has two lanes:

- `local-minimal/` is a repo-local, deterministic mini TSX project with active
  AnchorMap specs and mappings. It requires no network and is the minimum
  reproducible adoption signal.
- The external lane in `scripts/tsx-adoption-corpus.mjs` fetches
  `dan5py/react-vite-ts` at commit
  `6c09ea115c02e28c3c66588d9617cbc132625478` into a temporary directory and
  runs AnchorMap without installing dependencies.

Run:

```sh
npm run adoption:tsx
```

The runner writes its current evidence under `reports/tsx-adoption/current/`.
If the external repository cannot be fetched, the external lane is reported as
`unavailable` and the command still exits `0`; local corpus invariants remain
blocking.
