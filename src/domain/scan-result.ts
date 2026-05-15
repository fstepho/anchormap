import type { AnchorId } from "./anchor-id";
import {
	compareCanonicalTextByUtf8,
	sortAnchorIdsByUtf8,
	sortRepoPathsByUtf8,
} from "./canonical-order";
import type { Finding, FindingKind } from "./finding";
import type { RepoPath } from "./repo-path";

export type AnalysisHealth = "clean" | "degraded";

export interface ConfigView {
	readonly version: 1;
	readonly product_root: RepoPath;
	readonly spec_roots: readonly RepoPath[];
	readonly ignore_roots: readonly RepoPath[];
	readonly tsconfig_path: RepoPath | null;
	readonly local_aliases: readonly LocalAliasView[];
}

export interface LocalAliasView {
	readonly prefix: string;
	readonly target: string;
}

export type ObservedAnchorMappingState = "absent" | "usable" | "invalid" | "draft";

export type ScanSchemaVersion = 4 | 5;

export type ObservedAnchorSourceView =
	| {
			readonly kind: "markdown_atx_heading";
			readonly line: number;
			readonly column: number;
			readonly heading_level: number;
	  }
	| {
			readonly kind: "yaml_root_id";
			readonly line: number;
			readonly column: number;
	  };

export interface ObservedAnchorView {
	readonly spec_path: RepoPath;
	readonly mapping_state: ObservedAnchorMappingState;
	readonly source?: ObservedAnchorSourceView;
}

export type ObservedAnchorV5View = ObservedAnchorView & {
	readonly source: ObservedAnchorSourceView;
};

export type StoredMappingState = "usable" | "invalid" | "stale";

export interface StoredMappingView {
	readonly state: StoredMappingState;
	readonly seed_files: readonly RepoPath[];
	readonly reached_files: readonly RepoPath[];
}

export interface FileView {
	readonly covering_anchor_ids: readonly AnchorId[];
	readonly supported_local_targets: readonly RepoPath[];
}

export interface TraceabilitySummaryView {
	readonly product_file_count: number;
	readonly stored_mapping_count: number;
	readonly usable_mapping_count: number;
	readonly observed_anchor_count: number;
	readonly active_anchor_count: number;
	readonly draft_anchor_count: number;
	readonly covered_product_file_count: number;
	readonly uncovered_product_file_count: number;
	readonly directly_seeded_product_file_count: number;
	readonly single_cover_product_file_count: number;
	readonly multi_cover_product_file_count: number;
}

export interface AnchorTraceabilityMetricsView {
	readonly seed_file_count: number;
	readonly direct_seed_file_count: number;
	readonly reached_file_count: number;
	readonly transitive_reached_file_count: number;
	readonly unique_reached_file_count: number;
	readonly shared_reached_file_count: number;
}

export interface TraceabilityMetricsView {
	readonly summary: TraceabilitySummaryView;
	readonly anchors: Readonly<Record<AnchorId, AnchorTraceabilityMetricsView>>;
}

export type ObservedAnchorsView = Readonly<Record<AnchorId, ObservedAnchorView>>;
export type ObservedAnchorsV5View = Readonly<Record<AnchorId, ObservedAnchorV5View>>;
export type StoredMappingsView = Readonly<Record<AnchorId, StoredMappingView>>;
export type FilesView = Readonly<Record<RepoPath, FileView>>;
export type FindingsView = readonly Finding[];

export interface ScanResultView {
	readonly schema_version: ScanSchemaVersion;
	readonly config: ConfigView;
	readonly analysis_health: AnalysisHealth;
	readonly observed_anchors: ObservedAnchorsView;
	readonly stored_mappings: StoredMappingsView;
	readonly files: FilesView;
	readonly traceability_metrics: TraceabilityMetricsView;
	readonly findings: FindingsView;
}

export type ConfigViewFields = Pick<ConfigView, "product_root" | "spec_roots" | "ignore_roots"> &
	Partial<Pick<ConfigView, "tsconfig_path" | "local_aliases">>;
export type ObservedAnchorViewFields = ObservedAnchorV5View;
export type StoredMappingViewFields = StoredMappingView;
export type FileViewFields = FileView;
export type TraceabilityMetricsViewFields = TraceabilityMetricsView;
export type ScanResultViewFields = Pick<
	ScanResultView,
	"config" | "stored_mappings" | "files" | "traceability_metrics" | "findings"
> & {
	readonly observed_anchors: ObservedAnchorsV5View;
};

type NoExtraFields<Input, Shape> = Input & Record<Exclude<keyof Input, keyof Shape>, never>;

const DEGRADING_FINDING_KINDS = new Set<FindingKind>([
	"stale_mapping_anchor",
	"broken_seed_path",
	"unresolved_static_edge",
	"unsupported_static_edge",
	"out_of_scope_static_edge",
	"unsupported_local_target",
]);

export function analysisHealth(findings: readonly Finding[]): AnalysisHealth {
	return findings.some((finding) => DEGRADING_FINDING_KINDS.has(finding.kind))
		? "degraded"
		: "clean";
}

export function createConfigView<const Input extends ConfigViewFields>(
	fields: NoExtraFields<Input, ConfigViewFields>,
): ConfigView {
	return {
		version: 1,
		product_root: fields.product_root,
		spec_roots: sortRepoPathsByUtf8(fields.spec_roots),
		ignore_roots: sortRepoPathsByUtf8(fields.ignore_roots),
		tsconfig_path: fields.tsconfig_path ?? null,
		local_aliases: sortLocalAliasViews(fields.local_aliases ?? []),
	};
}

export function createObservedAnchorView<const Input extends ObservedAnchorViewFields>(
	fields: NoExtraFields<Input, ObservedAnchorViewFields>,
): ObservedAnchorV5View {
	return {
		spec_path: fields.spec_path,
		mapping_state: fields.mapping_state,
		source: fields.source,
	};
}

export function createStoredMappingView<const Input extends StoredMappingViewFields>(
	fields: NoExtraFields<Input, StoredMappingViewFields>,
): StoredMappingView {
	return {
		state: fields.state,
		seed_files: sortRepoPathsByUtf8(fields.seed_files),
		reached_files: fields.state === "usable" ? sortRepoPathsByUtf8(fields.reached_files) : [],
	};
}

export function createFileView<const Input extends FileViewFields>(
	fields: NoExtraFields<Input, FileViewFields>,
): FileView {
	return {
		covering_anchor_ids: sortAnchorIdsByUtf8(fields.covering_anchor_ids),
		supported_local_targets: sortRepoPathsByUtf8(fields.supported_local_targets),
	};
}

export function createTraceabilityMetricsView<const Input extends TraceabilityMetricsViewFields>(
	fields: NoExtraFields<Input, TraceabilityMetricsViewFields>,
): TraceabilityMetricsView {
	return {
		summary: fields.summary,
		anchors: sortRecordByUtf8Key(fields.anchors),
	};
}

export function createScanResultView<const Input extends ScanResultViewFields>(
	fields: NoExtraFields<Input, ScanResultViewFields>,
): ScanResultView {
	assertObservedAnchorsHaveSource(fields.observed_anchors);

	return {
		schema_version: 5,
		config: fields.config,
		analysis_health: analysisHealth(fields.findings),
		observed_anchors: sortRecordByUtf8Key(fields.observed_anchors),
		stored_mappings: sortRecordByUtf8Key(fields.stored_mappings),
		files: sortRecordByUtf8Key(fields.files),
		traceability_metrics: createTraceabilityMetricsView(fields.traceability_metrics),
		findings: fields.findings,
	};
}

function assertObservedAnchorsHaveSource(observedAnchors: ObservedAnchorsView): void {
	for (const [anchorId, observedAnchor] of Object.entries(observedAnchors)) {
		if (observedAnchor.source === undefined) {
			throw new Error(`Cannot create schema v5 scan result without source for ${anchorId}`);
		}
	}
}

function sortRecordByUtf8Key<Key extends string, Value>(
	record: Readonly<Record<Key, Value>>,
): Record<Key, Value> {
	const entries = Object.entries(record) as [Key, Value][];
	entries.sort(([leftKey], [rightKey]) => compareCanonicalTextByUtf8(leftKey, rightKey));
	return Object.fromEntries(entries) as Record<Key, Value>;
}

function sortLocalAliasViews(localAliases: readonly LocalAliasView[]): readonly LocalAliasView[] {
	return [...localAliases].sort((left, right) => {
		const prefixLengthOrder = right.prefix.length - left.prefix.length;
		if (prefixLengthOrder !== 0) {
			return prefixLengthOrder;
		}

		const prefixOrder = compareCanonicalTextByUtf8(left.prefix, right.prefix);
		if (prefixOrder !== 0) {
			return prefixOrder;
		}

		return compareCanonicalTextByUtf8(left.target, right.target);
	});
}
