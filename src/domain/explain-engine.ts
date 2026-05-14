import type { AnchorId } from "./anchor-id";
import { sortAnchorIdsByUtf8, sortRepoPathsByUtf8 } from "./canonical-order";
import { compareFindings, type Finding } from "./finding";
import type { RepoPath } from "./repo-path";
import type { ObservedAnchorMappingState, ScanResultView, StoredMappingState } from "./scan-result";

export type ExplainSubject =
	| { readonly kind: "anchor"; readonly anchor_id: AnchorId }
	| { readonly kind: "file"; readonly path: RepoPath };

export interface ExplainAnchorObserved {
	readonly present: boolean;
	readonly spec_path: RepoPath | null;
	readonly mapping_state: ObservedAnchorMappingState;
}

export interface ExplainAnchorMapping {
	readonly present: boolean;
	readonly state: StoredMappingState | "absent";
	readonly seed_files: readonly RepoPath[];
	readonly reached_file_count: number;
}

export interface ExplainFile {
	readonly present: boolean;
	readonly covering_anchor_ids: readonly AnchorId[];
	readonly supported_local_targets: readonly RepoPath[];
}

export interface ExplainReachedFile {
	readonly path: RepoPath;
	readonly path_from_seed: readonly RepoPath[];
}

export type ExplainCoverage =
	| { readonly reached_files: readonly ExplainReachedFile[] }
	| { readonly covered: boolean; readonly single_cover: boolean; readonly multi_cover: boolean };

export interface ExplainResult {
	readonly schema_version: 1;
	readonly subject: ExplainSubject;
	readonly observed: ExplainAnchorObserved | null;
	readonly mapping: ExplainAnchorMapping | null;
	readonly file: ExplainFile | null;
	readonly coverage: ExplainCoverage;
	readonly findings: readonly Finding[];
}

export function explainScanSubject(scan: ScanResultView, subject: ExplainSubject): ExplainResult {
	if (subject.kind === "anchor") {
		return explainAnchor(scan, subject.anchor_id);
	}

	return explainFile(scan, subject.path);
}

function explainAnchor(scan: ScanResultView, anchorId: AnchorId): ExplainResult {
	const observed = scan.observed_anchors[anchorId];
	const mapping = scan.stored_mappings[anchorId];
	const pathsByFile =
		mapping === undefined
			? new Map<RepoPath, readonly RepoPath[]>()
			: anchorPathsByFile(scan, mapping.seed_files);
	const reachedFiles =
		mapping === undefined
			? []
			: sortRepoPathsByUtf8(mapping.reached_files).map((path) => ({
					path,
					path_from_seed: pathsByFile.get(path) ?? [],
				}));

	return {
		schema_version: 1,
		subject: { kind: "anchor", anchor_id: anchorId },
		observed: {
			present: observed !== undefined,
			spec_path: observed?.spec_path ?? null,
			mapping_state: observed?.mapping_state ?? "absent",
		},
		mapping: {
			present: mapping !== undefined,
			state: mapping?.state ?? "absent",
			seed_files: mapping === undefined ? [] : sortRepoPathsByUtf8(mapping.seed_files),
			reached_file_count: mapping?.reached_files.length ?? 0,
		},
		file: null,
		coverage: { reached_files: reachedFiles },
		findings: findingsForAnchor(scan.findings, anchorId),
	};
}

function explainFile(scan: ScanResultView, path: RepoPath): ExplainResult {
	const file = scan.files[path];
	const coveringAnchorIds = file === undefined ? [] : sortAnchorIdsByUtf8(file.covering_anchor_ids);

	return {
		schema_version: 1,
		subject: { kind: "file", path },
		observed: null,
		mapping: null,
		file: {
			present: file !== undefined,
			covering_anchor_ids: coveringAnchorIds,
			supported_local_targets:
				file === undefined ? [] : sortRepoPathsByUtf8(file.supported_local_targets),
		},
		coverage: {
			covered: coveringAnchorIds.length > 0,
			single_cover: coveringAnchorIds.length === 1,
			multi_cover: coveringAnchorIds.length > 1,
		},
		findings: findingsForFile(scan.findings, path),
	};
}

function anchorPathsByFile(
	scan: ScanResultView,
	seedFiles: readonly RepoPath[],
): Map<RepoPath, readonly RepoPath[]> {
	const pathsByFile = new Map<RepoPath, readonly RepoPath[]>();
	const queue: RepoPath[] = [];

	for (const seedFile of sortRepoPathsByUtf8(seedFiles)) {
		if (pathsByFile.has(seedFile)) {
			continue;
		}
		pathsByFile.set(seedFile, [seedFile]);
		queue.push(seedFile);
	}

	for (let index = 0; index < queue.length; index += 1) {
		const current = queue[index];
		const currentPath = pathsByFile.get(current);
		if (currentPath === undefined) {
			continue;
		}

		const localTargets = sortRepoPathsByUtf8(scan.files[current]?.supported_local_targets ?? []);
		for (const target of localTargets) {
			if (pathsByFile.has(target)) {
				continue;
			}
			pathsByFile.set(target, [...currentPath, target]);
			queue.push(target);
		}
	}

	return pathsByFile;
}

function findingsForAnchor(findings: readonly Finding[], anchorId: AnchorId): readonly Finding[] {
	return findings
		.filter((finding) => "anchor_id" in finding && finding.anchor_id === anchorId)
		.sort(compareFindings);
}

function findingsForFile(findings: readonly Finding[], path: RepoPath): readonly Finding[] {
	return findings
		.filter((finding) => {
			switch (finding.kind) {
				case "broken_seed_path":
					return finding.seed_path === path;
				case "unresolved_static_edge":
				case "unsupported_static_edge":
					return finding.importer === path;
				case "out_of_scope_static_edge":
				case "unsupported_local_target":
					return finding.importer === path || finding.target_path === path;
				case "untraced_product_file":
					return finding.path === path;
				case "unmapped_anchor":
				case "stale_mapping_anchor":
					return false;
			}
			return false;
		})
		.sort(compareFindings);
}
