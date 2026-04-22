import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import type { FixtureManifest, LoadedFixtureManifest } from "./fixture-manifest";
import { resolveFixtureLayout } from "./fixture-manifest";
import {
	assertFixtureOutputOracles,
	assertFixtureStderrOracle,
	FixtureOutputOracleError,
} from "./fixture-output-oracle";
import type { FixtureProcessResult } from "./fixture-process";

function baseProcessResult(overrides: Partial<FixtureProcessResult> = {}): FixtureProcessResult {
	const stdout = overrides.stdout ?? Buffer.alloc(0);
	const stderr = overrides.stderr ?? Buffer.alloc(0);

	return {
		command: overrides.command ?? ["node", "./cli-stub.cjs", "scan", "--json"],
		cwd: overrides.cwd ?? "/tmp/fixture",
		exitCode: overrides.exitCode ?? 0,
		stdout,
		stderr,
		stdoutLength: overrides.stdoutLength ?? stdout.length,
		stderrLength: overrides.stderrLength ?? stderr.length,
		totalDurationMs: overrides.totalDurationMs ?? 0,
		phaseTraceEvents: overrides.phaseTraceEvents ?? [],
		phaseTimings: overrides.phaseTimings ?? [],
		lastFailedPhase: overrides.lastFailedPhase ?? null,
		phaseTraceStatus: overrides.phaseTraceStatus ?? { state: "not_emitted", detail: null },
		phaseTraceRaw: overrides.phaseTraceRaw ?? null,
	};
}

function withTempFixture(
	manifest: FixtureManifest,
	setup: (fixtureDir: string) => void,
	callback: (fixture: LoadedFixtureManifest) => void,
): void {
	const rootDir = mkdtempSync(resolve(tmpdir(), "anchormap-fixture-output-oracle-"));
	const fixtureDir = resolve(rootDir, manifest.family, manifest.id);

	try {
		mkdirSync(resolve(fixtureDir, "repo"), { recursive: true });
		setup(fixtureDir);
		callback({
			layout: resolveFixtureLayout(fixtureDir),
			manifest,
		});
	} finally {
		rmSync(rootDir, { recursive: true, force: true });
	}
}

function minimalScanJsonSuccessManifest(id: string): FixtureManifest {
	return {
		id,
		family: "harness-output-oracle",
		purpose: "Fixture output oracle unit test.",
		command: ["node", "./cli-stub.cjs", "scan", "--json"],
		cwd: ".",
		exit_code: 0,
		stdout: { kind: "golden" },
		stderr: { kind: "empty" },
		filesystem: { kind: "no_mutation" },
	};
}

test("reports readable golden diffs and missing final newlines distinctly", () => {
	withTempFixture(
		minimalScanJsonSuccessManifest("fixture_output_oracle_golden_missing_newline"),
		(fixtureDir) => {
			writeFileSync(resolve(fixtureDir, "stdout.golden"), "ok\n");
		},
		(fixture) => {
			assert.throws(
				() =>
					assertFixtureOutputOracles(
						fixture,
						baseProcessResult({
							stdout: Buffer.from("ok", "utf8"),
						}),
					),
				(error: unknown) => {
					assert.ok(error instanceof FixtureOutputOracleError);
					assert.equal(error.stream, "stdout");
					assert.equal(error.oracleKind, "golden");
					assert.match(error.message, /stdout bytes did not match/);
					assert.match(error.message, /final newline mismatch: expected present, actual missing/);
					assert.match(error.message, /actual end of buffer, expected has extra trailing bytes/);
					assert.match(error.message, /expected preview:/);
					assert.match(error.message, /actual preview:/);
					return true;
				},
			);
		},
	);
});

test("reports extra final newlines distinctly", () => {
	withTempFixture(
		minimalScanJsonSuccessManifest("fixture_output_oracle_golden_extra_newline"),
		(fixtureDir) => {
			writeFileSync(resolve(fixtureDir, "stdout.golden"), "ok");
		},
		(fixture) => {
			assert.throws(
				() =>
					assertFixtureOutputOracles(
						fixture,
						baseProcessResult({
							stdout: Buffer.from("ok\n", "utf8"),
						}),
					),
				(error: unknown) => {
					assert.ok(error instanceof FixtureOutputOracleError);
					assert.match(error.message, /final newline mismatch: expected missing, actual present/);
					assert.match(error.message, /expected end of buffer, actual has extra trailing bytes/);
					return true;
				},
			);
		},
	);
});

test("accepts exact stdout bytes when stdout.kind is exact", () => {
	withTempFixture(
		{
			...minimalScanJsonSuccessManifest("fixture_output_oracle_exact_stdout"),
			command: ["node", "./cli-stub.cjs", "scan"],
			stdout: { kind: "exact", value: "exact bytes" },
			stderr: { kind: "ignored" },
		},
		() => {},
		(fixture) => {
			assert.doesNotThrow(() =>
				assertFixtureOutputOracles(
					fixture,
					baseProcessResult({
						stdout: Buffer.from("exact bytes", "utf8"),
						stderr: Buffer.from("human diagnostic\n", "utf8"),
					}),
				),
			);
		},
	);
});

test("rejects any stderr byte when stderr.kind is empty", () => {
	withTempFixture(
		minimalScanJsonSuccessManifest("fixture_output_oracle_stderr_empty"),
		(fixtureDir) => {
			writeFileSync(resolve(fixtureDir, "stdout.golden"), "{}\n");
		},
		(fixture) => {
			assert.throws(
				() =>
					assertFixtureOutputOracles(
						fixture,
						baseProcessResult({
							stdout: Buffer.from("{}\n", "utf8"),
							stderr: Buffer.from("E", "utf8"),
						}),
					),
				(error: unknown) => {
					assert.ok(error instanceof FixtureOutputOracleError);
					assert.equal(error.stream, "stderr");
					assert.equal(error.oracleKind, "empty");
					assert.match(error.message, /stderr must be empty/);
					return true;
				},
			);
		},
	);
});

test("does not fail on human stderr when stderr.kind is ignored", () => {
	withTempFixture(
		{
			...minimalScanJsonSuccessManifest("fixture_output_oracle_stderr_ignored"),
			command: ["node", "./cli-stub.cjs", "scan"],
			stdout: { kind: "ignored" },
			stderr: { kind: "ignored" },
		},
		() => {},
		(fixture) => {
			assert.doesNotThrow(() =>
				assertFixtureOutputOracles(
					fixture,
					baseProcessResult({
						stderr: Buffer.from("diagnostic text\n", "utf8"),
					}),
				),
			);
		},
	);
});

test("supports lower-level stderr contains and pattern matching helpers", () => {
	withTempFixture(
		{
			...minimalScanJsonSuccessManifest("fixture_output_oracle_stderr_text_matching"),
			command: ["node", "./cli-stub.cjs", "scan"],
			stdout: { kind: "ignored" },
			stderr: { kind: "contains", value: "permission denied" },
		},
		() => {},
		(fixture) => {
			assert.doesNotThrow(() =>
				assertFixtureStderrOracle(
					fixture,
					Buffer.from("fatal: permission denied on path\n", "utf8"),
					fixture.manifest.stderr,
				),
			);

			assert.doesNotThrow(() =>
				assertFixtureStderrOracle(
					{
						...fixture,
						manifest: {
							...fixture.manifest,
							id: "fixture_output_oracle_stderr_pattern",
							stderr: { kind: "pattern", value: "^fatal: .* path\\n$" },
						},
					},
					Buffer.from("fatal: permission denied on path\n", "utf8"),
					{ kind: "pattern", value: "^fatal: .* path\\n$" },
				),
			);
		},
	);
});

test("rejects scan --json failure results that emit any stdout bytes", () => {
	withTempFixture(
		{
			...minimalScanJsonSuccessManifest("fixture_output_oracle_scan_json_failure_stdout"),
			exit_code: 3,
			stdout: { kind: "empty" },
			stderr: { kind: "ignored" },
		},
		() => {},
		(fixture) => {
			assert.throws(
				() =>
					assertFixtureOutputOracles(
						fixture,
						baseProcessResult({
							exitCode: 3,
							stdout: Buffer.from("{}", "utf8"),
						}),
					),
				(error: unknown) => {
					assert.ok(error instanceof FixtureOutputOracleError);
					assert.equal(error.stream, "stdout");
					assert.equal(error.oracleKind, "empty");
					assert.match(error.message, /stdout must be empty/);
					assert.match(error.message, /actual bytes: 2/);
					return true;
				},
			);
		},
	);
});
