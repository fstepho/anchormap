# Gate F Performance Report

- Task: `T9.4`
- Corpus version: `release-benchmark-corpus-v1`
- Generated at UTC: `2026-04-26T14:47:53.940Z`
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
- CPU: Apple M3 Max
- CPU count: 16
- Memory: 49152 MiB
- Node: v22.19.0
- npm: 11.11.1

## Results

| Corpus | Product files | Anchors | Supported edges | p95 wall-clock | Peak RSS | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `small` | 200 | 50 | 1500 | 315.323 ms | 118.219 MiB | pass |
| `medium` | 1000 | 200 | 8000 | 1079.829 ms | 120.016 MiB | pass |
| `large` | 5000 | 500 | 40000 | 4687.152 ms | 140.797 MiB | informational |

`large` is archived for trend tracking only and is excluded from pass/fail.
