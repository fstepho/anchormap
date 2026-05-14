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

test("release gate aggregator rejects duplicate and unsupported metamorphic cases", () => {
	const evidence = createTempReleaseEvidence();
	try {
		const metamorphicPath = resolve(evidence.evidenceDir, "metamorphic-report.json");
		const metamorphicReport = readJson<{
			cases: Array<{ case: string; status: string }>;
		}>(metamorphicPath);
		metamorphicReport.cases.push({ case: "C1", status: "pass" }, { case: "C13", status: "pass" });
		writeJson(metamorphicPath, metamorphicReport);

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
					duplicate_cases?: string[];
					unsupported_cases?: string[];
				}>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateD = report.gates.find((gate) => gate.id === "D");
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateD?.status, "fail");
		assert.deepEqual(
			gateD?.checks.find((check) => check.id === "c1_c12_cases_not_duplicated")?.duplicate_cases,
			["C1"],
		);
		assert.deepEqual(
			gateD?.checks.find((check) => check.id === "c1_c12_cases_only_supported")?.unsupported_cases,
			["C13"],
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});
