import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { posix, resolve } from "node:path";
import { test } from "node:test";

import type { FixtureManifest } from "./fixture-manifest";
import { prepareFixtureRunnerArtifacts } from "./fixture-run-artifacts";
import { parseFixtureRunnerArgs, runFixtureRunner, runFixtureRunnerCli } from "./fixture-runner";

interface TempFixtureSpec {
	manifest: FixtureManifest;
	scriptBody: string;
	stdoutGolden?: string;
}

function scanFixtureManifest(id: string, family: string, exitCode: number): FixtureManifest {
	return {
		id,
		family,
		purpose: "Fixture runner unit test fixture.",
		command: ["node", "./cli-stub.cjs", "scan"],
		cwd: ".",
		exit_code: exitCode,
		stdout: { kind: "ignored" },
		stderr: { kind: "ignored" },
		filesystem: { kind: "no_mutation" },
	};
}

function scanJsonFixtureManifest(id: string, family: string, exitCode: number): FixtureManifest {
	return {
		...scanFixtureManifest(id, family, exitCode),
		command: ["node", "./cli-stub.cjs", "scan", "--json"],
		stdout: { kind: "golden" },
		stderr: { kind: "empty" },
	};
}

function withTempFixtures(
	fixtures: TempFixtureSpec[],
	callback: (fixturesRoot: string) => Promise<void> | void,
): Promise<void> {
	const fixturesRoot = mkdtempSync(resolve(tmpdir(), "anchormap-fixture-runner-"));

	try {
		for (const fixture of fixtures) {
			const fixtureDir = resolve(fixturesRoot, fixture.manifest.family, fixture.manifest.id);
			mkdirSync(resolve(fixtureDir, "repo"), { recursive: true });
			writeFileSync(
				resolve(fixtureDir, "manifest.json"),
				`${JSON.stringify(fixture.manifest, null, "\t")}\n`,
			);
			writeFileSync(resolve(fixtureDir, "repo", "cli-stub.cjs"), fixture.scriptBody);
			if (fixture.stdoutGolden !== undefined) {
				writeFileSync(resolve(fixtureDir, "stdout.golden"), fixture.stdoutGolden);
			}
		}

		return Promise.resolve(callback(fixturesRoot)).finally(() => {
			rmSync(fixturesRoot, { recursive: true, force: true });
		});
	} catch (error) {
		rmSync(fixturesRoot, { recursive: true, force: true });
		throw error;
	}
}

function createBufferingWriter(): {
	writer: { write(chunk: string): boolean };
	read(): string;
} {
	const chunks: string[] = [];

	return {
		writer: {
			write(chunk: string): boolean {
				chunks.push(chunk);
				return true;
			},
		},
		read(): string {
			return chunks.join("");
		},
	};
}

const PASSING_FIXTURES: TempFixtureSpec[] = [
	{
		manifest: scanFixtureManifest("fx90_b_cli_second", "B-cli", 0),
		scriptBody: "process.exit(0);\n",
	},
	{
		manifest: scanFixtureManifest("fx10_b_cli_first", "B-cli", 0),
		scriptBody: "process.exit(0);\n",
	},
	{
		manifest: scanFixtureManifest("fx50_b_scan_only", "B-scan", 0),
		scriptBody: "process.exit(0);\n",
	},
];

function selectionRunDir(selection: string, runNumber: number): string {
	return posix.join(".tmp", "fixture-runs", selection, `run-${String(runNumber).padStart(4, "0")}`);
}

function fixtureArtifactsRelativePath(
	runDirRelative: string,
	family: string,
	fixtureId: string,
): string {
	return posix.join(runDirRelative, "fixtures", family, fixtureId);
}

function runnerSummaryLine(
	runDirRelative: string,
	total: number,
	passed: number,
	failed: number,
): string {
	return `SUMMARY total=${total} passed=${passed} failed=${failed} artifacts=${runDirRelative} summary=${posix.join(runDirRelative, "summary.txt")}`;
}

function readJsonFile(pathValue: string): unknown {
	return JSON.parse(readFileSync(pathValue, "utf8"));
}

function requireRecord<T>(value: T | undefined): T {
	assert.ok(value);
	return value;
}

async function allocateRunDirInChildProcess(fixturesRoot: string, fixtureId: string): Promise<string> {
	const modulePath = resolve(__dirname, "fixture-run-artifacts.js");
	const script = [
		"const { prepareFixtureRunnerArtifacts } = require(process.argv[1]);",
		"const layout = prepareFixtureRunnerArtifacts(process.argv[2], { fixtureId: process.argv[3] });",
		"process.stdout.write(layout.runDirRelative + '\\n');",
	].join(" ");

	return await new Promise<string>((resolvePromise, rejectPromise) => {
		const child = spawn(process.execPath, ["-e", script, modulePath, fixturesRoot, fixtureId], {
			stdio: ["ignore", "pipe", "inherit"],
		});
		let stdout = "";

		child.stdout.on("data", (chunk: Buffer | string) => {
			stdout += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
		});
		child.on("error", rejectPromise);
		child.on("close", (code) => {
			if (code !== 0) {
				rejectPromise(new Error(`allocator child exited with code ${code}`));
				return;
			}

			resolvePromise(stdout.trim());
		});
	});
}

test("parses fixture runner selectors and rejects mixed selection modes", () => {
	assert.deepEqual(parseFixtureRunnerArgs(["--fixture", "fx68_cli_unknown_command"]), {
		fixtureId: "fx68_cli_unknown_command",
		family: undefined,
	});
	assert.deepEqual(parseFixtureRunnerArgs(["--family", "B-cli"]), {
		fixtureId: undefined,
		family: "B-cli",
	});
	assert.throws(
		() => parseFixtureRunnerArgs(["--fixture", "fx68_cli_unknown_command", "--family", "B-cli"]),
		/mutually exclusive/,
	);
});

test("runs only the requested fixture ID through the CLI wrapper", async () => {
	await withTempFixtures(PASSING_FIXTURES, async (fixturesRoot) => {
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = await runFixtureRunnerCli(["--fixture", "fx50_b_scan_only"], {
			fixturesRoot,
			timeoutMs: 1_000,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 0);
		assert.equal(stderr.read(), "");
		assert.equal(
			stdout.read(),
			[
				"PASS fx50_b_scan_only",
				runnerSummaryLine(selectionRunDir("fixture-fx50_b_scan_only", 1), 1, 1, 0),
				"",
			].join("\n"),
		);
	});
});

test("runs only the requested family through the CLI wrapper in stable order", async () => {
	await withTempFixtures(PASSING_FIXTURES, async (fixturesRoot) => {
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = await runFixtureRunnerCli(["--family", "B-cli"], {
			fixturesRoot,
			timeoutMs: 1_000,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 0);
		assert.equal(stderr.read(), "");
		assert.equal(
			stdout.read(),
			[
				"PASS fx10_b_cli_first",
				"PASS fx90_b_cli_second",
				runnerSummaryLine(selectionRunDir("family-B-cli", 1), 2, 2, 0),
				"",
			].join("\n"),
		);
	});
});

test("run-all reporting preserves fixture ordering across reruns while using distinct artifact roots", async () => {
	await withTempFixtures(PASSING_FIXTURES, async (fixturesRoot) => {
		const first = await runFixtureRunner({
			fixturesRoot,
			timeoutMs: 1_000,
		});
		const second = await runFixtureRunner({
			fixturesRoot,
			timeoutMs: 1_000,
		});

		assert.equal(first.exitCode, 0);
		assert.equal(second.exitCode, 0);
		assert.equal(
			first.report,
			[
				"PASS fx10_b_cli_first",
				"PASS fx90_b_cli_second",
				"PASS fx50_b_scan_only",
				runnerSummaryLine(first.artifactsDirRelative, 3, 3, 0),
				"",
			].join("\n"),
		);
		assert.equal(
			second.report,
			[
				"PASS fx10_b_cli_first",
				"PASS fx90_b_cli_second",
				"PASS fx50_b_scan_only",
				runnerSummaryLine(second.artifactsDirRelative, 3, 3, 0),
				"",
			].join("\n"),
		);
		assert.notEqual(second.artifactsDirRelative, first.artifactsDirRelative);
	});
});

test("allocator reserves distinct run roots for concurrent same-selection runs", async () => {
	await withTempFixtures(PASSING_FIXTURES, async (fixturesRoot) => {
		const baseline = prepareFixtureRunnerArtifacts(fixturesRoot, {
			fixtureId: "fx50_b_scan_only",
		});
		assert.equal(baseline.runDirRelative, selectionRunDir("fixture-fx50_b_scan_only", 1));

		const concurrentAllocations = await Promise.all(
			Array.from({ length: 12 }, () =>
				allocateRunDirInChildProcess(fixturesRoot, "fx50_b_scan_only"),
			),
		);

		assert.equal(new Set(concurrentAllocations).size, concurrentAllocations.length);
		assert.equal(concurrentAllocations.includes(baseline.runDirRelative), false);
	});
});

test("runner exits non-zero and names the failed oracle when one fixture fails", async () => {
	await withTempFixtures(
		[
			...PASSING_FIXTURES,
			{
				manifest: scanFixtureManifest("fx20_b_cli_exit_mismatch", "B-cli", 0),
				scriptBody: "process.exit(1);\n",
			},
		],
		async (fixturesRoot) => {
			const summary = await runFixtureRunner({
				fixturesRoot,
				timeoutMs: 1_000,
			});

			assert.equal(summary.exitCode, 1);
			assert.equal(summary.failedCount, 1);
			assert.match(
				summary.report,
				/^FAIL fx20_b_cli_exit_mismatch exit_code expected exit code 0, got 1 \[artifacts .+fx20_b_cli_exit_mismatch\]$/m,
			);
			assert.equal(
				summary.report,
				[
					"PASS fx10_b_cli_first",
					`FAIL fx20_b_cli_exit_mismatch exit_code expected exit code 0, got 1 [artifacts ${fixtureArtifactsRelativePath(summary.artifactsDirRelative, "B-cli", "fx20_b_cli_exit_mismatch")}]`,
					"PASS fx90_b_cli_second",
					"PASS fx50_b_scan_only",
					runnerSummaryLine(summary.artifactsDirRelative, 4, 3, 1),
					"",
				].join("\n"),
			);
		},
	);
});

test("persists per-run artifacts and metadata for a passing fixture", async () => {
	await withTempFixtures(
		[
			{
				manifest: scanFixtureManifest("fx11_artifact_pass", "B-cli", 0),
				scriptBody: 'process.stdout.write("pass\\n");\nprocess.exit(0);\n',
			},
		],
		async (fixturesRoot) => {
			const summary = await runFixtureRunner({
				fixturesRoot,
				fixtureId: "fx11_artifact_pass",
				timeoutMs: 1_000,
			});

			assert.equal(summary.exitCode, 0);
			const record = requireRecord(summary.records[0]);
			assert.equal(
				record?.artifactDirRelative,
				fixtureArtifactsRelativePath(summary.artifactsDirRelative, "B-cli", "fx11_artifact_pass"),
			);
			assert.equal(existsSync(record.artifactDir), true);
			assert.equal(existsSync(summary.summaryPath), true);

			const metadata = readJsonFile(record.metadataPath) as {
				fixture_id: string;
				status: string;
				command: string[];
				cwd: string;
				exit_code: number;
				oracles: { exit_code: { status: string } };
				artifacts: {
					stdout_actual: string | null;
					filesystem_pre: string | null;
					filesystem_post: string | null;
				};
				error: null;
			};
			assert.equal(metadata.fixture_id, "fx11_artifact_pass");
			assert.equal(metadata.status, "pass");
			assert.deepEqual(metadata.command, ["node", "./cli-stub.cjs", "scan"]);
			assert.ok(metadata.cwd.length > 0);
			assert.equal(metadata.exit_code, 0);
			assert.equal(metadata.oracles.exit_code.status, "pass");
			assert.equal(metadata.artifacts.stdout_actual, "stdout.actual.bin");
			assert.equal(metadata.artifacts.filesystem_pre, "filesystem.pre.json");
			assert.equal(metadata.artifacts.filesystem_post, "filesystem.post.json");
			assert.equal(metadata.error, null);
		},
	);
});

test("persists actual and expected stdout artifacts for a golden mismatch", async () => {
	await withTempFixtures(
		[
			{
				manifest: {
					...scanJsonFixtureManifest("fx12_artifact_golden_mismatch", "B-scan", 0),
				},
				scriptBody: 'process.stdout.write("{\\"ok\\":false}\\n");\nprocess.exit(0);\n',
				stdoutGolden: '{"ok":true}\n',
			},
		],
		async (fixturesRoot) => {
			const summary = await runFixtureRunner({
				fixturesRoot,
				fixtureId: "fx12_artifact_golden_mismatch",
				timeoutMs: 1_000,
			});

			assert.equal(summary.exitCode, 1);
			const record = requireRecord(summary.records[0]);
			assert.equal(record?.failedOracle, "stdout.golden");
			assert.equal(
				readFileSync(resolve(record.artifactDir, "stdout.actual.bin"), "utf8"),
				'{"ok":false}\n',
			);
			assert.equal(
				readFileSync(resolve(record.artifactDir, "stdout.expected.bin"), "utf8"),
				'{"ok":true}\n',
			);
		},
	);
});

test("persists filesystem diff artifacts for a mutation failure", async () => {
	await withTempFixtures(
		[
			{
				manifest: scanFixtureManifest("fx13_artifact_mutation_failure", "B-cli", 0),
				scriptBody:
					'require("node:fs").writeFileSync("created.txt", "mutation\\n");\nprocess.exit(0);\n',
			},
		],
		async (fixturesRoot) => {
			const summary = await runFixtureRunner({
				fixturesRoot,
				fixtureId: "fx13_artifact_mutation_failure",
				timeoutMs: 1_000,
			});

			assert.equal(summary.exitCode, 1);
			const record = requireRecord(summary.records[0]);
			assert.equal(record?.failedOracle, "filesystem.no_mutation");

			const diff = readJsonFile(resolve(record.artifactDir, "filesystem.diff.json")) as {
				added: Array<{ path: string }>;
			};
			assert.deepEqual(
				diff.added.map((entry) => entry.path),
				["created.txt"],
			);
			assert.equal(existsSync(resolve(record.artifactDir, "filesystem.pre.json")), true);
			assert.equal(existsSync(resolve(record.artifactDir, "filesystem.post.json")), true);
		},
	);
});

test("rerunning the same selection preserves prior artifact sets", async () => {
	await withTempFixtures(
		[
			{
				manifest: scanFixtureManifest("fx14_artifact_rerun", "B-cli", 0),
				scriptBody: 'process.stdout.write("pass\\n");\nprocess.exit(0);\n',
			},
		],
		async (fixturesRoot) => {
			const first = await runFixtureRunner({
				fixturesRoot,
				fixtureId: "fx14_artifact_rerun",
				timeoutMs: 1_000,
			});
			const firstRecord = requireRecord(first.records[0]);
			const firstMetadata = readFileSync(firstRecord.metadataPath, "utf8");

			const second = await runFixtureRunner({
				fixturesRoot,
				fixtureId: "fx14_artifact_rerun",
				timeoutMs: 1_000,
			});
			const secondRecord = requireRecord(second.records[0]);

			assert.notEqual(first.artifactsDirRelative, second.artifactsDirRelative);
			assert.notEqual(firstRecord.artifactDirRelative, secondRecord.artifactDirRelative);
			assert.equal(existsSync(first.summaryPath), true);
			assert.equal(existsSync(firstRecord.artifactDir), true);
			assert.equal(existsSync(firstRecord.metadataPath), true);
			assert.equal(readFileSync(firstRecord.metadataPath, "utf8"), firstMetadata);
		},
	);
});

test("namespaces artifact directories by family when fixture IDs repeat across families", async () => {
	await withTempFixtures(
		[
			{
				manifest: scanFixtureManifest("same_id", "B-one", 0),
				scriptBody: 'process.stdout.write("one\\n");\nprocess.exit(0);\n',
			},
			{
				manifest: scanFixtureManifest("same_id", "B-two", 0),
				scriptBody: 'process.stdout.write("two\\n");\nprocess.exit(0);\n',
			},
		],
		async (fixturesRoot) => {
			const summary = await runFixtureRunner({
				fixturesRoot,
				timeoutMs: 1_000,
			});

			assert.equal(summary.exitCode, 0);
			assert.equal(summary.records.length, 2);
			assert.deepEqual(
				summary.records.map((record) => record.artifactDirRelative),
				[
					fixtureArtifactsRelativePath(summary.artifactsDirRelative, "B-one", "same_id"),
					fixtureArtifactsRelativePath(summary.artifactsDirRelative, "B-two", "same_id"),
				],
			);
			assert.notEqual(
				summary.records[0]?.artifactDirRelative,
				summary.records[1]?.artifactDirRelative,
			);
			assert.equal(
				readFileSync(
					resolve(requireRecord(summary.records[0]).artifactDir, "stdout.actual.bin"),
					"utf8",
				),
				"one\n",
			);
			assert.equal(
				readFileSync(
					resolve(requireRecord(summary.records[1]).artifactDir, "stdout.actual.bin"),
					"utf8",
				),
				"two\n",
			);
		},
	);
});
