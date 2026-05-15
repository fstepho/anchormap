import { strict as assert } from "node:assert";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { createTempRepo, minimalScanArtifactJson } from "../cli/commands-test-support";
import {
	loadPolicyResultArtifact,
	loadScanArtifact,
	loadTraceabilityDiffArtifact,
	parsePolicyResultArtifactJson,
	parseScanArtifactJson,
	parseTraceabilityDiffArtifactJson,
} from "./artifact-io";

test("parses a supported scan schema v4 artifact", () => {
	const result = parseScanArtifactJson(minimalScanArtifactJson());

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.equal(result.scan.schema_version, 4);
		assert.equal(result.scan.config.product_root, "src");
	}
});

test("parses a supported closed scan schema v5 artifact with source locations", () => {
	const scan = JSON.parse(minimalScanArtifactJson());
	scan.schema_version = 5;
	scan.observed_anchors = {
		"QA-001": {
			spec_path: "specs/requirements.md",
			mapping_state: "absent",
			source: {
				kind: "markdown_atx_heading",
				line: 2,
				column: 5,
				heading_level: 3,
			},
		},
		"QA-002": {
			spec_path: "specs/metadata.yaml",
			mapping_state: "absent",
			source: {
				kind: "yaml_root_id",
				line: 4,
				column: 7,
			},
		},
	};

	const result = parseScanArtifactJson(JSON.stringify(scan));

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.equal(result.scan.schema_version, 5);
		const markdownAnchor = Object.values(result.scan.observed_anchors).find(
			(anchor) => anchor.spec_path === "specs/requirements.md",
		);
		const yamlAnchor = Object.values(result.scan.observed_anchors).find(
			(anchor) => anchor.spec_path === "specs/metadata.yaml",
		);
		assert.deepEqual(markdownAnchor?.source, {
			kind: "markdown_atx_heading",
			line: 2,
			column: 5,
			heading_level: 3,
		});
		assert.deepEqual(yamlAnchor?.source, {
			kind: "yaml_root_id",
			line: 4,
			column: 7,
		});
	}
});

test("rejects invalid JSON, unknown scan schema versions, and open scan objects", () => {
	const unknownSchema = JSON.parse(minimalScanArtifactJson());
	unknownSchema.schema_version = 6;
	const cases = [
		{ name: "invalid JSON", text: "{" },
		{ name: "unknown schema", text: JSON.stringify(unknownSchema) },
		{
			name: "open root object",
			text: JSON.stringify({ ...JSON.parse(minimalScanArtifactJson()), extra: true }),
		},
		{
			name: "open nested object",
			text: JSON.stringify({
				...JSON.parse(minimalScanArtifactJson()),
				config: { ...JSON.parse(minimalScanArtifactJson()).config, extra: true },
			}),
		},
		{
			name: "v5 missing source",
			text: JSON.stringify({
				...JSON.parse(minimalScanArtifactJson()),
				schema_version: 5,
				observed_anchors: {
					"QA-001": {
						spec_path: "specs/requirements.md",
						mapping_state: "absent",
					},
				},
			}),
		},
		{
			name: "v5 open source",
			text: JSON.stringify({
				...JSON.parse(minimalScanArtifactJson()),
				schema_version: 5,
				observed_anchors: {
					"QA-001": {
						spec_path: "specs/requirements.md",
						mapping_state: "absent",
						source: {
							kind: "yaml_root_id",
							line: 1,
							column: 3,
							snippet: "QA-001",
						},
					},
				},
			}),
		},
	];

	for (const testCase of cases) {
		const result = parseScanArtifactJson(testCase.text);

		assert.equal(result.kind, "error", testCase.name);
		if (result.kind === "error") {
			assert.equal(result.error.kind, "UsageError", testCase.name);
		}
	}
});

test("loadScanArtifact rejects invalid paths, unreadable files, invalid UTF-8, and invalid schema", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "artifacts"));
		writeFileSync(join(cwd, "artifacts", "invalid-utf8.json"), Uint8Array.from([0xff]));
		writeFileSync(join(cwd, "artifacts", "unknown-schema.json"), '{"schema_version":3}\n');

		const cases = [
			{ name: "invalid path", path: "../scan.json" },
			{ name: "missing file", path: "artifacts/missing.json" },
			{ name: "invalid UTF-8", path: "artifacts/invalid-utf8.json" },
			{ name: "unknown schema", path: "artifacts/unknown-schema.json" },
		];

		for (const testCase of cases) {
			const result = loadScanArtifact(testCase.path, { cwd });

			assert.equal(result.kind, "error", testCase.name);
			if (result.kind === "error") {
				assert.equal(result.error.kind, "UsageError", testCase.name);
			}
		}
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("parses supported check and diff artifacts", () => {
	const policy = parsePolicyResultArtifactJson(policyResultArtifactJson());
	assert.equal(policy.kind, "ok");
	if (policy.kind === "ok") {
		assert.equal(policy.policyResult.schema_version, 1);
		assert.equal(policy.policyResult.decision, "fail");
		assert.equal(policy.policyResult.violations.length, 1);
	}

	const diff = parseTraceabilityDiffArtifactJson(traceabilityDiffArtifactJson());
	assert.equal(diff.kind, "ok");
	if (diff.kind === "ok") {
		assert.equal(diff.diff.schema_version, 1);
		assert.equal(diff.diff.files.lost_coverage[0], "src/lost.ts");
		assert.equal(diff.diff.metrics_delta.product_file_count, -1);
	}
});

test("load check and diff artifacts reject invalid paths, unreadable files, invalid JSON, and open objects", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "artifacts"));
		writeFileSync(join(cwd, "artifacts", "invalid.json"), "{");
		writeFileSync(join(cwd, "artifacts", "open-check.json"), '{"schema_version":1,"extra":true}\n');
		writeFileSync(join(cwd, "artifacts", "open-diff.json"), '{"schema_version":1,"extra":true}\n');

		const checkCases = [
			"../check.json",
			"artifacts/missing.json",
			"artifacts/invalid.json",
			"artifacts/open-check.json",
		];
		for (const path of checkCases) {
			const result = loadPolicyResultArtifact(path, { cwd });
			assert.equal(result.kind, "error", path);
			if (result.kind === "error") {
				assert.equal(result.error.kind, "UsageError", path);
			}
		}

		const diffCases = [
			"../diff.json",
			"artifacts/missing.json",
			"artifacts/invalid.json",
			"artifacts/open-diff.json",
		];
		for (const path of diffCases) {
			const result = loadTraceabilityDiffArtifact(path, { cwd });
			assert.equal(result.kind, "error", path);
			if (result.kind === "error") {
				assert.equal(result.error.kind, "UsageError", path);
			}
		}
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

function policyResultArtifactJson(): string {
	return [
		'{"schema_version":1,"decision":"fail","source_scan_schema_version":4,"analysis_health":"degraded","violations":[',
		'{"kind":"analysis_health_degraded"}',
		'],"summary":{"observed_anchor_count":1,"usable_mapping_count":0,"product_file_count":1,',
		'"covered_product_file_count":0,"uncovered_product_file_count":1,',
		'"covered_product_file_percent":0,"untraced_product_file_count":0}}\n',
	].join("");
}

function traceabilityDiffArtifactJson(): string {
	return [
		'{"schema_version":1,"base_scan_schema_version":4,"head_scan_schema_version":4,',
		'"comparability":"same_scope","analysis_health_change":{"from":"clean","to":"degraded"},',
		'"anchors":{"added":["QA-001"],"removed":[],"mapping_state_changed":[]},',
		'"mappings":{"added":[],"removed":[],"state_changed":[]},',
		'"files":{"added":[],"removed":[],"became_covered":[],"lost_coverage":["src/lost.ts"],',
		'"covering_anchor_ids_changed":[],"supported_local_targets_changed":[]},',
		'"findings":{"added":[{"kind":"unmapped_anchor","anchor_id":"QA-001"}],"removed":[]},',
		'"metrics_delta":{"product_file_count":-1,"stored_mapping_count":0,"usable_mapping_count":0,',
		'"observed_anchor_count":1,"active_anchor_count":1,"draft_anchor_count":0,',
		'"covered_product_file_count":0,"uncovered_product_file_count":-1,',
		'"directly_seeded_product_file_count":0,"single_cover_product_file_count":0,',
		'"multi_cover_product_file_count":0}}\n',
	].join("");
}
