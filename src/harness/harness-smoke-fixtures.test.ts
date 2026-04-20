import { strict as assert } from "node:assert";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
			"SUMMARY total=3 passed=3 failed=0",
			"",
		].join("\n"),
	);
});

test("walking skeleton fixtures surface a readable broken-golden failure through the runner", async () => {
	await withTempHarnessSmokeFixtures(async (fixturesRoot) => {
		writeFileSync(
			resolve(
				fixturesRoot,
				HARNESS_SMOKE_FAMILY,
				"harness_smoke_scan_success",
				"stdout.golden",
			),
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
			/^FAIL harness_smoke_scan_success stdout\.golden stdout bytes did not match .*stdout\.golden$/m,
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
		assert.equal(summary.records[0]?.failedOracle, "filesystem.no_mutation");
		assert.match(
			summary.report,
			/^FAIL harness_smoke_scan_success filesystem\.no_mutation filesystem\.kind "no_mutation" forbids repository mutations$/m,
		);
	});
});
