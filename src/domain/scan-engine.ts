import type { Config } from "../infra/config-io";
import type { SpecIndex } from "../infra/spec-index";
import type { ProductGraph } from "../infra/ts-graph";
import type { AnchorId } from "./anchor-id";
import { sortAnchorIdsByUtf8, sortRepoPathsByUtf8 } from "./canonical-order";
import {
	createBrokenSeedPathFinding,
	createStaleMappingAnchorFinding,
	createUnmappedAnchorFinding,
	createUntracedProductFileFinding,
	type Finding,
	normalizeFindings,
} from "./finding";
import type { RepoPath } from "./repo-path";
import {
	analysisHealth,
	createConfigView,
	createFileView,
	createObservedAnchorView,
	createScanResultView,
	createStoredMappingView,
	createTraceabilityMetricsView,
	type FilesView,
	type ScanResultView,
	type StoredMappingState,
	type StoredMappingsView,
	type TraceabilityMetricsView,
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
	const activeAnchorIds = new Set(input.specIndex.activeAnchors.keys());
	const productFiles = new Set(input.productGraph.productFiles);
	const usableMappingIds = new Set<AnchorId>();
	const invalidMappingIds = new Set<AnchorId>();
	const reachedFilesByMapping = new Map<AnchorId, readonly RepoPath[]>();
	const mappingFindings: Finding[] = [];

	const stored_mappings = Object.fromEntries(
		sortedMappingEntries(input.config.mappings).map(([anchorId, mapping]) => {
			let state: StoredMappingState;
			let invalidSeedFiles: readonly RepoPath[] = [];

			if (!activeAnchorIds.has(anchorId)) {
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
				reachedFilesByMapping.set(
					anchorId,
					calculateReachedFiles(input.productGraph, mapping.seedFiles, productFiles),
				);
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
	const observed_anchors = Object.fromEntries(
		sortedObservedAnchorEntries(input.specIndex.observedAnchors).map(([anchorId, anchor]) => {
			const mapping_state =
				anchor.status === "draft"
					? "draft"
					: usableMappingIds.has(anchorId)
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
	);
	const files = Object.fromEntries(
		input.productGraph.productFiles.map((productFile) => [
			productFile,
			createFileView({
				covering_anchor_ids: coveringAnchorIdsByFile.get(productFile) ?? [],
				supported_local_targets: input.productGraph.edgesByImporter.get(productFile) ?? [],
			}),
		]),
	);
	const traceability_metrics = buildTraceabilityMetrics({
		config: input.config,
		observedAnchorIds,
		activeAnchorIds,
		stored_mappings,
		files,
		reachedFilesByMapping,
	});
	const baseFindings = normalizeFindings([...input.productGraph.graphFindings, ...mappingFindings]);
	const findings = normalizeFindings([
		...baseFindings,
		...untracedProductFileFindings({
			baseFindings,
			files,
			activeAnchorIds,
			usableMappingIds,
		}),
	]);

	return createScanResultView({
		config: createConfigView({
			product_root: input.config.productRoot,
			spec_roots: input.config.specRoots,
			ignore_roots: input.config.ignoreRoots,
		}),
		observed_anchors,
		stored_mappings,
		files,
		traceability_metrics,
		findings,
	});
}

function buildTraceabilityMetrics(input: {
	readonly config: Config;
	readonly observedAnchorIds: ReadonlySet<AnchorId>;
	readonly activeAnchorIds: ReadonlySet<AnchorId>;
	readonly stored_mappings: StoredMappingsView;
	readonly files: FilesView;
	readonly reachedFilesByMapping: ReadonlyMap<AnchorId, readonly RepoPath[]>;
}): TraceabilityMetricsView {
	const directlySeededFiles = new Set<RepoPath>();
	let coveredProductFileCount = 0;
	let singleCoverProductFileCount = 0;
	let multiCoverProductFileCount = 0;

	for (const file of Object.values(input.files)) {
		if (file.covering_anchor_ids.length > 0) {
			coveredProductFileCount += 1;
		}

		if (file.covering_anchor_ids.length === 1) {
			singleCoverProductFileCount += 1;
		}

		if (file.covering_anchor_ids.length >= 2) {
			multiCoverProductFileCount += 1;
		}
	}

	for (const storedMapping of Object.values(input.stored_mappings)) {
		if (storedMapping.state !== "usable") {
			continue;
		}

		for (const seedFile of storedMapping.seed_files) {
			directlySeededFiles.add(seedFile);
		}
	}

	const anchors = Object.fromEntries(
		sortAnchorIdsByUtf8([
			...new Set([
				...input.observedAnchorIds,
				...(Object.keys(input.stored_mappings) as AnchorId[]),
			]),
		]).map((anchorId) => {
			const storedMapping = input.stored_mappings[anchorId];
			const seedFileCount = input.config.mappings[anchorId]?.seedFiles.length ?? 0;

			if (storedMapping?.state !== "usable") {
				return [
					anchorId,
					{
						seed_file_count: seedFileCount,
						direct_seed_file_count: 0,
						reached_file_count: 0,
						transitive_reached_file_count: 0,
						unique_reached_file_count: 0,
						shared_reached_file_count: 0,
					},
				];
			}

			let uniqueReachedFileCount = 0;
			let sharedReachedFileCount = 0;
			const reachedFiles = input.reachedFilesByMapping.get(anchorId) ?? [];

			for (const reachedFile of reachedFiles) {
				const coveringAnchorIds = input.files[reachedFile]?.covering_anchor_ids ?? [];

				if (coveringAnchorIds.length === 1) {
					uniqueReachedFileCount += 1;
				}

				if (coveringAnchorIds.length >= 2) {
					sharedReachedFileCount += 1;
				}
			}

			return [
				anchorId,
				{
					seed_file_count: seedFileCount,
					direct_seed_file_count: storedMapping.seed_files.length,
					reached_file_count: reachedFiles.length,
					transitive_reached_file_count: reachedFiles.length - storedMapping.seed_files.length,
					unique_reached_file_count: uniqueReachedFileCount,
					shared_reached_file_count: sharedReachedFileCount,
				},
			];
		}),
	);

	const productFileCount = Object.keys(input.files).length;
	const activeAnchorCount = input.activeAnchorIds.size;

	return createTraceabilityMetricsView({
		summary: {
			product_file_count: productFileCount,
			stored_mapping_count: Object.keys(input.stored_mappings).length,
			usable_mapping_count: Object.values(input.stored_mappings).filter(
				(storedMapping) => storedMapping.state === "usable",
			).length,
			observed_anchor_count: input.observedAnchorIds.size,
			active_anchor_count: activeAnchorCount,
			draft_anchor_count: input.observedAnchorIds.size - activeAnchorCount,
			covered_product_file_count: coveredProductFileCount,
			uncovered_product_file_count: productFileCount - coveredProductFileCount,
			directly_seeded_product_file_count: directlySeededFiles.size,
			single_cover_product_file_count: singleCoverProductFileCount,
			multi_cover_product_file_count: multiCoverProductFileCount,
		},
		anchors,
	});
}

function untracedProductFileFindings(input: {
	readonly baseFindings: readonly Finding[];
	readonly files: ScanResultView["files"];
	readonly activeAnchorIds: ReadonlySet<AnchorId>;
	readonly usableMappingIds: ReadonlySet<AnchorId>;
}): Finding[] {
	if (analysisHealth(input.baseFindings) === "degraded" || input.usableMappingIds.size === 0) {
		return [];
	}

	for (const anchorId of input.activeAnchorIds) {
		if (!input.usableMappingIds.has(anchorId)) {
			return [];
		}
	}

	return Object.entries(input.files)
		.filter(([, file]) => file.covering_anchor_ids.length === 0)
		.map(([path]) => createUntracedProductFileFinding({ path: path as RepoPath }));
}

function calculateReachedFiles(
	productGraph: ProductGraph,
	seedFiles: readonly RepoPath[],
	productFiles: ReadonlySet<RepoPath>,
): readonly RepoPath[] {
	const reachedFiles = new Set<RepoPath>();
	const queuedFiles = new Set<RepoPath>();
	const queue: RepoPath[] = [];

	for (const seedFile of sortRepoPathsByUtf8(seedFiles)) {
		if (productFiles.has(seedFile) && !queuedFiles.has(seedFile)) {
			queue.push(seedFile);
			queuedFiles.add(seedFile);
		}
	}

	let cursor = 0;
	while (cursor < queue.length) {
		const currentFile = queue[cursor];
		cursor += 1;

		if (currentFile === undefined || reachedFiles.has(currentFile)) {
			continue;
		}

		reachedFiles.add(currentFile);

		for (const targetFile of productGraph.edgesByImporter.get(currentFile) ?? []) {
			if (
				productFiles.has(targetFile) &&
				!reachedFiles.has(targetFile) &&
				!queuedFiles.has(targetFile)
			) {
				queue.push(targetFile);
				queuedFiles.add(targetFile);
			}
		}
	}

	return sortRepoPathsByUtf8([...reachedFiles]);
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
		[...coveringAnchorIdsByFile.entries()].map(([path, anchorIds]) => [path, anchorIds]),
	);
}
