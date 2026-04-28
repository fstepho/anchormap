# Gate F Performance Report

- Task: `T9.4`
- Corpus version: `release-benchmark-corpus-v1`
- Generated at UTC: `2026-04-28T18:44:33.184Z`
- Release build command: `npm run build`
- CLI: `bin/anchormap`
- Node flags: `--no-opt --max-semi-space-size=1 --no-expose-wasm`
- Warm-up runs: 5
- Measured process-separated runs: 30
- Protocol compliant: yes
- Gate F evaluable: yes
- Gate F verdict: fail

## Reference Machine

- Platform: linux
- Architecture: x64
- Supported platform: yes
- OS release: 6.17.0-1011-azure
- CPU: AMD EPYC 9V74 80-Core Processor
- CPU count: 2
- Memory: 7938 MiB
- Node: v22.22.2
- npm: 10.9.7

## Results

| Corpus | Product files | Anchors | Supported edges | p95 wall-clock | Peak RSS | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `small` | 200 | 50 | 1500 | 579.85 ms | 88.293 MiB | fail |
| `medium` | 1000 | 200 | 8000 | 1808.587 ms | 91.301 MiB | pass |
| `large` | 5000 | 500 | 40000 | 7532.285 ms | 108.996 MiB | informational |

`large` is archived for trend tracking only and is excluded from pass/fail.
