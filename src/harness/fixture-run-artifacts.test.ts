import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import type { FixtureProcessResult } from "./fixture-process";
import {
	prepareFixtureRunnerArtifacts,
	writeFixtureRunArtifacts,
	writeFixtureRunnerSummaryArtifacts,
} from "./fixture-run-artifacts";

function baseProcessResult(overrides: Partial<FixtureProcessResult> = {}): FixtureProcessResult {
	const stdout = overrides.stdout ?? Buffer.alloc(0);
	const stderr = overrides.stderr ?? Buffer.alloc(0);

	return {
		command: overrides.command ?? ["node", "./cli-stub.cjs", "scan"],
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

test("preserves process runtime separately from harness runtime in archived metadata", () => {
	const rootDir = mkdtempSync(resolve(tmpdir(), "anchormap-fixture-run-artifacts-"));
	const fixturesRoot = resolve(rootDir, "fixtures");
	mkdirSync(fixturesRoot, { recursive: true });

	try {
		const layout = prepareFixtureRunnerArtifacts(fixturesRoot, {
			fixtureId: "fx_artifact_duration_split",
		});
		const artifactPaths = writeFixtureRunArtifacts(
			layout,
			{
				entryFixtureId: "fx_artifact_duration_split",
				entryFamily: "B-cli",
				recordStatus: "pass",
				recordTotalDurationMs: null,
				recordHarnessDurationMs: null,
				failedOracle: null,
				summary: "ok",
				fixture: null,
				sandbox: null,
				processResult: baseProcessResult({
					totalDurationMs: 7,
				}),
				processTimeoutError: null,
				processError: null,
				postRunSnapshot: null,
				filesystemDiff: null,
				oracleStatuses: {
					exitCode: "pass",
					stdout: "not_run",
					stderr: "not_run",
					filesystem: "not_run",
				},
				error: null,
			},
			{
				resolveTimingOverride: () => ({
					recordTotalDurationMs: null,
					recordHarnessDurationMs: 11,
				}),
			},
		);

		assert.equal(artifactPaths.totalDurationMs, 7);
		assert.equal(artifactPaths.harnessDurationMs, 11);

		const metadata = JSON.parse(readFileSync(artifactPaths.metadataPath, "utf8")) as {
			total_duration_ms: number | null;
			harness_duration_ms: number | null;
		};
		assert.equal(metadata.total_duration_ms, 7);
		assert.equal(metadata.harness_duration_ms, 11);
		assert.match(readFileSync(artifactPaths.summaryPath, "utf8"), /total duration ms: 7/);
		assert.match(readFileSync(artifactPaths.summaryPath, "utf8"), /harness duration ms: 11/);
	} finally {
		rmSync(rootDir, { recursive: true, force: true });
	}
});

test("updates archived runner duration after writing summary artifacts", () => {
	const rootDir = mkdtempSync(resolve(tmpdir(), "anchormap-runner-summary-artifacts-"));
	const fixturesRoot = resolve(rootDir, "fixtures");
	mkdirSync(fixturesRoot, { recursive: true });

	try {
		const layout = prepareFixtureRunnerArtifacts(fixturesRoot, {
			fixtureId: "fx_runner_duration_end_to_end",
		});
		const result = writeFixtureRunnerSummaryArtifacts(
			layout,
			{
				totalCount: 1,
				passedCount: 1,
				failedCount: 0,
				exitCode: 0,
				report:
					"SUMMARY total=1 passed=1 failed=0 artifacts=.tmp/fixture-runs/fixture-fx_runner_duration_end_to_end/run-0001 summary=.tmp/fixture-runs/fixture-fx_runner_duration_end_to_end/run-0001/summary.txt\n",
				totalDurationMs: 7,
				records: [
					{
						fixtureId: "fx_runner_duration_end_to_end",
						family: "B-cli",
						status: "pass",
						failedOracle: null,
						summary: "ok",
						totalDurationMs: 3,
						harnessDurationMs: 5,
						lastFailedPhase: null,
						phaseTraceStatus: { state: "captured", detail: null },
						artifactDirRelative: "fixtures/B-cli/fx_runner_duration_end_to_end",
						metadataPathRelative: "fixtures/B-cli/fx_runner_duration_end_to_end/result.json",
						summaryPathRelative: "fixtures/B-cli/fx_runner_duration_end_to_end/summary.txt",
					},
				],
			},
			{
				resolveTimingOverride: () => ({
					totalDurationMs: 11,
				}),
			},
		);

		assert.equal(result.totalDurationMs, 11);

		const metadata = JSON.parse(readFileSync(layout.runMetadataPath, "utf8")) as {
			total_duration_ms: number;
		};
		assert.equal(metadata.total_duration_ms, 11);
		assert.match(readFileSync(layout.summaryPath, "utf8"), /^SUMMARY total=1 passed=1 failed=0 /u);
	} finally {
		rmSync(rootDir, { recursive: true, force: true });
	}
});
