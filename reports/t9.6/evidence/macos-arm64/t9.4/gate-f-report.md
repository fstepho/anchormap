# Gate F Performance Report

- Task: `T9.4`
- Corpus version: `release-benchmark-corpus-v1`
- Generated at UTC: `2026-04-28T21:42:20.274Z`
- Release build command: `npm run build`
- CLI: `bin/anchormap`
- Node flags: `--no-opt --max-semi-space-size=1 --no-expose-wasm`
- Warm-up runs: 5
- Measured process-separated runs: 30
- Protocol compliant: yes
- Gate F evaluable: yes
- Gate F verdict: pass

## Reference Machine

- Platform: darwin
- Architecture: arm64
- Supported platform: yes
- OS release: 24.6.0
- CPU: Apple M1 (Virtual)
- CPU count: 3
- Memory: 7168 MiB
- Node: v22.22.2
- npm: 10.9.7

## Results

| Corpus | Product files | Anchors | Supported edges | p95 wall-clock | Peak RSS | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `small` | 200 | 50 | 1500 | 160.607 ms | 49.547 MiB | pass |
| `medium` | 1000 | 200 | 8000 | 297.418 ms | 52.703 MiB | pass |
| `large` | 5000 | 500 | 40000 | 764.312 ms | 69.234 MiB | informational |

`large` is archived for trend tracking only and is excluded from pass/fail.
