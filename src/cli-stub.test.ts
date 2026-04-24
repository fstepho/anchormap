import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { test } from "node:test";

import { runCliStub } from "./cli-stub";
import { FIXTURE_TRACE_ENV_VAR } from "./harness/fixture-phase-trace";

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

function withTempRepo(callback: (repoDir: string) => void): void {
	const repoDir = mkdtempSync(resolve(tmpdir(), "anchormap-cli-stub-"));

	try {
		callback(repoDir);
	} finally {
		rmSync(repoDir, { recursive: true, force: true });
	}
}

test("scan --json succeeds with exact golden bytes when the stub fixture repo is present", () => {
	withTempRepo((repoDir) => {
		mkdirSync(resolve(repoDir, "specs"), { recursive: true });
		writeFileSync(resolve(repoDir, "specs", "example.md"), "# US-001 Example\n");
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runCliStub(["scan", "--json"], {
			cwd: repoDir,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 0);
		assert.equal(stdout.read(), '{"ok":true}\n');
		assert.equal(stderr.read(), "");
	});
});

test("scan --json fails with empty stdout when the stub fixture repo is missing the success marker", () => {
	withTempRepo((repoDir) => {
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runCliStub(["scan", "--json"], {
			cwd: repoDir,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 2);
		assert.equal(stdout.read(), "");
		assert.match(stderr.read(), /missing specs\/example\.md/);
	});
});

test("priority probe returns usage code 4 before config access", () => {
	withTempRepo((repoDir) => {
		writeFileSync(resolve(repoDir, ".stub-priority-config-access-mutation.txt"), "config access\n");
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runCliStub(["scan", "--json", "--unknown"], {
			cwd: repoDir,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 4);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.equal(existsSync(resolve(repoDir, ".stub-priority-config-accessed.txt")), false);
	});
});

test("priority probe returns config code 2 before repo analysis", () => {
	withTempRepo((repoDir) => {
		writeFileSync(resolve(repoDir, ".stub-priority-config-error"), "");
		writeFileSync(resolve(repoDir, ".stub-priority-repo-error"), "");
		writeFileSync(resolve(repoDir, ".stub-priority-repo-access-mutation.txt"), "repo access\n");
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runCliStub(["scan", "--json"], {
			cwd: repoDir,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 2);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.equal(existsSync(resolve(repoDir, ".stub-priority-repo-accessed.txt")), false);
	});
});

test("priority probe returns repo code 3 before later internal injection", () => {
	withTempRepo((repoDir) => {
		writeFileSync(resolve(repoDir, ".stub-priority-repo-error"), "");
		writeFileSync(resolve(repoDir, ".stub-priority-internal-error"), "");
		writeFileSync(
			resolve(repoDir, ".stub-priority-internal-access-mutation.txt"),
			"internal access\n",
		);
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runCliStub(["scan", "--json"], {
			cwd: repoDir,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 3);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.equal(existsSync(resolve(repoDir, ".stub-priority-internal-accessed.txt")), false);
	});
});

test("init writes anchormap.yaml from the walking skeleton stub template when requested", () => {
	withTempRepo((repoDir) => {
		const output = [
			"version: 1",
			"product_root: src",
			"spec_roots:",
			"  - specs",
			"mappings: {}",
			"",
		].join("\n");

		writeFileSync(resolve(repoDir, ".stub-init-output.yaml"), output);

		const exitCode = runCliStub(["init"], {
			cwd: repoDir,
		});

		assert.equal(exitCode, 0);
		assert.equal(readFileSync(resolve(repoDir, "anchormap.yaml"), "utf8"), output);
	});
});

test("scan --json can trigger a deterministic unexpected mutation for walking skeleton harness checks", () => {
	withTempRepo((repoDir) => {
		mkdirSync(resolve(repoDir, "specs"), { recursive: true });
		writeFileSync(resolve(repoDir, "specs", "example.md"), "# US-001 Example\n");
		writeFileSync(resolve(repoDir, ".stub-scan-unexpected-mutation.txt"), "unexpected mutation\n");
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runCliStub(["scan", "--json"], {
			cwd: repoDir,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 0);
		assert.equal(stdout.read(), '{"ok":true}\n');
		assert.equal(stderr.read(), "");
		assert.equal(readFileSync(resolve(repoDir, "unexpected.txt"), "utf8"), "unexpected mutation\n");
	});
});

test("scan --json traces deterministic unexpected mutations as a failing fs.write phase", () => {
	withTempRepo((repoDir) => {
		mkdirSync(resolve(repoDir, "specs"), { recursive: true });
		mkdirSync(resolve(repoDir, "src"), { recursive: true });
		writeFileSync(resolve(repoDir, "specs", "example.md"), "# US-001 Example\n");
		writeFileSync(resolve(repoDir, "src", "index.ts"), "export {};\n");
		writeFileSync(resolve(repoDir, ".stub-scan-unexpected-mutation.txt"), "unexpected mutation\n");
		const tracePath = resolve(repoDir, "phase-trace.json");
		const previousTraceEnv = process.env[FIXTURE_TRACE_ENV_VAR];

		process.env[FIXTURE_TRACE_ENV_VAR] = tracePath;

		try {
			const exitCode = runCliStub(["scan", "--json"], {
				cwd: repoDir,
			});

			assert.equal(exitCode, 0);

			const traceDocument = JSON.parse(readFileSync(tracePath, "utf8")) as {
				events: Array<{ phase: string; status: string; detail: string | null }>;
			};
			assert.deepEqual(
				traceDocument.events.map((event) => ({
					phase: event.phase,
					status: event.status,
					detail: event.detail,
				})),
				[
					{
						phase: "cli.parse",
						status: "pass",
						detail: "command=scan",
					},
					{
						phase: "spec.index",
						status: "pass",
						detail: "specs/example.md",
					},
					{
						phase: "ts.graph",
						status: "pass",
						detail: "src/index.ts",
					},
					{
						phase: "scan.evaluate",
						status: "pass",
						detail: null,
					},
					{
						phase: "fs.write",
						status: "fail",
						detail: "unexpected.txt",
					},
					{
						phase: "render",
						status: "pass",
						detail: "stdout.json",
					},
					{
						phase: "exit",
						status: "pass",
						detail: "exit_code=0",
					},
				],
			);
		} finally {
			if (previousTraceEnv === undefined) {
				delete process.env[FIXTURE_TRACE_ENV_VAR];
			} else {
				process.env[FIXTURE_TRACE_ENV_VAR] = previousTraceEnv;
			}
		}
	});
});

test("scan --json omits ts.graph tracing when no graph target exists", () => {
	withTempRepo((repoDir) => {
		mkdirSync(resolve(repoDir, "specs"), { recursive: true });
		writeFileSync(resolve(repoDir, "specs", "example.md"), "# US-001 Example\n");
		const tracePath = resolve(repoDir, "phase-trace.json");
		const previousTraceEnv = process.env[FIXTURE_TRACE_ENV_VAR];

		process.env[FIXTURE_TRACE_ENV_VAR] = tracePath;

		try {
			const exitCode = runCliStub(["scan", "--json"], {
				cwd: repoDir,
			});

			assert.equal(exitCode, 0);

			const traceDocument = JSON.parse(readFileSync(tracePath, "utf8")) as {
				events: Array<{ phase: string }>;
			};
			assert.deepEqual(
				traceDocument.events.map((event) => event.phase),
				["cli.parse", "spec.index", "scan.evaluate", "render", "exit"],
			);
		} finally {
			if (previousTraceEnv === undefined) {
				delete process.env[FIXTURE_TRACE_ENV_VAR];
			} else {
				process.env[FIXTURE_TRACE_ENV_VAR] = previousTraceEnv;
			}
		}
	});
});

test("trace emission failures do not change stub exit semantics", () => {
	withTempRepo((repoDir) => {
		mkdirSync(resolve(repoDir, "specs"), { recursive: true });
		writeFileSync(resolve(repoDir, "specs", "example.md"), "# US-001 Example\n");
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();
		const previousTraceEnv = process.env[FIXTURE_TRACE_ENV_VAR];

		process.env[FIXTURE_TRACE_ENV_VAR] = resolve(repoDir, "missing", "phase-trace.json");

		try {
			const exitCode = runCliStub(["scan", "--json"], {
				cwd: repoDir,
				stdout: stdout.writer,
				stderr: stderr.writer,
			});

			assert.equal(exitCode, 0);
			assert.equal(stdout.read(), '{"ok":true}\n');
			assert.equal(stderr.read(), "");
		} finally {
			if (previousTraceEnv === undefined) {
				delete process.env[FIXTURE_TRACE_ENV_VAR];
			} else {
				process.env[FIXTURE_TRACE_ENV_VAR] = previousTraceEnv;
			}
		}
	});
});

test("scan --json measures render duration around the actual stdout write", () => {
	withTempRepo((repoDir) => {
		mkdirSync(resolve(repoDir, "specs"), { recursive: true });
		writeFileSync(resolve(repoDir, "specs", "example.md"), "# US-001 Example\n");
		const tracePath = resolve(repoDir, "phase-trace.json");
		const previousTraceEnv = process.env[FIXTURE_TRACE_ENV_VAR];
		const stdout = createBufferingWriter();

		process.env[FIXTURE_TRACE_ENV_VAR] = tracePath;

		try {
			const exitCode = runCliStub(["scan", "--json"], {
				cwd: repoDir,
				stdout: {
					write(chunk: string): boolean {
						const startedAtMs = performance.now();
						while (performance.now() - startedAtMs < 25) {
							// Busy-wait to create a deterministic synchronous render span.
						}
						return stdout.writer.write(chunk);
					},
				},
			});

			assert.equal(exitCode, 0);
			assert.equal(stdout.read(), '{"ok":true}\n');

			const traceDocument = JSON.parse(readFileSync(tracePath, "utf8")) as {
				events: Array<{ phase: string; duration_ms: number }>;
			};
			const renderEvent = traceDocument.events.find((event) => event.phase === "render");

			assert.ok(renderEvent);
			assert.ok(renderEvent.duration_ms >= 10);
		} finally {
			if (previousTraceEnv === undefined) {
				delete process.env[FIXTURE_TRACE_ENV_VAR];
			} else {
				process.env[FIXTURE_TRACE_ENV_VAR] = previousTraceEnv;
			}
		}
	});
});

test("init flushes trace output and marks fs.write as failed when the write throws", () => {
	withTempRepo((repoDir) => {
		writeFileSync(resolve(repoDir, ".stub-init-output.yaml"), "version: 1\n");
		mkdirSync(resolve(repoDir, "anchormap.yaml"));
		const tracePath = resolve(repoDir, "phase-trace.json");
		const previousTraceEnv = process.env[FIXTURE_TRACE_ENV_VAR];

		process.env[FIXTURE_TRACE_ENV_VAR] = tracePath;

		try {
			assert.throws(
				() => runCliStub(["init"], { cwd: repoDir }),
				/EISDIR|illegal operation|directory/i,
			);

			const traceDocument = JSON.parse(readFileSync(tracePath, "utf8")) as {
				events: Array<{ phase: string; status: string; detail: string | null }>;
			};
			assert.deepEqual(
				traceDocument.events.map((event) => ({
					phase: event.phase,
					status: event.status,
					detail: event.detail,
				})),
				[
					{
						phase: "cli.parse",
						status: "pass",
						detail: "command=init",
					},
					{
						phase: "fs.write",
						status: "fail",
						detail: "anchormap.yaml",
					},
				],
			);
		} finally {
			if (previousTraceEnv === undefined) {
				delete process.env[FIXTURE_TRACE_ENV_VAR];
			} else {
				process.env[FIXTURE_TRACE_ENV_VAR] = previousTraceEnv;
			}
		}
	});
});

test("unsupported commands emit one failing cli.parse phase event", () => {
	withTempRepo((repoDir) => {
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();
		const tracePath = resolve(repoDir, "phase-trace.json");
		const previousTraceEnv = process.env[FIXTURE_TRACE_ENV_VAR];

		process.env[FIXTURE_TRACE_ENV_VAR] = tracePath;

		try {
			const exitCode = runCliStub(["unknown"], {
				cwd: repoDir,
				stdout: stdout.writer,
				stderr: stderr.writer,
			});

			assert.equal(exitCode, 4);
			assert.equal(stdout.read(), "");
			assert.match(stderr.read(), /unsupported command: unknown/);

			const traceDocument = JSON.parse(readFileSync(tracePath, "utf8")) as {
				events: Array<{ phase: string; status: string; detail: string | null }>;
			};
			assert.deepEqual(
				traceDocument.events.map((event) => ({
					phase: event.phase,
					status: event.status,
					detail: event.detail,
				})),
				[
					{
						phase: "cli.parse",
						status: "fail",
						detail: "unsupported command unknown",
					},
					{
						phase: "exit",
						status: "fail",
						detail: "exit_code=4",
					},
				],
			);
		} finally {
			if (previousTraceEnv === undefined) {
				delete process.env[FIXTURE_TRACE_ENV_VAR];
			} else {
				process.env[FIXTURE_TRACE_ENV_VAR] = previousTraceEnv;
			}
		}
	});
});
