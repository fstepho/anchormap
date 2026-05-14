import { strict as assert } from "node:assert";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
	createTempReleaseEvidence,
	readJson,
	runAggregator,
} from "./release-gate-aggregator-test-support";

test("release gate aggregator requires B-cli surface fixtures in Gate C", () => {
	const evidence = createTempReleaseEvidence();
	try {
		rmSync(resolve(evidence.fixturesRoot, "B-cli", "fx69_cli_unknown_option"), {
			recursive: true,
			force: true,
		});

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			gates: Array<{
				id: string;
				status: string;
				checks: Array<{ id: string; status: string; missing_fixtures?: string[] }>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateC = report.gates.find((gate) => gate.id === "C");
		const cliSurfaceCheck = gateC?.checks.find(
			(check) => check.id === "cli_surface_fixtures_fx68_fx71_fx76_passed",
		);
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateC?.status, "fail");
		assert.equal(cliSurfaceCheck?.status, "fail");
		assert.deepEqual(cliSurfaceCheck?.missing_fixtures, ["fx69_cli_unknown_option"]);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});
