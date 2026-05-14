import { strict as assert } from "node:assert";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
	createTempReleaseEvidence,
	performanceReportForPlatform,
	readJson,
	runAggregator,
	staleAggregatePerformanceReportForPlatform,
	writeJson,
} from "./release-gate-aggregator-test-support";

test("release gate aggregator requires Gate F reports for both supported platforms", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writeJson(
			resolve(evidence.evidenceDir, "performance-report.json"),
			performanceReportForPlatform("darwin", "arm64"),
		);

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			gates: Array<{
				id: string;
				status: string;
				checks: Array<{ id: string; status: string; missing_platforms?: string[] }>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateF = report.gates.find((gate) => gate.id === "F");
		const platformCheck = gateF?.checks.find(
			(check) => check.id === "supported_platform_benchmark_reports_present",
		);
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateF?.status, "fail");
		assert.equal(platformCheck?.status, "fail");
		assert.deepEqual(platformCheck?.missing_platforms, ["linux:x64"]);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator validates Gate F benchmark evidence instead of verdict strings", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writeJson(resolve(evidence.evidenceDir, "performance-report.json"), {
			schema_version: 1,
			task: "T9.4",
			platform_reports: [
				staleAggregatePerformanceReportForPlatform("darwin", "arm64"),
				performanceReportForPlatform("linux", "x64"),
			],
		});

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			gates: Array<{
				id: string;
				status: string;
				checks: Array<{
					id: string;
					status: string;
					validation_errors?: Array<{ platform: string; error: string }>;
				}>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateF = report.gates.find((gate) => gate.id === "F");
		const validationCheck = gateF?.checks.find(
			(check) => check.id === "gate_f_benchmark_reports_validated",
		);
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateF?.status, "fail");
		assert.equal(validationCheck?.status, "fail");
		assert.deepEqual(
			validationCheck?.validation_errors?.map((entry) => entry.platform),
			["darwin:arm64"],
		);
		assert.match(
			validationCheck?.validation_errors?.[0]?.error ?? "",
			/small p95_wall_clock_ms does not match measured runs/,
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});
