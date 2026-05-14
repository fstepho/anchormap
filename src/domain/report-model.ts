import type { TraceabilityDiff } from "./diff-engine";
import type { Finding } from "./finding";
import type { PolicyResult } from "./policy-engine";
import type { ScanResultView } from "./scan-result";

export interface MarkdownReportModel {
	readonly scan: ScanResultView;
	readonly check?: PolicyResult;
	readonly diff?: TraceabilityDiff;
	readonly suggested_actions: readonly string[];
}

type ActionFindingKind = Exclude<Finding["kind"], "stale_mapping_anchor" | "untraced_product_file">;

const ACTION_FINDING_ORDER: readonly ActionFindingKind[] = [
	"unmapped_anchor",
	"broken_seed_path",
	"unresolved_static_edge",
	"unsupported_static_edge",
	"out_of_scope_static_edge",
	"unsupported_local_target",
];

export function buildMarkdownReportModel(input: {
	readonly scan: ScanResultView;
	readonly check?: PolicyResult;
	readonly diff?: TraceabilityDiff;
	readonly renderString: (value: string) => string;
}): MarkdownReportModel {
	return {
		scan: input.scan,
		...(input.check !== undefined ? { check: input.check } : {}),
		...(input.diff !== undefined ? { diff: input.diff } : {}),
		suggested_actions: buildSuggestedActions(input.scan.findings, input.diff, input.renderString),
	};
}

function buildSuggestedActions(
	findings: readonly Finding[],
	diff: TraceabilityDiff | undefined,
	renderString: (value: string) => string,
): string[] {
	const actions: string[] = [];

	for (const kind of ACTION_FINDING_ORDER) {
		for (const finding of findings) {
			if (finding.kind === kind) {
				actions.push(renderFindingAction(finding, renderString));
			}
		}
	}

	for (const path of diff?.files.lost_coverage ?? []) {
		actions.push(`- Inspect lost coverage for ${renderString(path)}.`);
	}

	return dedupeStrings(actions);
}

function renderFindingAction(
	finding: Extract<Finding, { kind: ActionFindingKind }>,
	renderString: (value: string) => string,
): string {
	switch (finding.kind) {
		case "unmapped_anchor":
			return `- Add a mapping for ${renderString(finding.anchor_id)}.`;
		case "broken_seed_path":
			return `- Fix or remove seed ${renderString(finding.seed_path)} for ${renderString(finding.anchor_id)}.`;
		case "unresolved_static_edge":
			return `- Inspect unresolved edge ${renderString(finding.importer)} -> ${renderString(finding.specifier)}.`;
		case "unsupported_static_edge":
			return `- Inspect unsupported edge ${renderString(finding.importer)} -> ${renderString(finding.specifier)}.`;
		case "out_of_scope_static_edge":
			return `- Inspect out-of-scope edge ${renderString(finding.importer)} -> ${renderString(finding.target_path)}.`;
		case "unsupported_local_target":
			return `- Inspect unsupported local target ${renderString(finding.importer)} -> ${renderString(finding.target_path)}.`;
	}
}

function dedupeStrings(values: readonly string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];

	for (const value of values) {
		if (!seen.has(value)) {
			seen.add(value);
			result.push(value);
		}
	}

	return result;
}
