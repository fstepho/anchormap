#!/bin/sh

set -eu

if [ "$#" -lt 1 ]; then
	printf '%s\n' "usage: scripts/doc-surface-inventory.sh <regex> [root ...]" >&2
	exit 2
fi

query=$1
shift

if [ "$#" -eq 0 ]; then
	set -- .
fi

if ! command -v rg >/dev/null 2>&1; then
	printf '%s\n' "doc-surface-inventory: rg is required" >&2
	exit 2
fi

rg -n --hidden --glob '!/.git/**' --glob '!node_modules/**' --glob '!dist/**' "$query" "$@"
