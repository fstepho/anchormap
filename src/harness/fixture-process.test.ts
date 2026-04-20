import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import { type FixtureManifest, loadFixtureManifest } from "./fixture-manifest";
import {
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
				const result = await executeFixtureCommand(fixture, sandbox, { timeoutMs: 1_000 });

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
				const result = await executeFixtureCommand(fixture, sandbox, { timeoutMs: 1_000 });

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
					() => executeFixtureCommand(fixture, sandbox, { timeoutMs: 50 }),
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
