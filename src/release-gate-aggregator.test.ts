import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";

const REPO_ROOT = resolve(__dirname, "..");
const SCRIPT_PATH = resolve(REPO_ROOT, "scripts", "release-gate-aggregator.mjs");

interface ReleaseGateFixture {
	id: string;
	family: string;
	exitCode: number;
	stdoutKind?: "golden" | "empty" | "ignored";
	filesystemKind?: "no_mutation" | "expected_files";
	command?: string[];
}

interface TempReleaseEvidence {
	rootDir: string;
	fixturesRoot: string;
	evidenceDir: string;
	outDir: string;
}

interface GateFBenchmarkReport {
	reference_machine: {
		platform: string;
		arch: string;
		supported_platform: boolean;
	};
	results: Array<{
		corpus_id: string;
		p95_wall_clock_ms: number;
		peak_rss_mib: number;
		measured_runs: Array<{
			wall_clock_ms: number;
			peak_rss_mib: number;
			exit_code: number;
		}>;
		verdict: string;
	}>;
}

function writeJson(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`, "utf8");
}

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

function baseFixture(id: string, family: string, exitCode = 0): ReleaseGateFixture {
	return {
		id,
		family,
		exitCode,
		stdoutKind: "empty",
		filesystemKind: "no_mutation",
		command: ["node", "dist/anchormap.js", "scan", "--json"],
	};
}

function createTempReleaseEvidence(): TempReleaseEvidence {
	const rootDir = mkdtempSync(join(tmpdir(), "anchormap-release-gates-test-"));
	const fixturesRoot = resolve(rootDir, "fixtures");
	const evidenceDir = resolve(rootDir, "evidence");
	const outDir = resolve(rootDir, "reports", "t9.6");
	const fixtures: ReleaseGateFixture[] = [
		{
			...baseFixture("fx01_scan_min_clean", "B-scan", 0),
			stdoutKind: "golden",
			command: ["node", "dist/anchormap.js", "scan", "--json"],
		},
		{
			...baseFixture("fx59_map_create", "B-map", 0),
			filesystemKind: "expected_files",
			command: ["node", "dist/anchormap.js", "map", "--anchor", "FR-014", "--seed", "src/index.ts"],
		},
		baseFixture("fx43_config_missing_file", "B-config", 2),
		baseFixture("fx00b_decoding_spec_non_utf8", "B-decodage", 3),
		baseFixture("fx37_graph_parse_failure", "B-graph", 3),
		baseFixture("fx54_init_success_minimal", "B-init", 0),
		baseFixture("fx39_repo_case_collision_in_scope", "B-repo", 3),
		baseFixture("fx19_specs_duplicate_anchor", "B-specs", 3),
		baseFixture("fx68_cli_unknown_command", "B-cli", 4),
		baseFixture("fx69_cli_unknown_option", "B-cli", 4),
		baseFixture("fx70_cli_invalid_option_combination", "B-cli", 4),
		baseFixture("fx71_cli_scan_option_order_invariant", "B-cli", 0),
		baseFixture("fx71a_cli_scan_human_success", "B-cli", 0),
		baseFixture("fx71b_cli_scan_human_config_error_code2", "B-cli", 2),
		baseFixture("fx71c_cli_scan_human_repo_error_code3", "B-cli", 3),
		baseFixture("fx71d_cli_scan_human_invalid_args_code4", "B-cli", 4),
		baseFixture("fx71e_cli_scan_human_internal_error_code1", "B-cli", 1),
		baseFixture("fx72_cli_priority_4_over_2", "B-cli", 4),
		baseFixture("fx73_cli_priority_2_over_3", "B-cli", 2),
		baseFixture("fx74_cli_priority_3_over_1", "B-cli", 3),
		baseFixture("fx75_cli_internal_error_code_1", "B-cli", 1),
		baseFixture("fx76_cli_write_failure_code_1", "B-cli", 1),
	];

	for (const fixture of fixtures) {
		writeFixtureManifest(fixturesRoot, fixture);
	}

	const fixtureReport = {
		total_count: fixtures.length,
		passed_count: fixtures.length,
		failed_count: 0,
		exit_code: 0,
		records: fixtures.map((fixture) => ({
			fixture_id: fixture.id,
			family: fixture.family,
			status: "pass",
		})),
	};
	const goldenRecords = fixtures
		.filter((fixture) => fixture.stdoutKind === "golden")
		.map((fixture) => ({ fixture_id: fixture.id, family: fixture.family, status: "pass" }));
	writeJson(resolve(evidenceDir, "fixture-report.json"), fixtureReport);
	writeJson(resolve(evidenceDir, "golden-report.json"), {
		total_count: goldenRecords.length,
		passed_count: goldenRecords.length,
		failed_count: 0,
		exit_code: 0,
		records: goldenRecords,
	});
	writeJson(resolve(evidenceDir, "metamorphic-report.json"), {
		schema_version: 1,
		task: "T9.1/T9.2",
		gate_d: { verdict: "pass" },
		cases: Array.from({ length: 12 }, (_, index) => ({
			case: `C${index + 1}`,
			status: "pass",
		})),
	});
	writeJson(resolve(evidenceDir, "cross-platform-report.json"), {
		schema_version: 1,
		task: "T9.3",
		gate_e: { verdict: "pass" },
		platforms: [
			{ platform: "darwin", arch: "arm64", verdict: "pass" },
			{ platform: "linux", arch: "x64", verdict: "pass" },
		],
	});
	writeJson(resolve(evidenceDir, "performance-report.json"), {
		schema_version: 1,
		task: "T9.4",
		platform_reports: [
			performanceReportForPlatform("darwin", "arm64"),
			performanceReportForPlatform("linux", "x64"),
		],
	});
	writeJson(resolve(evidenceDir, "dependency-audit.json"), {
		schema_version: 1,
		task: "T9.5",
		contract_dependency_policy: {
			floating_semver_ranges_rejected: true,
			lockfile_required: true,
			lockfile_root_consistency_checked: true,
			full_lockfile_hash_checked: true,
			installed_parser_versions_checked: true,
			versioned_goldens_checked_with_git: true,
		},
		goldens: { versioned: true },
		gate_g_dependency_verdict: "pass",
	});
	writeJson(resolve(evidenceDir, "golden-diffs.json"), []);
	writeJson(resolve(rootDir, "reports", "t9.7", "entropy-review.json"), {
		schema_version: 1,
		task: "T9.7",
		report_version: "entropy-review-v1",
		summary: {
			findings_count: 0,
			blocking_findings_remaining: 0,
			unclassified_drift_remaining: false,
		},
		findings: [],
		release_candidate_review_set: {
			unclassified_drift_remaining: false,
		},
	});

	return { rootDir, fixturesRoot, evidenceDir, outDir };
}

function writeFixtureManifest(fixturesRoot: string, fixture: ReleaseGateFixture): void {
	writeJson(resolve(fixturesRoot, fixture.family, fixture.id, "manifest.json"), {
		id: fixture.id,
		family: fixture.family,
		purpose: "Release gate aggregator test fixture.",
		command: fixture.command ?? ["scan", "--json"],
		cwd: ".",
		exit_code: fixture.exitCode,
		stdout: { kind: fixture.stdoutKind ?? "empty" },
		stderr: { kind: "empty" },
		filesystem: { kind: fixture.filesystemKind ?? "no_mutation" },
	});
}

function performanceReportForPlatform(platform: string, arch: string) {
	const report = readJson<GateFBenchmarkReport>(
		resolve(REPO_ROOT, "bench", "reports", "gate-f-report.json"),
	);
	report.reference_machine = {
		...report.reference_machine,
		platform,
		arch,
		supported_platform: true,
	};
	return report;
}

function staleAggregatePerformanceReportForPlatform(platform: string, arch: string) {
	const report = performanceReportForPlatform(platform, arch);
	const smallResult = report.results.find((result) => result.corpus_id === "small");
	assert.ok(smallResult);
	for (const [index, run] of smallResult.measured_runs.entries()) {
		run.wall_clock_ms = index < 28 ? 100 : 401;
		run.peak_rss_mib = index < 29 ? 80 : 121;
		run.exit_code = 0;
	}
	smallResult.p95_wall_clock_ms = 100;
	smallResult.peak_rss_mib = 80;
	smallResult.verdict = "pass";
	return {
		...report,
	};
}

function runAggregator(evidence: TempReleaseEvidence) {
	return runAggregatorWithArgs(
		[
			"--repo-root",
			evidence.rootDir,
			"--fixtures-root",
			evidence.fixturesRoot,
			"--evidence-dir",
			evidence.evidenceDir,
			"--out-dir",
			evidence.outDir,
		],
		evidence.rootDir,
	);
}

function runAggregatorWithArgs(args: string[], cwd: string) {
	return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
		cwd,
		encoding: "utf8",
	});
}

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
				required_artifacts: Array<{ name: string; status: string }>;
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
			report.publication_checklist.required_artifacts.map((artifact) => [
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
			1,
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

test("release gate aggregator semantically validates the entropy review artifact", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writeJson(resolve(evidence.rootDir, "reports", "t9.7", "entropy-review.json"), {
			schema_version: 1,
			task: "T9.7",
			report_version: "entropy-review-v1",
			summary: {
				findings_count: 1,
				blocking_findings_remaining: 0,
				unclassified_drift_remaining: false,
			},
			findings: [
				{
					id: "T9.7-F1",
					title: "Finding with incomplete required review routing fields",
					primary_classification: "todo",
					blocking_status: "unknown",
				},
			],
			release_candidate_review_set: {
				unclassified_drift_remaining: false,
			},
		});

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			publication_checklist: {
				verdict: string;
				entropy_review: {
					status: string;
					validation_errors: string[];
					findings_with_unsupported_primary_classification: Array<{
						finding: string;
						primary_classification: string;
					}>;
					findings_with_unsupported_blocking_status: Array<{
						finding: string;
						blocking_status: string;
					}>;
					findings_missing_follow_up_disposition: string[];
				};
			};
		}>(resolve(evidence.outDir, "release-report.json"));
		assert.equal(report.release_verdict, "fail");
		assert.equal(report.publication_checklist.verdict, "fail");
		assert.equal(report.publication_checklist.entropy_review.status, "fail");
		assert.ok(
			report.publication_checklist.entropy_review.validation_errors.includes(
				"entropy review findings use unsupported primary_classification",
			),
		);
		assert.deepEqual(
			report.publication_checklist.entropy_review.findings_with_unsupported_primary_classification,
			[
				{
					finding: "T9.7-F1",
					primary_classification: "todo",
				},
			],
		);
		assert.deepEqual(
			report.publication_checklist.entropy_review.findings_with_unsupported_blocking_status,
			[
				{
					finding: "T9.7-F1",
					blocking_status: "unknown",
				},
			],
		);
		assert.deepEqual(
			report.publication_checklist.entropy_review.findings_missing_follow_up_disposition,
			["T9.7-F1"],
		);
	} finally {
		rmSync(evidence.rootDir, { recursive: true, force: true });
	}
});

test("release gate aggregator fails closed when entropy review reports unresolved drift", () => {
	const evidence = createTempReleaseEvidence();
	try {
		writeJson(resolve(evidence.rootDir, "reports", "t9.7", "entropy-review.json"), {
			schema_version: 1,
			task: "T9.7",
			report_version: "entropy-review-v1",
			summary: {
				findings_count: 0,
				blocking_findings_remaining: 1,
				unclassified_drift_remaining: false,
			},
			findings: [],
			release_candidate_review_set: {
				unclassified_drift_remaining: true,
			},
		});

		const result = runAggregator(evidence);
		assert.equal(result.status, 1);

		const report = readJson<{
			release_verdict: string;
			publication_checklist: {
				verdict: string;
				entropy_review: {
					status: string;
					validation_errors: string[];
					blocking_findings_remaining: number | null;
					unclassified_drift_remaining: boolean | null;
				};
			};
		}>(resolve(evidence.outDir, "release-report.json"));
		assert.equal(report.release_verdict, "fail");
		assert.equal(report.publication_checklist.verdict, "fail");
		assert.equal(report.publication_checklist.entropy_review.status, "fail");
		assert.equal(report.publication_checklist.entropy_review.blocking_findings_remaining, 1);
		assert.equal(report.publication_checklist.entropy_review.unclassified_drift_remaining, true);
		assert.ok(
			report.publication_checklist.entropy_review.validation_errors.includes(
				"entropy review summary.blocking_findings_remaining must be 0",
			),
		);
		assert.ok(
			report.publication_checklist.entropy_review.validation_errors.includes(
				"entropy review release_candidate_review_set.unclassified_drift_remaining must be false",
			),
		);
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
