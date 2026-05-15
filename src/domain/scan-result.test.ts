import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { AnchorId } from "./anchor-id";
import { validateAnchorId } from "./anchor-id";
import {
	createBrokenSeedPathFinding,
	createOutOfScopeStaticEdgeFinding,
	createStaleMappingAnchorFinding,
	createUnmappedAnchorFinding,
	createUnresolvedStaticEdgeFinding,
	createUnsupportedLocalTargetFinding,
	createUnsupportedStaticEdgeFinding,
	createUntracedProductFileFinding,
	type Finding,
} from "./finding";
import type { RepoPath } from "./repo-path";
import { repoPathToString, validateRepoPath } from "./repo-path";
import {
	analysisHealth,
	createConfigView,
	createFileView,
	createObservedAnchorView,
	createScanResultView,
	createStoredMappingView,
	createTraceabilityMetricsView,
	type ScanResultViewFields,
} from "./scan-result";

test("computes clean analysis health for no findings", () => {
	assert.equal(analysisHealth([]), "clean");
});

test("keeps analysis health clean for only non-degrading findings", () => {
	assert.equal(
		analysisHealth([
			createUnmappedAnchorFinding({ anchor_id: anchorId("QA-001") }),
			createUntracedProductFileFinding({ path: repoPath("src/orphan.ts") }),
		]),
		"clean",
	);
});

test("degrades analysis health for every degrading finding kind", () => {
	for (const finding of degradingFindings()) {
		assert.equal(analysisHealth([finding]), "degraded", finding.kind);
	}
});

test("constructs scan result with only contract root fields and computed health", () => {
	const result = createScanResultView({
		config: createConfigView({
			product_root: repoPath("src"),
			spec_roots: [repoPath("specs")],
			ignore_roots: [],
		}),
		observed_anchors: {
			[anchorId("QA-001")]: createObservedAnchorView({
				spec_path: repoPath("specs/a.md"),
				mapping_state: "usable",
				source: markdownSourceLocation(),
			}),
		},
		stored_mappings: {
			[anchorId("QA-001")]: createStoredMappingView({
				state: "usable",
				seed_files: [repoPath("src/index.ts")],
				reached_files: [repoPath("src/index.ts")],
			}),
		},
		files: {
			[repoPath("src/index.ts")]: createFileView({
				covering_anchor_ids: [anchorId("QA-001")],
				supported_local_targets: [],
			}),
		},
		traceability_metrics: minimalTraceabilityMetrics(),
		findings: [createStaleMappingAnchorFinding({ anchor_id: anchorId("QA-999") })],
	});

	assert.deepEqual(Object.keys(result), [
		"schema_version",
		"config",
		"analysis_health",
		"observed_anchors",
		"stored_mappings",
		"files",
		"traceability_metrics",
		"findings",
	]);
	assert.equal(result.schema_version, 5);
	assert.equal(result.analysis_health, "degraded");
});

test("constructs closed nested output views with contract fields", () => {
	const config = createConfigView({
		product_root: repoPath("src"),
		spec_roots: [repoPath("specs/z"), repoPath("specs/a")],
		ignore_roots: [repoPath("tmp"), repoPath("dist")],
	});
	const observedAnchor = createObservedAnchorView({
		spec_path: repoPath("specs/a.md"),
		mapping_state: "absent",
		source: markdownSourceLocation(),
	});
	const storedMapping = createStoredMappingView({
		state: "usable",
		seed_files: [repoPath("src/z.ts"), repoPath("src/a.ts")],
		reached_files: [repoPath("src/b.ts"), repoPath("src/a.ts")],
	});
	const file = createFileView({
		covering_anchor_ids: [anchorId("QA-002"), anchorId("QA-001")],
		supported_local_targets: [repoPath("src/z.ts"), repoPath("src/a.ts")],
	});

	assert.deepEqual(Object.keys(config), [
		"version",
		"product_root",
		"spec_roots",
		"ignore_roots",
		"tsconfig_path",
		"local_aliases",
	]);
	assert.deepEqual(config.spec_roots.map(repoPathToString), ["specs/a", "specs/z"]);
	assert.deepEqual(config.ignore_roots.map(repoPathToString), ["dist", "tmp"]);
	assert.equal(config.tsconfig_path, null);
	assert.deepEqual(config.local_aliases, []);
	assert.deepEqual(Object.keys(observedAnchor), ["spec_path", "mapping_state", "source"]);
	assert.deepEqual(Object.keys(storedMapping), ["state", "seed_files", "reached_files"]);
	assert.deepEqual(storedMapping.seed_files.map(repoPathToString), ["src/a.ts", "src/z.ts"]);
	assert.deepEqual(storedMapping.reached_files.map(repoPathToString), ["src/a.ts", "src/b.ts"]);
	assert.deepEqual(Object.keys(file), ["covering_anchor_ids", "supported_local_targets"]);
	assert.deepEqual(file.covering_anchor_ids, [anchorId("QA-001"), anchorId("QA-002")]);
	assert.deepEqual(file.supported_local_targets.map(repoPathToString), ["src/a.ts", "src/z.ts"]);

	const metrics = createTraceabilityMetricsView({
		summary: {
			product_file_count: 2,
			stored_mapping_count: 2,
			usable_mapping_count: 1,
			observed_anchor_count: 2,
			active_anchor_count: 2,
			draft_anchor_count: 0,
			covered_product_file_count: 1,
			uncovered_product_file_count: 1,
			directly_seeded_product_file_count: 1,
			single_cover_product_file_count: 1,
			multi_cover_product_file_count: 0,
		},
		anchors: {
			[anchorId("QA-002")]: emptyAnchorTraceabilityMetrics(),
			[anchorId("QA-001")]: emptyAnchorTraceabilityMetrics(),
		},
	});
	assert.deepEqual(Object.keys(metrics), ["summary", "anchors"]);
	assert.deepEqual(Object.keys(metrics.summary), [
		"product_file_count",
		"stored_mapping_count",
		"usable_mapping_count",
		"observed_anchor_count",
		"active_anchor_count",
		"draft_anchor_count",
		"covered_product_file_count",
		"uncovered_product_file_count",
		"directly_seeded_product_file_count",
		"single_cover_product_file_count",
		"multi_cover_product_file_count",
	]);
	assert.deepEqual(Object.keys(metrics.anchors), [anchorId("QA-001"), anchorId("QA-002")]);
});

test("canonicalizes config local alias state", () => {
	const config = createConfigView({
		product_root: repoPath("src"),
		spec_roots: [repoPath("specs")],
		ignore_roots: [],
		tsconfig_path: repoPath("tsconfig.json"),
		local_aliases: [
			{ prefix: "#/", target: "src/hash/" },
			{ prefix: "@/feature/", target: "src/feature/" },
			{ prefix: "@/", target: "src/" },
			{ prefix: "@/feature/", target: "src/a/" },
		],
	});

	assert.equal(config.tsconfig_path, repoPath("tsconfig.json"));
	assert.deepEqual(config.local_aliases, [
		{ prefix: "@/feature/", target: "src/a/" },
		{ prefix: "@/feature/", target: "src/feature/" },
		{ prefix: "#/", target: "src/hash/" },
		{ prefix: "@/", target: "src/" },
	]);
});

test("clears reached files for non-usable stored mappings", () => {
	for (const state of ["invalid", "stale"] as const) {
		const storedMapping = createStoredMappingView({
			state,
			seed_files: [repoPath("src/z.ts"), repoPath("src/a.ts")],
			reached_files: [repoPath("src/reached.ts")],
		});

		assert.deepEqual(storedMapping.seed_files.map(repoPathToString), ["src/a.ts", "src/z.ts"]);
		assert.deepEqual(storedMapping.reached_files, [], state);
	}
});

test("canonicalizes scan result record key order", () => {
	const result = createScanResultView({
		config: createConfigView({
			product_root: repoPath("src"),
			spec_roots: [repoPath("specs")],
			ignore_roots: [],
		}),
		observed_anchors: {
			[anchorId("QA-002")]: createObservedAnchorView({
				spec_path: repoPath("specs/b.md"),
				mapping_state: "absent",
				source: markdownSourceLocation(),
			}),
			[anchorId("QA-001")]: createObservedAnchorView({
				spec_path: repoPath("specs/a.md"),
				mapping_state: "usable",
				source: markdownSourceLocation(),
			}),
		},
		stored_mappings: {
			[anchorId("QA-002")]: createStoredMappingView({
				state: "stale",
				seed_files: [repoPath("src/b.ts")],
				reached_files: [],
			}),
			[anchorId("QA-001")]: createStoredMappingView({
				state: "usable",
				seed_files: [repoPath("src/a.ts")],
				reached_files: [repoPath("src/a.ts")],
			}),
		},
		files: {
			[repoPath("src/z.ts")]: createFileView({
				covering_anchor_ids: [],
				supported_local_targets: [],
			}),
			[repoPath("src/a.ts")]: createFileView({
				covering_anchor_ids: [anchorId("QA-001")],
				supported_local_targets: [],
			}),
		},
		traceability_metrics: createTraceabilityMetricsView({
			summary: minimalTraceabilityMetrics().summary,
			anchors: {
				[anchorId("QA-002")]: emptyAnchorTraceabilityMetrics(),
				[anchorId("QA-001")]: emptyAnchorTraceabilityMetrics(),
			},
		}),
		findings: [],
	});

	assert.deepEqual(Object.keys(result.observed_anchors), [anchorId("QA-001"), anchorId("QA-002")]);
	assert.deepEqual(Object.keys(result.stored_mappings), [anchorId("QA-001"), anchorId("QA-002")]);
	assert.deepEqual(Object.keys(result.files), [repoPath("src/a.ts"), repoPath("src/z.ts")]);
	assert.deepEqual(Object.keys(result.traceability_metrics.anchors), [
		anchorId("QA-001"),
		anchorId("QA-002"),
	]);
});

test("typed view construction rejects extra fields", () => {
	const fieldsWithExtraKey = {
		spec_path: repoPath("specs/a.md"),
		mapping_state: "usable" as const,
		source: markdownSourceLocation(),
		unexpected: "not_contract",
	};

	// @ts-expect-error view constructors are closed over their normative fields.
	createObservedAnchorView(fieldsWithExtraKey);
});

test("typed observed anchor construction requires source for schema v5", () => {
	const fieldsWithoutSource = {
		spec_path: repoPath("specs/a.md"),
		mapping_state: "usable" as const,
	};

	// @ts-expect-error scan v5 observed anchors require source.
	createObservedAnchorView(fieldsWithoutSource);
});

test("rejects source-less observed anchors before stamping schema v5", () => {
	const sourceLessFields = {
		config: createConfigView({
			product_root: repoPath("src"),
			spec_roots: [repoPath("specs")],
			ignore_roots: [],
		}),
		observed_anchors: {
			[anchorId("QA-001")]: {
				spec_path: repoPath("specs/a.md"),
				mapping_state: "usable",
			},
		},
		stored_mappings: {},
		files: {},
		traceability_metrics: minimalTraceabilityMetrics(),
		findings: [],
	} as unknown as ScanResultViewFields;

	assert.throws(
		() => createScanResultView(sourceLessFields),
		/Cannot create schema v5 scan result without source for QA-001/,
	);
});

function degradingFindings(): Finding[] {
	return [
		createStaleMappingAnchorFinding({ anchor_id: anchorId("QA-001") }),
		createBrokenSeedPathFinding({
			anchor_id: anchorId("QA-001"),
			seed_path: repoPath("src/missing.ts"),
		}),
		createUnresolvedStaticEdgeFinding({
			importer: repoPath("src/importer.ts"),
			specifier: "./missing",
		}),
		createUnsupportedStaticEdgeFinding({
			importer: repoPath("src/importer.ts"),
			syntax_kind: "dynamic_import",
			specifier: "./late",
		}),
		createOutOfScopeStaticEdgeFinding({
			importer: repoPath("src/importer.ts"),
			target_path: repoPath("outside/target.ts"),
		}),
		createUnsupportedLocalTargetFinding({
			importer: repoPath("src/importer.ts"),
			target_path: repoPath("src/view.tsx"),
		}),
	];
}

function minimalTraceabilityMetrics() {
	return createTraceabilityMetricsView({
		summary: {
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
		},
		anchors: {},
	});
}

function emptyAnchorTraceabilityMetrics() {
	return {
		seed_file_count: 0,
		direct_seed_file_count: 0,
		reached_file_count: 0,
		transitive_reached_file_count: 0,
		unique_reached_file_count: 0,
		shared_reached_file_count: 0,
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
	return result.anchorId;
}

function repoPath(value: string): RepoPath {
	const result = validateRepoPath(value);
	assert.equal(result.kind, "ok");
	return result.repoPath;
}
