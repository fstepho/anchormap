import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import { type FixtureManifest, loadFixtureManifest } from "./fixture-manifest";
import { createEmptyFixturePhaseTrace, FIXTURE_TRACE_ENV_VAR } from "./fixture-phase-trace";
import {
	defaultTraceCaptureFactory,
	executeFixtureCommand,
	FixtureProcessError,
	FixtureProcessTimeoutError,
} from "./fixture-process";
import { materializeFixtureSandbox } from "./fixture-sandbox";

function minimalFixtureManifest(id: string, exitCode: number): FixtureManifest {
	return {
		id,
		family: "harness-process",
		purpose: "Fixture process execution test fixture.",
		command: ["node", "./cli-stub.cjs", "scan"],
		cwd: ".",
		exit_code: exitCode,
		stdout: { kind: "ignored" },
		stderr: { kind: "ignored" },
		filesystem: { kind: "no_mutation" },
	};
}

function withTempFixture(
	manifest: FixtureManifest,
	setup: (fixtureDir: string) => void,
	callback: (fixtureDir: string) => Promise<void> | void,
): Promise<void> {
	const rootDir = mkdtempSync(resolve(tmpdir(), "anchormap-fixture-process-"));
	const fixtureDir = resolve(rootDir, manifest.family, manifest.id);

	try {
		mkdirSync(resolve(fixtureDir, "repo"), { recursive: true });
		writeFileSync(
			resolve(fixtureDir, "manifest.json"),
			`${JSON.stringify(manifest, null, "\t")}\n`,
		);
		setup(fixtureDir);
		return Promise.resolve(callback(fixtureDir)).finally(() => {
			rmSync(rootDir, { recursive: true, force: true });
		});
	} catch (error) {
		rmSync(rootDir, { recursive: true, force: true });
		throw error;
	}
}

function createDefaultTestTraceCapture() {
	return defaultTraceCaptureFactory();
}

test("captures raw stdout/stderr bytes, exit code, and report fields for a stub CLI", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_success_raw_bytes", 0),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"process.stdout.write(Buffer.from([0x41, 0x0a, 0x42]));",
					"process.stderr.write(Buffer.from([0x43]));",
					"process.exit(0);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				const result = await executeFixtureCommand(fixture, sandbox, {
					timeoutMs: 1_000,
					traceCaptureFactory: createDefaultTestTraceCapture,
				});

				assert.deepEqual(result.command, fixture.manifest.command);
				assert.equal(result.cwd, sandbox.cwd);
				assert.equal(result.exitCode, 0);
				assert.deepEqual(result.stdout, Buffer.from([0x41, 0x0a, 0x42]));
				assert.deepEqual(result.stderr, Buffer.from([0x43]));
				assert.equal(result.stdoutLength, 3);
				assert.equal(result.stderrLength, 1);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("captures non-zero exit codes without normalizing stdout or stderr", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_non_zero_exit", 3),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"process.stdout.write('no-newline');",
					"process.stderr.write('E\\n');",
					"process.exit(3);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				const result = await executeFixtureCommand(fixture, sandbox, {
					timeoutMs: 1_000,
					traceCaptureFactory: createDefaultTestTraceCapture,
				});

				assert.equal(result.exitCode, 3);
				assert.deepEqual(result.stdout, Buffer.from("no-newline", "utf8"));
				assert.deepEqual(result.stderr, Buffer.from("E\n", "utf8"));
				assert.equal(result.stdoutLength, "no-newline".length);
				assert.equal(result.stderrLength, 2);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("loads optional phase trace events and derives per-phase timings", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_phase_trace", 2),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"const events = [",
					"\t{ phase: 'cli.parse', status: 'pass', started_at_ms: 0, finished_at_ms: 1, duration_ms: 1, detail: 'scan --json' },",
					"\t{ phase: 'config.load', status: 'fail', started_at_ms: 1, finished_at_ms: 3, duration_ms: 2, detail: 'missing anchormap.yaml' },",
					"\t{ phase: 'spec.index', status: 'pass', started_at_ms: 3, finished_at_ms: 4, duration_ms: 1, detail: null },",
					"\t{ phase: 'ts.graph', status: 'pass', started_at_ms: 4, finished_at_ms: 5, duration_ms: 1, detail: null },",
					"\t{ phase: 'scan.evaluate', status: 'pass', started_at_ms: 5, finished_at_ms: 6, duration_ms: 1, detail: null },",
					"\t{ phase: 'render', status: 'pass', started_at_ms: 6, finished_at_ms: 7, duration_ms: 1, detail: null },",
					"\t{ phase: 'fs.write', status: 'pass', started_at_ms: 7, finished_at_ms: 8, duration_ms: 1, detail: null },",
					"\t{ phase: 'exit', status: 'fail', started_at_ms: 8, finished_at_ms: 9, duration_ms: 1, detail: 'exit_code=2' },",
					"];",
					"fs.writeFileSync(tracePath, JSON.stringify({ events }, null, '\\t') + '\\n');",
					"process.stderr.write('config missing\\n');",
					"process.exit(2);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				const result = await executeFixtureCommand(fixture, sandbox, {
					timeoutMs: 1_000,
					traceCaptureFactory: createDefaultTestTraceCapture,
				});

				assert.equal(result.exitCode, 2);
				assert.ok(result.totalDurationMs >= 0);
				assert.equal(result.phaseTraceEvents.length, 8);
				assert.deepEqual(
					result.phaseTraceEvents.map((event) => event.phase),
					[
						"cli.parse",
						"config.load",
						"spec.index",
						"ts.graph",
						"scan.evaluate",
						"render",
						"fs.write",
						"exit",
					],
				);
				assert.equal(result.lastFailedPhase, "config.load");
				assert.deepEqual(
					result.phaseTimings.map((timing) => timing.phase),
					[
						"cli.parse",
						"config.load",
						"spec.index",
						"ts.graph",
						"scan.evaluate",
						"render",
						"fs.write",
						"exit",
					],
				);
				assert.equal(
					result.phaseTimings.find((timing) => timing.phase === "config.load")?.status,
					"fail",
				);
				for (const timing of result.phaseTimings) {
					assert.ok(timing.total_duration_ms >= 0);
					assert.equal(timing.occurrences, 1);
				}
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("ignores recovered retries when deriving lastFailedPhase while preserving aggregated timing status", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_repeated_phase_trace", 0),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"const events = [",
					"\t{ phase: 'config.load', status: 'fail', started_at_ms: 0, finished_at_ms: 2, duration_ms: 2, detail: 'first attempt' },",
					"\t{ phase: 'config.load', status: 'pass', started_at_ms: 2, finished_at_ms: 3, duration_ms: 1, detail: 'second attempt' },",
					"\t{ phase: 'exit', status: 'pass', started_at_ms: 3, finished_at_ms: 4, duration_ms: 1, detail: 'exit_code=0' },",
					"];",
					"fs.writeFileSync(tracePath, JSON.stringify({ events }, null, '\\t') + '\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				const result = await executeFixtureCommand(fixture, sandbox, {
					timeoutMs: 1_000,
					traceCaptureFactory: createDefaultTestTraceCapture,
				});

				assert.equal(result.exitCode, 0);
				assert.equal(result.lastFailedPhase, null);
				assert.equal(result.phaseTimings.length, 2);
				assert.deepEqual(
					result.phaseTimings.map((timing) => timing.phase),
					["config.load", "exit"],
				);

				const configLoadTiming = result.phaseTimings.find(
					(timing) => timing.phase === "config.load",
				);
				assert.ok(configLoadTiming);
				assert.equal(configLoadTiming.status, "fail");
				assert.equal(configLoadTiming.occurrences, 2);
				assert.equal(configLoadTiming.total_duration_ms, 3);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("preserves the last non-exit failure when the command later fails after the same coarse phase passes", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_repeated_phase_failure", 2),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"const events = [",
					"\t{ phase: 'fs.write', status: 'fail', started_at_ms: 0, finished_at_ms: 2, duration_ms: 2, detail: 'anchormap.yaml' },",
					"\t{ phase: 'fs.write', status: 'pass', started_at_ms: 2, finished_at_ms: 3, duration_ms: 1, detail: 'summary.txt' },",
					"\t{ phase: 'exit', status: 'fail', started_at_ms: 3, finished_at_ms: 4, duration_ms: 1, detail: 'exit_code=2' },",
					"];",
					"fs.writeFileSync(tracePath, JSON.stringify({ events }, null, '\\t') + '\\n');",
					"process.exit(2);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				const result = await executeFixtureCommand(fixture, sandbox, {
					timeoutMs: 1_000,
					traceCaptureFactory: createDefaultTestTraceCapture,
				});

				assert.equal(result.exitCode, 2);
				assert.equal(result.lastFailedPhase, "fs.write");
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("records an explicit trace setup failure without changing command semantics", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_trace_capture_setup_failure", 0),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"process.stdout.write(process.env.ANCHORMAP_FIXTURE_TRACE_PATH ? 'trace-on\\n' : 'trace-off\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);
			const previousTraceEnv = process.env[FIXTURE_TRACE_ENV_VAR];

			process.env[FIXTURE_TRACE_ENV_VAR] = resolve(
				fixtureDir,
				"repo",
				"inherited-phase-trace.json",
			);

			try {
				const result = await executeFixtureCommand(fixture, sandbox, {
					timeoutMs: 1_000,
					traceCaptureFactory: () => {
						throw new Error("ENOSPC: no space left on device");
					},
				});

				assert.equal(result.exitCode, 0);
				assert.deepEqual(result.stdout, Buffer.from("trace-off\n", "utf8"));
				assert.equal(result.phaseTraceEvents.length, 0);
				assert.equal(result.phaseTimings.length, 0);
				assert.equal(result.lastFailedPhase, null);
				assert.equal(result.phaseTraceStatus.state, "setup_failed");
				assert.match(result.phaseTraceStatus.detail ?? "", /ENOSPC/);
			} finally {
				if (previousTraceEnv === undefined) {
					delete process.env[FIXTURE_TRACE_ENV_VAR];
				} else {
					process.env[FIXTURE_TRACE_ENV_VAR] = previousTraceEnv;
				}
				sandbox.dispose();
			}
		},
	);
});

test("clears inherited trace env when trace capture is not requested", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_trace_not_requested", 0),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"process.stdout.write(process.env.ANCHORMAP_FIXTURE_TRACE_PATH ? 'trace-on\\n' : 'trace-off\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);
			const previousTraceEnv = process.env[FIXTURE_TRACE_ENV_VAR];

			process.env[FIXTURE_TRACE_ENV_VAR] = resolve(
				fixtureDir,
				"repo",
				"inherited-phase-trace.json",
			);

			try {
				const result = await executeFixtureCommand(fixture, sandbox, { timeoutMs: 1_000 });

				assert.equal(result.exitCode, 0);
				assert.deepEqual(result.stdout, Buffer.from("trace-off\n", "utf8"));
				assert.equal(result.phaseTraceEvents.length, 0);
				assert.equal(result.phaseTimings.length, 0);
				assert.equal(result.lastFailedPhase, null);
				assert.deepEqual(result.phaseTraceStatus, { state: "not_requested", detail: null });
			} finally {
				if (previousTraceEnv === undefined) {
					delete process.env[FIXTURE_TRACE_ENV_VAR];
				} else {
					process.env[FIXTURE_TRACE_ENV_VAR] = previousTraceEnv;
				}
				sandbox.dispose();
			}
		},
	);
});

test("does not delete caller-owned trace capture directories without an explicit disposer", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_external_trace_capture_dir", 0),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"fs.writeFileSync(tracePath, JSON.stringify({ events: [] }, null, '\\t') + '\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);
			const externalTraceDir = mkdtempSync(
				resolve(tmpdir(), "anchormap-fixture-process-external-trace-"),
			);
			const externalMarkerPath = resolve(externalTraceDir, "keep.txt");

			writeFileSync(externalMarkerPath, "keep\n");

			try {
				const result = await executeFixtureCommand(fixture, sandbox, {
					timeoutMs: 1_000,
					traceCaptureFactory: () => ({
						traceCaptureDir: externalTraceDir,
						tracePath: resolve(externalTraceDir, "phase-trace.json"),
					}),
				});

				assert.equal(result.exitCode, 0);
				assert.equal(result.phaseTraceStatus.state, "captured");
				assert.equal(existsSync(externalTraceDir), true);
				assert.equal(existsSync(externalMarkerPath), true);
			} finally {
				rmSync(externalTraceDir, { recursive: true, force: true });
				sandbox.dispose();
			}
		},
	);
});

test("clears stale custom trace files before a run that emits no trace", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_stale_custom_trace_file", 0),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"process.stdout.write(process.env.ANCHORMAP_FIXTURE_TRACE_PATH ? 'trace-on\\n' : 'trace-off\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);
			const externalTraceDir = mkdtempSync(
				resolve(tmpdir(), "anchormap-fixture-process-stale-trace-"),
			);
			const tracePath = resolve(externalTraceDir, "phase-trace.json");

			writeFileSync(
				tracePath,
				`${JSON.stringify(
					{
						events: [
							{
								phase: "config.load",
								status: "fail",
								started_at_ms: 0,
								finished_at_ms: 1,
								duration_ms: 1,
								detail: "stale failure",
							},
						],
					},
					null,
					"\t",
				)}\n`,
			);

			try {
				const result = await executeFixtureCommand(fixture, sandbox, {
					timeoutMs: 1_000,
					traceCaptureFactory: () => ({
						traceCaptureDir: externalTraceDir,
						tracePath,
					}),
				});

				assert.equal(result.exitCode, 0);
				assert.deepEqual(result.stdout, Buffer.from("trace-on\n", "utf8"));
				assert.equal(result.phaseTraceStatus.state, "not_emitted");
				assert.deepEqual(result.phaseTraceEvents, []);
				assert.equal(result.lastFailedPhase, null);
				assert.equal(existsSync(tracePath), false);
			} finally {
				rmSync(externalTraceDir, { recursive: true, force: true });
				sandbox.dispose();
			}
		},
	);
});

test("normalizes relative custom trace capture paths before exporting them to the child process", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_relative_trace_capture_path", 0),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"const fs = require('node:fs');",
					"const path = require('node:path');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"fs.writeFileSync(tracePath, JSON.stringify({ events: [] }, null, '\\t') + '\\n');",
					"process.stdout.write(path.isAbsolute(tracePath) ? 'absolute\\n' : 'relative\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);
			const externalTraceDir = mkdtempSync(
				resolve(tmpdir(), "anchormap-fixture-process-relative-trace-"),
			);
			const externalTracePath = resolve(externalTraceDir, "phase-trace.json");

			try {
				const result = await executeFixtureCommand(fixture, sandbox, {
					timeoutMs: 1_000,
					traceCaptureFactory: () => ({
						traceCaptureDir: externalTraceDir,
						tracePath: "phase-trace.json",
					}),
				});

				assert.equal(result.exitCode, 0);
				assert.deepEqual(result.stdout, Buffer.from("absolute\n", "utf8"));
				assert.equal(result.phaseTraceStatus.state, "captured");
				assert.equal(existsSync(externalTracePath), true);
				assert.equal(existsSync(resolve(sandbox.cwd, "phase-trace.json")), false);
			} finally {
				rmSync(externalTraceDir, { recursive: true, force: true });
				sandbox.dispose();
			}
		},
	);
});

test("rejects relative custom trace paths that escape the reserved trace capture directory", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_relative_trace_capture_escape", 0),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"process.stdout.write(process.env.ANCHORMAP_FIXTURE_TRACE_PATH ? 'trace-on\\n' : 'trace-off\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);
			const externalTraceDir = mkdtempSync(
				resolve(tmpdir(), "anchormap-fixture-process-trace-escape-"),
			);
			const escapedTracePath = resolve(externalTraceDir, "..", "phase-trace-escape.json");

			writeFileSync(escapedTracePath, "keep\n");

			try {
				const result = await executeFixtureCommand(fixture, sandbox, {
					timeoutMs: 1_000,
					traceCaptureFactory: () => ({
						traceCaptureDir: externalTraceDir,
						tracePath: "../phase-trace-escape.json",
					}),
				});

				assert.equal(result.exitCode, 0);
				assert.deepEqual(result.stdout, Buffer.from("trace-off\n", "utf8"));
				assert.equal(result.phaseTraceStatus.state, "setup_failed");
				assert.match(result.phaseTraceStatus.detail ?? "", /must stay within traceCaptureDir/);
				assert.deepEqual(readFileSync(escapedTracePath), Buffer.from("keep\n", "utf8"));
			} finally {
				rmSync(escapedTracePath, { force: true });
				rmSync(externalTraceDir, { recursive: true, force: true });
				sandbox.dispose();
			}
		},
	);
});

test("rejects absolute custom trace paths that escape the reserved trace capture directory", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_absolute_trace_capture_escape", 0),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"process.stdout.write(process.env.ANCHORMAP_FIXTURE_TRACE_PATH ? 'trace-on\\n' : 'trace-off\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);
			const externalTraceDir = mkdtempSync(
				resolve(tmpdir(), "anchormap-fixture-process-trace-absolute-"),
			);
			const escapedTracePath = resolve(tmpdir(), "anchormap-fixture-process-absolute-escape.json");

			writeFileSync(escapedTracePath, "keep\n");

			try {
				const result = await executeFixtureCommand(fixture, sandbox, {
					timeoutMs: 1_000,
					traceCaptureFactory: () => ({
						traceCaptureDir: externalTraceDir,
						tracePath: escapedTracePath,
					}),
				});

				assert.equal(result.exitCode, 0);
				assert.deepEqual(result.stdout, Buffer.from("trace-off\n", "utf8"));
				assert.equal(result.phaseTraceStatus.state, "setup_failed");
				assert.match(result.phaseTraceStatus.detail ?? "", /must stay within traceCaptureDir/);
				assert.deepEqual(readFileSync(escapedTracePath), Buffer.from("keep\n", "utf8"));
			} finally {
				rmSync(escapedTracePath, { force: true });
				rmSync(externalTraceDir, { recursive: true, force: true });
				sandbox.dispose();
			}
		},
	);
});

test("reports timeouts as harness failures instead of product exit codes", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_timeout", 0),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"process.stdout.write('prefix');",
					"setTimeout(() => {",
					"\tprocess.stdout.write('late');",
					"\tprocess.exit(0);",
					"}, 5_000);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				await assert.rejects(
					() =>
						executeFixtureCommand(fixture, sandbox, {
							timeoutMs: 50,
							traceCaptureFactory: createDefaultTestTraceCapture,
						}),
					(error: unknown) => {
						assert.ok(error instanceof FixtureProcessTimeoutError);
						assert.ok(error instanceof FixtureProcessError);
						assert.match(error.message, /timed out after 50 ms/);
						assert.deepEqual(error.command, fixture.manifest.command);
						assert.equal(error.cwd, sandbox.cwd);
						assert.equal(error.timeoutMs, 50);
						assert.equal(Number.isInteger(error.stdoutLength), true);
						assert.equal(Number.isInteger(error.stderrLength), true);
						assert.ok(error.stdoutLength >= 0);
						assert.ok(error.stderrLength >= 0);
						return true;
					},
				);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("records malformed phase traces explicitly when reporting process timeouts", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_timeout_malformed_trace", 0),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"fs.writeFileSync(tracePath, '{\"events\": [');",
					"process.stdout.write('prefix');",
					"setTimeout(() => {",
					"\tprocess.stdout.write('late');",
					"\tprocess.exit(0);",
					"}, 5_000);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				await assert.rejects(
					() =>
						executeFixtureCommand(fixture, sandbox, {
							timeoutMs: 50,
							traceCaptureFactory: createDefaultTestTraceCapture,
						}),
					(error: unknown) => {
						assert.ok(error instanceof FixtureProcessTimeoutError);
						assert.equal(error.phaseTraceEvents.length, 0);
						assert.equal(error.phaseTimings.length, 0);
						assert.equal(error.lastFailedPhase, null);
						assert.ok(
							error.phaseTraceStatus.state === "invalid" ||
								error.phaseTraceStatus.state === "not_emitted",
						);
						if (error.phaseTraceStatus.state === "invalid") {
							assert.match(error.phaseTraceStatus.detail ?? "", /not valid JSON/);
						}
						return true;
					},
				);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("records malformed phase traces explicitly when the fixture command exits normally", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_normal_exit_malformed_trace", 0),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"fs.writeFileSync(tracePath, '{\"events\": [');",
					"process.stdout.write('ok\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				const result = await executeFixtureCommand(fixture, sandbox, {
					timeoutMs: 1_000,
					traceCaptureFactory: createDefaultTestTraceCapture,
				});

				assert.equal(result.exitCode, 0);
				assert.deepEqual(result.stdout, Buffer.from("ok\n", "utf8"));
				assert.equal(result.phaseTraceEvents.length, 0);
				assert.equal(result.phaseTimings.length, 0);
				assert.equal(result.lastFailedPhase, null);
				assert.equal(result.phaseTraceStatus.state, "invalid");
				assert.match(result.phaseTraceStatus.detail ?? "", /not valid JSON/);
				assert.deepEqual(result.phaseTraceRaw, Buffer.from('{"events": [', "utf8"));
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("ignores trace cleanup failures after the fixture command has already settled", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_trace_cleanup_failure", 0),
		(fixtureDir) => {
			mkdirSync(resolve(fixtureDir, "trace-capture"), { recursive: true });
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"fs.writeFileSync(tracePath, JSON.stringify({ events: [] }, null, '\\t') + '\\n');",
					"process.stdout.write('ok\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);
			let disposeCalls = 0;

			try {
				const result = await executeFixtureCommand(fixture, sandbox, {
					timeoutMs: 1_000,
					traceCaptureFactory: () => ({
						traceCaptureDir: resolve(fixtureDir, "trace-capture"),
						tracePath: resolve(fixtureDir, "trace-capture", "phase-trace.json"),
						dispose: () => {
							disposeCalls += 1;
							throw new Error("EBUSY: trace capture still locked");
						},
					}),
				});

				assert.equal(result.exitCode, 0);
				assert.deepEqual(result.stdout, Buffer.from("ok\n", "utf8"));
				assert.equal(result.phaseTraceStatus.state, "captured");
				assert.equal(result.phaseTraceRaw, null);
				assert.equal(disposeCalls, 1);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("preserves trace and stream observability when the fixture command exits by signal", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_signal_exit_trace", 0),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
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
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				await assert.rejects(
					() =>
						executeFixtureCommand(fixture, sandbox, {
							timeoutMs: 1_000,
							traceCaptureFactory: createDefaultTestTraceCapture,
						}),
					(error: unknown) => {
						assert.ok(error instanceof FixtureProcessError);
						assert.match(error.message, /signal=SIGTERM/);
						assert.deepEqual(error.stdout, Buffer.from("signal-stdout\n", "utf8"));
						assert.deepEqual(error.stderr, Buffer.from("signal-stderr\n", "utf8"));
						assert.equal(error.stdoutLength, "signal-stdout\n".length);
						assert.equal(error.stderrLength, "signal-stderr\n".length);
						assert.ok((error.totalDurationMs ?? -1) >= 0);
						assert.equal(error.phaseTraceStatus?.state, "captured");
						assert.equal(error.phaseTraceEvents.length, 2);
						assert.equal(error.phaseTimings.length, 2);
						assert.equal(error.lastFailedPhase, "config.load");
						return true;
					},
				);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("records when trace capture was available but the command emitted no trace", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_trace_not_emitted", 0),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"process.stdout.write(process.env.ANCHORMAP_FIXTURE_TRACE_PATH ? 'trace-on\\n' : 'trace-off\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				const result = await executeFixtureCommand(fixture, sandbox, {
					timeoutMs: 1_000,
					traceCaptureFactory: createDefaultTestTraceCapture,
				});

				assert.equal(result.exitCode, 0);
				assert.deepEqual(result.stdout, Buffer.from("trace-on\n", "utf8"));
				assert.equal(result.phaseTraceEvents.length, 0);
				assert.equal(result.phaseTimings.length, 0);
				assert.equal(result.lastFailedPhase, null);
				assert.deepEqual(result.phaseTraceStatus, { state: "not_emitted", detail: null });
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("preserves timing metadata and marks trace capture as spawn_failed when the command never starts", async () => {
	const manifest: FixtureManifest = {
		...minimalFixtureManifest("harness_process_spawn_failure", 0),
		command: ["./missing-cli", "scan"],
	};

	await withTempFixture(
		manifest,
		() => {},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				await assert.rejects(
					() =>
						executeFixtureCommand(fixture, sandbox, {
							timeoutMs: 1_000,
							traceCaptureFactory: createDefaultTestTraceCapture,
						}),
					(error: unknown) => {
						assert.ok(error instanceof FixtureProcessError);
						assert.match(error.message, /failed to start/);
						assert.ok((error.totalDurationMs ?? -1) >= 0);
						assert.equal(error.phaseTraceEvents.length, 0);
						assert.equal(error.phaseTimings.length, 0);
						assert.equal(error.lastFailedPhase, null);
						assert.equal(error.phaseTraceStatus?.state, "spawn_failed");
						assert.match(error.phaseTraceStatus?.detail ?? "", /ENOENT|not found/);
						return true;
					},
				);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("resolves built dist CLI paths from the project root when the sandbox fixture does not carry them", async () => {
	const manifest: FixtureManifest = {
		id: "harness_process_project_dist_stub",
		family: "harness-process",
		purpose: "Fixture process project-dist resolution test fixture.",
		command: ["node", "dist/cli-stub.js", "scan"],
		cwd: ".",
		exit_code: 0,
		stdout: { kind: "ignored" },
		stderr: { kind: "ignored" },
		filesystem: { kind: "no_mutation" },
	};

	await withTempFixture(
		manifest,
		() => {},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				const result = await executeFixtureCommand(fixture, sandbox, {
					timeoutMs: 1_000,
					traceCaptureFactory: createDefaultTestTraceCapture,
				});

				assert.deepEqual(result.command, fixture.manifest.command);
				assert.equal(result.exitCode, 0);
				assert.deepEqual(result.stdout, Buffer.from("stub scan\n", "utf8"));
				assert.deepEqual(result.stderr, Buffer.alloc(0));
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("prefers a built dist CLI carried by the sandbox repo root even when cwd is a subdirectory", async () => {
	const manifest: FixtureManifest = {
		id: "harness_process_sandbox_root_dist_stub",
		family: "harness-process",
		purpose:
			"Fixture process treats supported dist entrypoints as repo-root relative before project fallback.",
		command: ["node", "dist/cli-stub.js", "scan"],
		cwd: "subdir",
		exit_code: 0,
		stdout: { kind: "ignored" },
		stderr: { kind: "ignored" },
		filesystem: { kind: "no_mutation" },
	};

	await withTempFixture(
		manifest,
		(fixtureDir) => {
			mkdirSync(resolve(fixtureDir, "repo", "dist"), { recursive: true });
			mkdirSync(resolve(fixtureDir, "repo", "subdir", "dist"), { recursive: true });
			writeFileSync(
				resolve(fixtureDir, "repo", "dist", "cli-stub.js"),
				'process.stdout.write("sandbox root dist stub\\n");\nprocess.exit(0);\n',
			);
			writeFileSync(
				resolve(fixtureDir, "repo", "subdir", "dist", "cli-stub.js"),
				'process.stdout.write("shadowed subdir dist stub\\n");\nprocess.exit(0);\n',
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				const result = await executeFixtureCommand(fixture, sandbox, { timeoutMs: 1_000 });

				assert.deepEqual(result.command, fixture.manifest.command);
				assert.equal(result.exitCode, 0);
				assert.deepEqual(result.stdout, Buffer.from("sandbox root dist stub\n", "utf8"));
				assert.deepEqual(result.stderr, Buffer.alloc(0));
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("does not fall back to the project root for arbitrary missing relative node scripts", async () => {
	const manifest: FixtureManifest = {
		id: "harness_process_missing_relative_script",
		family: "harness-process",
		purpose: "Fixture process rejects unrelated project-root script fallback.",
		command: ["node", "scripts/not-in-sandbox.js", "scan"],
		cwd: ".",
		exit_code: 0,
		stdout: { kind: "ignored" },
		stderr: { kind: "ignored" },
		filesystem: { kind: "no_mutation" },
	};

	await withTempFixture(
		manifest,
		() => {},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				const result = await executeFixtureCommand(fixture, sandbox, { timeoutMs: 1_000 });

				assert.equal(result.exitCode !== 0, true);
				assert.equal(result.stdout.length, 0);
				assert.match(result.stderr.toString("utf8"), /not[- ]in[- ]sandbox|Cannot find module/i);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("derives aggregated phase timings from timestamps instead of trusting duration_ms", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_phase_trace_timestamp_duration", 0),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"const events = [",
					"\t{ phase: 'config.load', status: 'pass', started_at_ms: 5, finished_at_ms: 8, duration_ms: 99, detail: 'first attempt' },",
					"\t{ phase: 'config.load', status: 'fail', started_at_ms: 8, finished_at_ms: 10, duration_ms: 42, detail: 'second attempt' },",
					"\t{ phase: 'exit', status: 'pass', started_at_ms: 10, finished_at_ms: 11, duration_ms: 1000, detail: 'exit_code=0' },",
					"];",
					"fs.writeFileSync(tracePath, JSON.stringify({ events }, null, '\\t') + '\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				const result = await executeFixtureCommand(fixture, sandbox, {
					timeoutMs: 1_000,
					traceCaptureFactory: createDefaultTestTraceCapture,
				});
				const configLoadTiming = result.phaseTimings.find(
					(timing) => timing.phase === "config.load",
				);
				const exitTiming = result.phaseTimings.find((timing) => timing.phase === "exit");

				assert.ok(configLoadTiming);
				assert.equal(configLoadTiming.total_duration_ms, 5);
				assert.equal(configLoadTiming.status, "fail");
				assert.equal(configLoadTiming.occurrences, 2);
				assert.ok(exitTiming);
				assert.equal(exitTiming.total_duration_ms, 1);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("measures process duration before synchronous trace loading", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_duration_excludes_trace_loading", 0),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"fs.writeFileSync(tracePath, JSON.stringify({ events: [] }, null, '\\t') + '\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				const loaderDelayMs = 75;
				const startedAtMs = Date.now();
				const result = await executeFixtureCommand(fixture, sandbox, {
					timeoutMs: 1_000,
					traceCaptureFactory: createDefaultTestTraceCapture,
					traceLoader: (_tracePath) => {
						const delayUntilMs = Date.now() + loaderDelayMs;
						while (Date.now() < delayUntilMs) {
							// Busy wait to simulate synchronous trace parsing work.
						}
						return {
							trace: createEmptyFixturePhaseTrace(),
							traceStatus: { state: "captured", detail: null },
						};
					},
				});
				const finishedAtMs = Date.now();
				const wallClockDurationMs = finishedAtMs - startedAtMs;

				assert.equal(result.exitCode, 0);
				assert.equal(result.phaseTraceStatus.state, "captured");
				assert.ok(result.totalDurationMs >= 0);
				assert.ok(
					wallClockDurationMs - result.totalDurationMs >= loaderDelayMs / 2,
					`expected process duration ${result.totalDurationMs}ms to exclude most of ${loaderDelayMs}ms trace loading; wall=${wallClockDurationMs}ms`,
				);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("classifies trace loader failures as harness errors with archived diagnostics", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_trace_loader_failure", 0),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"fs.writeFileSync(tracePath, JSON.stringify({ events: [] }, null, '\\t') + '\\n');",
					"process.stdout.write('trace-stdout\\n');",
					"process.stderr.write('trace-stderr\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				await assert.rejects(
					() =>
						executeFixtureCommand(fixture, sandbox, {
							timeoutMs: 1_000,
							traceCaptureFactory: createDefaultTestTraceCapture,
							traceLoader: (_tracePath) => {
								throw new Error("simulated trace loader failure");
							},
						}),
					(error: unknown) => {
						assert.ok(error instanceof FixtureProcessError);
						assert.match(error.message, /fixture phase trace loading failed/);
						assert.match(error.message, /simulated trace loader failure/);
						assert.deepEqual(error.stdout, Buffer.from("trace-stdout\n", "utf8"));
						assert.deepEqual(error.stderr, Buffer.from("trace-stderr\n", "utf8"));
						assert.equal(error.stdoutLength, "trace-stdout\n".length);
						assert.equal(error.stderrLength, "trace-stderr\n".length);
						assert.ok((error.totalDurationMs ?? -1) >= 0);
						assert.equal(error.phaseTraceEvents.length, 0);
						assert.equal(error.phaseTimings.length, 0);
						assert.equal(error.lastFailedPhase, null);
						assert.deepEqual(error.phaseTraceStatus, {
							state: "invalid",
							detail: "simulated trace loader failure",
						});
						return true;
					},
				);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("preserves timeout classification when a custom trace loader throws", async () => {
	await withTempFixture(
		minimalFixtureManifest("harness_process_timeout_trace_loader_failure", 0),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"const fs = require('node:fs');",
					"const tracePath = process.env.ANCHORMAP_FIXTURE_TRACE_PATH;",
					"fs.writeFileSync(tracePath, JSON.stringify({ events: [] }, null, '\\t') + '\\n');",
					"setTimeout(() => {",
					"\tprocess.exit(0);",
					"}, 5_000);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				await assert.rejects(
					() =>
						executeFixtureCommand(fixture, sandbox, {
							timeoutMs: 50,
							traceCaptureFactory: createDefaultTestTraceCapture,
							traceLoader: (_tracePath) => {
								throw new Error("simulated trace loader failure");
							},
						}),
					(error: unknown) => {
						assert.ok(error instanceof FixtureProcessTimeoutError);
						assert.equal(error.phaseTraceStatus.state, "invalid");
						assert.equal(error.phaseTraceStatus.detail, "simulated trace loader failure");
						return true;
					},
				);
			} finally {
				sandbox.dispose();
			}
		},
	);
});
