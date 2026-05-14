import { strict as assert } from "node:assert";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { createTempRepo, minimalScanArtifactJson } from "../cli/commands-test-support";
import { loadScanArtifact, parseScanArtifactJson } from "./artifact-io";

test("parses a supported scan schema v4 artifact", () => {
	const result = parseScanArtifactJson(minimalScanArtifactJson());

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.equal(result.scan.schema_version, 4);
		assert.equal(result.scan.config.product_root, "src");
	}
});

test("rejects invalid JSON, unknown scan schema versions, and open scan objects", () => {
	const cases = [
		{ name: "invalid JSON", text: "{" },
		{ name: "unknown schema", text: JSON.stringify({ schema_version: 5 }) },
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
