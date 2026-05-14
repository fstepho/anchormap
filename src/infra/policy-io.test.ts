import { strict as assert } from "node:assert";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { createTempRepo } from "../cli/commands-test-support";
import { loadPolicy, parsePolicyYamlText } from "./policy-io";

test("parses the closed supported policy schema", () => {
	const result = parsePolicyYamlText(
		[
			"version: 1",
			"fail_on:",
			"  analysis_health: degraded",
			"  finding_kinds:",
			"    - untraced_product_file",
			"thresholds:",
			"  min_covered_product_file_percent: 80",
			"  max_untraced_product_files: 0",
			"",
		].join("\n"),
	);

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.policy, {
			version: 1,
			fail_on: {
				analysis_health: "degraded",
				finding_kinds: ["untraced_product_file"],
			},
			thresholds: {
				min_covered_product_file_percent: 80,
				max_untraced_product_files: 0,
			},
		});
	}
});

test("rejects invalid policy YAML and schema as usage errors", () => {
	const cases = [
		{ name: "invalid YAML", text: "version: [" },
		{ name: "multi document", text: "version: 1\n---\nversion: 1\n" },
		{ name: "unknown root key", text: "version: 1\nextra: true\n" },
		{ name: "wrong version", text: "version: 2\n" },
		{ name: "unknown nested key", text: "version: 1\nfail_on:\n  extra: true\n" },
		{
			name: "unsupported finding kind",
			text: "version: 1\nfail_on:\n  finding_kinds:\n    - other\n",
		},
		{
			name: "duplicate finding kind",
			text: [
				"version: 1",
				"fail_on:",
				"  finding_kinds:",
				"    - untraced_product_file",
				"    - untraced_product_file",
				"",
			].join("\n"),
		},
		{
			name: "threshold out of range",
			text: "version: 1\nthresholds:\n  min_covered_product_file_percent: 101\n",
		},
	];

	for (const testCase of cases) {
		const result = parsePolicyYamlText(testCase.text);

		assert.equal(result.kind, "error", testCase.name);
		if (result.kind === "error") {
			assert.equal(result.error.kind, "UsageError", testCase.name);
		}
	}
});

test("loadPolicy rejects invalid paths, unreadable files, and invalid UTF-8", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "policies"));
		writeFileSync(join(cwd, "policies", "invalid-utf8.yaml"), Uint8Array.from([0xff]));

		const cases = [
			{ name: "invalid path", path: "../policy.yaml" },
			{ name: "missing file", path: "policies/missing.yaml" },
			{ name: "invalid UTF-8", path: "policies/invalid-utf8.yaml" },
		];

		for (const testCase of cases) {
			const result = loadPolicy(testCase.path, { cwd });

			assert.equal(result.kind, "error", testCase.name);
			if (result.kind === "error") {
				assert.equal(result.error.kind, "UsageError", testCase.name);
			}
		}
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
