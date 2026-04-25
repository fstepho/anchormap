import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { test } from "node:test";

import { runFixtureRunner } from "./fixture-runner";
import {
	fixtureArtifactsRelativePath,
	PASSING_FIXTURES,
	readJsonFile,
	requireRecord,
	runnerSummaryLine,
	scanFixtureManifest,
	scanJsonFixtureManifest,
	withTempFixtures,
} from "./fixture-runner-test-support";
import { materializeFixtureSandbox } from "./fixture-sandbox";

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

test("fails closed when a fixture directory omits manifest.json during discovery", async () => {
	await withTempFixtures(PASSING_FIXTURES, async (fixturesRoot) => {
		const brokenFixtureDir = resolve(fixturesRoot, "B-cli", "fx15_missing_manifest");
		mkdirSync(resolve(brokenFixtureDir, "repo"), { recursive: true });
		writeFileSync(resolve(brokenFixtureDir, "repo", "cli-stub.cjs"), "process.exit(0);\n");

		await assert.rejects(
			() =>
				runFixtureRunner({
					fixturesRoot,
					timeoutMs: 1_000,
				}),
			/fixture directory "B-cli\/fx15_missing_manifest" is incomplete: missing required file "manifest\.json"/,
		);
	});
});

test("fails closed when a fixture directory omits repo during discovery", async () => {
	await withTempFixtures(PASSING_FIXTURES, async (fixturesRoot) => {
		const brokenFixtureDir = resolve(fixturesRoot, "B-cli", "fx16_missing_repo");
		mkdirSync(brokenFixtureDir, { recursive: true });
		writeFileSync(
			resolve(brokenFixtureDir, "manifest.json"),
			`${JSON.stringify(scanFixtureManifest("fx16_missing_repo", "B-cli", 0), null, "\t")}\n`,
		);

		await assert.rejects(
			() =>
				runFixtureRunner({
					fixturesRoot,
					timeoutMs: 1_000,
				}),
			/fixture directory "B-cli\/fx16_missing_repo" is incomplete: missing required directory "repo"/,
		);
	});
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
			assert.ok(summary.totalDurationMs >= 0);

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

			const runMetadata = readJsonFile(resolve(summary.artifactsDir, "run.json")) as {
				total_duration_ms: number;
				summary_path: string;
			};
			assert.equal(runMetadata.total_duration_ms, summary.totalDurationMs);
			assert.equal(runMetadata.summary_path, summary.summaryPathRelative);
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

test("persists phase trace and timing artifacts and surfaces the last failing phase in summaries", async () => {
	await withTempFixtures(
		[
			{
				manifest: scanFixtureManifest("fx13a_artifact_phase_trace", "B-cli", 0),
				scriptBody: [
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"const events = [",
					"\t{ phase: 'cli.parse', status: 'pass', started_at_ms: 0, finished_at_ms: 1, duration_ms: 1, detail: 'scan' },",
					"\t{ phase: 'config.load', status: 'fail', started_at_ms: 1, finished_at_ms: 3, duration_ms: 2, detail: 'config invalid' },",
					"\t{ phase: 'exit', status: 'fail', started_at_ms: 3, finished_at_ms: 4, duration_ms: 1, detail: 'exit_code=2' },",
					"];",
					"fs.writeFileSync(tracePath, JSON.stringify({ events }, null, '\\t') + '\\n');",
					"process.stderr.write('config invalid\\n');",
					"process.exit(2);",
					"",
				].join("\n"),
			},
		],
		async (fixturesRoot) => {
			const summary = await runFixtureRunner({
				fixturesRoot,
				fixtureId: "fx13a_artifact_phase_trace",
				timeoutMs: 1_000,
			});

			assert.equal(summary.exitCode, 1);
			const record = requireRecord(summary.records[0]);
			assert.equal(record?.failedOracle, "exit_code");
			assert.equal(record?.lastFailedPhase, "config.load");
			assert.ok(record?.totalDurationMs !== null);
			assert.ok((record?.totalDurationMs ?? -1) >= 0);
			assert.ok(record?.harnessDurationMs >= (record?.totalDurationMs ?? -1));

			const metadata = readJsonFile(record.metadataPath) as {
				total_duration_ms: number;
				harness_duration_ms: number;
				last_failed_phase: string | null;
				trace: {
					state: string;
					detail: string | null;
				};
				artifacts: {
					phase_trace_events: string | null;
					phase_timings: string | null;
				};
			};
			assert.equal(metadata.total_duration_ms, record.totalDurationMs);
			assert.equal(metadata.harness_duration_ms, record.harnessDurationMs);
			assert.ok(metadata.total_duration_ms >= 0);
			assert.ok(metadata.harness_duration_ms >= metadata.total_duration_ms);
			assert.equal(metadata.last_failed_phase, "config.load");
			assert.equal(metadata.trace.state, "captured");
			assert.equal(metadata.trace.detail, null);
			assert.equal(metadata.artifacts.phase_trace_events, "phase-trace.events.json");
			assert.equal(metadata.artifacts.phase_timings, "phase-timings.json");

			const phaseTrace = readJsonFile(
				resolve(record.artifactDir, "phase-trace.events.json"),
			) as Array<{
				phase: string;
			}>;
			assert.deepEqual(
				phaseTrace.map((event) => event.phase),
				["cli.parse", "config.load", "exit"],
			);

			const phaseTimings = readJsonFile(
				resolve(record.artifactDir, "phase-timings.json"),
			) as Array<{
				phase: string;
				status: string;
				total_duration_ms: number;
			}>;
			assert.equal(phaseTimings[1]?.phase, "config.load");
			assert.equal(phaseTimings[1]?.status, "fail");
			assert.ok((phaseTimings[1]?.total_duration_ms ?? -1) >= 0);
			assert.match(readFileSync(record.summaryPath, "utf8"), /last failed phase: config\.load/);
			assert.match(readFileSync(record.summaryPath, "utf8"), /trace status: captured/);
			assert.match(readFileSync(record.summaryPath, "utf8"), /harness duration ms: /);
		},
	);
});

test("measures harness duration after sandbox cleanup completes", async () => {
	await withTempFixtures(
		[
			{
				manifest: scanFixtureManifest("fx13ab_artifact_cleanup_timing", "B-cli", 0),
				scriptBody: "process.exit(0);\n",
			},
		],
		async (fixturesRoot) => {
			const cleanupDelayMs = 25;
			const summary = await runFixtureRunner({
				fixturesRoot,
				fixtureId: "fx13ab_artifact_cleanup_timing",
				timeoutMs: 1_000,
				sandboxFactory: (fixture) => {
					const sandbox = materializeFixtureSandbox(fixture);
					return {
						...sandbox,
						dispose() {
							const startedAtMs = performance.now();
							while (performance.now() - startedAtMs < cleanupDelayMs) {
								// Busy-wait to create a deterministic synchronous cleanup cost.
							}
							sandbox.dispose();
						},
					};
				},
			});

			assert.equal(summary.exitCode, 0);
			const record = requireRecord(summary.records[0]);
			assert.ok(record.harnessDurationMs >= cleanupDelayMs);

			const metadata = readJsonFile(record.metadataPath) as {
				harness_duration_ms: number;
			};
			assert.ok(metadata.harness_duration_ms >= cleanupDelayMs);
			assert.equal(metadata.harness_duration_ms, record.harnessDurationMs);
		},
	);
});

test("persists fixture artifacts even when sandbox cleanup fails", async () => {
	await withTempFixtures(
		[
			{
				manifest: scanFixtureManifest("fx13ac_artifact_cleanup_failure", "B-cli", 0),
				scriptBody: "process.exit(0);\n",
			},
		],
		async (fixturesRoot) => {
			const summary = await runFixtureRunner({
				fixturesRoot,
				fixtureId: "fx13ac_artifact_cleanup_failure",
				timeoutMs: 1_000,
				sandboxFactory: (fixture) => {
					const sandbox = materializeFixtureSandbox(fixture);
					return {
						...sandbox,
						dispose() {
							sandbox.dispose();
							throw new Error("simulated sandbox cleanup failure");
						},
					};
				},
			});

			assert.equal(summary.exitCode, 1);
			const record = requireRecord(summary.records[0]);
			assert.equal(record.status, "fail");
			assert.equal(record.failedOracle, "sandbox");
			assert.match(record.summary, /cleanup failed/);
			assert.equal(existsSync(record.metadataPath), true);
			assert.equal(existsSync(record.summaryPath), true);

			const metadata = readJsonFile(record.metadataPath) as {
				status: string;
				failed_oracle: string | null;
				summary: string;
			};
			assert.equal(metadata.status, "fail");
			assert.equal(metadata.failed_oracle, "sandbox");
			assert.match(metadata.summary, /cleanup failed/);
			assert.match(readFileSync(record.summaryPath, "utf8"), /cleanup failed/);
		},
	);
});

test("persists the declared manifest cwd when sandbox setup fails before returning a sandbox", async () => {
	await withTempFixtures(
		[
			{
				manifest: {
					...scanFixtureManifest("fx13ad_artifact_sandbox_declared_cwd", "B-cli", 0),
					cwd: "missing-dir",
				},
				scriptBody: "process.exit(0);\n",
			},
		],
		async (fixturesRoot) => {
			const summary = await runFixtureRunner({
				fixturesRoot,
				fixtureId: "fx13ad_artifact_sandbox_declared_cwd",
				timeoutMs: 1_000,
			});

			assert.equal(summary.exitCode, 1);
			const record = requireRecord(summary.records[0]);
			assert.equal(record.status, "fail");
			assert.equal(record.failedOracle, "sandbox");

			const metadata = readJsonFile(record.metadataPath) as {
				cwd: string | null;
				exit_code: number | null;
			};
			assert.equal(metadata.cwd, "missing-dir");
			assert.equal(metadata.exit_code, null);
		},
	);
});

test("accepts additional traced phase names without invalidating archived trace artifacts", async () => {
	await withTempFixtures(
		[
			{
				manifest: scanFixtureManifest("fx13a0_artifact_extended_phase_trace", "B-cli", 0),
				scriptBody: [
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"const events = [",
					"\t{ phase: 'cli.parse', status: 'pass', started_at_ms: 0, finished_at_ms: 1, duration_ms: 1, detail: 'scan' },",
					"\t{ phase: 'repo.enumerate', status: 'pass', started_at_ms: 1, finished_at_ms: 2, duration_ms: 1, detail: 'walk roots' },",
					"\t{ phase: 'config.validate', status: 'fail', started_at_ms: 2, finished_at_ms: 4, duration_ms: 2, detail: 'invalid mapping' },",
					"\t{ phase: 'exit', status: 'fail', started_at_ms: 4, finished_at_ms: 5, duration_ms: 1, detail: 'exit_code=2' },",
					"];",
					"fs.writeFileSync(tracePath, JSON.stringify({ events }, null, '\\t') + '\\n');",
					"process.stderr.write('config invalid\\n');",
					"process.exit(2);",
					"",
				].join("\n"),
			},
		],
		async (fixturesRoot) => {
			const summary = await runFixtureRunner({
				fixturesRoot,
				fixtureId: "fx13a0_artifact_extended_phase_trace",
				timeoutMs: 1_000,
			});

			assert.equal(summary.exitCode, 1);
			const record = requireRecord(summary.records[0]);
			assert.equal(record?.failedOracle, "exit_code");
			assert.equal(record?.phaseTraceStatus?.state, "captured");
			assert.equal(record?.lastFailedPhase, "config.validate");

			const metadata = readJsonFile(record.metadataPath) as {
				last_failed_phase: string | null;
				trace: {
					state: string;
					detail: string | null;
				};
				artifacts: {
					phase_trace_events: string | null;
					phase_timings: string | null;
				};
			};
			assert.equal(metadata.last_failed_phase, "config.validate");
			assert.equal(metadata.trace.state, "captured");
			assert.equal(metadata.artifacts.phase_trace_events, "phase-trace.events.json");
			assert.equal(metadata.artifacts.phase_timings, "phase-timings.json");

			const phaseTrace = readJsonFile(
				resolve(record.artifactDir, "phase-trace.events.json"),
			) as Array<{
				phase: string;
			}>;
			assert.deepEqual(
				phaseTrace.map((event) => event.phase),
				["cli.parse", "repo.enumerate", "config.validate", "exit"],
			);

			const phaseTimings = readJsonFile(
				resolve(record.artifactDir, "phase-timings.json"),
			) as Array<{
				phase: string;
				status: string;
			}>;
			assert.deepEqual(
				phaseTimings.map((timing) => timing.phase),
				["cli.parse", "exit", "config.validate", "repo.enumerate"],
			);
			assert.equal(
				phaseTimings.find((timing) => timing.phase === "config.validate")?.status,
				"fail",
			);
			assert.match(readFileSync(record.summaryPath, "utf8"), /last failed phase: config\.validate/);
		},
	);
});

test("persists trace and stream artifacts for fixture commands terminated by signal", async () => {
	await withTempFixtures(
		[
			{
				manifest: scanFixtureManifest("fx13aa_artifact_signal_trace", "B-cli", 0),
				scriptBody: [
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"const events = [",
					"\t{ phase: 'cli.parse', status: 'pass', started_at_ms: 0, finished_at_ms: 1, duration_ms: 1, detail: 'scan' },",
					"\t{ phase: 'config.load', status: 'fail', started_at_ms: 1, finished_at_ms: 3, duration_ms: 2, detail: 'terminated by signal' },",
					"];",
					"fs.writeFileSync(tracePath, JSON.stringify({ events }, null, '\\t') + '\\n');",
					"process.stdout.write('signal-stdout\\n', () => {",
					"\tprocess.stderr.write('signal-stderr\\n', () => {",
					"\t\tprocess.kill(process.pid, 'SIGTERM');",
					"\t});",
					"});",
					"",
				].join("\n"),
			},
		],
		async (fixturesRoot) => {
			const summary = await runFixtureRunner({
				fixturesRoot,
				fixtureId: "fx13aa_artifact_signal_trace",
				timeoutMs: 1_000,
			});

			assert.equal(summary.exitCode, 1);
			const record = requireRecord(summary.records[0]);
			assert.equal(record?.failedOracle, "process");
			assert.equal(record?.lastFailedPhase, "config.load");
			assert.equal(record?.phaseTraceStatus?.state, "captured");

			const metadata = readJsonFile(record.metadataPath) as {
				stdout_length: number | null;
				stderr_length: number | null;
				last_failed_phase: string | null;
				trace: {
					state: string;
					detail: string | null;
				};
				artifacts: {
					stdout_actual: string | null;
					stderr_actual: string | null;
					phase_trace_events: string | null;
					phase_timings: string | null;
				};
			};
			assert.equal(metadata.stdout_length, "signal-stdout\n".length);
			assert.equal(metadata.stderr_length, "signal-stderr\n".length);
			assert.equal(metadata.last_failed_phase, "config.load");
			assert.equal(metadata.trace.state, "captured");
			assert.equal(metadata.trace.detail, null);
			assert.equal(metadata.artifacts.stdout_actual, "stdout.actual.bin");
			assert.equal(metadata.artifacts.stderr_actual, "stderr.actual.bin");
			assert.equal(metadata.artifacts.phase_trace_events, "phase-trace.events.json");
			assert.equal(metadata.artifacts.phase_timings, "phase-timings.json");

			assert.deepEqual(
				readFileSync(resolve(record.artifactDir, "stdout.actual.bin")),
				Buffer.from("signal-stdout\n", "utf8"),
			);
			assert.deepEqual(
				readFileSync(resolve(record.artifactDir, "stderr.actual.bin")),
				Buffer.from("signal-stderr\n", "utf8"),
			);
			const phaseTrace = readJsonFile(
				resolve(record.artifactDir, "phase-trace.events.json"),
			) as Array<{
				phase: string;
			}>;
			assert.deepEqual(
				phaseTrace.map((event) => event.phase),
				["cli.parse", "config.load"],
			);
			assert.match(readFileSync(record.summaryPath, "utf8"), /last failed phase: config\.load/);
			assert.match(readFileSync(record.summaryPath, "utf8"), /trace status: captured/);
		},
	);
});

test("leaves last failed phase empty for exit-code oracle mismatches without traced failures", async () => {
	await withTempFixtures(
		[
			{
				manifest: scanFixtureManifest("fx13b_artifact_exit_phase_mismatch", "B-cli", 2),
				scriptBody: [
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"const events = [",
					"\t{ phase: 'cli.parse', status: 'pass', started_at_ms: 0, finished_at_ms: 1, duration_ms: 1, detail: 'scan' },",
					"\t{ phase: 'exit', status: 'pass', started_at_ms: 1, finished_at_ms: 2, duration_ms: 1, detail: 'exit_code=0' },",
					"];",
					"fs.writeFileSync(tracePath, JSON.stringify({ events }, null, '\\t') + '\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			},
		],
		async (fixturesRoot) => {
			const summary = await runFixtureRunner({
				fixturesRoot,
				fixtureId: "fx13b_artifact_exit_phase_mismatch",
				timeoutMs: 1_000,
			});

			assert.equal(summary.exitCode, 1);
			const record = requireRecord(summary.records[0]);
			assert.equal(record?.failedOracle, "exit_code");
			assert.equal(record?.lastFailedPhase, null);

			const metadata = readJsonFile(record.metadataPath) as {
				last_failed_phase: string | null;
			};
			assert.equal(metadata.last_failed_phase, null);
			assert.match(readFileSync(record.summaryPath, "utf8"), /last failed phase: none/);
		},
	);
});

test("omits last failed phase for passing fixture records with traced retries", async () => {
	await withTempFixtures(
		[
			{
				manifest: scanFixtureManifest("fx13c_artifact_pass_retry_trace", "B-cli", 0),
				scriptBody: [
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"const events = [",
					"\t{ phase: 'config.load', status: 'fail', started_at_ms: 0, finished_at_ms: 2, duration_ms: 2, detail: 'first attempt' },",
					"\t{ phase: 'config.load', status: 'pass', started_at_ms: 2, finished_at_ms: 3, duration_ms: 1, detail: 'retry succeeded' },",
					"\t{ phase: 'exit', status: 'pass', started_at_ms: 3, finished_at_ms: 4, duration_ms: 1, detail: 'exit_code=0' },",
					"];",
					"fs.writeFileSync(tracePath, JSON.stringify({ events }, null, '\\t') + '\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			},
		],
		async (fixturesRoot) => {
			const summary = await runFixtureRunner({
				fixturesRoot,
				fixtureId: "fx13c_artifact_pass_retry_trace",
				timeoutMs: 1_000,
			});

			assert.equal(summary.exitCode, 0);
			const record = requireRecord(summary.records[0]);
			assert.equal(record?.status, "pass");
			assert.equal(record?.failedOracle, null);
			assert.equal(record?.lastFailedPhase, null);

			const metadata = readJsonFile(record.metadataPath) as {
				last_failed_phase: string | null;
			};
			assert.equal(metadata.last_failed_phase, null);
			assert.match(readFileSync(record.summaryPath, "utf8"), /last failed phase: none/);
		},
	);
});

test("records explicit invalid-trace metadata instead of collapsing to no-trace artifacts", async () => {
	await withTempFixtures(
		[
			{
				manifest: scanFixtureManifest("fx13d_artifact_invalid_trace", "B-cli", 0),
				scriptBody: [
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"fs.writeFileSync(tracePath, '{\"events\": [');",
					"process.exit(0);",
					"",
				].join("\n"),
			},
		],
		async (fixturesRoot) => {
			const summary = await runFixtureRunner({
				fixturesRoot,
				fixtureId: "fx13d_artifact_invalid_trace",
				timeoutMs: 1_000,
			});

			assert.equal(summary.exitCode, 0);
			const record = requireRecord(summary.records[0]);
			assert.equal(record?.phaseTraceStatus?.state, "invalid");

			const metadata = readJsonFile(record.metadataPath) as {
				trace: {
					state: string;
					detail: string | null;
				};
				artifacts: {
					phase_trace_events: string | null;
					phase_trace_raw: string | null;
					phase_timings: string | null;
				};
			};
			assert.equal(metadata.trace.state, "invalid");
			assert.match(metadata.trace.detail ?? "", /not valid JSON/);
			assert.equal(metadata.artifacts.phase_trace_events, null);
			assert.equal(metadata.artifacts.phase_trace_raw, "phase-trace.raw.bin");
			assert.equal(metadata.artifacts.phase_timings, null);
			assert.deepEqual(
				readFileSync(resolve(record.artifactDir, "phase-trace.raw.bin")),
				Buffer.from('{"events": [', "utf8"),
			);
			assert.match(readFileSync(record.summaryPath, "utf8"), /trace status: invalid/);
			assert.match(
				readFileSync(record.summaryPath, "utf8"),
				/phase_trace_raw: phase-trace\.raw\.bin/,
			);
		},
	);
});

test("persists empty phase trace artifacts when capture succeeds with no events", async () => {
	await withTempFixtures(
		[
			{
				manifest: scanFixtureManifest("fx13d0_artifact_empty_trace", "B-cli", 0),
				scriptBody: [
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"fs.writeFileSync(tracePath, JSON.stringify({ events: [] }, null, '\\t') + '\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			},
		],
		async (fixturesRoot) => {
			const summary = await runFixtureRunner({
				fixturesRoot,
				fixtureId: "fx13d0_artifact_empty_trace",
				timeoutMs: 1_000,
			});

			assert.equal(summary.exitCode, 0);
			const record = requireRecord(summary.records[0]);
			assert.equal(record?.phaseTraceStatus?.state, "captured");

			const metadata = readJsonFile(record.metadataPath) as {
				trace: {
					state: string;
				};
				artifacts: {
					phase_trace_events: string | null;
					phase_timings: string | null;
				};
			};
			assert.equal(metadata.trace.state, "captured");
			assert.equal(metadata.artifacts.phase_trace_events, "phase-trace.events.json");
			assert.equal(metadata.artifacts.phase_timings, "phase-timings.json");
			assert.deepEqual(readJsonFile(resolve(record.artifactDir, "phase-trace.events.json")), []);
			assert.deepEqual(readJsonFile(resolve(record.artifactDir, "phase-timings.json")), []);
		},
	);
});

test("records explicit not-emitted trace metadata when the command writes no trace file", async () => {
	await withTempFixtures(
		[
			{
				manifest: scanFixtureManifest("fx13da_artifact_trace_not_emitted", "B-cli", 0),
				scriptBody: "process.exit(0);\n",
			},
		],
		async (fixturesRoot) => {
			const summary = await runFixtureRunner({
				fixturesRoot,
				fixtureId: "fx13da_artifact_trace_not_emitted",
				timeoutMs: 1_000,
			});

			assert.equal(summary.exitCode, 0);
			const record = requireRecord(summary.records[0]);
			assert.equal(record?.phaseTraceStatus?.state, "not_emitted");

			const metadata = readJsonFile(record.metadataPath) as {
				trace: {
					state: string;
					detail: string | null;
				};
			};
			assert.equal(metadata.trace.state, "not_emitted");
			assert.equal(metadata.trace.detail, null);
			assert.match(readFileSync(record.summaryPath, "utf8"), /trace status: not_emitted/);
		},
	);
});

test("archives spawn failures with total duration and explicit trace metadata", async () => {
	await withTempFixtures(
		[
			{
				manifest: {
					...scanFixtureManifest("fx13db_artifact_spawn_failure", "B-cli", 0),
					command: ["./missing-cli", "scan"],
				},
				scriptBody: "process.exit(0);\n",
			},
		],
		async (fixturesRoot) => {
			const summary = await runFixtureRunner({
				fixturesRoot,
				fixtureId: "fx13db_artifact_spawn_failure",
				timeoutMs: 1_000,
			});

			assert.equal(summary.exitCode, 1);
			const record = requireRecord(summary.records[0]);
			assert.equal(record?.phaseTraceStatus?.state, "spawn_failed");
			assert.ok((record?.totalDurationMs ?? -1) >= 0);
			assert.equal(record?.lastFailedPhase, null);

			const metadata = readJsonFile(record.metadataPath) as {
				total_duration_ms: number | null;
				trace: {
					state: string;
					detail: string | null;
				};
				artifacts: {
					phase_trace_events: string | null;
					phase_timings: string | null;
				};
			};
			assert.ok((metadata.total_duration_ms ?? -1) >= 0);
			assert.equal(metadata.trace.state, "spawn_failed");
			assert.match(metadata.trace.detail ?? "", /ENOENT|not found/);
			assert.equal(metadata.artifacts.phase_trace_events, null);
			assert.equal(metadata.artifacts.phase_timings, null);
			assert.match(readFileSync(record.summaryPath, "utf8"), /trace status: spawn_failed/);
		},
	);
});

test("leaves last failed phase empty for output-oracle failures without traced failing phases", async () => {
	await withTempFixtures(
		[
			{
				manifest: scanJsonFixtureManifest("fx13e_artifact_stdout_phase_fallback", "B-cli", 0),
				scriptBody: [
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"const events = [",
					"\t{ phase: 'cli.parse', status: 'pass', started_at_ms: 0, finished_at_ms: 1, duration_ms: 1, detail: 'scan' },",
					"\t{ phase: 'render', status: 'pass', started_at_ms: 1, finished_at_ms: 2, duration_ms: 1, detail: 'stdout rendered' },",
					"\t{ phase: 'exit', status: 'pass', started_at_ms: 2, finished_at_ms: 3, duration_ms: 1, detail: 'exit_code=0' },",
					"];",
					"fs.writeFileSync(tracePath, JSON.stringify({ events }, null, '\\t') + '\\n');",
					"process.stdout.write('unexpected\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
				stdoutGolden: '{"ok":true}\n',
			},
		],
		async (fixturesRoot) => {
			const summary = await runFixtureRunner({
				fixturesRoot,
				fixtureId: "fx13e_artifact_stdout_phase_fallback",
				timeoutMs: 1_000,
			});

			assert.equal(summary.exitCode, 1);
			const record = requireRecord(summary.records[0]);
			assert.equal(record?.failedOracle, "stdout.golden");
			assert.equal(record?.lastFailedPhase, null);

			const metadata = readJsonFile(record.metadataPath) as {
				last_failed_phase: string | null;
			};
			assert.equal(metadata.last_failed_phase, null);
			assert.match(readFileSync(record.summaryPath, "utf8"), /last failed phase: none/);
		},
	);
});

test("ignores recovered traced retries when a later oracle fails", async () => {
	await withTempFixtures(
		[
			{
				manifest: scanJsonFixtureManifest("fx13ea_artifact_recovered_retry_phase", "B-cli", 0),
				scriptBody: [
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"const events = [",
					"\t{ phase: 'cli.parse', status: 'pass', started_at_ms: 0, finished_at_ms: 1, duration_ms: 1, detail: 'scan' },",
					"\t{ phase: 'config.load', status: 'fail', started_at_ms: 1, finished_at_ms: 3, duration_ms: 2, detail: 'first attempt' },",
					"\t{ phase: 'config.load', status: 'pass', started_at_ms: 3, finished_at_ms: 4, duration_ms: 1, detail: 'retry succeeded' },",
					"\t{ phase: 'render', status: 'pass', started_at_ms: 4, finished_at_ms: 5, duration_ms: 1, detail: 'stdout rendered' },",
					"\t{ phase: 'exit', status: 'pass', started_at_ms: 5, finished_at_ms: 6, duration_ms: 1, detail: 'exit_code=0' },",
					"];",
					"fs.writeFileSync(tracePath, JSON.stringify({ events }, null, '\\t') + '\\n');",
					"process.stdout.write('unexpected\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
				stdoutGolden: '{"ok":true}\n',
			},
		],
		async (fixturesRoot) => {
			const summary = await runFixtureRunner({
				fixturesRoot,
				fixtureId: "fx13ea_artifact_recovered_retry_phase",
				timeoutMs: 1_000,
			});

			assert.equal(summary.exitCode, 1);
			const record = requireRecord(summary.records[0]);
			assert.equal(record?.failedOracle, "stdout.golden");
			assert.equal(record?.lastFailedPhase, null);

			const metadata = readJsonFile(record.metadataPath) as {
				last_failed_phase: string | null;
			};
			assert.equal(metadata.last_failed_phase, null);
			assert.match(readFileSync(record.summaryPath, "utf8"), /last failed phase: none/);
		},
	);
});

test("leaves last failed phase empty for filesystem-oracle failures without traced failing phases", async () => {
	await withTempFixtures(
		[
			{
				manifest: scanFixtureManifest("fx13f_artifact_filesystem_phase_fallback", "B-cli", 0),
				scriptBody: [
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"const events = [",
					"\t{ phase: 'cli.parse', status: 'pass', started_at_ms: 0, finished_at_ms: 1, duration_ms: 1, detail: 'scan' },",
					"\t{ phase: 'fs.write', status: 'pass', started_at_ms: 1, finished_at_ms: 2, duration_ms: 1, detail: 'unexpected file write' },",
					"\t{ phase: 'exit', status: 'pass', started_at_ms: 2, finished_at_ms: 3, duration_ms: 1, detail: 'exit_code=0' },",
					"];",
					"fs.writeFileSync(tracePath, JSON.stringify({ events }, null, '\\t') + '\\n');",
					"fs.writeFileSync('created.txt', 'mutation\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			},
		],
		async (fixturesRoot) => {
			const summary = await runFixtureRunner({
				fixturesRoot,
				fixtureId: "fx13f_artifact_filesystem_phase_fallback",
				timeoutMs: 1_000,
			});

			assert.equal(summary.exitCode, 1);
			const record = requireRecord(summary.records[0]);
			assert.equal(record?.failedOracle, "filesystem.no_mutation");
			assert.equal(record?.lastFailedPhase, null);

			const metadata = readJsonFile(record.metadataPath) as {
				last_failed_phase: string | null;
			};
			assert.equal(metadata.last_failed_phase, null);
			assert.match(readFileSync(record.summaryPath, "utf8"), /last failed phase: none/);
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
			assert.equal(
				summary.report,
				[
					"PASS B-one/same_id",
					"PASS B-two/same_id",
					runnerSummaryLine(summary.artifactsDirRelative, 2, 2, 0),
					"",
				].join("\n"),
			);
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
