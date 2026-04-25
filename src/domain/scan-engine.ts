import type { Config } from "../infra/config-io";
import type { SpecIndex } from "../infra/spec-index";
import type { ProductGraph } from "../infra/ts-graph";
import type { AnchorId } from "./anchor-id";
import { sortAnchorIdsByUtf8 } from "./canonical-order";
import {
	createBrokenSeedPathFinding,
	createStaleMappingAnchorFinding,
	createUnmappedAnchorFinding,
	type Finding,
	normalizeFindings,
} from "./finding";
import type { RepoPath } from "./repo-path";
import {
	createConfigView,
	createFileView,
	createObservedAnchorView,
	createScanResultView,
	createStoredMappingView,
	type ScanResultView,
	type StoredMappingState,
} from "./scan-result";

type ObservedAnchor =
	SpecIndex["observedAnchors"] extends ReadonlyMap<AnchorId, infer Value> ? Value : never;

export interface ScanEngineInput {
	readonly config: Config;
	readonly specIndex: SpecIndex;
	readonly productGraph: ProductGraph;
}

export function runScanEngine(input: ScanEngineInput): ScanResultView {
	const observedAnchorIds = new Set(input.specIndex.observedAnchors.keys());
	const productFiles = new Set(input.productGraph.productFiles);
	const usableMappingIds = new Set<AnchorId>();
	const invalidMappingIds = new Set<AnchorId>();
	const reachedFilesByMapping = new Map<AnchorId, readonly RepoPath[]>();
	const mappingFindings: Finding[] = [];

	const stored_mappings = Object.fromEntries(
		sortedMappingEntries(input.config.mappings).map(([anchorId, mapping]) => {
			let state: StoredMappingState;
			let invalidSeedFiles: readonly RepoPath[] = [];

			if (!observedAnchorIds.has(anchorId)) {
				state = "stale";
				mappingFindings.push(createStaleMappingAnchorFinding({ anchor_id: anchorId }));
			} else {
				invalidSeedFiles = mapping.seedFiles.filter((seedFile) => !productFiles.has(seedFile));
				state = invalidSeedFiles.length > 0 ? "invalid" : "usable";
			}

			if (state === "invalid") {
				invalidMappingIds.add(anchorId);
				for (const seedFile of invalidSeedFiles) {
					mappingFindings.push(
						createBrokenSeedPathFinding({
							anchor_id: anchorId,
							seed_path: seedFile,
						}),
					);
				}
			}

			if (state === "usable") {
				usableMappingIds.add(anchorId);
				assertNoPendingReachabilityTraversal(input.productGraph, anchorId, mapping.seedFiles);
				reachedFilesByMapping.set(anchorId, mapping.seedFiles);
			}

			return [
				anchorId,
				createStoredMappingView({
					state,
					seed_files: mapping.seedFiles,
					reached_files: reachedFilesByMapping.get(anchorId) ?? [],
				}),
			];
		}),
	);

	const coveringAnchorIdsByFile = buildCoveringAnchorIdsByFile(reachedFilesByMapping);

	return createScanResultView({
		config: createConfigView({
			product_root: input.config.productRoot,
			spec_roots: input.config.specRoots,
			ignore_roots: input.config.ignoreRoots,
		}),
		observed_anchors: Object.fromEntries(
			sortedObservedAnchorEntries(input.specIndex.observedAnchors).map(([anchorId, anchor]) => {
				const mapping_state = usableMappingIds.has(anchorId)
					? "usable"
					: invalidMappingIds.has(anchorId)
						? "invalid"
						: "absent";

				if (mapping_state === "absent") {
					mappingFindings.push(createUnmappedAnchorFinding({ anchor_id: anchorId }));
				}

				return [
					anchorId,
					createObservedAnchorView({
						spec_path: anchor.specPath,
						mapping_state,
					}),
				];
			}),
		),
		stored_mappings,
		files: Object.fromEntries(
			input.productGraph.productFiles.map((productFile) => [
				productFile,
				createFileView({
					covering_anchor_ids: coveringAnchorIdsByFile.get(productFile) ?? [],
					supported_local_targets: input.productGraph.edgesByImporter.get(productFile) ?? [],
				}),
			]),
		),
		findings: normalizeFindings([...input.productGraph.graphFindings, ...mappingFindings]),
	});
}

function assertNoPendingReachabilityTraversal(
	productGraph: ProductGraph,
	anchorId: AnchorId,
	seedFiles: readonly RepoPath[],
): void {
	for (const seedFile of seedFiles) {
		const supportedLocalTargets = productGraph.edgesByImporter.get(seedFile) ?? [];
		if (supportedLocalTargets.length > 0) {
			throw new Error(
				`T7.2 scan engine cannot render complete reachability for usable mapping ${anchorId} before T7.3`,
			);
		}
	}
}

function sortedMappingEntries(
	mappings: Config["mappings"],
): readonly [AnchorId, Config["mappings"][AnchorId]][] {
	return sortAnchorIdsByUtf8(Object.keys(mappings) as AnchorId[]).map((anchorId) => [
		anchorId,
		mappings[anchorId],
	]);
}

function sortedObservedAnchorEntries(
	observedAnchors: SpecIndex["observedAnchors"],
): readonly [AnchorId, ObservedAnchor][] {
	return sortAnchorIdsByUtf8([...observedAnchors.keys()]).map((anchorId) => {
		const observedAnchor = observedAnchors.get(anchorId);
		if (observedAnchor === undefined) {
			throw new Error(`scan engine observed anchor index is missing ${anchorId}`);
		}

		return [anchorId, observedAnchor];
	});
}

function buildCoveringAnchorIdsByFile(
	reachedFilesByMapping: ReadonlyMap<AnchorId, readonly RepoPath[]>,
): ReadonlyMap<RepoPath, readonly AnchorId[]> {
	const coveringAnchorIdsByFile = new Map<RepoPath, AnchorId[]>();

	for (const [anchorId, reachedFiles] of reachedFilesByMapping) {
		for (const reachedFile of reachedFiles) {
			const coveringAnchorIds = coveringAnchorIdsByFile.get(reachedFile) ?? [];
			coveringAnchorIds.push(anchorId);
			coveringAnchorIdsByFile.set(reachedFile, coveringAnchorIds);
		}
	}

	return new Map(
		[...coveringAnchorIdsByFile.entries()].map(([path, anchorIds]) => [
			path,
			sortAnchorIdsByUtf8(anchorIds),
		]),
	);
}
