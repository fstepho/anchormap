import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const REPO_ROOT = resolve(__dirname, "..");
export const PACKAGE_JSON_PATH = resolve(REPO_ROOT, "package.json");
export const PACKAGE_LOCK_PATH = resolve(REPO_ROOT, "package-lock.json");
export const NPM_SHRINKWRAP_PATH = resolve(REPO_ROOT, "npm-shrinkwrap.json");
export const RELEASE_LAUNCHER_PATH = resolve(REPO_ROOT, "bin", "anchormap");
export const T9_3_CROSS_PLATFORM_WORKFLOW_PATH = resolve(
	REPO_ROOT,
	".github",
	"workflows",
	"t9-3-cross-platform-linux.yml",
);
export const VALIDATE_BENCHMARK_REPORT_PATH = resolve(
	REPO_ROOT,
	"scripts",
	"validate-release-benchmark-report.mjs",
);
export const RELEASE_BENCHMARK_PATH = resolve(REPO_ROOT, "scripts", "release-benchmark.mjs");
export const VERIFY_INSTALLED_ARTIFACT_PATH = resolve(
	REPO_ROOT,
	"scripts",
	"verify-installed-artifact.mjs",
);
export const PUBLICATION_DRY_RUN_PATH = resolve(REPO_ROOT, "scripts", "publication-dry-run.mjs");
export const EXPECTED_PACKAGE_VERSION = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")).version;

export interface PackageJson {
	name?: string;
	version?: string;
	license?: string;
	private?: boolean;
	bin?: Record<string, string>;
	files?: string[];
	publishConfig?: Record<string, string>;
	engines?: Record<string, string>;
	scripts?: Record<string, string>;
}

export interface PackageLockJson {
	packages?: Record<
		string,
		{
			devDependencies?: Record<string, string>;
		}
	>;
}

export const EXPECTED_PACKAGE_FILES = [
	"npm-shrinkwrap.json",
	"bin/anchormap",
	"dist/anchormap.js",
	"dist/cli/artifact-commands.js",
	"dist/cli/command-args.js",
	"dist/cli/command-preconditions.js",
	"dist/cli/command-result.js",
	"dist/cli/commands.js",
	"dist/domain/anchor-id.js",
	"dist/domain/canonical-order.js",
	"dist/domain/diff-engine.js",
	"dist/domain/finding.js",
	"dist/domain/policy-engine.js",
	"dist/domain/repo-path.js",
	"dist/domain/scan-engine.js",
	"dist/domain/scan-result.js",
	"dist/infra/artifact-io.js",
	"dist/infra/config-io.js",
	"dist/infra/config-yaml-render.js",
	"dist/infra/product-files.js",
	"dist/infra/policy-io.js",
	"dist/infra/repo-fs.js",
	"dist/infra/scaffold.js",
	"dist/infra/spec-index.js",
	"dist/infra/ts-graph.js",
	"dist/infra/tsconfig-io.js",
	"dist/render/render-json.js",
];

export interface BenchmarkRunRecord {
	wall_clock_ms: number;
	peak_rss_mib: number;
	exit_code: number;
}

export interface BenchmarkReport {
	release_build: {
		command: string;
		cli: string;
		node_flags: string[];
	};
	protocol: {
		warmup_runs: number;
		measured_runs: number;
		process_separated_runs: boolean;
		wall_clock_from_process_launch_to_exit: boolean;
		peak_rss_from_external_time_command: boolean;
		large_excluded_from_pass_fail: boolean;
		protocol_compliant: boolean;
	};
	reference_machine: {
		platform: string;
		arch: string;
		supported_platform: boolean;
	};
	gate_f: {
		evaluable: boolean;
		verdict: string;
		large_excluded_from_pass_fail: boolean;
	};
	results: Array<{
		corpus_id: string;
		mapped_anchors: number;
		warmup_runs: BenchmarkRunRecord[];
		measured_runs: BenchmarkRunRecord[];
		verdict: string;
	}>;
}

export function loadPackageJson(): PackageJson {
	return JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as PackageJson;
}

export function loadPackageLockJson(path: string): PackageLockJson {
	return JSON.parse(readFileSync(path, "utf8")) as PackageLockJson;
}

export function loadBenchmarkReport(): BenchmarkReport {
	return JSON.parse(
		readFileSync(resolve(REPO_ROOT, "bench", "reports", "gate-f-report.json"), "utf8"),
	) as BenchmarkReport;
}

export function validateBenchmarkReport(report: unknown) {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-bench-report-test-"));
	const reportPath = join(tempDir, "gate-f-report.json");
	try {
		writeFileSync(reportPath, `${JSON.stringify(report, null, "\t")}\n`, "utf8");

		return spawnSync(process.execPath, [VALIDATE_BENCHMARK_REPORT_PATH, reportPath], {
			cwd: REPO_ROOT,
			encoding: "utf8",
		});
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

export function validateBenchmarkReportWithManifest(report: unknown, manifest: unknown) {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-bench-report-test-"));
	const reportPath = join(tempDir, "gate-f-report.json");
	const manifestPath = join(tempDir, "corpora.json");
	try {
		writeFileSync(reportPath, `${JSON.stringify(report, null, "\t")}\n`, "utf8");
		writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`, "utf8");

		return spawnSync(process.execPath, [VALIDATE_BENCHMARK_REPORT_PATH, reportPath], {
			cwd: REPO_ROOT,
			encoding: "utf8",
			env: {
				...process.env,
				ANCHORMAP_BENCH_CORPORA_MANIFEST: manifestPath,
			},
		});
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

export function loadBenchmarkManifest() {
	return JSON.parse(
		readFileSync(resolve(REPO_ROOT, "bench", "corpora", "v1", "corpora.json"), "utf8"),
	) as {
		corpora: Array<{
			id: string;
			product_files: number;
			observed_anchors: number;
			mapped_anchors: number;
			supported_edges: number;
			gate: boolean;
			p95_wall_clock_ms_budget: number | null;
			peak_rss_mib_budget: number | null;
		}>;
	};
}

export function cleanNodeEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
	const { NODE_OPTIONS: _nodeOptions, NODE_PATH: _nodePath, ...env } = process.env;
	return {
		...env,
		...overrides,
	};
}

export function writeJsonFile(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`, "utf8");
}

export function readJsonFile<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function seedCanonicalPublicationEvidence(evidenceDir: string): void {
	writeJsonFile(join(evidenceDir, "consumer-lockback.json"), {
		schema_version: 1,
		task: "T10.5",
		status: "previous-pass",
		marker: "keep-consumer-lockback",
	});
	writeJsonFile(join(evidenceDir, "t10.5-tarball-artifact.json"), {
		schema_version: 1,
		task: "T10.5",
		status: "previous-pass",
		marker: "keep-tarball-artifact",
	});
	writeJsonFile(join(evidenceDir, "t10.5-publication-dry-run.json"), {
		schema_version: 1,
		task: "T10.5",
		status: "previous-pass",
		marker: "keep-publication-dry-run",
	});
}

export function assertCanonicalPublicationEvidencePreserved(evidenceDir: string): void {
	const consumerLockback = readJsonFile<{ marker?: string }>(
		join(evidenceDir, "consumer-lockback.json"),
	);
	const tarballArtifact = readJsonFile<{ marker?: string }>(
		join(evidenceDir, "t10.5-tarball-artifact.json"),
	);
	const publicationDryRun = readJsonFile<{ marker?: string }>(
		join(evidenceDir, "t10.5-publication-dry-run.json"),
	);

	assert.equal(consumerLockback.marker, "keep-consumer-lockback");
	assert.equal(tarballArtifact.marker, "keep-tarball-artifact");
	assert.equal(publicationDryRun.marker, "keep-publication-dry-run");
}

export function benchmarkRunnerEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
	return cleanNodeEnv(overrides);
}
