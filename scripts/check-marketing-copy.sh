#!/bin/sh

set -eu

if [ "$#" -ne 1 ]; then
	printf '%s\n' "usage: scripts/check-marketing-copy.sh <publishable-copy-file>" >&2
	exit 2
fi

file=$1

if [ ! -f "$file" ]; then
	printf '%s\n' "check-marketing-copy: file not found: $file" >&2
	exit 2
fi

if ! command -v rg >/dev/null 2>&1; then
	printf '%s\n' "check-marketing-copy: rg is required" >&2
	exit 2
fi

run_rg() {
	pattern=$1
	label=$2

	set +e
	rg -n -i "$pattern" "$file"
	rc=$?
	set -e

	case "$rc" in
		0)
			return 0
			;;
		1)
			return 1
			;;
		*)
			printf '%s\n' "check-marketing-copy: rg failed while checking $label" >&2
			exit 2
			;;
	esac
}

prohibited='\b(CTAs?|calls?[- ]to[- ]actions?|funnels?|conversions?|campaigns?|qualified signals?|trackers?|distribution plans?|distribution notes?|marketing plans?|reader asks?|launch plans?|social notes?|LinkedIn notes?|X notes?|publish checklists?|publication checklists?|internal checklists?|handoff checklists?|internal briefs?|internal notes|operating notes|tracker notes?|skill-routing notes?|skill routing notes?|vanity metrics?|assets?|traction|signups?|customers?|testimonials?|enterprise claims?|compliance claims?|proof-of-correctness|guarantees?|magic|overclaims?|overclaimed|overclaiming|validating|current validation)\b'

if run_rg "$prohibited" "prohibited wording"; then
	printf '%s\n' "check-marketing-copy: prohibited reader-facing wording found" >&2
	exit 1
fi

risky='\b(users?|metrics?|downloads?|enterprise|compliance|proof|prove|proves|proved|proving|deletion safety|AI-powered|AI inference|source intelligence|governance platform)\b'

if run_rg "$risky" "risky wording"; then
	printf '%s\n' "check-marketing-copy: review the matches above manually; risky terms must be disclaimers or bounded public proof only" >&2
fi

printf '%s\n' "check-marketing-copy: passed prohibited-wording check"
