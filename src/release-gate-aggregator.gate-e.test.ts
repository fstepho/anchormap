import { strict as assert } from "node:assert";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
	createTempReleaseEvidence,
	readJson,
	runAggregator,
	writeJson,
} from "./release-gate-aggregator-test-support";

test("release gate aggregator rejects duplicate supported Gate E platform entries", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writeJson(resolve(evidence.evidenceDir, "cross-platform-report.json"), {
			schema_version: 1,
			task: "T9.3",
			gate_e: { verdict: "pass" },
			platforms: [
				{ platform: "darwin", arch: "arm64", verdict: "pass" },
				{ platform: "linux", arch: "x64", verdict: "pass" },
				{ platform: "linux", arch: "x86_64", verdict: "fail" },
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
					duplicate_supported_platforms?: string[];
					missing_or_failing_platforms?: string[];
				}>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateE = report.gates.find((gate) => gate.id === "E");
		const platformCheck = gateE?.checks.find(
			(check) => check.id === "supported_platform_matrix_passed",
		);
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateE?.status, "fail");
		assert.equal(platformCheck?.status, "fail");
		assert.deepEqual(platformCheck?.duplicate_supported_platforms, ["linux:x64"]);
		assert.deepEqual(platformCheck?.missing_or_failing_platforms, ["Linux x86_64"]);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator rejects unsupported Gate E platform entries", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writeJson(resolve(evidence.evidenceDir, "cross-platform-report.json"), {
			schema_version: 1,
			task: "T9.3",
			gate_e: { verdict: "pass" },
			platforms: [
				{ platform: "darwin", arch: "arm64", verdict: "pass" },
				{ platform: "linux", arch: "x64", verdict: "pass" },
				{ platform: "win32", arch: "x64", verdict: "pass" },
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
					unsupported_platforms?: Array<{ platform: string | null; arch: string | null }>;
				}>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateE = report.gates.find((gate) => gate.id === "E");
		const platformCheck = gateE?.checks.find(
			(check) => check.id === "supported_platform_matrix_passed",
		);
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateE?.status, "fail");
		assert.deepEqual(platformCheck?.unsupported_platforms, [{ platform: "win32", arch: "x64" }]);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});
