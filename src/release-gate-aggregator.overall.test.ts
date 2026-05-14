import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { test } from "node:test";
import {
	baseFixture,
	createTempReleaseEvidence,
	readJson,
	runAggregator,
	runAggregatorWithArgs,
	writeFixtureManifest,
	writeJson,
} from "./release-gate-aggregator-test-support";

test("release gate aggregator writes a deterministic passing release report and archives checklist artifacts", () => {
	const evidence = createTempReleaseEvidence();
	try {
		const result = runAggregator(evidence);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /release verdict: pass/);

		const report = readJson<{
			release_verdict: string;
			gates: Array<{
				id: string;
				status: string;
				checks: Array<{ id: string; status: string }>;
			}>;
			publication_checklist: {
				verdict: string;
				pre_publication_required_artifacts: Array<{ name: string; status: string }>;
				post_m9_publication_evidence_artifacts: Array<{ name: string; status: string }>;
				post_publication_evidence_artifacts: Array<{ name: string; status: string }>;
				publication_evidence: {
					status: string;
					consumer_lockback: { status: string };
					t10_5_tarball_artifact: { status: string };
					t10_5_publication_dry_run: { status: string };
					t10_6_publication_evidence: { status: string };
				};
			};
		}>(resolve(evidence.outDir, "release-report.json"));

		assert.equal(report.release_verdict, "pass");
		assert.deepEqual(
			report.gates.map((gate) => [gate.id, gate.status]),
			[
				["A", "pass"],
				["B", "pass"],
				["C", "pass"],
				["D", "pass"],
				["E", "pass"],
				["F", "pass"],
				["G", "pass"],
			],
		);
		assert.equal(
			report.gates
				.find((gate) => gate.id === "B")
				?.checks.find((check) => check.id === "json_goldens_present")?.status,
			"pass",
		);
		assert.equal(report.publication_checklist.verdict, "pass");
		assert.deepEqual(
			report.publication_checklist.pre_publication_required_artifacts.map((artifact) => [
				artifact.name,
				artifact.status,
			]),
			[
				["fixture_report", "archived"],
				["golden_report", "archived"],
				["metamorphic_report", "archived"],
				["cross_platform_report", "archived"],
				["performance_report", "archived"],
				["dependency_audit", "archived"],
				["golden_diffs", "archived"],
				["entropy_review", "archived"],
			],
		);
		assert.deepEqual(
			report.publication_checklist.post_m9_publication_evidence_artifacts.map((artifact) => [
				artifact.name,
				artifact.status,
			]),
			[
				["consumer_lockback", "pending"],
				["t10_5_tarball_artifact", "pending"],
				["t10_5_publication_dry_run", "pending"],
				["t10_6_publication_evidence", "pending"],
			],
		);
		assert.deepEqual(
			report.publication_checklist.post_publication_evidence_artifacts,
			report.publication_checklist.post_m9_publication_evidence_artifacts,
		);
		assert.equal(report.publication_checklist.publication_evidence.status, "pass");
		assert.equal(
			report.publication_checklist.publication_evidence.consumer_lockback.status,
			"pending",
		);
		assert.equal(
			report.publication_checklist.publication_evidence.t10_5_tarball_artifact.status,
			"pending",
		);
		assert.equal(
			report.publication_checklist.publication_evidence.t10_5_publication_dry_run.status,
			"pending",
		);
		assert.equal(
			report.publication_checklist.publication_evidence.t10_6_publication_evidence.status,
			"pending",
		);
		assert.ok(
			readFileSync(resolve(evidence.outDir, "release-report.md"), "utf8").includes("Gate A"),
		);
		assert.ok(
			readFileSync(resolve(evidence.outDir, "artifacts", "fixture-report.json"), "utf8").includes(
				"fx01_scan_min_clean",
			),
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator scopes fixture pass checks to each release gate", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writeFixtureManifest(evidence.fixturesRoot, {
			...baseFixture("c1_filesystem_order_baseline", "C-metamorphic", 0),
			command: ["node", "dist/anchormap.js", "scan", "--json"],
		});
		const fixtureReportPath = resolve(evidence.evidenceDir, "fixture-report.json");
		const fixtureReport = readJson<{
			total_count: number;
			passed_count: number;
			failed_count: number;
			exit_code: number;
			records: Array<{ fixture_id: string; family: string; status: string }>;
		}>(fixtureReportPath);
		fixtureReport.records.push({
			fixture_id: "c1_filesystem_order_baseline",
			family: "C-metamorphic",
			status: "fail",
		});
		fixtureReport.total_count = fixtureReport.records.length;
		fixtureReport.passed_count = fixtureReport.records.filter(
			(record) => record.status === "pass",
		).length;
		fixtureReport.failed_count = 1;
		fixtureReport.exit_code = 1;
		writeJson(fixtureReportPath, fixtureReport);

		const scopedPassResult = runAggregator(evidence);
		assert.equal(scopedPassResult.status, 0, scopedPassResult.stderr);

		const scopedPassReport = readJson<{
			release_verdict: string;
			gates: Array<{
				id: string;
				status: string;
				checks: Array<{ id: string; status: string; failed_scoped_record_count?: number }>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateA = scopedPassReport.gates.find((gate) => gate.id === "A");
		const gateB = scopedPassReport.gates.find((gate) => gate.id === "B");
		const gateC = scopedPassReport.gates.find((gate) => gate.id === "C");
		assert.equal(scopedPassReport.release_verdict, "pass");
		assert.equal(gateA?.status, "pass");
		assert.equal(gateB?.status, "pass");
		assert.equal(gateC?.status, "pass");
		assert.equal(
			gateA?.checks.find((check) => check.id === "level_b_fixture_report_passed")
				?.failed_scoped_record_count,
			0,
		);
		assert.equal(
			gateB?.checks.find((check) => check.id === "all_level_b_fixture_oracles_passed")
				?.failed_scoped_record_count,
			0,
		);
		assert.equal(
			gateC?.checks.find((check) => check.id === "b_cli_fixtures_passed")
				?.failed_scoped_record_count,
			0,
		);

		const bCliRecord = fixtureReport.records.find(
			(record) => record.family === "B-cli" && record.fixture_id === "fx68_cli_unknown_command",
		);
		assert.ok(bCliRecord);
		bCliRecord.status = "fail";
		fixtureReport.passed_count = fixtureReport.records.filter(
			(record) => record.status === "pass",
		).length;
		fixtureReport.failed_count = fixtureReport.records.length - fixtureReport.passed_count;
		fixtureReport.exit_code = 1;
		writeJson(fixtureReportPath, fixtureReport);

		const scopedFailResult = runAggregator(evidence);
		assert.equal(scopedFailResult.status, 1);

		const scopedFailReport = readJson<{
			release_verdict: string;
			gates: Array<{
				id: string;
				status: string;
				checks: Array<{ id: string; status: string; failed_scoped_record_count?: number }>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const failedGateC = scopedFailReport.gates.find((gate) => gate.id === "C");
		const bCliPassCheck = failedGateC?.checks.find((check) => check.id === "b_cli_fixtures_passed");
		assert.equal(scopedFailReport.release_verdict, "fail");
		assert.equal(failedGateC?.status, "fail");
		assert.equal(bCliPassCheck?.status, "fail");
		assert.equal(bCliPassCheck?.failed_scoped_record_count, 1);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator resolves repo and fixture roots deterministically", () => {
	const relativeRepoEvidence = createTempReleaseEvidence();
	try {
		const result = runAggregatorWithArgs(
			[
				"--repo-root",
				basename(relativeRepoEvidence.rootDir),
				"--evidence-dir",
				relativeRepoEvidence.evidenceDir,
				"--out-dir",
				relativeRepoEvidence.outDir,
			],
			dirname(relativeRepoEvidence.rootDir),
		);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /release verdict: pass/);
	} finally {
		rmSync(relativeRepoEvidence.rootDir, { recursive: true, force: true });
	}

	const explicitFixtureEvidence = createTempReleaseEvidence();
	try {
		const customFixturesRoot = resolve(explicitFixtureEvidence.rootDir, "custom-fixtures");
		renameSync(explicitFixtureEvidence.fixturesRoot, customFixturesRoot);
		const result = runAggregatorWithArgs(
			[
				"--fixtures-root",
				"custom-fixtures",
				"--repo-root",
				explicitFixtureEvidence.rootDir,
				"--evidence-dir",
				explicitFixtureEvidence.evidenceDir,
				"--out-dir",
				explicitFixtureEvidence.outDir,
			],
			explicitFixtureEvidence.rootDir,
		);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /release verdict: pass/);
	} finally {
		rmSync(explicitFixtureEvidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator fails the overall verdict when a blocking input fails", () => {
	const evidence = createTempReleaseEvidence();
	try {
		const fixtureReportPath = resolve(evidence.evidenceDir, "fixture-report.json");
		const fixtureReport = readJson<{
			total_count: number;
			passed_count: number;
			failed_count: number;
			exit_code: number;
			records: Array<{ fixture_id: string; family: string; status: string }>;
		}>(fixtureReportPath);
		fixtureReport.failed_count = 1;
		fixtureReport.exit_code = 1;
		fixtureReport.records[0].status = "fail";
		writeJson(fixtureReportPath, fixtureReport);

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);
		assert.match(result.stdout, /release verdict: fail/);

		const report = readJson<{
			release_verdict: string;
			gates: Array<{ id: string; status: string }>;
		}>(resolve(evidence.outDir, "release-report.json"));
		assert.equal(report.release_verdict, "fail");
		assert.equal(report.gates.find((gate) => gate.id === "A")?.status, "fail");
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator fails closed for missing artifacts and unclassified golden diffs", () => {
	const evidence = createTempReleaseEvidence();
	try {
		rmSync(resolve(evidence.evidenceDir, "cross-platform-report.json"), { force: true });
		writeJson(resolve(evidence.evidenceDir, "golden-diffs.json"), [
			{ path: "fixtures/B-scan/fx01_scan_min_clean/stdout.golden" },
		]);

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			publication_checklist: {
				verdict: string;
				missing_blocking_artifacts: string[];
				unclassified_golden_diffs: Array<string | null>;
			};
		}>(resolve(evidence.outDir, "release-report.json"));
		assert.equal(report.release_verdict, "fail");
		assert.equal(report.publication_checklist.verdict, "fail");
		assert.deepEqual(report.publication_checklist.missing_blocking_artifacts, [
			"cross_platform_report",
		]);
		assert.deepEqual(report.publication_checklist.unclassified_golden_diffs, [
			"fixtures/B-scan/fx01_scan_min_clean/stdout.golden",
		]);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator writes failing reports when an artifact path is a directory", () => {
	const evidence = createTempReleaseEvidence();
	try {
		const fixtureReportPath = resolve(evidence.evidenceDir, "fixture-report.json");
		rmSync(fixtureReportPath, { force: true });
		mkdirSync(fixtureReportPath);

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);
		assert.equal(result.stderr, "");
		assert.match(result.stdout, /release verdict: fail/);

		const report = readJson<{
			release_verdict: string;
			input_errors: string[];
			publication_checklist: {
				verdict: string;
				required_artifacts: Array<{ name: string; status: string }>;
				missing_blocking_artifacts: string[];
			};
		}>(resolve(evidence.outDir, "release-report.json"));
		const markdownReport = readFileSync(resolve(evidence.outDir, "release-report.md"), "utf8");
		const fixtureArtifact = report.publication_checklist.required_artifacts.find(
			(artifact) => artifact.name === "fixture_report",
		);

		assert.equal(report.release_verdict, "fail");
		assert.equal(report.publication_checklist.verdict, "fail");
		assert.equal(fixtureArtifact?.status, "invalid");
		assert.deepEqual(report.publication_checklist.missing_blocking_artifacts, ["fixture_report"]);
		assert.ok(
			report.input_errors.some(
				(error) =>
					error.includes("invalid fixture report JSON:") && error.includes("fixture-report.json"),
			),
		);
		assert.ok(
			report.input_errors.some(
				(error) =>
					error.includes("invalid fixture_report:") &&
					error.includes("artifact path is not a file"),
			),
		);
		assert.match(markdownReport, /fixture_report: invalid/);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});
