import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { AnchorId } from "./anchor-id";
import { validateAnchorId } from "./anchor-id";
import { explainScanSubject } from "./explain-engine";
import {
	createBrokenSeedPathFinding,
	createOutOfScopeStaticEdgeFinding,
	createUnmappedAnchorFinding,
	createUntracedProductFileFinding,
	normalizeFindings,
} from "./finding";
import type { RepoPath } from "./repo-path";
import { validateRepoPath } from "./repo-path";
import {
	createConfigView,
	createFileView,
	createObservedAnchorView,
	createScanResultView,
	createStoredMappingView,
	createTraceabilityMetricsView,
} from "./scan-result";

test("explains an anchor with deterministic BFS paths from stored mapping seeds", () => {
	const scan = createScanResultView({
		config: createConfigView({
			product_root: repoPath("src"),
			spec_roots: [repoPath("specs")],
			ignore_roots: [],
		}),
		observed_anchors: {
			[anchorId("QA-001")]: createObservedAnchorView({
				spec_path: repoPath("specs/requirements.md"),
				mapping_state: "usable",
				source: markdownSourceLocation(),
			}),
		},
		stored_mappings: {
			[anchorId("QA-001")]: createStoredMappingView({
				state: "usable",
				seed_files: [repoPath("src/root.ts")],
				reached_files: [repoPath("src/root.ts"), repoPath("src/a.ts"), repoPath("src/leaf.ts")],
			}),
		},
		files: {
			[repoPath("src/root.ts")]: createFileView({
				covering_anchor_ids: [anchorId("QA-001")],
				supported_local_targets: [repoPath("src/b.ts"), repoPath("src/a.ts")],
			}),
			[repoPath("src/a.ts")]: createFileView({
				covering_anchor_ids: [anchorId("QA-001")],
				supported_local_targets: [repoPath("src/leaf.ts")],
			}),
			[repoPath("src/b.ts")]: createFileView({
				covering_anchor_ids: [],
				supported_local_targets: [repoPath("src/leaf.ts")],
			}),
			[repoPath("src/leaf.ts")]: createFileView({
				covering_anchor_ids: [anchorId("QA-001")],
				supported_local_targets: [],
			}),
		},
		traceability_metrics: createTraceabilityMetricsView({
			summary: traceabilitySummary(),
			anchors: {},
		}),
		findings: [],
	});

	const result = explainScanSubject(scan, { kind: "anchor", anchor_id: anchorId("QA-001") });

	assert.deepEqual(result.observed, {
		present: true,
		spec_path: repoPath("specs/requirements.md"),
		mapping_state: "usable",
	});
	assert.deepEqual(result.mapping, {
		present: true,
		state: "usable",
		seed_files: [repoPath("src/root.ts")],
		reached_file_count: 3,
	});
	assert.deepEqual(result.coverage, {
		reached_files: [
			{
				path: repoPath("src/a.ts"),
				path_from_seed: [repoPath("src/root.ts"), repoPath("src/a.ts")],
			},
			{
				path: repoPath("src/leaf.ts"),
				path_from_seed: [repoPath("src/root.ts"), repoPath("src/a.ts"), repoPath("src/leaf.ts")],
			},
			{ path: repoPath("src/root.ts"), path_from_seed: [repoPath("src/root.ts")] },
		],
	});
});

test("missing anchor remains a successful explanation with absent observed and mapping views", () => {
	const result = explainScanSubject(minimalScan(), {
		kind: "anchor",
		anchor_id: anchorId("QA-404"),
	});

	assert.deepEqual(result.subject, { kind: "anchor", anchor_id: anchorId("QA-404") });
	assert.deepEqual(result.observed, {
		present: false,
		spec_path: null,
		mapping_state: "absent",
	});
	assert.deepEqual(result.mapping, {
		present: false,
		state: "absent",
		seed_files: [],
		reached_file_count: 0,
	});
	assert.deepEqual(result.coverage, { reached_files: [] });
});

test("explains file presence, coverage cardinality, and file-scoped findings", () => {
	const scan = createScanResultView({
		config: createConfigView({
			product_root: repoPath("src"),
			spec_roots: [repoPath("specs")],
			ignore_roots: [],
		}),
		observed_anchors: {},
		stored_mappings: {},
		files: {
			[repoPath("src/shared.ts")]: createFileView({
				covering_anchor_ids: [anchorId("QA-002"), anchorId("QA-001")],
				supported_local_targets: [repoPath("src/z.ts"), repoPath("src/a.ts")],
			}),
		},
		traceability_metrics: createTraceabilityMetricsView({
			summary: traceabilitySummary(),
			anchors: {},
		}),
		findings: normalizeFindings([
			createUnmappedAnchorFinding({ anchor_id: anchorId("QA-999") }),
			createOutOfScopeStaticEdgeFinding({
				importer: repoPath("src/shared.ts"),
				target_path: repoPath("outside/dep.ts"),
			}),
			createBrokenSeedPathFinding({
				anchor_id: anchorId("QA-003"),
				seed_path: repoPath("src/shared.ts"),
			}),
		]),
	});

	const result = explainScanSubject(scan, { kind: "file", path: repoPath("src/shared.ts") });

	assert.deepEqual(result.file, {
		present: true,
		covering_anchor_ids: [anchorId("QA-001"), anchorId("QA-002")],
		supported_local_targets: [repoPath("src/a.ts"), repoPath("src/z.ts")],
	});
	assert.deepEqual(result.coverage, {
		covered: true,
		single_cover: false,
		multi_cover: true,
	});
	assert.deepEqual(result.findings, [
		createBrokenSeedPathFinding({
			anchor_id: anchorId("QA-003"),
			seed_path: repoPath("src/shared.ts"),
		}),
		createOutOfScopeStaticEdgeFinding({
			importer: repoPath("src/shared.ts"),
			target_path: repoPath("outside/dep.ts"),
		}),
	]);
});

test("missing file remains a successful explanation with matching path findings", () => {
	const scan = createScanResultView({
		config: createConfigView({
			product_root: repoPath("src"),
			spec_roots: [repoPath("specs")],
			ignore_roots: [],
		}),
		observed_anchors: {},
		stored_mappings: {},
		files: {},
		traceability_metrics: createTraceabilityMetricsView({
			summary: traceabilitySummary(),
			anchors: {},
		}),
		findings: normalizeFindings([
			createUntracedProductFileFinding({ path: repoPath("src/missing.ts") }),
			createOutOfScopeStaticEdgeFinding({
				importer: repoPath("src/importer.ts"),
				target_path: repoPath("src/missing.ts"),
			}),
		]),
	});

	const result = explainScanSubject(scan, { kind: "file", path: repoPath("src/missing.ts") });

	assert.deepEqual(result.file, {
		present: false,
		covering_anchor_ids: [],
		supported_local_targets: [],
	});
	assert.deepEqual(result.coverage, {
		covered: false,
		single_cover: false,
		multi_cover: false,
	});
	assert.deepEqual(result.findings, [
		createOutOfScopeStaticEdgeFinding({
			importer: repoPath("src/importer.ts"),
			target_path: repoPath("src/missing.ts"),
		}),
		createUntracedProductFileFinding({ path: repoPath("src/missing.ts") }),
	]);
});

function minimalScan() {
	return createScanResultView({
		config: createConfigView({
			product_root: repoPath("src"),
			spec_roots: [repoPath("specs")],
			ignore_roots: [],
		}),
		observed_anchors: {},
		stored_mappings: {},
		files: {},
		traceability_metrics: createTraceabilityMetricsView({
			summary: traceabilitySummary(),
			anchors: {},
		}),
		findings: [],
	});
}

function traceabilitySummary() {
	return {
		product_file_count: 0,
		stored_mapping_count: 0,
		usable_mapping_count: 0,
		observed_anchor_count: 0,
		active_anchor_count: 0,
		draft_anchor_count: 0,
		covered_product_file_count: 0,
		uncovered_product_file_count: 0,
		directly_seeded_product_file_count: 0,
		single_cover_product_file_count: 0,
		multi_cover_product_file_count: 0,
	};
}

function markdownSourceLocation() {
	return {
		kind: "markdown_atx_heading" as const,
		line: 1,
		column: 3,
		heading_level: 1,
	};
}

function anchorId(value: string): AnchorId {
	const result = validateAnchorId(value);
	assert.equal(result.kind, "ok");
	if (result.kind !== "ok") {
		throw new Error(`invalid AnchorId fixture value ${value}`);
	}
	return result.anchorId;
}

function repoPath(value: string): RepoPath {
	const result = validateRepoPath(value);
	assert.equal(result.kind, "ok");
	if (result.kind !== "ok") {
		throw new Error(`invalid RepoPath fixture value ${value}`);
	}
	return result.repoPath;
}
