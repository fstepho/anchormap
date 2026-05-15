import { strict as assert } from "node:assert";
import { test } from "node:test";

import { parseBundleMetadataJson } from "./metadata-io";

test("parses closed bundle metadata JSON without semantic secret detection", () => {
	const result = parseBundleMetadataJson(
		[
			"{",
			'"provider":"generic",',
			'"repository":"token-looking explicit value",',
			'"commit":null,',
			'"branch":"main",',
			'"pull_request":1,',
			'"run_url":null',
			"}\n",
		].join(""),
	);

	assert.equal(result.kind, "ok");
	assert.deepEqual(result.kind === "ok" ? result.metadata : undefined, {
		provider: "generic",
		repository: "token-looking explicit value",
		commit: null,
		branch: "main",
		pull_request: 1,
		run_url: null,
	});
});

test("rejects invalid bundle metadata JSON shapes and values", () => {
	const cases = [
		'{"provider":"github"}\n',
		'{"provider":"github","repository":"","commit":null,"branch":null,"pull_request":null,"run_url":null}\n',
		'{"provider":"github","repository":null,"commit":null,"branch":null,"pull_request":0,"run_url":null}\n',
		'{"provider":"bitbucket","repository":null,"commit":null,"branch":null,"pull_request":null,"run_url":null}\n',
		'{"provider":"github","repository":null,"commit":null,"branch":null,"pull_request":null,"run_url":null,"extra":true}\n',
		"{not json}\n",
	];

	for (const source of cases) {
		const result = parseBundleMetadataJson(source);
		assert.equal(result.kind, "error", source);
	}
});
