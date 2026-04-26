# Release Benchmark Reports

Archived Gate F reports live in this directory.

The default release benchmark command writes:

- `gate-f-report.json`
- `gate-f-report.md`

GitHub Actions archives the same report names under supported-platform
directories:

- `reports/t9.4/linux-x86_64/`
- `reports/t9.4/macos-arm64/`

The report records the corpus version, release-build command, warm-up count,
measured process-separated run count, wall-clock p95, peak RSS, platform, Node
version, npm version, reference-machine details, supported-platform status,
Gate F evaluability, and the Gate F verdict.

The supported-platform artifact set is validated with:

```sh
npm run bench:validate:artifacts
```
