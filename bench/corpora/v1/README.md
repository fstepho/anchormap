# Release Benchmark Corpus v1

This directory versions the Gate F benchmark corpus definitions.

The release benchmark runner materializes these definitions into an isolated
temporary repository for each run. The generated repositories contain:

- `small`: 200 product files, 50 observed anchors, 1,500 supported edges
- `medium`: 1,000 product files, 200 observed anchors, 8,000 supported edges
- `large`: 5,000 product files, 500 observed anchors, 40,000 supported edges

`small` and `medium` are release-gated. `large` is informational only.

The committed manifest is the versioned corpus source of truth; generated
repositories are run artifacts and are not committed.
