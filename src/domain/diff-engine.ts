import type { AnchorId } from "./anchor-id";
import {
	compareCanonicalTextByUtf8,
	sortAnchorIdsByUtf8,
	sortRepoPathsByUtf8,
} from "./canonical-order";
import { compareFindings, type Finding } from "./finding";
import type {
	AnalysisHealth,
	ConfigView,
	FileView,
	ObservedAnchorMappingState,
	ScanResultView,
	StoredMappingState,
	TraceabilitySummaryView,
} from "./scan-result";

export type TraceabilityDiffComparability = "same_scope" | "scope_changed";

export interface TraceabilityDiff {
	readonly schema_version: 1;
	readonly base_scan_schema_version: number;
	readonly head_scan_schema_version: number;
	readonly comparability: TraceabilityDiffComparability;
	readonly analysis_health_change: {
		readonly from: AnalysisHealth;
		readonly to: AnalysisHealth;
	};
	readonly anchors: {
		readonly added: readonly AnchorId[];
		readonly removed: readonly AnchorId[];
		readonly mapping_state_changed: readonly MappingStateChange[];
	};
	readonly mappings: {
		readonly added: readonly AnchorId[];
		readonly removed: readonly AnchorId[];
		readonly state_changed: readonly StoredMappingStateChange[];
	};
	readonly files: {
		readonly added: readonly string[];
		readonly removed: readonly string[];
		readonly became_covered: readonly string[];
		readonly lost_coverage: readonly string[];
		readonly covering_anchor_ids_changed: readonly CoveringAnchorIdsChange[];
		readonly supported_local_targets_changed: readonly SupportedLocalTargetsChange[];
	};
	readonly findings: {
		readonly added: readonly Finding[];
		readonly removed: readonly Finding[];
	};
	readonly metrics_delta: TraceabilitySummaryView;
}

export interface MappingStateChange {
	readonly anchor_id: AnchorId;
	readonly from: ObservedAnchorMappingState;
	readonly to: ObservedAnchorMappingState;
}

export interface StoredMappingStateChange {
	readonly anchor_id: AnchorId;
	readonly from: StoredMappingState;
	readonly to: StoredMappingState;
}

export interface CoveringAnchorIdsChange {
	readonly path: string;
	readonly from: readonly AnchorId[];
	readonly to: readonly AnchorId[];
}

export interface SupportedLocalTargetsChange {
	readonly path: string;
	readonly from: readonly string[];
	readonly to: readonly string[];
}

export function diffScanResults(base: ScanResultView, head: ScanResultView): TraceabilityDiff {
	const baseAnchorIds = Object.keys(base.observed_anchors) as AnchorId[];
	const headAnchorIds = Object.keys(head.observed_anchors) as AnchorId[];
	const baseMappingIds = Object.keys(base.stored_mappings) as AnchorId[];
	const headMappingIds = Object.keys(head.stored_mappings) as AnchorId[];
	const baseFilePaths = Object.keys(base.files);
	const headFilePaths = Object.keys(head.files);

	return {
		schema_version: 1,
		base_scan_schema_version: base.schema_version,
		head_scan_schema_version: head.schema_version,
		comparability: sameScope(base.config, head.config) ? "same_scope" : "scope_changed",
		analysis_health_change: {
			from: base.analysis_health,
			to: head.analysis_health,
		},
		anchors: {
			added: addedKeys(baseAnchorIds, headAnchorIds) as AnchorId[],
			removed: removedKeys(baseAnchorIds, headAnchorIds) as AnchorId[],
			mapping_state_changed: changedAnchorMappingStates(base, head),
		},
		mappings: {
			added: addedKeys(baseMappingIds, headMappingIds) as AnchorId[],
			removed: removedKeys(baseMappingIds, headMappingIds) as AnchorId[],
			state_changed: changedStoredMappingStates(base, head),
		},
		files: {
			added: addedKeys(baseFilePaths, headFilePaths),
			removed: removedKeys(baseFilePaths, headFilePaths),
			became_covered: changedCoverage(base, head, "became_covered"),
			lost_coverage: changedCoverage(base, head, "lost_coverage"),
			covering_anchor_ids_changed: changedCoveringAnchorIds(base, head),
			supported_local_targets_changed: changedSupportedLocalTargets(base, head),
		},
		findings: diffFindings(base.findings, head.findings),
		metrics_delta: diffTraceabilitySummary(
			base.traceability_metrics.summary,
			head.traceability_metrics.summary,
		),
	};
}

function sameScope(base: ConfigView, head: ConfigView): boolean {
	return configComparisonKey(base) === configComparisonKey(head);
}

function configComparisonKey(config: ConfigView): string {
	return JSON.stringify({
		version: config.version,
		product_root: config.product_root,
		spec_roots: sortRepoPathsByUtf8(config.spec_roots),
		ignore_roots: sortRepoPathsByUtf8(config.ignore_roots),
		tsconfig_path: config.tsconfig_path,
		local_aliases: [...config.local_aliases].sort((left, right) => {
			const prefixLengthOrder = right.prefix.length - left.prefix.length;
			if (prefixLengthOrder !== 0) {
				return prefixLengthOrder;
			}
			const prefixOrder = compareCanonicalTextByUtf8(left.prefix, right.prefix);
			if (prefixOrder !== 0) {
				return prefixOrder;
			}
			return compareCanonicalTextByUtf8(left.target, right.target);
		}),
	});
}

function addedKeys(baseKeys: readonly string[], headKeys: readonly string[]): string[] {
	const base = new Set(baseKeys);
	return sortTextByUtf8(headKeys.filter((key) => !base.has(key)));
}

function removedKeys(baseKeys: readonly string[], headKeys: readonly string[]): string[] {
	const head = new Set(headKeys);
	return sortTextByUtf8(baseKeys.filter((key) => !head.has(key)));
}

function intersectionKeys(baseKeys: readonly string[], headKeys: readonly string[]): string[] {
	const head = new Set(headKeys);
	return sortTextByUtf8(baseKeys.filter((key) => head.has(key)));
}

function changedAnchorMappingStates(
	base: ScanResultView,
	head: ScanResultView,
): MappingStateChange[] {
	return intersectionKeys(Object.keys(base.observed_anchors), Object.keys(head.observed_anchors))
		.flatMap((anchorId) => {
			const typedAnchorId = anchorId as AnchorId;
			const from = base.observed_anchors[typedAnchorId].mapping_state;
			const to = head.observed_anchors[typedAnchorId].mapping_state;
			return from === to ? [] : [{ anchor_id: typedAnchorId, from, to }];
		})
		.sort(compareAnchorIdChange);
}

function changedStoredMappingStates(
	base: ScanResultView,
	head: ScanResultView,
): StoredMappingStateChange[] {
	return intersectionKeys(Object.keys(base.stored_mappings), Object.keys(head.stored_mappings))
		.flatMap((anchorId) => {
			const typedAnchorId = anchorId as AnchorId;
			const from = base.stored_mappings[typedAnchorId].state;
			const to = head.stored_mappings[typedAnchorId].state;
			return from === to ? [] : [{ anchor_id: typedAnchorId, from, to }];
		})
		.sort(compareAnchorIdChange);
}

function changedCoverage(
	base: ScanResultView,
	head: ScanResultView,
	direction: "became_covered" | "lost_coverage",
): string[] {
	return intersectionKeys(Object.keys(base.files), Object.keys(head.files)).filter((path) => {
		const filePath = path as keyof typeof base.files;
		const baseCovered = isCovered(base.files[filePath]);
		const headCovered = isCovered(head.files[filePath]);
		return direction === "became_covered"
			? !baseCovered && headCovered
			: baseCovered && !headCovered;
	});
}

function changedCoveringAnchorIds(
	base: ScanResultView,
	head: ScanResultView,
): CoveringAnchorIdsChange[] {
	return intersectionKeys(Object.keys(base.files), Object.keys(head.files)).flatMap((path) => {
		const filePath = path as keyof typeof base.files;
		const from = sortAnchorIdsByUtf8(base.files[filePath].covering_anchor_ids);
		const to = sortAnchorIdsByUtf8(head.files[filePath].covering_anchor_ids);
		return sameStringArray(from, to) ? [] : [{ path, from, to }];
	});
}

function changedSupportedLocalTargets(
	base: ScanResultView,
	head: ScanResultView,
): SupportedLocalTargetsChange[] {
	return intersectionKeys(Object.keys(base.files), Object.keys(head.files)).flatMap((path) => {
		const filePath = path as keyof typeof base.files;
		const from = sortRepoPathsByUtf8(base.files[filePath].supported_local_targets);
		const to = sortRepoPathsByUtf8(head.files[filePath].supported_local_targets);
		return sameStringArray(from, to) ? [] : [{ path, from, to }];
	});
}

function isCovered(file: FileView): boolean {
	return file.covering_anchor_ids.length > 0;
}

function diffFindings(
	baseFindings: readonly Finding[],
	headFindings: readonly Finding[],
): { added: readonly Finding[]; removed: readonly Finding[] } {
	const baseKeys = new Set(baseFindings.map(findingComparisonKey));
	const headKeys = new Set(headFindings.map(findingComparisonKey));

	return {
		added: headFindings
			.filter((finding) => !baseKeys.has(findingComparisonKey(finding)))
			.sort(compareFindings),
		removed: baseFindings
			.filter((finding) => !headKeys.has(findingComparisonKey(finding)))
			.sort(compareFindings),
	};
}

function findingComparisonKey(finding: Finding): string {
	switch (finding.kind) {
		case "unmapped_anchor":
			return JSON.stringify([finding.kind, finding.anchor_id]);
		case "stale_mapping_anchor":
			return JSON.stringify([finding.kind, finding.anchor_id]);
		case "broken_seed_path":
			return JSON.stringify([finding.kind, finding.anchor_id, finding.seed_path]);
		case "unresolved_static_edge":
			return JSON.stringify([finding.kind, finding.importer, finding.specifier]);
		case "unsupported_static_edge":
			return JSON.stringify([
				finding.kind,
				finding.importer,
				finding.syntax_kind,
				finding.specifier,
			]);
		case "out_of_scope_static_edge":
			return JSON.stringify([finding.kind, finding.importer, finding.target_path]);
		case "unsupported_local_target":
			return JSON.stringify([finding.kind, finding.importer, finding.target_path]);
		case "untraced_product_file":
			return JSON.stringify([finding.kind, finding.path]);
	}
}

function diffTraceabilitySummary(
	base: TraceabilitySummaryView,
	head: TraceabilitySummaryView,
): TraceabilitySummaryView {
	return {
		product_file_count: head.product_file_count - base.product_file_count,
		stored_mapping_count: head.stored_mapping_count - base.stored_mapping_count,
		usable_mapping_count: head.usable_mapping_count - base.usable_mapping_count,
		observed_anchor_count: head.observed_anchor_count - base.observed_anchor_count,
		active_anchor_count: head.active_anchor_count - base.active_anchor_count,
		draft_anchor_count: head.draft_anchor_count - base.draft_anchor_count,
		covered_product_file_count: head.covered_product_file_count - base.covered_product_file_count,
		uncovered_product_file_count:
			head.uncovered_product_file_count - base.uncovered_product_file_count,
		directly_seeded_product_file_count:
			head.directly_seeded_product_file_count - base.directly_seeded_product_file_count,
		single_cover_product_file_count:
			head.single_cover_product_file_count - base.single_cover_product_file_count,
		multi_cover_product_file_count:
			head.multi_cover_product_file_count - base.multi_cover_product_file_count,
	};
}

function compareAnchorIdChange(
	left: { anchor_id: AnchorId; from: string; to: string },
	right: { anchor_id: AnchorId; from: string; to: string },
): number {
	return (
		compareCanonicalTextByUtf8(left.anchor_id, right.anchor_id) ||
		compareCanonicalTextByUtf8(left.from, right.from) ||
		compareCanonicalTextByUtf8(left.to, right.to)
	);
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sortTextByUtf8<T extends string>(values: readonly T[]): T[] {
	return [...values].sort(compareCanonicalTextByUtf8);
}
