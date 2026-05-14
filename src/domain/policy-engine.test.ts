import { strict as assert } from "node:assert";
import { test } from "node:test";
import { evaluatePolicy, type Policy } from "./policy-engine";
import type { RepoPath } from "./repo-path";
import type { ScanResultView } from "./scan-result";

test("passes when no supported policy rule is violated", () => {
	const result = evaluatePolicy(
		scanFixture({
			productFileCount: 2,
			coveredProductFileCount: 2,
			uncoveredProductFileCount: 0,
			findings: [],
		}),
		{
			version: 1,
			fail_on: { analysis_health: "degraded", finding_kinds: ["untraced_product_file"] },
			thresholds: {
				min_covered_product_file_percent: 100,
				max_untraced_product_files: 0,
			},
		},
	);

	assert.equal(result.decision, "pass");
	assert.deepEqual(result.violations, []);
	assert.deepEqual(result.summary, {
		observed_anchor_count: 1,
		usable_mapping_count: 1,
		product_file_count: 2,
		covered_product_file_count: 2,
		uncovered_product_file_count: 0,
		covered_product_file_percent: 100,
		untraced_product_file_count: 0,
	});
});

test("fails deterministically for degraded health, finding kinds, and thresholds", () => {
	const policy: Policy = {
		version: 1,
		fail_on: {
			analysis_health: "degraded",
			finding_kinds: ["untraced_product_file", "unsupported_static_edge"],
		},
		thresholds: {
			min_covered_product_file_percent: 75,
			max_untraced_product_files: 0,
		},
	};

	const result = evaluatePolicy(
		scanFixture({
			analysisHealth: "degraded",
			productFileCount: 3,
			coveredProductFileCount: 1,
			uncoveredProductFileCount: 2,
			findings: [
				{ kind: "untraced_product_file", path: repoPath("src/b.ts") },
				{
					kind: "unsupported_static_edge",
					importer: repoPath("src/a.ts"),
					syntax_kind: "dynamic_import",
					specifier: "./x",
				},
				{ kind: "untraced_product_file", path: repoPath("src/c.ts") },
			],
		}),
		policy,
	);

	assert.equal(result.decision, "fail");
	assert.deepEqual(result.violations, [
		{ kind: "analysis_health_degraded" },
		{ kind: "covered_product_file_percent_below_threshold", actual: 33, threshold: 75 },
		{ kind: "finding_kind_present", finding_kind: "unsupported_static_edge", count: 1 },
		{ kind: "finding_kind_present", finding_kind: "untraced_product_file", count: 2 },
		{ kind: "untraced_product_files_above_threshold", actual: 2, threshold: 0 },
	]);
	assert.equal(result.summary.covered_product_file_percent, 33);
	assert.equal(result.summary.untraced_product_file_count, 2);
});

test("treats empty product sets as fully covered for percent policy", () => {
	const result = evaluatePolicy(
		scanFixture({
			productFileCount: 0,
			coveredProductFileCount: 0,
			uncoveredProductFileCount: 0,
			findings: [],
		}),
		{ version: 1, thresholds: { min_covered_product_file_percent: 100 } },
	);

	assert.equal(result.decision, "pass");
	assert.equal(result.summary.covered_product_file_percent, 100);
});

function scanFixture(input: {
	readonly analysisHealth?: "clean" | "degraded";
	readonly productFileCount: number;
	readonly coveredProductFileCount: number;
	readonly uncoveredProductFileCount: number;
	readonly findings: ScanResultView["findings"];
}): ScanResultView {
	return {
		schema_version: 4,
		config: {
			version: 1,
			product_root: repoPath("src"),
			spec_roots: [repoPath("specs")],
			ignore_roots: [],
			tsconfig_path: null,
			local_aliases: [],
		},
		analysis_health: input.analysisHealth ?? "clean",
		observed_anchors: {},
		stored_mappings: {},
		files: {},
		traceability_metrics: {
			summary: {
				product_file_count: input.productFileCount,
				stored_mapping_count: 1,
				usable_mapping_count: 1,
				observed_anchor_count: 1,
				active_anchor_count: 1,
				draft_anchor_count: 0,
				covered_product_file_count: input.coveredProductFileCount,
				uncovered_product_file_count: input.uncoveredProductFileCount,
				directly_seeded_product_file_count: 1,
				single_cover_product_file_count: input.coveredProductFileCount,
				multi_cover_product_file_count: 0,
			},
			anchors: {},
		},
		findings: input.findings,
	};
}

function repoPath(value: string): RepoPath {
	return value as RepoPath;
}
