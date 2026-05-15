import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { AnchorId } from "./anchor-id";
import { validateAnchorId } from "./anchor-id";
import { diffScanResults } from "./diff-engine";
import {
	createStaleMappingAnchorFinding,
	createUnmappedAnchorFinding,
	createUntracedProductFileFinding,
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
	type ObservedAnchorsV5View,
	type ScanResultView,
	type TraceabilitySummaryView,
} from "./scan-result";

test("computes same-scope scan deltas in canonical order", () => {
	const base = scan({
		configSpecRoots: [repoPath("specs/b"), repoPath("specs/a")],
		observed_anchors: {
			[anchorId("QA-001")]: createObservedAnchorView({
				spec_path: repoPath("specs/a.md"),
				mapping_state: "absent",
				source: markdownSourceLocation(1),
			}),
			[anchorId("QA-002")]: createObservedAnchorView({
				spec_path: repoPath("specs/b.md"),
				mapping_state: "usable",
				source: markdownSourceLocation(2),
			}),
		},
		stored_mappings: {
			[anchorId("QA-001")]: createStoredMappingView({
				state: "invalid",
				seed_files: [repoPath("src/a.ts")],
				reached_files: [],
			}),
			[anchorId("QA-999")]: createStoredMappingView({
				state: "stale",
				seed_files: [repoPath("src/old.ts")],
				reached_files: [],
			}),
		},
		files: {
			[repoPath("src/a.ts")]: createFileView({
				covering_anchor_ids: [],
				supported_local_targets: [repoPath("src/b.ts")],
			}),
			[repoPath("src/covered.ts")]: createFileView({
				covering_anchor_ids: [anchorId("QA-002")],
				supported_local_targets: [],
			}),
			[repoPath("src/removed.ts")]: createFileView({
				covering_anchor_ids: [],
				supported_local_targets: [],
			}),
		},
		summary: {
			product_file_count: 3,
			stored_mapping_count: 2,
			usable_mapping_count: 0,
			observed_anchor_count: 2,
			active_anchor_count: 2,
			draft_anchor_count: 0,
			covered_product_file_count: 1,
			uncovered_product_file_count: 2,
			directly_seeded_product_file_count: 0,
			single_cover_product_file_count: 1,
			multi_cover_product_file_count: 0,
		},
		findings: [
			createUnmappedAnchorFinding({ anchor_id: anchorId("QA-001") }),
			createStaleMappingAnchorFinding({ anchor_id: anchorId("QA-999") }),
		],
	});
	const head = scan({
		configSpecRoots: [repoPath("specs/a"), repoPath("specs/b")],
		observed_anchors: {
			[anchorId("QA-001")]: createObservedAnchorView({
				spec_path: repoPath("specs/a.md"),
				mapping_state: "usable",
				source: markdownSourceLocation(1),
			}),
			[anchorId("QA-003")]: createObservedAnchorView({
				spec_path: repoPath("specs/c.md"),
				mapping_state: "draft",
				source: markdownSourceLocation(3),
			}),
		},
		stored_mappings: {
			[anchorId("QA-001")]: createStoredMappingView({
				state: "usable",
				seed_files: [repoPath("src/a.ts")],
				reached_files: [repoPath("src/a.ts")],
			}),
			[anchorId("QA-003")]: createStoredMappingView({
				state: "usable",
				seed_files: [repoPath("src/new.ts")],
				reached_files: [repoPath("src/new.ts")],
			}),
		},
		files: {
			[repoPath("src/a.ts")]: createFileView({
				covering_anchor_ids: [anchorId("QA-001")],
				supported_local_targets: [repoPath("src/c.ts")],
			}),
			[repoPath("src/covered.ts")]: createFileView({
				covering_anchor_ids: [],
				supported_local_targets: [],
			}),
			[repoPath("src/new.ts")]: createFileView({
				covering_anchor_ids: [anchorId("QA-003")],
				supported_local_targets: [],
			}),
		},
		summary: {
			product_file_count: 3,
			stored_mapping_count: 2,
			usable_mapping_count: 2,
			observed_anchor_count: 2,
			active_anchor_count: 1,
			draft_anchor_count: 1,
			covered_product_file_count: 2,
			uncovered_product_file_count: 1,
			directly_seeded_product_file_count: 2,
			single_cover_product_file_count: 2,
			multi_cover_product_file_count: 0,
		},
		findings: [
			createUntracedProductFileFinding({ path: repoPath("src/covered.ts") }),
			createUnmappedAnchorFinding({ anchor_id: anchorId("QA-003") }),
		],
	});

	const diff = diffScanResults(base, head);

	assert.deepEqual(diff.anchors, {
		added: [anchorId("QA-003")],
		removed: [anchorId("QA-002")],
		mapping_state_changed: [{ anchor_id: anchorId("QA-001"), from: "absent", to: "usable" }],
	});
	assert.deepEqual(diff.mappings, {
		added: [anchorId("QA-003")],
		removed: [anchorId("QA-999")],
		state_changed: [{ anchor_id: anchorId("QA-001"), from: "invalid", to: "usable" }],
	});
	assert.deepEqual(diff.files, {
		added: ["src/new.ts"],
		removed: ["src/removed.ts"],
		became_covered: ["src/a.ts"],
		lost_coverage: ["src/covered.ts"],
		covering_anchor_ids_changed: [
			{ path: "src/a.ts", from: [], to: [anchorId("QA-001")] },
			{ path: "src/covered.ts", from: [anchorId("QA-002")], to: [] },
		],
		supported_local_targets_changed: [{ path: "src/a.ts", from: ["src/b.ts"], to: ["src/c.ts"] }],
	});
	assert.equal(diff.comparability, "same_scope");
	assert.deepEqual(diff.metrics_delta, {
		product_file_count: 0,
		stored_mapping_count: 0,
		usable_mapping_count: 2,
		observed_anchor_count: 0,
		active_anchor_count: -1,
		draft_anchor_count: 1,
		covered_product_file_count: 1,
		uncovered_product_file_count: -1,
		directly_seeded_product_file_count: 2,
		single_cover_product_file_count: 1,
		multi_cover_product_file_count: 0,
	});
	assert.deepEqual(diff.findings.added, [
		createUnmappedAnchorFinding({ anchor_id: anchorId("QA-003") }),
		createUntracedProductFileFinding({ path: repoPath("src/covered.ts") }),
	]);
	assert.deepEqual(diff.findings.removed, [
		createStaleMappingAnchorFinding({ anchor_id: anchorId("QA-999") }),
		createUnmappedAnchorFinding({ anchor_id: anchorId("QA-001") }),
	]);
});

test("reports scope changes without suppressing the diff", () => {
	const base = scan({ configProductRoot: repoPath("src") });
	const head = scan({ configProductRoot: repoPath("app") });

	const diff = diffScanResults(base, head);

	assert.equal(diff.comparability, "scope_changed");
	assert.equal(diff.base_scan_schema_version, 5);
	assert.equal(diff.head_scan_schema_version, 5);
});

function scan(
	input: {
		readonly configProductRoot?: RepoPath;
		readonly configSpecRoots?: readonly RepoPath[];
		readonly observed_anchors?: ObservedAnchorsV5View;
		readonly stored_mappings?: ScanResultView["stored_mappings"];
		readonly files?: ScanResultView["files"];
		readonly summary?: TraceabilitySummaryView;
		readonly findings?: ScanResultView["findings"];
	} = {},
): ScanResultView {
	return createScanResultView({
		config: createConfigView({
			product_root: input.configProductRoot ?? repoPath("src"),
			spec_roots: input.configSpecRoots ?? [repoPath("specs")],
			ignore_roots: [],
		}),
		observed_anchors: input.observed_anchors ?? {},
		stored_mappings: input.stored_mappings ?? {},
		files: input.files ?? {},
		traceability_metrics: createTraceabilityMetricsView({
			summary: input.summary ?? emptySummary(),
			anchors: {},
		}),
		findings: input.findings ?? [],
	});
}

function emptySummary(): TraceabilitySummaryView {
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

function markdownSourceLocation(line: number) {
	return {
		kind: "markdown_atx_heading" as const,
		line,
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
