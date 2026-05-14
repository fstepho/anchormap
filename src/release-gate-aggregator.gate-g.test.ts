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

test("release gate aggregator requires full Gate G dependency audit evidence", () => {
	const evidence = createTempReleaseEvidence();
	try {
		const dependencyAuditPath = resolve(evidence.evidenceDir, "dependency-audit.json");
		const dependencyAudit = readJson<{
			contract_dependency_policy: Record<string, boolean>;
			gate_g_dependency_verdict: string;
		}>(dependencyAuditPath);
		dependencyAudit.contract_dependency_policy.full_lockfile_hash_checked = false;
		delete dependencyAudit.contract_dependency_policy.installed_parser_versions_checked;
		delete dependencyAudit.contract_dependency_policy.versioned_goldens_checked_with_git;
		dependencyAudit.gate_g_dependency_verdict = "pass";
		writeJson(dependencyAuditPath, dependencyAudit);

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			gates: Array<{
				id: string;
				status: string;
				checks: Array<{ id: string; status: string }>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateG = report.gates.find((gate) => gate.id === "G");
		const checkStatuses = new Map(gateG?.checks.map((check) => [check.id, check.status]));
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateG?.status, "fail");
		assert.equal(checkStatuses.get("dependency_audit_verdict_passed"), "pass");
		assert.equal(checkStatuses.get("full_lockfile_hash_checked"), "fail");
		assert.equal(checkStatuses.get("installed_parser_versions_checked"), "fail");
		assert.equal(checkStatuses.get("versioned_goldens_checked_with_git"), "fail");
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});
