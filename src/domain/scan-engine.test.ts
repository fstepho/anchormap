import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { Config } from "../infra/config-io";
import type { SpecIndex } from "../infra/spec-index";
import type { ProductGraph } from "../infra/ts-graph";
import type { AnchorId } from "./anchor-id";
import { validateAnchorId } from "./anchor-id";
import { createUnresolvedStaticEdgeFinding } from "./finding";
import type { RepoPath } from "./repo-path";
import { validateRepoPath } from "./repo-path";
import { runScanEngine } from "./scan-engine";

test("classifies usable stored mappings and observed anchors", () => {
	const result = runScanEngine({
		config: configWithMappings({
			[anchorId("FR-014")]: {
				seedFiles: [repoPath("src/index.ts")],
			},
		}),
		specIndex: specIndexWithAnchors([observedAnchor("FR-014")]),
		productGraph: minimalProductGraph(),
	});

	assert.equal(result.analysis_health, "clean");
	assert.deepEqual(result.findings, []);
	assert.deepEqual(result.observed_anchors[anchorId("FR-014")], {
		spec_path: repoPath("specs/requirements.md"),
		mapping_state: "usable",
	});
	assert.deepEqual(result.stored_mappings[anchorId("FR-014")], {
		state: "usable",
		seed_files: [repoPath("src/index.ts")],
		reached_files: [repoPath("src/index.ts")],
	});
	assert.deepEqual(result.files[repoPath("src/index.ts")].covering_anchor_ids, [
		anchorId("FR-014"),
	]);
});

test("calculates sorted transitive reached files from sorted seeds and targets", () => {
	const result = runScanEngine({
		config: configWithMappings({
			[anchorId("FR-014")]: {
				seedFiles: [repoPath("src/z.ts"), repoPath("src/a.ts")],
			},
		}),
		specIndex: specIndexWithAnchors([observedAnchor("FR-014")]),
		productGraph: productGraphWithFiles(
			[
				repoPath("src/a.ts"),
				repoPath("src/b.ts"),
				repoPath("src/c.ts"),
				repoPath("src/d.ts"),
				repoPath("src/z.ts"),
			],
			[
				[repoPath("src/a.ts"), [repoPath("src/c.ts"), repoPath("src/b.ts")]],
				[repoPath("src/b.ts"), [repoPath("src/d.ts")]],
				[repoPath("src/c.ts"), [repoPath("src/d.ts"), repoPath("src/not-discovered.ts")]],
			],
		),
	});

	assert.deepEqual(result.stored_mappings[anchorId("FR-014")], {
		state: "usable",
		seed_files: [repoPath("src/a.ts"), repoPath("src/z.ts")],
		reached_files: [
			repoPath("src/a.ts"),
			repoPath("src/b.ts"),
			repoPath("src/c.ts"),
			repoPath("src/d.ts"),
			repoPath("src/z.ts"),
		],
	});
	assert.deepEqual(result.files[repoPath("src/not-discovered.ts")], undefined);
	assert.deepEqual(result.files[repoPath("src/d.ts")].covering_anchor_ids, [anchorId("FR-014")]);
});

test("accumulates sorted covering anchor ids for overlapping closures", () => {
	const result = runScanEngine({
		config: configWithMappings({
			[anchorId("FR-020")]: {
				seedFiles: [repoPath("src/right.ts")],
			},
			[anchorId("FR-010")]: {
				seedFiles: [repoPath("src/left.ts")],
			},
		}),
		specIndex: specIndexWithAnchors([observedAnchor("FR-020"), observedAnchor("FR-010")]),
		productGraph: productGraphWithFiles(
			[repoPath("src/left.ts"), repoPath("src/right.ts"), repoPath("src/shared.ts")],
			[
				[repoPath("src/left.ts"), [repoPath("src/shared.ts")]],
				[repoPath("src/right.ts"), [repoPath("src/shared.ts")]],
			],
		),
	});

	assert.deepEqual(result.files[repoPath("src/shared.ts")].covering_anchor_ids, [
		anchorId("FR-010"),
		anchorId("FR-020"),
	]);
});

test("terminates deterministically on supported graph cycles", () => {
	const result = runScanEngine({
		config: configWithMappings({
			[anchorId("FR-014")]: {
				seedFiles: [repoPath("src/a.ts")],
			},
		}),
		specIndex: specIndexWithAnchors([observedAnchor("FR-014")]),
		productGraph: productGraphWithFiles(
			[repoPath("src/a.ts"), repoPath("src/b.ts"), repoPath("src/c.ts")],
			[
				[repoPath("src/a.ts"), [repoPath("src/b.ts")]],
				[repoPath("src/b.ts"), [repoPath("src/a.ts"), repoPath("src/c.ts")]],
				[repoPath("src/c.ts"), [repoPath("src/b.ts")]],
			],
		),
	});

	assert.deepEqual(result.stored_mappings[anchorId("FR-014")].reached_files, [
		repoPath("src/a.ts"),
		repoPath("src/b.ts"),
		repoPath("src/c.ts"),
	]);
});

test("emits unmapped_anchor for observed anchors without stored mappings", () => {
	const result = runScanEngine({
		config: minimalConfig(),
		specIndex: specIndexWithAnchors([observedAnchor("FR-014")]),
		productGraph: minimalProductGraph(),
	});

	assert.equal(result.analysis_health, "clean");
	assert.deepEqual(result.observed_anchors[anchorId("FR-014")], {
		spec_path: repoPath("specs/requirements.md"),
		mapping_state: "absent",
	});
	assert.deepEqual(result.stored_mappings, {});
	assert.deepEqual(result.findings, [
		{
			kind: "unmapped_anchor",
			anchor_id: anchorId("FR-014"),
		},
	]);
});

test("emits broken_seed_path per invalid seed for observed invalid mappings", () => {
	const result = runScanEngine({
		config: configWithMappings({
			[anchorId("FR-014")]: {
				seedFiles: [
					repoPath("src/index.ts"),
					repoPath("src/missing.ts"),
					repoPath("test/helper.ts"),
				],
			},
		}),
		specIndex: specIndexWithAnchors([observedAnchor("FR-014")]),
		productGraph: minimalProductGraph(),
	});

	assert.equal(result.analysis_health, "degraded");
	assert.deepEqual(result.observed_anchors[anchorId("FR-014")].mapping_state, "invalid");
	assert.deepEqual(result.stored_mappings[anchorId("FR-014")], {
		state: "invalid",
		seed_files: [repoPath("src/index.ts"), repoPath("src/missing.ts"), repoPath("test/helper.ts")],
		reached_files: [],
	});
	assert.deepEqual(result.files[repoPath("src/index.ts")].covering_anchor_ids, []);
	assert.deepEqual(result.findings, [
		{
			kind: "broken_seed_path",
			anchor_id: anchorId("FR-014"),
			seed_path: repoPath("src/missing.ts"),
		},
		{
			kind: "broken_seed_path",
			anchor_id: anchorId("FR-014"),
			seed_path: repoPath("test/helper.ts"),
		},
	]);
});

test("emits exactly one stale mapping finding and skips invalid stale seeds", () => {
	const result = runScanEngine({
		config: configWithMappings({
			[anchorId("FR-999")]: {
				seedFiles: [repoPath("src/missing.ts"), repoPath("test/helper.ts")],
			},
		}),
		specIndex: specIndexWithAnchors([observedAnchor("FR-014")]),
		productGraph: minimalProductGraph(),
	});

	assert.equal(result.analysis_health, "degraded");
	assert.deepEqual(result.observed_anchors[anchorId("FR-014")].mapping_state, "absent");
	assert.deepEqual(result.stored_mappings[anchorId("FR-999")], {
		state: "stale",
		seed_files: [repoPath("src/missing.ts"), repoPath("test/helper.ts")],
		reached_files: [],
	});
	assert.deepEqual(result.findings, [
		{
			kind: "stale_mapping_anchor",
			anchor_id: anchorId("FR-999"),
		},
		{
			kind: "unmapped_anchor",
			anchor_id: anchorId("FR-014"),
		},
	]);
});

test("preserves and normalizes graph findings with mapping findings", () => {
	const result = runScanEngine({
		config: minimalConfig(),
		specIndex: specIndexWithAnchors([observedAnchor("FR-014")]),
		productGraph: {
			...minimalProductGraph(),
			graphFindings: [
				createUnresolvedStaticEdgeFinding({
					importer: repoPath("src/index.ts"),
					specifier: "./missing",
				}),
			],
		},
	});

	assert.equal(result.analysis_health, "degraded");
	assert.deepEqual(
		result.findings.map((finding) => finding.kind),
		["unmapped_anchor", "unresolved_static_edge"],
	);
});

test("emits untraced_product_file for uncovered product files in otherwise clean analysis", () => {
	const result = runScanEngine({
		config: configWithMappings({
			[anchorId("FR-014")]: {
				seedFiles: [repoPath("src/index.ts")],
			},
		}),
		specIndex: specIndexWithAnchors([observedAnchor("FR-014")]),
		productGraph: productGraphWithFiles([repoPath("src/index.ts"), repoPath("src/unused.ts")]),
	});

	assert.equal(result.analysis_health, "clean");
	assert.deepEqual(result.files[repoPath("src/unused.ts")].covering_anchor_ids, []);
	assert.deepEqual(result.findings, [
		{
			kind: "untraced_product_file",
			path: repoPath("src/unused.ts"),
		},
	]);
});

test("suppresses untraced_product_file when any observed anchor is unmapped", () => {
	const result = runScanEngine({
		config: configWithMappings({
			[anchorId("FR-014")]: {
				seedFiles: [repoPath("src/index.ts")],
			},
		}),
		specIndex: specIndexWithAnchors([observedAnchor("FR-014"), observedAnchor("FR-020")]),
		productGraph: productGraphWithFiles([repoPath("src/index.ts"), repoPath("src/unused.ts")]),
	});

	assert.equal(result.analysis_health, "clean");
	assert.deepEqual(result.files[repoPath("src/unused.ts")].covering_anchor_ids, []);
	assert.deepEqual(result.findings, [
		{
			kind: "unmapped_anchor",
			anchor_id: anchorId("FR-020"),
		},
	]);
});

test("suppresses untraced_product_file when analysis is degraded", () => {
	const result = runScanEngine({
		config: configWithMappings({
			[anchorId("FR-014")]: {
				seedFiles: [repoPath("src/index.ts")],
			},
		}),
		specIndex: specIndexWithAnchors([observedAnchor("FR-014")]),
		productGraph: {
			...productGraphWithFiles([repoPath("src/index.ts"), repoPath("src/unused.ts")]),
			graphFindings: [
				createUnresolvedStaticEdgeFinding({
					importer: repoPath("src/index.ts"),
					specifier: "./missing",
				}),
			],
		},
	});

	assert.equal(result.analysis_health, "degraded");
	assert.deepEqual(result.files[repoPath("src/unused.ts")].covering_anchor_ids, []);
	assert.deepEqual(result.findings, [
		{
			kind: "unresolved_static_edge",
			importer: repoPath("src/index.ts"),
			specifier: "./missing",
		},
	]);
});

function minimalConfig(): Config {
	return {
		version: 1,
		productRoot: repoPath("src"),
		specRoots: [repoPath("specs")],
		ignoreRoots: [],
		mappings: {},
	};
}

function specIndexWithAnchors(anchors: readonly ReturnType<typeof observedAnchor>[]): SpecIndex {
	return {
		specFiles: [],
		observedAnchors: new Map(anchors.map((anchor) => [anchor.anchorId, anchor])),
		anchorOccurrences: anchors,
	};
}

function observedAnchor(value: string): {
	readonly anchorId: AnchorId;
	readonly specPath: RepoPath;
	readonly sourceKind: "markdown";
} {
	return {
		anchorId: anchorId(value),
		specPath: repoPath("specs/requirements.md"),
		sourceKind: "markdown",
	};
}

function configWithMappings(mappings: Config["mappings"]): Config {
	return {
		...minimalConfig(),
		mappings,
	};
}

function minimalProductGraph(): ProductGraph {
	return {
		productFiles: [repoPath("src/index.ts")],
		parsedFiles: [],
		edgesByImporter: new Map(),
		graphFindings: [],
	};
}

function productGraphWithFiles(
	productFiles: readonly RepoPath[],
	edges: readonly (readonly [RepoPath, readonly RepoPath[]])[] = [],
): ProductGraph {
	return {
		productFiles,
		parsedFiles: [],
		edgesByImporter: new Map(edges),
		graphFindings: [],
	};
}

function repoPath(value: string): RepoPath {
	const result = validateRepoPath(value);
	assert.equal(result.kind, "ok");
	return result.repoPath;
}

function anchorId(value: string): AnchorId {
	const result = validateAnchorId(value);
	assert.equal(result.kind, "ok");
	return result.anchorId;
}
