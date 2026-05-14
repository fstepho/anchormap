import { strict as assert } from "node:assert";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
	baseFixture,
	createTempReleaseEvidence,
	readJson,
	runAggregator,
	writeFixtureManifest,
	writeJson,
} from "./release-gate-aggregator-test-support";

test("release gate aggregator accepts stdout-only golden reports when YAML expected-file fixtures pass in fixture evidence", () => {
	const evidence = createTempReleaseEvidence();
	try {
		const result = runAggregator(evidence);
		assert.equal(result.status, 0, result.stderr);

		const goldenReport = readJson<{
			records: Array<{ fixture_id: string; family: string; status: string }>;
		}>(resolve(evidence.evidenceDir, "golden-report.json"));
		const report = readJson<{
			release_verdict: string;
			gates: Array<{
				id: string;
				status: string;
				checks: Array<{
					id: string;
					status: string;
					yaml_golden_count?: number;
					missing_yaml_expected_file_fixtures?: string[];
				}>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateB = report.gates.find((gate) => gate.id === "B");
		const stdoutCoverageCheck = gateB?.checks.find(
			(check) => check.id === "golden_report_matches_current_stdout_golden_manifests",
		);
		const yamlCoverageCheck = gateB?.checks.find(
			(check) => check.id === "yaml_expected_file_fixtures_passed",
		);
		assert.deepEqual(goldenReport.records, [
			{ fixture_id: "fx01_scan_min_clean", family: "B-scan", status: "pass" },
		]);
		assert.equal(report.release_verdict, "pass");
		assert.equal(gateB?.status, "pass");
		assert.equal(stdoutCoverageCheck?.status, "pass");
		assert.equal(yamlCoverageCheck?.status, "pass");
		assert.deepEqual(yamlCoverageCheck?.missing_yaml_expected_file_fixtures, []);
		assert.equal(
			gateB?.checks.find((check) => check.id === "yaml_goldens_present")?.yaml_golden_count,
			2,
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator recognizes direct launcher scan JSON goldens", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writeFixtureManifest(evidence.fixturesRoot, {
			...baseFixture("fx01_scan_min_clean", "B-scan", 0),
			stdoutKind: "golden",
			command: ["bin/anchormap", "scan", "--json"],
		});

		const result = runAggregator(evidence);
		assert.equal(result.status, 0, result.stderr);

		const report = readJson<{
			release_verdict: string;
			gates: Array<{
				id: string;
				checks: Array<{ id: string; status: string; json_golden_count?: number }>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const jsonGoldenCheck = report.gates
			.find((gate) => gate.id === "B")
			?.checks.find((check) => check.id === "json_goldens_present");
		assert.equal(report.release_verdict, "pass");
		assert.equal(jsonGoldenCheck?.status, "pass");
		assert.equal(jsonGoldenCheck?.json_golden_count, 1);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator rejects stale golden report records", () => {
	const evidence = createTempReleaseEvidence();
	try {
		const goldenReportPath = resolve(evidence.evidenceDir, "golden-report.json");
		const goldenReport = readJson<{
			total_count: number;
			passed_count: number;
			records: Array<{ fixture_id: string; family: string; status: string }>;
		}>(goldenReportPath);
		goldenReport.records.push({
			fixture_id: "fx999_stale_golden",
			family: "B-scan",
			status: "pass",
		});
		goldenReport.total_count = goldenReport.records.length;
		goldenReport.passed_count = goldenReport.records.length;
		writeJson(goldenReportPath, goldenReport);

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			gates: Array<{
				id: string;
				status: string;
				checks: Array<{ id: string; status: string; stale_or_unknown_fixtures?: string[] }>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateB = report.gates.find((gate) => gate.id === "B");
		const staleCheck = gateB?.checks.find(
			(check) => check.id === "golden_report_has_no_stale_records",
		);
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateB?.status, "fail");
		assert.deepEqual(staleCheck?.stale_or_unknown_fixtures, ["B-scan/fx999_stale_golden"]);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator requires non-Level-B current stdout golden manifests in Gate B", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writeFixtureManifest(evidence.fixturesRoot, {
			...baseFixture("c1_filesystem_order_baseline", "C-metamorphic", 0),
			stdoutKind: "golden",
		});

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			gates: Array<{
				id: string;
				status: string;
				checks: Array<{ id: string; status: string; missing_stdout_golden_fixtures?: string[] }>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateB = report.gates.find((gate) => gate.id === "B");
		const coverageCheck = gateB?.checks.find(
			(check) => check.id === "golden_report_matches_current_stdout_golden_manifests",
		);
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateB?.status, "fail");
		assert.equal(coverageCheck?.status, "fail");
		assert.deepEqual(coverageCheck?.missing_stdout_golden_fixtures, [
			"C-metamorphic/c1_filesystem_order_baseline",
		]);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator rejects malformed golden report records", () => {
	const evidence = createTempReleaseEvidence();
	try {
		const goldenReportPath = resolve(evidence.evidenceDir, "golden-report.json");
		const goldenReport = readJson<{
			records: Array<{ fixture_id?: string; family?: string; status: string }>;
		}>(goldenReportPath);
		goldenReport.records.push({ fixture_id: "fx_malformed_without_family", status: "pass" });
		writeJson(goldenReportPath, goldenReport);

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			gates: Array<{
				id: string;
				status: string;
				checks: Array<{ id: string; status: string; malformed_record_count?: number }>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateB = report.gates.find((gate) => gate.id === "B");
		const malformedCheck = gateB?.checks.find(
			(check) => check.id === "golden_report_records_well_formed",
		);
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateB?.status, "fail");
		assert.equal(malformedCheck?.status, "fail");
		assert.equal(malformedCheck?.malformed_record_count, 1);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator rejects whitespace-only golden diff classifications", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writeJson(resolve(evidence.evidenceDir, "golden-diffs.json"), [
			{
				path: "fixtures/B-scan/fx01_scan_min_clean/stdout.golden",
				classification: " \t ",
			},
		]);

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			gates: Array<{
				id: string;
				status: string;
				checks: Array<{ id: string; status: string; unclassified_count?: number }>;
			}>;
			publication_checklist: {
				verdict: string;
				golden_diffs: Array<{ path: string | null; classification: string | null }>;
				unclassified_golden_diffs: Array<string | null>;
			};
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateB = report.gates.find((gate) => gate.id === "B");
		const goldenDiffCheck = gateB?.checks.find((check) => check.id === "golden_diffs_classified");
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateB?.status, "fail");
		assert.equal(goldenDiffCheck?.status, "fail");
		assert.equal(goldenDiffCheck?.unclassified_count, 1);
		assert.equal(report.publication_checklist.verdict, "fail");
		assert.deepEqual(report.publication_checklist.golden_diffs, [
			{
				path: "fixtures/B-scan/fx01_scan_min_clean/stdout.golden",
				classification: null,
				summary: null,
			},
		]);
		assert.deepEqual(report.publication_checklist.unclassified_golden_diffs, [
			"fixtures/B-scan/fx01_scan_min_clean/stdout.golden",
		]);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator requires every golden diff to identify a changed path", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writeJson(resolve(evidence.evidenceDir, "golden-diffs.json"), [
			{
				classification: "bug d'implémentation",
			},
		]);

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			gates: Array<{
				id: string;
				status: string;
				checks: Array<{ id: string; status: string; invalid_path_count?: number }>;
			}>;
			publication_checklist: {
				verdict: string;
				golden_diffs: Array<{ path: string | null; classification: string | null }>;
				invalid_golden_diff_paths: Array<string | null>;
				unclassified_golden_diffs: Array<string | null>;
			};
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateB = report.gates.find((gate) => gate.id === "B");
		const pathCheck = gateB?.checks.find((check) => check.id === "golden_diff_paths_present");
		const classificationCheck = gateB?.checks.find(
			(check) => check.id === "golden_diffs_classified",
		);
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateB?.status, "fail");
		assert.equal(pathCheck?.status, "fail");
		assert.equal(pathCheck?.invalid_path_count, 1);
		assert.equal(classificationCheck?.status, "pass");
		assert.equal(report.publication_checklist.verdict, "fail");
		assert.deepEqual(report.publication_checklist.golden_diffs, [
			{
				path: null,
				classification: "bug d'implémentation",
				summary: null,
			},
		]);
		assert.deepEqual(report.publication_checklist.invalid_golden_diff_paths, [null]);
		assert.deepEqual(report.publication_checklist.unclassified_golden_diffs, []);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator rejects unsupported golden diff classifications", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writeJson(resolve(evidence.evidenceDir, "golden-diffs.json"), [
			{
				path: "fixtures/B-scan/fx01_scan_min_clean/stdout.golden",
				classification: "todo",
			},
		]);

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
					unclassified_count?: number;
					unsupported_classification_count?: number;
				}>;
			}>;
			publication_checklist: {
				verdict: string;
				golden_diffs: Array<{ path: string | null; classification: string | null }>;
				unclassified_golden_diffs: Array<string | null>;
				unsupported_golden_diff_classifications: Array<{
					path: string | null;
					classification: string | null;
				}>;
			};
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateB = report.gates.find((gate) => gate.id === "B");
		const goldenDiffCheck = gateB?.checks.find((check) => check.id === "golden_diffs_classified");
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateB?.status, "fail");
		assert.equal(goldenDiffCheck?.status, "fail");
		assert.equal(goldenDiffCheck?.unclassified_count, 1);
		assert.equal(goldenDiffCheck?.unsupported_classification_count, 1);
		assert.equal(report.publication_checklist.verdict, "fail");
		assert.deepEqual(report.publication_checklist.golden_diffs, [
			{
				path: "fixtures/B-scan/fx01_scan_min_clean/stdout.golden",
				classification: null,
				summary: null,
			},
		]);
		assert.deepEqual(report.publication_checklist.unclassified_golden_diffs, [
			"fixtures/B-scan/fx01_scan_min_clean/stdout.golden",
		]);
		assert.deepEqual(report.publication_checklist.unsupported_golden_diff_classifications, [
			{
				path: "fixtures/B-scan/fx01_scan_min_clean/stdout.golden",
				classification: "todo",
			},
		]);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});
