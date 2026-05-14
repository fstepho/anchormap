import { strict as assert } from "node:assert";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
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

test("release gate aggregator scopes Gate A report freshness to Level B records", () => {
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
			records: Array<{ fixture_id: string; family: string; status: string }>;
		}>(fixtureReportPath);
		fixtureReport.records.push({
			fixture_id: "c1_filesystem_order_baseline",
			family: "C-metamorphic",
			status: "pass",
		});
		fixtureReport.total_count = fixtureReport.records.length;
		fixtureReport.passed_count = fixtureReport.records.length;
		writeJson(fixtureReportPath, fixtureReport);

		const result = runAggregator(evidence);
		assert.equal(result.status, 0, result.stderr);

		const report = readJson<{
			release_verdict: string;
			gates: Array<{
				id: string;
				status: string;
				checks: Array<{
					id: string;
					status: string;
					expected_count?: number;
					actual_count?: number;
				}>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateA = report.gates.find((gate) => gate.id === "A");
		const coverageCheck = gateA?.checks.find(
			(check) => check.id === "level_b_fixture_report_matches_current_manifests",
		);
		assert.equal(report.release_verdict, "pass");
		assert.equal(gateA?.status, "pass");
		assert.equal(coverageCheck?.status, "pass");
		assert.equal(coverageCheck?.expected_count, coverageCheck?.actual_count);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator requires every Level B fixture manifest to have a passing record", () => {
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
		const seenFamilies = new Set<string>();
		fixtureReport.records = fixtureReport.records.filter((record) => {
			if (seenFamilies.has(record.family)) {
				return false;
			}
			seenFamilies.add(record.family);
			return true;
		});
		fixtureReport.total_count = fixtureReport.records.length;
		fixtureReport.passed_count = fixtureReport.records.length;
		fixtureReport.failed_count = 0;
		fixtureReport.exit_code = 0;
		writeJson(fixtureReportPath, fixtureReport);

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
		const gateA = report.gates.find((gate) => gate.id === "A");
		const allManifestCheck = gateA?.checks.find(
			(check) => check.id === "all_level_b_fixture_manifests_passed",
		);
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateA?.status, "fail");
		assert.equal(allManifestCheck?.status, "fail");
		assert.ok(
			allManifestCheck?.missing_fixtures?.includes("B-cli/fx71b_cli_scan_human_config_error_code2"),
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator requires current manifests for every Level B family", () => {
	const evidence = createTempReleaseEvidence();
	try {
		rmSync(resolve(evidence.fixturesRoot, "B-specs"), { recursive: true, force: true });

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			gates: Array<{
				id: string;
				status: string;
				checks: Array<{ id: string; status: string; missing_families?: string[] }>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateA = report.gates.find((gate) => gate.id === "A");
		const familyCheck = gateA?.checks.find(
			(check) => check.id === "all_required_b_families_present",
		);
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateA?.status, "fail");
		assert.equal(familyCheck?.status, "fail");
		assert.deepEqual(familyCheck?.missing_families, ["B-specs"]);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator requires current scaffold manifests", () => {
	const evidence = createTempReleaseEvidence();
	try {
		rmSync(resolve(evidence.fixturesRoot, "B-scaffold"), { recursive: true, force: true });

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			gates: Array<{
				id: string;
				status: string;
				checks: Array<{ id: string; status: string; missing_families?: string[] }>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateA = report.gates.find((gate) => gate.id === "A");
		const familyCheck = gateA?.checks.find(
			(check) => check.id === "all_required_b_families_present",
		);
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateA?.status, "fail");
		assert.equal(familyCheck?.status, "fail");
		assert.deepEqual(familyCheck?.missing_families, ["B-scaffold"]);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator keys Level B fixture coverage by family and fixture id", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writeFixtureManifest(evidence.fixturesRoot, baseFixture("fx01_scan_min_clean", "B-repo", 3));

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
		const gateA = report.gates.find((gate) => gate.id === "A");
		const allManifestCheck = gateA?.checks.find(
			(check) => check.id === "all_level_b_fixture_manifests_passed",
		);
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateA?.status, "fail");
		assert.equal(allManifestCheck?.status, "fail");
		assert.deepEqual(allManifestCheck?.missing_fixtures, ["B-repo/fx01_scan_min_clean"]);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator rejects malformed current Level B manifest identities", () => {
	const evidence = createTempReleaseEvidence();
	try {
		const manifestPath = resolve(
			evidence.fixturesRoot,
			"B-scan",
			"fx01_scan_min_clean",
			"manifest.json",
		);
		const manifest = readJson<Record<string, unknown>>(manifestPath);
		delete manifest.id;
		manifest.family = "B-cli";
		writeJson(manifestPath, manifest);

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			input_errors: string[];
			gates: Array<{
				id: string;
				status: string;
				checks: Array<{ id: string; status: string; invalid_manifests?: string[] }>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateA = report.gates.find((gate) => gate.id === "A");
		const currentManifestCheck = gateA?.checks.find(
			(check) => check.id === "current_level_b_fixture_manifests_valid",
		);
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateA?.status, "fail");
		assert.equal(currentManifestCheck?.status, "fail");
		assert.deepEqual(currentManifestCheck?.invalid_manifests, ["B-scan/fx01_scan_min_clean"]);
		assert.ok(
			report.input_errors.some(
				(error) =>
					error.includes("invalid fixture manifest identity:") &&
					error.includes("fx01_scan_min_clean") &&
					error.includes("id must be"),
			),
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator rejects stale Level B manifest identity mismatches", () => {
	const evidence = createTempReleaseEvidence();
	try {
		const manifestPath = resolve(
			evidence.fixturesRoot,
			"B-scan",
			"fx01_scan_min_clean",
			"manifest.json",
		);
		const manifest = readJson<Record<string, unknown>>(manifestPath);
		manifest.family = "B-cli";
		writeJson(manifestPath, manifest);

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			input_errors: string[];
			gates: Array<{
				id: string;
				status: string;
				checks: Array<{ id: string; status: string; invalid_manifests?: string[] }>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateA = report.gates.find((gate) => gate.id === "A");
		const currentManifestCheck = gateA?.checks.find(
			(check) => check.id === "current_level_b_fixture_manifests_valid",
		);
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateA?.status, "fail");
		assert.equal(currentManifestCheck?.status, "fail");
		assert.deepEqual(currentManifestCheck?.invalid_manifests, ["B-scan/fx01_scan_min_clean"]);
		assert.ok(
			report.input_errors.some(
				(error) =>
					error.includes("expected B-scan/fx01_scan_min_clean") &&
					error.includes("found B-cli/fx01_scan_min_clean"),
			),
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator marks unreadable current Level B manifests as Gate A failures", () => {
	const evidence = createTempReleaseEvidence();
	try {
		const manifestPath = resolve(
			evidence.fixturesRoot,
			"B-cli",
			"fx68_cli_unknown_command",
			"manifest.json",
		);
		writeFileSync(manifestPath, "{\n", "utf8");

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			input_errors: string[];
			gates: Array<{
				id: string;
				status: string;
				checks: Array<{ id: string; status: string; invalid_manifests?: string[] }>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateA = report.gates.find((gate) => gate.id === "A");
		const currentManifestCheck = gateA?.checks.find(
			(check) => check.id === "current_level_b_fixture_manifests_valid",
		);
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateA?.status, "fail");
		assert.equal(currentManifestCheck?.status, "fail");
		assert.deepEqual(currentManifestCheck?.invalid_manifests, ["B-cli/fx68_cli_unknown_command"]);
		assert.ok(
			report.input_errors.some(
				(error) =>
					error.includes("invalid fixture manifest B-cli/fx68_cli_unknown_command JSON:") &&
					error.includes("manifest.json"),
			),
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator rejects incomplete current Level B fixture directories", () => {
	const evidence = createTempReleaseEvidence();
	try {
		mkdirSync(resolve(evidence.fixturesRoot, "B-scan", "fx99_new_fixture_without_manifest"), {
			recursive: true,
		});

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			input_errors: string[];
			gates: Array<{
				id: string;
				status: string;
				checks: Array<{ id: string; status: string; invalid_manifests?: string[] }>;
			}>;
			publication_checklist: {
				verdict: string;
				invalid_level_b_fixture_manifests: string[];
			};
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateA = report.gates.find((gate) => gate.id === "A");
		const currentManifestCheck = gateA?.checks.find(
			(check) => check.id === "current_level_b_fixture_manifests_valid",
		);
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateA?.status, "fail");
		assert.equal(currentManifestCheck?.status, "fail");
		assert.deepEqual(currentManifestCheck?.invalid_manifests, [
			"B-scan/fx99_new_fixture_without_manifest",
		]);
		assert.equal(report.publication_checklist.verdict, "fail");
		assert.deepEqual(report.publication_checklist.invalid_level_b_fixture_manifests, [
			"B-scan/fx99_new_fixture_without_manifest",
		]);
		assert.ok(
			report.input_errors.some(
				(error) =>
					error.includes("missing fixture manifest:") &&
					error.includes("fx99_new_fixture_without_manifest/manifest.json"),
			),
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator rejects duplicate, stale, and malformed fixture report records", () => {
	const evidence = createTempReleaseEvidence();
	try {
		const fixtureReportPath = resolve(evidence.evidenceDir, "fixture-report.json");
		const fixtureReport = readJson<{
			total_count: number;
			passed_count: number;
			records: Array<{ fixture_id?: string; family?: string; status: string }>;
		}>(fixtureReportPath);
		fixtureReport.records.push(
			{ fixture_id: "fx01_scan_min_clean", family: "B-scan", status: "pass" },
			{ fixture_id: "fx999_stale", family: "B-scan", status: "pass" },
			{ family: "B-scan", status: "pass" },
		);
		fixtureReport.total_count = fixtureReport.records.length;
		fixtureReport.passed_count = fixtureReport.records.length;
		writeJson(fixtureReportPath, fixtureReport);

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
					duplicate_fixtures?: string[];
					stale_or_unknown_fixtures?: string[];
					malformed_record_count?: number;
				}>;
			}>;
		}>(resolve(evidence.outDir, "release-report.json"));
		const gateA = report.gates.find((gate) => gate.id === "A");
		const duplicateCheck = gateA?.checks.find(
			(check) => check.id === "level_b_fixture_report_has_no_duplicate_records",
		);
		const staleCheck = gateA?.checks.find(
			(check) => check.id === "level_b_fixture_report_has_no_stale_records",
		);
		const malformedCheck = gateA?.checks.find(
			(check) => check.id === "level_b_fixture_report_records_well_formed",
		);
		assert.equal(report.release_verdict, "fail");
		assert.equal(gateA?.status, "fail");
		assert.deepEqual(duplicateCheck?.duplicate_fixtures, ["B-scan/fx01_scan_min_clean"]);
		assert.deepEqual(staleCheck?.stale_or_unknown_fixtures, ["B-scan/fx999_stale"]);
		assert.equal(malformedCheck?.malformed_record_count, 1);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});
