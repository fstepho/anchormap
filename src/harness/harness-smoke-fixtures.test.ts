import { strict as assert } from "node:assert";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import { runFixtureRunner } from "./fixture-runner";

const PROJECT_ROOT = resolve(__dirname, "..", "..");
const PROJECT_FIXTURES_ROOT = resolve(PROJECT_ROOT, "fixtures");
const HARNESS_SMOKE_FAMILY = "harness-smoke";

function withTempHarnessSmokeFixtures(
	callback: (fixturesRoot: string) => Promise<void> | void,
): Promise<void> {
	const fixturesRoot = mkdtempSync(resolve(tmpdir(), "anchormap-harness-smoke-"));

	try {
		cpSync(
			resolve(PROJECT_FIXTURES_ROOT, HARNESS_SMOKE_FAMILY),
			resolve(fixturesRoot, HARNESS_SMOKE_FAMILY),
			{ recursive: true },
		);

		return Promise.resolve(callback(fixturesRoot)).finally(() => {
			rmSync(fixturesRoot, { recursive: true, force: true });
		});
	} catch (error) {
		rmSync(fixturesRoot, { recursive: true, force: true });
		throw error;
	}
}

test("walking skeleton harness-smoke family passes through the real fixture runner", async () => {
	const summary = await runFixtureRunner({
		fixturesRoot: PROJECT_FIXTURES_ROOT,
		family: HARNESS_SMOKE_FAMILY,
		timeoutMs: 1_000,
	});

	assert.equal(summary.exitCode, 0);
	assert.equal(summary.totalCount, 3);
	assert.equal(summary.failedCount, 0);
	assert.equal(
		summary.report,
		[
			"PASS harness_smoke_init_write",
			"PASS harness_smoke_scan_failure",
			"PASS harness_smoke_scan_success",
			`SUMMARY total=3 passed=3 failed=0 artifacts=${summary.artifactsDirRelative} summary=${summary.summaryPathRelative}`,
			"",
		].join("\n"),
	);
});

test("walking skeleton fixtures surface a readable broken-golden failure through the runner", async () => {
	await withTempHarnessSmokeFixtures(async (fixturesRoot) => {
		writeFileSync(
			resolve(fixturesRoot, HARNESS_SMOKE_FAMILY, "harness_smoke_scan_success", "stdout.golden"),
			'{"ok":false}\n',
		);

		const summary = await runFixtureRunner({
			fixturesRoot,
			fixtureId: "harness_smoke_scan_success",
			timeoutMs: 1_000,
		});

		assert.equal(summary.exitCode, 1);
		assert.equal(summary.totalCount, 1);
		assert.equal(summary.failedCount, 1);
		assert.equal(summary.records[0]?.failedOracle, "stdout.golden");
		assert.match(
			summary.report,
			/^FAIL harness_smoke_scan_success stdout\.golden stdout bytes did not match .*stdout\.golden \[artifacts .+harness_smoke_scan_success\]$/m,
		);
	});
});

test("walking skeleton fixtures surface unexpected mutation failures through the runner", async () => {
	await withTempHarnessSmokeFixtures(async (fixturesRoot) => {
		writeFileSync(
			resolve(
				fixturesRoot,
				HARNESS_SMOKE_FAMILY,
				"harness_smoke_scan_success",
				"repo",
				".stub-scan-unexpected-mutation.txt",
			),
			"unexpected mutation\n",
		);

		const summary = await runFixtureRunner({
			fixturesRoot,
			fixtureId: "harness_smoke_scan_success",
			timeoutMs: 1_000,
		});

		assert.equal(summary.exitCode, 1);
		assert.equal(summary.totalCount, 1);
		assert.equal(summary.failedCount, 1);
		const record = summary.records[0];
		assert.ok(record);
		assert.equal(record.failedOracle, "filesystem.no_mutation");
		assert.equal(record.lastFailedPhase, "fs.write");

		const metadata = JSON.parse(readFileSync(record.metadataPath, "utf8")) as {
			last_failed_phase: string | null;
		};
		assert.equal(metadata.last_failed_phase, "fs.write");
		assert.match(readFileSync(record.summaryPath, "utf8"), /last failed phase: fs\.write/);
		assert.match(
			summary.report,
			/^FAIL harness_smoke_scan_success filesystem\.no_mutation filesystem\.kind "no_mutation" forbids repository mutations \[artifacts .+harness_smoke_scan_success\]$/m,
		);
	});
});

test("walking skeleton fixtures persist trace and timing artifacts when the CLI stub emits them", async () => {
	const summary = await runFixtureRunner({
		fixturesRoot: PROJECT_FIXTURES_ROOT,
		fixtureId: "harness_smoke_scan_failure",
		timeoutMs: 1_000,
	});

	assert.equal(summary.exitCode, 0);
	const record = summary.records[0];
	assert.ok(record);
	assert.equal(record.lastFailedPhase, null);
	assert.ok((record.totalDurationMs ?? -1) >= 0);
	assert.ok(record.harnessDurationMs >= (record.totalDurationMs ?? -1));

	const metadata = JSON.parse(readFileSync(record.metadataPath, "utf8")) as {
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
	assert.ok(metadata.total_duration_ms >= 0);
	assert.equal(metadata.harness_duration_ms, record.harnessDurationMs);
	assert.ok(metadata.harness_duration_ms >= metadata.total_duration_ms);
	assert.equal(metadata.last_failed_phase, null);
	assert.equal(metadata.trace.state, "captured");
	assert.equal(metadata.trace.detail, null);
	assert.equal(metadata.artifacts.phase_trace_events, "phase-trace.events.json");
	assert.equal(metadata.artifacts.phase_timings, "phase-timings.json");
	assert.match(readFileSync(record.summaryPath, "utf8"), /last failed phase: none/);
	assert.match(readFileSync(record.summaryPath, "utf8"), /trace status: captured/);
});
