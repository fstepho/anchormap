import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";

import {
	benchmarkRunnerEnv,
	RELEASE_BENCHMARK_PATH,
	REPO_ROOT,
} from "./package-scripts-test-support";

test("release benchmark runner cleans generated corpus after CLI failure", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-bench-cleanup-test-"));
	const binDir = join(tempDir, "bin");
	const fakeNodePath = join(binDir, "node");
	const reportDir = join(tempDir, "reports");
	const before = new Set(
		readdirSync(tmpdir()).filter((entry) => entry.startsWith("anchormap-bench-small-")),
	);

	mkdirSync(binDir);
	writeFileSync(fakeNodePath, "#!/bin/sh\nexit 42\n", "utf8");
	chmodSync(fakeNodePath, 0o755);

	try {
		const result = spawnSync(
			process.execPath,
			[
				RELEASE_BENCHMARK_PATH,
				"--corpus",
				"small",
				"--warmups",
				"1",
				"--runs",
				"1",
				"--out-dir",
				reportDir,
			],
			{
				cwd: REPO_ROOT,
				env: benchmarkRunnerEnv({
					PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
				}),
				encoding: "utf8",
			},
		);
		const after = readdirSync(tmpdir()).filter((entry) =>
			entry.startsWith("anchormap-bench-small-"),
		);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /benchmark: CLI exited [1-9][0-9]*/);
		assert.deepEqual(new Set(after), before);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("release benchmark runner rejects inherited NODE_OPTIONS before measurement", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-bench-node-options-test-"));
	const reportDir = join(tempDir, "reports");

	try {
		const result = spawnSync(
			process.execPath,
			[
				RELEASE_BENCHMARK_PATH,
				"--corpus",
				"small",
				"--warmups",
				"1",
				"--runs",
				"1",
				"--out-dir",
				reportDir,
			],
			{
				cwd: REPO_ROOT,
				env: benchmarkRunnerEnv({
					NODE_OPTIONS: "--trace-warnings",
				}),
				encoding: "utf8",
			},
		);

		assert.equal(result.status, 1);
		assert.match(
			result.stderr,
			/benchmark: NODE_OPTIONS must be unset for release benchmark measurement/,
		);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
