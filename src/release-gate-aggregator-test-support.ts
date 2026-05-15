import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const REPO_ROOT = resolve(__dirname, "..");
export const SCRIPT_PATH = resolve(REPO_ROOT, "scripts", "release-gate-aggregator.mjs");
export const EXPECTED_PACKAGE_VERSION = JSON.parse(
	readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"),
).version;

export interface ReleaseGateFixture {
	id: string;
	family: string;
	exitCode: number;
	stdoutKind?: "golden" | "empty" | "ignored";
	filesystemKind?: "no_mutation" | "expected_files";
	command?: string[];
}

export interface TempReleaseEvidence {
	rootDir: string;
	fixturesRoot: string;
	evidenceDir: string;
	outDir: string;
}

export interface GateFBenchmarkReport {
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

export function writeJson(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`, "utf8");
}

export function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function baseFixture(id: string, family: string, exitCode = 0): ReleaseGateFixture {
	return {
		id,
		family,
		exitCode,
		stdoutKind: "empty",
		filesystemKind: "no_mutation",
		command: ["node", "dist/anchormap.js", "scan", "--json"],
	};
}

export function createTempReleaseEvidence(): TempReleaseEvidence {
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
		{
			...baseFixture("fx77_scaffold_success_minimal", "B-scaffold", 0),
			stdoutKind: "ignored",
			filesystemKind: "expected_files",
			command: ["node", "dist/anchormap.js", "scaffold", "--output", "specs/generated.md"],
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

export function writePublicationEvidence(evidenceDir: string): void {
	const tarballFile = `anchormap-${EXPECTED_PACKAGE_VERSION}.tgz`;
	const npmIntegrity =
		"sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
	const npmShasum = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
	const sha256 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
	writeJson(resolve(evidenceDir, "consumer-lockback.json"), {
		schema_version: 1,
		task: "T10.5",
		package_name: "anchormap",
		package_version: EXPECTED_PACKAGE_VERSION,
		mechanism: "npm-shrinkwrap.json",
		runtime_closure_matches_gate_g: true,
		shrinkwrap: {
			included_in_package: true,
			path: "npm-shrinkwrap.json",
		},
	});
	writeJson(resolve(evidenceDir, "t10.5-tarball-artifact.json"), {
		schema_version: 1,
		task: "T10.5",
		package_name: "anchormap",
		package_version: EXPECTED_PACKAGE_VERSION,
		tarball_file: tarballFile,
		included_files: ["package.json", "npm-shrinkwrap.json", "bin/anchormap", "dist/anchormap.js"],
		npm_integrity: npmIntegrity,
		npm_shasum: npmShasum,
		sha256,
		consumer_lockback_evidence: true,
		release_evidence_links: {
			m9_release_gate_report: "reports/t9.6/release-report.json",
			t9_7_entropy_review: "reports/t9.7/entropy-review.json",
			t10_3_installed_artifact_report: "reports/t10.3/installed-artifact-report.json",
			checksum_evidence: `reports/t10.5/anchormap-${EXPECTED_PACKAGE_VERSION}.sha256`,
		},
	});
	writeJson(resolve(evidenceDir, "t10.5-publication-dry-run.json"), {
		schema_version: 1,
		task: "T10.5",
		status: "pass",
		tarball_file: tarballFile,
	});
}

export function writeT10_6PublicationEvidence(evidenceDir: string): void {
	const npmIntegrity =
		"sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
	const npmShasum = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
	const sha256 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
	const tarballFile = `anchormap-${EXPECTED_PACKAGE_VERSION}.tgz`;
	const repositoryTag = `v${EXPECTED_PACKAGE_VERSION}`;
	writeJson(resolve(evidenceDir, "t10.6-publication-evidence.json"), {
		schema_version: 1,
		task: "T10.6",
		status: "pass",
		package_name: "anchormap",
		package_version: EXPECTED_PACKAGE_VERSION,
		registry_coordinate: `anchormap@${EXPECTED_PACKAGE_VERSION}`,
		tarball_file: tarballFile,
		dist_integrity: npmIntegrity,
		dist_shasum: npmShasum,
		sha256,
		distribution_channel: {
			adr: "docs/adr/0009-packaging-and-distribution.md",
			type: "public npm registry",
			registry: "https://registry.npmjs.org/",
			package_coordinate: `anchormap@${EXPECTED_PACKAGE_VERSION}`,
			dist_tag: "latest",
			repository_tag: repositoryTag,
		},
		artifact: {
			source: "T10.5 validated tarball",
			identifier: `anchormap@${EXPECTED_PACKAGE_VERSION}`,
			tarball_path: `reports/t10.5/${tarballFile}`,
			tarball_artifact_report: "reports/t10.5/t10.5-tarball-artifact.json",
			publication_dry_run_report: "reports/t10.5/t10.5-publication-dry-run.json",
			package_name: "anchormap",
			package_version: EXPECTED_PACKAGE_VERSION,
			npm_integrity: npmIntegrity,
			npm_shasum: npmShasum,
			sha256,
		},
		publication: {
			publish_attempted: true,
			registry_coordinate_published: `anchormap@${EXPECTED_PACKAGE_VERSION}`,
			npm_publish_result: {
				id: `anchormap@${EXPECTED_PACKAGE_VERSION}`,
				name: "anchormap",
				version: EXPECTED_PACKAGE_VERSION,
				shasum: npmShasum,
				integrity: npmIntegrity,
				filename: tarballFile,
			},
		},
		post_publish_verification: {
			registry_metadata_lookup: {
				status: 0,
				version: EXPECTED_PACKAGE_VERSION,
				dist_integrity: npmIntegrity,
				dist_shasum: npmShasum,
				matches_t10_5_artifact: true,
			},
			published_tarball_download_verification: {
				status: 0,
				sha256,
				matches_t10_5_artifact: true,
			},
		},
		regenerated_tarball: false,
		repository_tag: {
			local_status: 0,
			tag: repositoryTag,
			target_commit: "0123456789abcdef0123456789abcdef01234567",
			push_status: 0,
			remote: "origin",
			pushed: true,
			remote_ref: `refs/tags/${repositoryTag}`,
		},
	});
}

export function writeFixtureManifest(fixturesRoot: string, fixture: ReleaseGateFixture): void {
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

export function performanceReportForPlatform(platform: string, arch: string) {
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

export function staleAggregatePerformanceReportForPlatform(platform: string, arch: string) {
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

export function runAggregator(evidence: TempReleaseEvidence) {
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

export function runAggregatorWithArgs(args: string[], cwd: string) {
	return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
		cwd,
		encoding: "utf8",
	});
}
