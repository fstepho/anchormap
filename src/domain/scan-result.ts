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
}

export type ObservedAnchorMappingState = "absent" | "usable" | "invalid";

export interface ObservedAnchorView {
	readonly spec_path: RepoPath;
	readonly mapping_state: ObservedAnchorMappingState;
}

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

export type ObservedAnchorsView = Readonly<Record<AnchorId, ObservedAnchorView>>;
export type StoredMappingsView = Readonly<Record<AnchorId, StoredMappingView>>;
export type FilesView = Readonly<Record<RepoPath, FileView>>;
export type FindingsView = readonly Finding[];

export interface ScanResultView {
	readonly schema_version: 1;
	readonly config: ConfigView;
	readonly analysis_health: AnalysisHealth;
	readonly observed_anchors: ObservedAnchorsView;
	readonly stored_mappings: StoredMappingsView;
	readonly files: FilesView;
	readonly findings: FindingsView;
}

export type ConfigViewFields = Pick<ConfigView, "product_root" | "spec_roots" | "ignore_roots">;
export type ObservedAnchorViewFields = ObservedAnchorView;
export type StoredMappingViewFields = StoredMappingView;
export type FileViewFields = FileView;
export type ScanResultViewFields = Pick<
	ScanResultView,
	"config" | "observed_anchors" | "stored_mappings" | "files" | "findings"
>;

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
	};
}

export function createObservedAnchorView<const Input extends ObservedAnchorViewFields>(
	fields: NoExtraFields<Input, ObservedAnchorViewFields>,
): ObservedAnchorView {
	return {
		spec_path: fields.spec_path,
		mapping_state: fields.mapping_state,
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

export function createScanResultView<const Input extends ScanResultViewFields>(
	fields: NoExtraFields<Input, ScanResultViewFields>,
): ScanResultView {
	return {
		schema_version: 1,
		config: fields.config,
		analysis_health: analysisHealth(fields.findings),
		observed_anchors: sortRecordByUtf8Key(fields.observed_anchors),
		stored_mappings: sortRecordByUtf8Key(fields.stored_mappings),
		files: sortRecordByUtf8Key(fields.files),
		findings: fields.findings,
	};
}

function sortRecordByUtf8Key<Key extends string, Value>(
	record: Readonly<Record<Key, Value>>,
): Record<Key, Value> {
	const entries = Object.entries(record) as [Key, Value][];
	entries.sort(([leftKey], [rightKey]) => compareCanonicalTextByUtf8(leftKey, rightKey));
	return Object.fromEntries(entries) as Record<Key, Value>;
}
