import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";

const REPO_ROOT = resolve(__dirname, "..");
const PACKAGE_JSON_PATH = resolve(REPO_ROOT, "package.json");
const PACKAGE_LOCK_PATH = resolve(REPO_ROOT, "package-lock.json");
const NPM_SHRINKWRAP_PATH = resolve(REPO_ROOT, "npm-shrinkwrap.json");
const RELEASE_LAUNCHER_PATH = resolve(REPO_ROOT, "bin", "anchormap");
const T9_3_CROSS_PLATFORM_WORKFLOW_PATH = resolve(
	REPO_ROOT,
	".github",
	"workflows",
	"t9-3-cross-platform-linux.yml",
);
const VALIDATE_BENCHMARK_REPORT_PATH = resolve(
	REPO_ROOT,
	"scripts",
	"validate-release-benchmark-report.mjs",
);
const RELEASE_BENCHMARK_PATH = resolve(REPO_ROOT, "scripts", "release-benchmark.mjs");
const VERIFY_INSTALLED_ARTIFACT_PATH = resolve(
	REPO_ROOT,
	"scripts",
	"verify-installed-artifact.mjs",
);
const PUBLICATION_DRY_RUN_PATH = resolve(REPO_ROOT, "scripts", "publication-dry-run.mjs");
const EXPECTED_PACKAGE_VERSION = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")).version;

interface PackageJson {
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

interface PackageLockJson {
	packages?: Record<
		string,
		{
			devDependencies?: Record<string, string>;
		}
	>;
}

const EXPECTED_PACKAGE_FILES = [
	"npm-shrinkwrap.json",
	"bin/anchormap",
	"dist/anchormap.js",
	"dist/cli/command-args.js",
	"dist/cli/commands.js",
	"dist/domain/anchor-id.js",
	"dist/domain/canonical-order.js",
	"dist/domain/finding.js",
	"dist/domain/repo-path.js",
	"dist/domain/scan-engine.js",
	"dist/domain/scan-result.js",
	"dist/infra/config-io.js",
	"dist/infra/config-yaml-render.js",
	"dist/infra/product-files.js",
	"dist/infra/repo-fs.js",
	"dist/infra/spec-index.js",
	"dist/infra/ts-graph.js",
	"dist/render/render-json.js",
];

interface BenchmarkRunRecord {
	wall_clock_ms: number;
	peak_rss_mib: number;
	exit_code: number;
}

interface BenchmarkReport {
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

function loadPackageJson(): PackageJson {
	return JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as PackageJson;
}

function loadPackageLockJson(path: string): PackageLockJson {
	return JSON.parse(readFileSync(path, "utf8")) as PackageLockJson;
}

function loadBenchmarkReport(): BenchmarkReport {
	return JSON.parse(
		readFileSync(resolve(REPO_ROOT, "bench", "reports", "gate-f-report.json"), "utf8"),
	) as BenchmarkReport;
}

function validateBenchmarkReport(report: unknown) {
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

function validateBenchmarkReportWithManifest(report: unknown, manifest: unknown) {
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

function loadBenchmarkManifest() {
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

function cleanNodeEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
	const { NODE_OPTIONS: _nodeOptions, NODE_PATH: _nodePath, ...env } = process.env;
	return {
		...env,
		...overrides,
	};
}

function writeJsonFile(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`, "utf8");
}

function readJsonFile<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

function seedCanonicalPublicationEvidence(evidenceDir: string): void {
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

function assertCanonicalPublicationEvidencePreserved(evidenceDir: string): void {
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

function benchmarkRunnerEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
	return cleanNodeEnv(overrides);
}

test("package.json exposes the stable repo-local check and harness command surface", () => {
	const packageJson = loadPackageJson();
	const scripts = packageJson.scripts ?? {};

	assert.equal(packageJson.name, "anchormap");
	assert.equal(packageJson.version, EXPECTED_PACKAGE_VERSION);
	assert.equal(packageJson.license, "MIT");
	assert.equal(packageJson.private, false);
	assert.deepEqual(packageJson.publishConfig, {
		access: "public",
		registry: "https://registry.npmjs.org/",
	});
	assert.deepEqual(packageJson.engines, {
		node: ">=22.0.0",
	});
	assert.deepEqual(packageJson.bin, {
		anchormap: "bin/anchormap",
	});
	assert.deepEqual(packageJson.files, EXPECTED_PACKAGE_FILES);
	assert.match(
		readFileSync(RELEASE_LAUNCHER_PATH, "utf8"),
		/node --no-opt --max-semi-space-size=1 --no-expose-wasm/,
	);
	assert.doesNotMatch(readFileSync(RELEASE_LAUNCHER_PATH, "utf8"), /--max-old-space-size/);
	assert.equal(scripts["check:docs"], "sh scripts/check-docs-consistency.sh");
	assert.equal(scripts["bench:release"], "npm run build && node scripts/release-benchmark.mjs");
	assert.equal(
		scripts["bench:validate"],
		"node scripts/validate-release-benchmark-report.mjs bench/reports/gate-f-report.json",
	);
	assert.equal(
		scripts["bench:validate:artifacts"],
		"node scripts/validate-release-benchmark-report.mjs --require-supported-platform-artifacts reports/t9.4",
	);
	assert.equal(scripts["audit:reproducibility"], "node scripts/reproducibility-audit.mjs");
	assert.equal(
		scripts["audit:reproducibility:update"],
		"node scripts/reproducibility-audit.mjs --write",
	);
	assert.equal(scripts["release:gates"], "node scripts/release-gate-aggregator.mjs");
	assert.equal(
		scripts["release:publication-dry-run"],
		"npm run build && node scripts/publication-dry-run.mjs",
	);
	assert.equal(
		scripts["verify:installed-artifact"],
		"npm run build && node scripts/verify-installed-artifact.mjs",
	);
	assert.equal(scripts.test, "npm run test:unit");
	assert.equal(
		scripts["test:docs"],
		'npm run check:docs && npm run build && node --test "dist/package-scripts.test.js" "dist/harness/docs-consistency.test.js" "dist/harness/lint-tasks-fixture.test.js" "dist/harness/workflow-preflight-fixture.test.js"',
	);
	assert.equal(scripts["test:unit"], 'npm run build && node --test "dist/**/*.test.js"');
	assert.equal(
		scripts["test:product"],
		'npm run build && node --test "dist/bootstrap.test.js" "dist/cli/**/*.test.js" "dist/domain/**/*.test.js" "dist/infra/**/*.test.js" "dist/render/**/*.test.js"',
	);
	assert.equal(
		scripts["test:harness"],
		'npm run build && node --test "dist/cli-stub.test.js" "dist/harness/fixture-*.test.js" "dist/harness/harness-smoke-fixtures.test.js"',
	);
	assert.equal(scripts["test:fixtures"], "npm run build && node dist/harness/fixture-runner.js");
	assert.equal(scripts["test:fixtures:all"], "npm run test:fixtures");
	assert.equal(scripts["check:goldens"], "npm run test:fixtures -- --goldens-only");
	assert.equal(scripts["workflow:preflight"], "sh scripts/workflow-preflight.sh");
});

test("publication dry-run script fails closed when release prerequisites are not passing", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-publication-dry-run-test-"));
	const outDir = join(tempDir, "out");
	const evidenceDir = join(tempDir, "evidence");
	const m9ReportPath = join(tempDir, "release-report.json");
	const installedArtifactReportPath = join(tempDir, "installed-artifact-report.json");

	try {
		writeJsonFile(m9ReportPath, { schema_version: 1, release_verdict: "fail" });
		writeJsonFile(installedArtifactReportPath, { task: "T10.3", verdict: "pass" });
		seedCanonicalPublicationEvidence(evidenceDir);

		const result = spawnSync(
			process.execPath,
			[
				PUBLICATION_DRY_RUN_PATH,
				"--out-dir",
				outDir,
				"--evidence-dir",
				evidenceDir,
				"--m9-release-report",
				m9ReportPath,
				"--installed-artifact-report",
				installedArtifactReportPath,
			],
			{
				cwd: REPO_ROOT,
				encoding: "utf8",
				env: cleanNodeEnv(),
			},
		);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /preconditions failed/);
		assert.equal(existsSync(join(outDir, "precondition-failure.json")), true);
		assertCanonicalPublicationEvidencePreserved(evidenceDir);

		const report = readJsonFile<{
			status: string;
			failures: string[];
		}>(join(outDir, "precondition-failure.json"));
		assert.equal(report.status, "fail");
		assert.deepEqual(report.failures, ["M9 release report must have release_verdict pass"]);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("publication dry-run script rejects null release prerequisite reports", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-publication-null-report-test-"));
	const outDir = join(tempDir, "out");
	const evidenceDir = join(tempDir, "evidence");
	const m9ReportPath = join(tempDir, "release-report.json");
	const installedArtifactReportPath = join(tempDir, "installed-artifact-report.json");

	try {
		writeJsonFile(m9ReportPath, null);
		writeJsonFile(installedArtifactReportPath, { task: "T10.3", verdict: "pass" });
		seedCanonicalPublicationEvidence(evidenceDir);

		const result = spawnSync(
			process.execPath,
			[
				PUBLICATION_DRY_RUN_PATH,
				"--out-dir",
				outDir,
				"--evidence-dir",
				evidenceDir,
				"--m9-release-report",
				m9ReportPath,
				"--installed-artifact-report",
				installedArtifactReportPath,
			],
			{
				cwd: REPO_ROOT,
				encoding: "utf8",
				env: cleanNodeEnv(),
			},
		);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /preconditions failed/);
		assert.equal(existsSync(join(outDir, "t10.5-publication-dry-run.json")), false);
		assertCanonicalPublicationEvidencePreserved(evidenceDir);

		const report = readJsonFile<{
			status: string;
			failures: string[];
		}>(join(outDir, "precondition-failure.json"));
		assert.equal(report.status, "fail");
		assert.deepEqual(report.failures, ["M9 release report must be a JSON object"]);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("publication dry-run script rejects stale installed-artifact package metadata", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-publication-stale-install-test-"));
	const outDir = join(tempDir, "out");
	const evidenceDir = join(tempDir, "evidence");
	const m9ReportPath = join(tempDir, "release-report.json");
	const installedArtifactReportPath = join(tempDir, "installed-artifact-report.json");

	try {
		writeJsonFile(m9ReportPath, { schema_version: 1, release_verdict: "pass" });
		writeJsonFile(installedArtifactReportPath, {
			task: "T10.3",
			verdict: "pass",
			package: {
				name: "anchormap",
				version: "1.0.0",
				filename: "anchormap-1.0.0.tgz",
				integrity: "sha512-stale",
				shasum: "0000000000000000000000000000000000000000",
				files: ["package.json"],
			},
		});
		seedCanonicalPublicationEvidence(evidenceDir);

		const result = spawnSync(
			process.execPath,
			[
				PUBLICATION_DRY_RUN_PATH,
				"--out-dir",
				outDir,
				"--evidence-dir",
				evidenceDir,
				"--m9-release-report",
				m9ReportPath,
				"--installed-artifact-report",
				installedArtifactReportPath,
			],
			{
				cwd: REPO_ROOT,
				encoding: "utf8",
				env: cleanNodeEnv(),
			},
		);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /tarball artifact validation failed/);
		assertCanonicalPublicationEvidencePreserved(evidenceDir);

		const report = readJsonFile<{
			status: string;
			pack: {
				command: string;
			};
			installed_artifact_coherence: {
				status: string;
				failures: string[];
			};
		}>(join(outDir, "t10.5-tarball-artifact.json"));
		const relativeOutDir = relative(REPO_ROOT, outDir).split(sep).join("/");
		assert.equal(report.status, "fail");
		assert.equal(report.pack.command, `npm pack --pack-destination ${relativeOutDir} --json`);
		assert.equal(report.installed_artifact_coherence.status, "fail");
		assert.ok(
			report.installed_artifact_coherence.failures.includes(
				"T10.3 installed tarball integrity must match current tarball",
			),
		);
		assert.ok(
			report.installed_artifact_coherence.failures.includes(
				"T10.3 installed package file list must match current tarball",
			),
		);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("publication dry-run script rejects shrinkwraps missing package-lock transitive closure entries", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-publication-lockback-test-"));
	const scriptDir = join(tempDir, "scripts");
	const scriptPath = join(scriptDir, "publication-dry-run.mjs");
	const fakeBinDir = join(tempDir, "bin");
	const fakeNpmPath = join(fakeBinDir, "npm");
	const outDir = join(tempDir, "out");
	const evidenceDir = join(tempDir, "evidence");
	const m9ReportPath = join(tempDir, "release-report.json");
	const installedArtifactReportPath = join(tempDir, "installed-artifact-report.json");
	const packageFiles = [
		"package.json",
		"npm-shrinkwrap.json",
		"bin/anchormap",
		"dist/anchormap.js",
	].sort();

	try {
		mkdirSync(scriptDir, { recursive: true });
		mkdirSync(fakeBinDir);
		writeFileSync(scriptPath, readFileSync(PUBLICATION_DRY_RUN_PATH, "utf8"), "utf8");
		writeJsonFile(join(tempDir, "package.json"), {
			name: "anchormap",
			version: "1.0.0",
			files: ["npm-shrinkwrap.json", "bin/anchormap", "dist/anchormap.js"],
			dependencies: {
				direct: "1.0.0",
			},
		});
		writeJsonFile(join(tempDir, "package-lock.json"), {
			packages: {
				"": {
					dependencies: {
						direct: "1.0.0",
					},
				},
				"node_modules/direct": {
					version: "1.0.0",
					integrity: "sha512-direct",
					dependencies: {
						transitive: "1.0.0",
					},
				},
				"node_modules/transitive": {
					version: "1.0.0",
					integrity: "sha512-transitive",
				},
			},
		});
		writeJsonFile(join(tempDir, "npm-shrinkwrap.json"), {
			packages: {
				"": {
					dependencies: {
						direct: "1.0.0",
					},
				},
				"node_modules/direct": {
					version: "1.0.0",
					integrity: "sha512-direct",
				},
			},
		});
		writeFileSync(
			fakeNpmPath,
			`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const packageFiles = ${JSON.stringify(packageFiles.map((file) => ({ path: file })))};

if (process.argv[2] === "pack") {
	const destination = process.argv[process.argv.indexOf("--pack-destination") + 1];
	fs.mkdirSync(destination, { recursive: true });
	fs.writeFileSync(path.join(destination, "anchormap-${EXPECTED_PACKAGE_VERSION}.tgz"), "fake tarball\\n");
	process.stdout.write(JSON.stringify([{
		id: "anchormap@${EXPECTED_PACKAGE_VERSION}",
		name: "anchormap",
		version: "${EXPECTED_PACKAGE_VERSION}",
		filename: "anchormap-${EXPECTED_PACKAGE_VERSION}.tgz",
		integrity: "sha512-current",
		shasum: "1111111111111111111111111111111111111111",
		files: packageFiles,
	}]) + "\\n");
	process.exit(0);
}

if (process.argv[2] === "publish") {
	process.stdout.write("{\\"dryRun\\":true}\\n");
	process.exit(0);
}

process.stderr.write("unexpected fake npm invocation: " + process.argv.slice(2).join(" ") + "\\n");
process.exit(1);
`,
			"utf8",
		);
		chmodSync(fakeNpmPath, 0o755);
		writeJsonFile(m9ReportPath, { schema_version: 1, release_verdict: "pass" });
		writeJsonFile(installedArtifactReportPath, {
			task: "T10.3",
			verdict: "pass",
			package: {
				name: "anchormap",
				version: EXPECTED_PACKAGE_VERSION,
				filename: `anchormap-${EXPECTED_PACKAGE_VERSION}.tgz`,
				integrity: "sha512-current",
				shasum: "1111111111111111111111111111111111111111",
				files: packageFiles,
			},
		});
		seedCanonicalPublicationEvidence(evidenceDir);

		const result = spawnSync(
			process.execPath,
			[
				scriptPath,
				"--out-dir",
				outDir,
				"--evidence-dir",
				evidenceDir,
				"--m9-release-report",
				m9ReportPath,
				"--installed-artifact-report",
				installedArtifactReportPath,
			],
			{
				cwd: tempDir,
				encoding: "utf8",
				env: cleanNodeEnv({
					PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
				}),
			},
		);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /tarball artifact validation failed/);
		assertCanonicalPublicationEvidencePreserved(evidenceDir);

		const lockback = readJsonFile<{
			runtime_closure_matches_gate_g: boolean;
			failures: string[];
		}>(join(outDir, "consumer-lockback.json"));
		assert.equal(lockback.runtime_closure_matches_gate_g, false);
		assert.ok(
			lockback.failures.includes(
				"package-lock closure dependency transitive must match npm-shrinkwrap.json",
			),
		);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("publication dry-run script rejects package contents widened beyond ADR-0009", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-publication-allowlist-test-"));
	const scriptDir = join(tempDir, "scripts");
	const scriptPath = join(scriptDir, "publication-dry-run.mjs");
	const fakeBinDir = join(tempDir, "bin");
	const fakeNpmPath = join(fakeBinDir, "npm");
	const outDir = join(tempDir, "out");
	const evidenceDir = join(tempDir, "evidence");
	const m9ReportPath = join(tempDir, "release-report.json");
	const installedArtifactReportPath = join(tempDir, "installed-artifact-report.json");
	const extraFile = "dist/experimental.js";
	const packageFiles = ["package.json", ...EXPECTED_PACKAGE_FILES, extraFile].sort();

	try {
		mkdirSync(scriptDir, { recursive: true });
		mkdirSync(fakeBinDir);
		writeFileSync(scriptPath, readFileSync(PUBLICATION_DRY_RUN_PATH, "utf8"), "utf8");
		writeJsonFile(join(tempDir, "package.json"), {
			name: "anchormap",
			version: "1.0.0",
			files: [...EXPECTED_PACKAGE_FILES, extraFile],
			dependencies: {},
		});
		const lockback = {
			packages: {
				"": {
					name: "anchormap",
					version: "1.0.0",
				},
			},
		};
		writeJsonFile(join(tempDir, "package-lock.json"), lockback);
		writeJsonFile(join(tempDir, "npm-shrinkwrap.json"), lockback);
		writeFileSync(
			fakeNpmPath,
			`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const packageFiles = ${JSON.stringify(packageFiles.map((file) => ({ path: file })))};

if (process.argv[2] === "pack") {
	const destination = process.argv[process.argv.indexOf("--pack-destination") + 1];
	fs.mkdirSync(destination, { recursive: true });
	fs.writeFileSync(path.join(destination, "anchormap-${EXPECTED_PACKAGE_VERSION}.tgz"), "fake tarball\\n");
	process.stdout.write(JSON.stringify([{
		id: "anchormap@${EXPECTED_PACKAGE_VERSION}",
		name: "anchormap",
		version: "${EXPECTED_PACKAGE_VERSION}",
		filename: "anchormap-${EXPECTED_PACKAGE_VERSION}.tgz",
		integrity: "sha512-current",
		shasum: "1111111111111111111111111111111111111111",
		files: packageFiles,
	}]) + "\\n");
	process.exit(0);
}

if (process.argv[2] === "publish") {
	process.stdout.write("{\\"dryRun\\":true}\\n");
	process.exit(0);
}

process.stderr.write("unexpected fake npm invocation: " + process.argv.slice(2).join(" ") + "\\n");
process.exit(1);
`,
			"utf8",
		);
		chmodSync(fakeNpmPath, 0o755);
		writeJsonFile(m9ReportPath, { schema_version: 1, release_verdict: "pass" });
		writeJsonFile(installedArtifactReportPath, {
			task: "T10.3",
			verdict: "pass",
			package: {
				name: "anchormap",
				version: EXPECTED_PACKAGE_VERSION,
				filename: `anchormap-${EXPECTED_PACKAGE_VERSION}.tgz`,
				integrity: "sha512-current",
				shasum: "1111111111111111111111111111111111111111",
				files: packageFiles,
			},
		});
		seedCanonicalPublicationEvidence(evidenceDir);

		const result = spawnSync(
			process.execPath,
			[
				scriptPath,
				"--out-dir",
				outDir,
				"--evidence-dir",
				evidenceDir,
				"--m9-release-report",
				m9ReportPath,
				"--installed-artifact-report",
				installedArtifactReportPath,
			],
			{
				cwd: tempDir,
				encoding: "utf8",
				env: cleanNodeEnv({
					PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
				}),
			},
		);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /tarball artifact validation failed/);
		assertCanonicalPublicationEvidencePreserved(evidenceDir);

		const report = readJsonFile<{
			status: string;
			content_validation: {
				files_outside_adr_0009_allowlist: string[];
				required_compiled_dist_modules: string[];
			};
		}>(join(outDir, "t10.5-tarball-artifact.json"));
		assert.equal(report.status, "fail");
		assert.deepEqual(report.content_validation.files_outside_adr_0009_allowlist, [extraFile]);
		assert.deepEqual(
			report.content_validation.required_compiled_dist_modules,
			EXPECTED_PACKAGE_FILES.filter((file) => file.startsWith("dist/")).sort(),
		);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("publication dry-run script preserves canonical evidence on dry-run failure", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-publication-evidence-test-"));
	const fakeBinDir = join(tempDir, "bin");
	const fakeNpmPath = join(fakeBinDir, "npm");
	const publishArgsPath = join(tempDir, "publish-args.json");
	const outDir = join(tempDir, "out");
	const evidenceDir = join(tempDir, "evidence");
	const m9ReportPath = join(tempDir, "release-report.json");
	const installedArtifactReportPath = join(tempDir, "installed-artifact-report.json");
	const packageFiles = ["README.md", "package.json", ...EXPECTED_PACKAGE_FILES].sort();

	try {
		mkdirSync(fakeBinDir);
		writeFileSync(
			fakeNpmPath,
			`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const packageFiles = ${JSON.stringify(packageFiles.map((file) => ({ path: file })))};

if (process.argv[2] === "pack") {
	const destination = process.argv[process.argv.indexOf("--pack-destination") + 1];
	fs.mkdirSync(destination, { recursive: true });
	fs.writeFileSync(path.join(destination, "anchormap-${EXPECTED_PACKAGE_VERSION}.tgz"), "fake tarball\\n");
	process.stdout.write(JSON.stringify([{
		id: "anchormap@${EXPECTED_PACKAGE_VERSION}",
		name: "anchormap",
		version: "${EXPECTED_PACKAGE_VERSION}",
		filename: "anchormap-${EXPECTED_PACKAGE_VERSION}.tgz",
		integrity: "sha512-current",
		shasum: "1111111111111111111111111111111111111111",
		files: packageFiles,
	}]) + "\\n");
	process.exit(0);
}

if (process.argv[2] === "publish") {
	fs.writeFileSync(process.env.PUBLISH_ARGS_PATH, JSON.stringify(process.argv.slice(2)) + "\\n");
	process.stdout.write("{\\"dryRun\\":false}\\n");
	process.stderr.write("publish dry-run failed\\n");
	process.exit(17);
}

process.stderr.write("unexpected fake npm invocation: " + process.argv.slice(2).join(" ") + "\\n");
process.exit(1);
`,
			"utf8",
		);
		chmodSync(fakeNpmPath, 0o755);
		writeJsonFile(m9ReportPath, { schema_version: 1, release_verdict: "pass" });
		writeJsonFile(installedArtifactReportPath, {
			task: "T10.3",
			verdict: "pass",
			package: {
				name: "anchormap",
				version: EXPECTED_PACKAGE_VERSION,
				filename: `anchormap-${EXPECTED_PACKAGE_VERSION}.tgz`,
				integrity: "sha512-current",
				shasum: "1111111111111111111111111111111111111111",
				files: packageFiles,
			},
		});
		seedCanonicalPublicationEvidence(evidenceDir);

		const result = spawnSync(
			process.execPath,
			[
				PUBLICATION_DRY_RUN_PATH,
				"--out-dir",
				outDir,
				"--evidence-dir",
				evidenceDir,
				"--m9-release-report",
				m9ReportPath,
				"--installed-artifact-report",
				installedArtifactReportPath,
			],
			{
				cwd: REPO_ROOT,
				encoding: "utf8",
				env: cleanNodeEnv({
					PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
					PUBLISH_ARGS_PATH: publishArgsPath,
				}),
			},
		);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /npm publish dry-run failed/);
		assert.equal(existsSync(join(outDir, "consumer-lockback.json")), true);
		assert.equal(existsSync(join(outDir, "t10.5-tarball-artifact.json")), true);
		assert.equal(existsSync(join(outDir, "t10.5-publication-dry-run.json")), true);
		assertCanonicalPublicationEvidencePreserved(evidenceDir);
		const dryRunEvidence = readJsonFile<{
			status: string;
			command: string;
			tarball_path: string;
			exit_status: number;
		}>(join(outDir, "t10.5-publication-dry-run.json"));
		assert.equal(dryRunEvidence.status, "fail");
		assert.equal(dryRunEvidence.exit_status, 17);
		assert.equal(
			dryRunEvidence.command,
			`npm publish --dry-run ${dryRunEvidence.tarball_path} --tag latest --access public --registry https://registry.npmjs.org/ --json`,
		);
		assert.deepEqual(readJsonFile<string[]>(publishArgsPath), [
			"publish",
			"--dry-run",
			dryRunEvidence.tarball_path,
			"--tag",
			"latest",
			"--access",
			"public",
			"--registry",
			"https://registry.npmjs.org/",
			"--json",
		]);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("release package contents include launcher and compiled CLI target", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-pack-test-"));
	const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
		cwd: REPO_ROOT,
		env: {
			...process.env,
			npm_config_cache: join(tempDir, "npm-cache"),
		},
		encoding: "utf8",
	});
	try {
		assert.equal(result.status, 0, result.stderr);

		const [packResult] = JSON.parse(result.stdout) as Array<{
			files: Array<{ path: string }>;
		}>;
		const packedFiles = packResult.files.map((file) => file.path).sort();
		const expectedPackedFiles = [
			"LICENSE",
			"README.md",
			"package.json",
			...EXPECTED_PACKAGE_FILES,
		].sort();

		assert.deepEqual(packedFiles, expectedPackedFiles);
		assert.ok(!packedFiles.some((path) => path.includes(".test.")));
		assert.ok(!packedFiles.some((path) => path.startsWith("dist/harness/")));
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("installed artifact verifier archives smoke command failures before exiting", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-installed-artifact-failure-test-"));
	const fakeBinDir = join(tempDir, "bin");
	const fakeNpmPath = join(fakeBinDir, "npm");
	const initYaml = `version: 1
product_root: 'src'
spec_roots:
  - 'specs'
mappings: {}
`;

	try {
		mkdirSync(fakeBinDir);
		writeFileSync(
			fakeNpmPath,
			`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const packageFiles = [
	{ path: "bin/anchormap" },
	{ path: "dist/anchormap.js" },
	{ path: "npm-shrinkwrap.json" },
	{ path: "package.json" },
];

function writeExecutable(filePath, contents) {
	fs.writeFileSync(filePath, contents, "utf8");
	fs.chmodSync(filePath, 0o755);
}

if (process.argv[2] === "pack") {
	const destination = process.argv[process.argv.indexOf("--pack-destination") + 1];
	fs.mkdirSync(destination, { recursive: true });
	fs.writeFileSync(path.join(destination, "anchormap-1.0.0.tgz"), "");
	process.stdout.write(JSON.stringify([{
		id: "anchormap@1.0.0",
		name: "anchormap",
		version: "1.0.0",
		filename: "anchormap-1.0.0.tgz",
		integrity: "sha512-test",
		shasum: "test",
		files: packageFiles,
	}]) + "\\n");
	process.exit(0);
}

if (process.argv[2] === "install") {
	const packageDir = path.join(process.cwd(), "node_modules", "anchormap");
	const binDir = path.join(process.cwd(), "node_modules", ".bin");
	fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });
	fs.mkdirSync(path.join(packageDir, "dist"), { recursive: true });
	fs.mkdirSync(binDir, { recursive: true });
	fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
		name: "anchormap",
		version: "1.0.0",
	}), "utf8");
	fs.writeFileSync(path.join(packageDir, "npm-shrinkwrap.json"), "{}\\n", "utf8");
	fs.writeFileSync(path.join(packageDir, "dist", "anchormap.js"), "module.exports = {};\\n", "utf8");
writeExecutable(path.join(packageDir, "bin", "anchormap"), ${JSON.stringify(`#!/bin/sh
maybe_fail() {
	if [ "\${ANCHORMAP_FAKE_FAIL_COMMAND:-}" = "$1" ]; then
		printf '%s stdout\\n' "$1"
		printf '%s stderr\\n' "$1" >&2
		exit 9
	fi
}

case "$1" in
	init)
		maybe_fail init
		cat > anchormap.yaml <<'YAML'
${initYaml}YAML
		exit 0
		;;
	map)
		maybe_fail map
		exit 0
		;;
	scan)
		maybe_fail scan
		printf '{"fake":true}\\n'
		exit 0
		;;
esac
exit 4
`)});
	fs.symlinkSync("../anchormap/bin/anchormap", path.join(binDir, "anchormap"));
	fs.writeFileSync(path.join(process.cwd(), "package-lock.json"), "{}\\n", "utf8");
	process.exit(0);
}

process.stderr.write("unexpected fake npm invocation: " + process.argv.slice(2).join(" ") + "\\n");
process.exit(1);
`,
			"utf8",
		);
		chmodSync(fakeNpmPath, 0o755);

		const cases = [
			{
				failCommand: "init",
				reportCommand: "init",
				exitCheck: "init_exit_zero",
			},
			{
				failCommand: "map",
				reportCommand: "map",
				exitCheck: "map_exit_zero",
			},
			{
				failCommand: "scan",
				reportCommand: "scan_json",
				exitCheck: "scan_json_exit_zero",
			},
		];

		for (const smokeCase of cases) {
			const caseReportPath = join(tempDir, `${smokeCase.failCommand}-report.json`);
			const result = spawnSync(
				process.execPath,
				[VERIFY_INSTALLED_ARTIFACT_PATH, "--report", caseReportPath],
				{
					cwd: REPO_ROOT,
					encoding: "utf8",
					env: cleanNodeEnv({
						ANCHORMAP_FAKE_FAIL_COMMAND: smokeCase.failCommand,
						PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
					}),
				},
			);

			assert.equal(result.status, 1);
			assert.match(result.stderr, /installed artifact verification failed/);
			assert.equal(existsSync(caseReportPath), true);

			const report = JSON.parse(readFileSync(caseReportPath, "utf8")) as {
				verdict: string;
				commands: Record<
					string,
					{
						status: number;
						stdout: string;
						stderr: string;
						anchormap_yaml?: string | null;
					}
				>;
				checks: Record<string, boolean>;
			};
			const commandReport = report.commands[smokeCase.reportCommand];

			assert.equal(report.verdict, "fail");
			assert.equal(commandReport.status, 9);
			assert.equal(commandReport.stdout, `${smokeCase.failCommand} stdout\n`);
			assert.equal(commandReport.stderr, `${smokeCase.failCommand} stderr\n`);
			assert.equal(report.checks[smokeCase.exitCheck], false);
			if (smokeCase.failCommand === "map") {
				assert.equal(commandReport.anchormap_yaml, initYaml);
			}
		}
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("installed artifact verifier reports install and bin-linkage failures with cleanup", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-installed-artifact-linkage-test-"));
	const fakeBinDir = join(tempDir, "bin");
	const fakeNpmPath = join(fakeBinDir, "npm");
	const verifierTmpDir = join(tempDir, "verifier-tmp");

	try {
		mkdirSync(fakeBinDir);
		mkdirSync(verifierTmpDir);
		writeFileSync(
			fakeNpmPath,
			`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const packageFiles = [
	{ path: "bin/anchormap" },
	{ path: "dist/anchormap.js" },
	{ path: "npm-shrinkwrap.json" },
	{ path: "package.json" },
];

if (process.argv[2] === "pack") {
	const destination = process.argv[process.argv.indexOf("--pack-destination") + 1];
	fs.mkdirSync(destination, { recursive: true });
	fs.writeFileSync(path.join(destination, "anchormap-1.0.0.tgz"), "");
	process.stdout.write(JSON.stringify([{
		id: "anchormap@1.0.0",
		name: "anchormap",
		version: "1.0.0",
		filename: "anchormap-1.0.0.tgz",
		integrity: "sha512-test",
		shasum: "test",
		files: packageFiles,
	}]) + "\\n");
	process.exit(0);
}

if (process.argv[2] === "install") {
	if (process.env.ANCHORMAP_FAKE_INSTALL_FAIL === "1") {
		process.stdout.write("install stdout\\n");
		process.stderr.write("install stderr\\n");
		process.exit(42);
	}

	const packageDir = path.join(process.cwd(), "node_modules", "anchormap");
	const binDir = path.join(process.cwd(), "node_modules", ".bin");
	fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });
	fs.mkdirSync(path.join(packageDir, "dist"), { recursive: true });
	fs.mkdirSync(binDir, { recursive: true });
	fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
		name: "anchormap",
		version: "1.0.0",
	}), "utf8");
	fs.writeFileSync(path.join(packageDir, "npm-shrinkwrap.json"), "{}\\n", "utf8");
	fs.writeFileSync(path.join(packageDir, "dist", "anchormap.js"), "module.exports = {};\\n", "utf8");
	fs.writeFileSync(path.join(packageDir, "bin", "anchormap"), "#!/bin/sh\\nexit 0\\n", "utf8");
	if (process.env.ANCHORMAP_FAKE_MISSING_BIN_LINK !== "1") {
		if (process.env.ANCHORMAP_FAKE_PREFIX_SHARING_BIN_LINK === "1") {
			const siblingPackageDir = path.join(process.cwd(), "node_modules", "anchormap-copy", "anchormap");
			fs.mkdirSync(path.join(siblingPackageDir, "bin"), { recursive: true });
			fs.writeFileSync(path.join(siblingPackageDir, "bin", "anchormap"), "#!/bin/sh\\nexit 0\\n", "utf8");
			fs.symlinkSync("../anchormap-copy/anchormap/bin/anchormap", path.join(binDir, "anchormap"));
		} else {
			fs.symlinkSync("../anchormap/bin/anchormap", path.join(binDir, "anchormap"));
		}
	}
	fs.writeFileSync(path.join(process.cwd(), "package-lock.json"), "{}\\n", "utf8");
	process.exit(0);
}

process.stderr.write("unexpected fake npm invocation: " + process.argv.slice(2).join(" ") + "\\n");
process.exit(1);
`,
			"utf8",
		);
		chmodSync(fakeNpmPath, 0o755);

		const cases = [
			{
				name: "install-failure",
				env: { ANCHORMAP_FAKE_INSTALL_FAIL: "1" },
				assertReport(report: {
					consumer_install: { status: number; stdout: string; stderr: string };
					installed_binary: { present: boolean };
					commands: { init: unknown };
					checks: Record<string, boolean>;
				}) {
					assert.equal(report.consumer_install.status, 42);
					assert.equal(report.consumer_install.stdout, "install stdout\n");
					assert.equal(report.consumer_install.stderr, "install stderr\n");
					assert.equal(report.checks.consumer_install_exit_zero, false);
					assert.equal(report.installed_binary.present, false);
					assert.equal(report.commands.init, null);
				},
			},
			{
				name: "missing-bin",
				env: { ANCHORMAP_FAKE_MISSING_BIN_LINK: "1" },
				assertReport(report: {
					consumer_install: { status: number; stdout: string; stderr: string };
					installed_binary: { present: boolean; link_target: string | null };
					commands: { init: unknown };
					checks: Record<string, boolean>;
				}) {
					assert.equal(report.consumer_install.status, 0);
					assert.equal(report.checks.installed_binary_present, false);
					assert.equal(report.checks.bin_resolves_to_installed_package, false);
					assert.equal(report.installed_binary.present, false);
					assert.equal(report.installed_binary.link_target, null);
					assert.equal(report.commands.init, null);
				},
			},
			{
				name: "prefix-sharing-bin",
				env: { ANCHORMAP_FAKE_PREFIX_SHARING_BIN_LINK: "1" },
				assertReport(report: {
					consumer_install: { status: number; stdout: string; stderr: string };
					installed_binary: { present: boolean; link_target: string | null };
					checks: Record<string, boolean>;
				}) {
					assert.equal(report.consumer_install.status, 0);
					assert.equal(report.installed_binary.present, true);
					assert.equal(
						report.installed_binary.link_target,
						"../anchormap-copy/anchormap/bin/anchormap",
					);
					assert.equal(report.checks.bin_resolves_to_installed_package, false);
					assert.equal(report.checks.bin_points_at_release_launcher, false);
				},
			},
		];

		for (const failureCase of cases) {
			const caseReportPath = join(tempDir, `${failureCase.name}-report.json`);
			const result = spawnSync(
				process.execPath,
				[VERIFY_INSTALLED_ARTIFACT_PATH, "--report", caseReportPath],
				{
					cwd: REPO_ROOT,
					encoding: "utf8",
					env: cleanNodeEnv({
						...failureCase.env,
						PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
						TMPDIR: verifierTmpDir,
					}),
				},
			);

			assert.equal(result.status, 1);
			assert.match(result.stderr, /installed artifact verification failed/);
			assert.equal(existsSync(caseReportPath), true);
			assert.deepEqual(
				readdirSync(verifierTmpDir).filter((entry) =>
					entry.startsWith("anchormap-installed-artifact-"),
				),
				[],
			);

			const report = JSON.parse(readFileSync(caseReportPath, "utf8")) as {
				verdict: string;
				consumer_install: { status: number; stdout: string; stderr: string };
				installed_binary: { present: boolean; link_target: string | null };
				commands: { init: unknown };
				checks: Record<string, boolean>;
			};
			assert.equal(report.verdict, "fail");
			failureCase.assertReport(report);
		}
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("installed artifact verifier rejects inherited NODE_OPTIONS before artifact commands", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-installed-artifact-node-options-test-"));
	const reportPath = join(tempDir, "node-options-report.json");

	try {
		const result = spawnSync(
			process.execPath,
			[VERIFY_INSTALLED_ARTIFACT_PATH, "--report", reportPath],
			{
				cwd: REPO_ROOT,
				encoding: "utf8",
				env: cleanNodeEnv({
					NODE_OPTIONS: "--trace-warnings",
				}),
			},
		);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /NODE_OPTIONS must be unset for installed artifact verification/);
		assert.equal(existsSync(reportPath), true);

		const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
			verdict: string;
			environment: {
				node_options_inherited: boolean;
				node_options_rejected: boolean;
			};
			pack: unknown;
			consumer_install: unknown;
			checks: Record<string, boolean>;
		};

		assert.equal(report.verdict, "fail");
		assert.deepEqual(report.environment, {
			node_options_inherited: true,
			node_options_rejected: true,
		});
		assert.equal(report.pack, null);
		assert.equal(report.consumer_install, null);
		assert.equal(report.checks.node_options_unset, false);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("installed artifact verifier strips NODE_PATH from install and smoke command environments", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-installed-artifact-node-path-test-"));
	const fakeBinDir = join(tempDir, "bin");
	const fakeNpmPath = join(fakeBinDir, "npm");
	const externalNodePathDir = join(tempDir, "external-node-path");
	const reportPath = join(tempDir, "node-path-report.json");
	const initYaml = `version: 1
product_root: 'src'
spec_roots:
  - 'specs'
mappings: {}
`;
	const mappedYaml = `version: 1
product_root: 'src'
spec_roots:
  - 'specs'
mappings:
  'AM-001':
    seed_files:
      - 'src/index.ts'
`;
	const scanJson = `${JSON.stringify({
		schema_version: 2,
		config: {
			version: 1,
			product_root: "src",
			spec_roots: ["specs"],
			ignore_roots: [],
		},
		analysis_health: "clean",
		observed_anchors: {
			"AM-001": {
				spec_path: "specs/requirements.md",
				mapping_state: "usable",
			},
		},
		stored_mappings: {
			"AM-001": {
				state: "usable",
				seed_files: ["src/index.ts"],
				reached_files: ["src/index.ts"],
			},
		},
		files: {
			"src/index.ts": {
				covering_anchor_ids: ["AM-001"],
				supported_local_targets: [],
			},
		},
		traceability_metrics: {
			summary: {
				product_file_count: 1,
				stored_mapping_count: 1,
				usable_mapping_count: 1,
				observed_anchor_count: 1,
				covered_product_file_count: 1,
				uncovered_product_file_count: 0,
				directly_seeded_product_file_count: 1,
				single_cover_product_file_count: 1,
				multi_cover_product_file_count: 0,
			},
			anchors: {
				"AM-001": {
					seed_file_count: 1,
					direct_seed_file_count: 1,
					reached_file_count: 1,
					transitive_reached_file_count: 0,
					unique_reached_file_count: 1,
					shared_reached_file_count: 0,
				},
			},
		},
		findings: [],
	})}\n`;

	try {
		mkdirSync(fakeBinDir);
		mkdirSync(externalNodePathDir);
		writeFileSync(
			join(externalNodePathDir, "anchormap-node-path-sentinel.js"),
			"module.exports = true;\n",
			"utf8",
		);
		writeFileSync(
			fakeNpmPath,
			`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

if (process.env.NODE_PATH !== undefined) {
	process.stderr.write("NODE_PATH leaked into npm command\\n");
	process.exit(66);
}

const packageFiles = [
	{ path: "bin/anchormap" },
	{ path: "dist/anchormap.js" },
	{ path: "npm-shrinkwrap.json" },
	{ path: "package.json" },
];

function writeExecutable(filePath, contents) {
	fs.writeFileSync(filePath, contents, "utf8");
	fs.chmodSync(filePath, 0o755);
}

if (process.argv[2] === "pack") {
	const destination = process.argv[process.argv.indexOf("--pack-destination") + 1];
	fs.mkdirSync(destination, { recursive: true });
	fs.writeFileSync(path.join(destination, "anchormap-1.0.0.tgz"), "");
	process.stdout.write(JSON.stringify([{
		id: "anchormap@1.0.0",
		name: "anchormap",
		version: "1.0.0",
		filename: "anchormap-1.0.0.tgz",
		integrity: "sha512-test",
		shasum: "test",
		files: packageFiles,
	}]) + "\\n");
	process.exit(0);
}

if (process.argv[2] === "install") {
	const packageDir = path.join(process.cwd(), "node_modules", "anchormap");
	const binDir = path.join(process.cwd(), "node_modules", ".bin");
	fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });
	fs.mkdirSync(path.join(packageDir, "dist"), { recursive: true });
	fs.mkdirSync(binDir, { recursive: true });
	fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
		name: "anchormap",
		version: "1.0.0",
	}), "utf8");
	fs.writeFileSync(path.join(packageDir, "npm-shrinkwrap.json"), "{}\\n", "utf8");
	fs.writeFileSync(path.join(packageDir, "dist", "anchormap.js"), "module.exports = {};\\n", "utf8");
writeExecutable(path.join(packageDir, "bin", "anchormap"), ${JSON.stringify(`#!/usr/bin/env node
const fs = require("node:fs");

if (process.env.NODE_PATH !== undefined) {
	process.stderr.write("NODE_PATH leaked into smoke command\\n");
	process.exit(67);
}
try {
	require("anchormap-node-path-sentinel");
	process.stderr.write("NODE_PATH module resolution contaminated smoke command\\n");
	process.exit(68);
} catch (error) {
	if (!error || error.code !== "MODULE_NOT_FOUND") {
		throw error;
	}
}

if (process.argv[2] === "init") {
	fs.writeFileSync("anchormap.yaml", ${JSON.stringify(initYaml)}, "utf8");
	process.exit(0);
}
if (process.argv[2] === "map") {
	fs.writeFileSync("anchormap.yaml", ${JSON.stringify(mappedYaml)}, "utf8");
	process.exit(0);
}
if (process.argv[2] === "scan" && process.argv[3] === "--json") {
	process.stdout.write(${JSON.stringify(scanJson)});
	process.exit(0);
}
process.exit(4);
`)});
	fs.symlinkSync("../anchormap/bin/anchormap", path.join(binDir, "anchormap"));
	fs.writeFileSync(path.join(process.cwd(), "package-lock.json"), "{}\\n", "utf8");
	process.exit(0);
}

process.stderr.write("unexpected fake npm invocation: " + process.argv.slice(2).join(" ") + "\\n");
process.exit(1);
`,
			"utf8",
		);
		chmodSync(fakeNpmPath, 0o755);

		const result = spawnSync(
			process.execPath,
			[VERIFY_INSTALLED_ARTIFACT_PATH, "--report", reportPath],
			{
				cwd: REPO_ROOT,
				encoding: "utf8",
				env: cleanNodeEnv({
					NODE_PATH: externalNodePathDir,
					PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
				}),
			},
		);

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /installed artifact verification passed/);
		assert.equal(existsSync(reportPath), true);

		const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
			verdict: string;
			pack: { status: number };
			consumer_install: { status: number };
			commands: {
				init: { status: number; stderr: string };
				map: { status: number; stderr: string };
				scan_json: { status: number; stderr: string };
			};
			checks: Record<string, boolean>;
		};

		assert.equal(report.verdict, "pass");
		assert.equal(report.pack.status, 0);
		assert.equal(report.consumer_install.status, 0);
		assert.equal(report.commands.init.status, 0);
		assert.equal(report.commands.map.status, 0);
		assert.equal(report.commands.scan_json.status, 0);
		assert.equal(report.commands.init.stderr, "");
		assert.equal(report.commands.map.stderr, "");
		assert.equal(report.commands.scan_json.stderr, "");
		assert.equal(Object.values(report.checks).every(Boolean), true);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("installed artifact verifier ignores nested dependency TypeScript while rejecting package-owned source", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-installed-artifact-source-test-"));
	const fakeBinDir = join(tempDir, "bin");
	const fakeNpmPath = join(fakeBinDir, "npm");
	const initYaml = `version: 1
product_root: 'src'
spec_roots:
  - 'specs'
mappings: {}
`;
	const mappedYaml = `version: 1
product_root: 'src'
spec_roots:
  - 'specs'
mappings:
  'AM-001':
    seed_files:
      - 'src/index.ts'
`;
	const scanJson = `${JSON.stringify({
		schema_version: 2,
		config: {
			version: 1,
			product_root: "src",
			spec_roots: ["specs"],
			ignore_roots: [],
		},
		analysis_health: "clean",
		observed_anchors: {
			"AM-001": {
				spec_path: "specs/requirements.md",
				mapping_state: "usable",
			},
		},
		stored_mappings: {
			"AM-001": {
				state: "usable",
				seed_files: ["src/index.ts"],
				reached_files: ["src/index.ts"],
			},
		},
		files: {
			"src/index.ts": {
				covering_anchor_ids: ["AM-001"],
				supported_local_targets: [],
			},
		},
		traceability_metrics: {
			summary: {
				product_file_count: 1,
				stored_mapping_count: 1,
				usable_mapping_count: 1,
				observed_anchor_count: 1,
				covered_product_file_count: 1,
				uncovered_product_file_count: 0,
				directly_seeded_product_file_count: 1,
				single_cover_product_file_count: 1,
				multi_cover_product_file_count: 0,
			},
			anchors: {
				"AM-001": {
					seed_file_count: 1,
					direct_seed_file_count: 1,
					reached_file_count: 1,
					transitive_reached_file_count: 0,
					unique_reached_file_count: 1,
					shared_reached_file_count: 0,
				},
			},
		},
		findings: [],
	})}\n`;

	try {
		mkdirSync(fakeBinDir);
		writeFileSync(
			fakeNpmPath,
			`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const packageFiles = [
	{ path: "bin/anchormap" },
	{ path: "dist/anchormap.js" },
	{ path: "npm-shrinkwrap.json" },
	{ path: "package.json" },
];

function writeExecutable(filePath, contents) {
	fs.writeFileSync(filePath, contents, "utf8");
	fs.chmodSync(filePath, 0o755);
}

if (process.argv[2] === "pack") {
	const destination = process.argv[process.argv.indexOf("--pack-destination") + 1];
	fs.mkdirSync(destination, { recursive: true });
	fs.writeFileSync(path.join(destination, "anchormap-1.0.0.tgz"), "");
	process.stdout.write(JSON.stringify([{
		id: "anchormap@1.0.0",
		name: "anchormap",
		version: "1.0.0",
		filename: "anchormap-1.0.0.tgz",
		integrity: "sha512-test",
		shasum: "test",
		files: packageFiles,
	}]) + "\\n");
	process.exit(0);
}

if (process.argv[2] === "install") {
	const packageDir = path.join(process.cwd(), "node_modules", "anchormap");
	const binDir = path.join(process.cwd(), "node_modules", ".bin");
	fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });
	fs.mkdirSync(path.join(packageDir, "dist"), { recursive: true });
	fs.mkdirSync(path.join(packageDir, "node_modules", "typescript", "lib"), { recursive: true });
	fs.mkdirSync(path.join(packageDir, "node_modules", "nested-dep", "src"), { recursive: true });
	fs.mkdirSync(binDir, { recursive: true });
	fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
		name: "anchormap",
		version: "1.0.0",
	}), "utf8");
	fs.writeFileSync(path.join(packageDir, "npm-shrinkwrap.json"), "{}\\n", "utf8");
	fs.writeFileSync(path.join(packageDir, "dist", "anchormap.js"), "module.exports = {};\\n", "utf8");
	fs.writeFileSync(
		path.join(packageDir, "node_modules", "typescript", "lib", "typescript.d.ts"),
		"export {};\\n",
		"utf8",
	);
	fs.writeFileSync(
		path.join(packageDir, "node_modules", "nested-dep", "src", "index.ts"),
		"export {};\\n",
		"utf8",
	);
	if (process.env.ANCHORMAP_FAKE_OWN_SOURCE === "src") {
		fs.mkdirSync(path.join(packageDir, "src"), { recursive: true });
		fs.writeFileSync(path.join(packageDir, "src", "index.ts"), "export {};\\n", "utf8");
	}
	if (process.env.ANCHORMAP_FAKE_OWN_SOURCE === "root-ts") {
		fs.writeFileSync(path.join(packageDir, "runtime.d.ts"), "export {};\\n", "utf8");
	}
writeExecutable(path.join(packageDir, "bin", "anchormap"), ${JSON.stringify(`#!/usr/bin/env node
const fs = require("node:fs");

if (process.argv[2] === "init") {
	fs.writeFileSync("anchormap.yaml", ${JSON.stringify(initYaml)}, "utf8");
	process.exit(0);
}
if (process.argv[2] === "map") {
	fs.writeFileSync("anchormap.yaml", ${JSON.stringify(mappedYaml)}, "utf8");
	process.exit(0);
}
if (process.argv[2] === "scan" && process.argv[3] === "--json") {
	process.stdout.write(${JSON.stringify(scanJson)});
	process.exit(0);
}
process.exit(4);
`)});
	fs.symlinkSync("../anchormap/bin/anchormap", path.join(binDir, "anchormap"));
	fs.writeFileSync(path.join(process.cwd(), "package-lock.json"), "{}\\n", "utf8");
	process.exit(0);
}

process.stderr.write("unexpected fake npm invocation: " + process.argv.slice(2).join(" ") + "\\n");
process.exit(1);
`,
			"utf8",
		);
		chmodSync(fakeNpmPath, 0o755);

		const passReportPath = join(tempDir, "nested-dependency-source-report.json");
		const passResult = spawnSync(
			process.execPath,
			[VERIFY_INSTALLED_ARTIFACT_PATH, "--report", passReportPath],
			{
				cwd: REPO_ROOT,
				encoding: "utf8",
				env: cleanNodeEnv({
					PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
				}),
			},
		);

		assert.equal(passResult.status, 0, passResult.stderr);
		const passReport = JSON.parse(readFileSync(passReportPath, "utf8")) as {
			verdict: string;
			runtime_source_check: {
				typescript_source_absent: boolean;
				unexpected_source_files: string[];
			};
		};
		assert.equal(passReport.verdict, "pass");
		assert.deepEqual(passReport.runtime_source_check, {
			compiled_dist_entry_present: true,
			typescript_source_absent: true,
			unexpected_source_files: [],
		});

		for (const sourceCase of [
			{
				name: "own-src",
				value: "src",
				unexpectedSourceFiles: ["src/index.ts"],
			},
			{
				name: "own-root-ts",
				value: "root-ts",
				unexpectedSourceFiles: ["runtime.d.ts"],
			},
		]) {
			const caseReportPath = join(tempDir, `${sourceCase.name}-report.json`);
			const result = spawnSync(
				process.execPath,
				[VERIFY_INSTALLED_ARTIFACT_PATH, "--report", caseReportPath],
				{
					cwd: REPO_ROOT,
					encoding: "utf8",
					env: cleanNodeEnv({
						ANCHORMAP_FAKE_OWN_SOURCE: sourceCase.value,
						PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
					}),
				},
			);

			assert.equal(result.status, 1);
			assert.match(result.stderr, /installed artifact verification failed/);

			const report = JSON.parse(readFileSync(caseReportPath, "utf8")) as {
				verdict: string;
				runtime_source_check: {
					typescript_source_absent: boolean;
					unexpected_source_files: string[];
				};
				checks: Record<string, boolean>;
			};
			assert.equal(report.verdict, "fail");
			assert.equal(report.runtime_source_check.typescript_source_absent, false);
			assert.deepEqual(
				report.runtime_source_check.unexpected_source_files,
				sourceCase.unexpectedSourceFiles,
			);
			assert.equal(report.checks.typescript_source_absent, false);
		}
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("installed artifact verifier records timeout evidence for install and smoke commands", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-installed-artifact-timeout-test-"));
	const fakeBinDir = join(tempDir, "bin");
	const fakeNpmPath = join(fakeBinDir, "npm");
	const verifierTmpDir = join(tempDir, "verifier-tmp");
	const initYaml = `version: 1
product_root: 'src'
spec_roots:
  - 'specs'
mappings: {}
`;

	try {
		mkdirSync(fakeBinDir);
		mkdirSync(verifierTmpDir);
		writeFileSync(
			fakeNpmPath,
			`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const packageFiles = [
	{ path: "bin/anchormap" },
	{ path: "dist/anchormap.js" },
	{ path: "npm-shrinkwrap.json" },
	{ path: "package.json" },
];

function hang() {
	setInterval(() => {}, 1000);
}

function writeExecutable(filePath, contents) {
	fs.writeFileSync(filePath, contents, "utf8");
	fs.chmodSync(filePath, 0o755);
}

if (process.argv[2] === "pack") {
	const destination = process.argv[process.argv.indexOf("--pack-destination") + 1];
	fs.mkdirSync(destination, { recursive: true });
	fs.writeFileSync(path.join(destination, "anchormap-1.0.0.tgz"), "");
	process.stdout.write(JSON.stringify([{
		id: "anchormap@1.0.0",
		name: "anchormap",
		version: "1.0.0",
		filename: "anchormap-1.0.0.tgz",
		integrity: "sha512-test",
		shasum: "test",
		files: packageFiles,
	}]) + "\\n");
	process.exit(0);
}

if (process.argv[2] === "install") {
	if (process.env.ANCHORMAP_FAKE_TIMEOUT_PHASE === "install") {
		process.stdout.write("install started\\n");
		return hang();
	}

	const packageDir = path.join(process.cwd(), "node_modules", "anchormap");
	const binDir = path.join(process.cwd(), "node_modules", ".bin");
	fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });
	fs.mkdirSync(path.join(packageDir, "dist"), { recursive: true });
	fs.mkdirSync(binDir, { recursive: true });
	fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
		name: "anchormap",
		version: "1.0.0",
	}), "utf8");
	fs.writeFileSync(path.join(packageDir, "npm-shrinkwrap.json"), "{}\\n", "utf8");
	fs.writeFileSync(path.join(packageDir, "dist", "anchormap.js"), "module.exports = {};\\n", "utf8");
writeExecutable(path.join(packageDir, "bin", "anchormap"), ${JSON.stringify(`#!/usr/bin/env node
const fs = require("node:fs");

function hang() {
	setInterval(() => {}, 1000);
}

if (process.env.ANCHORMAP_FAKE_TIMEOUT_PHASE === "init" && process.argv[2] === "init") {
	process.stdout.write("init started\\n");
	return hang();
}

if (process.argv[2] === "init") {
	fs.writeFileSync("anchormap.yaml", ${JSON.stringify(initYaml)}, "utf8");
	process.exit(0);
}
if (process.argv[2] === "map") {
	process.exit(0);
}
if (process.argv[2] === "scan") {
	process.stdout.write('{"fake":true}\\n');
	process.exit(0);
}
process.exit(4);
`)});
	fs.symlinkSync("../anchormap/bin/anchormap", path.join(binDir, "anchormap"));
	fs.writeFileSync(path.join(process.cwd(), "package-lock.json"), "{}\\n", "utf8");
	process.exit(0);
}

process.stderr.write("unexpected fake npm invocation: " + process.argv.slice(2).join(" ") + "\\n");
process.exit(1);
`,
			"utf8",
		);
		chmodSync(fakeNpmPath, 0o755);

		interface TimeoutReport {
			consumer_install: {
				status: number | null;
				timed_out: boolean;
				timeout_ms: number;
				stdout: string | null;
			};
			commands: {
				init: null | {
					status: number | null;
					timed_out: boolean;
					timeout_ms: number;
					stdout: string;
				};
			};
			checks: Record<string, boolean>;
		}

		const cases: Array<{
			name: string;
			phase: string;
			assertReport(report: TimeoutReport): void;
		}> = [
			{
				name: "install-timeout",
				phase: "install",
				assertReport(report) {
					assert.equal(report.consumer_install.status, null);
					assert.equal(report.consumer_install.timed_out, true);
					assert.equal(report.consumer_install.timeout_ms, 500);
					assert.equal(report.consumer_install.stdout, "install started\n");
					assert.equal(report.checks.consumer_install_exit_zero, false);
					assert.equal(report.commands.init, null);
				},
			},
			{
				name: "init-timeout",
				phase: "init",
				assertReport(report) {
					assert.notEqual(report.commands.init, null);
					assert.equal(report.consumer_install.status, 0);
					assert.equal(report.consumer_install.timed_out, false);
					assert.equal(report.commands.init?.status, null);
					assert.equal(report.commands.init?.timed_out, true);
					assert.equal(report.commands.init?.timeout_ms, 500);
					assert.equal(report.commands.init?.stdout, "init started\n");
					assert.equal(report.checks.init_exit_zero, false);
				},
			},
		];

		for (const timeoutCase of cases) {
			const caseReportPath = join(tempDir, `${timeoutCase.name}-report.json`);
			const result = spawnSync(
				process.execPath,
				[VERIFY_INSTALLED_ARTIFACT_PATH, "--timeout-ms", "500", "--report", caseReportPath],
				{
					cwd: REPO_ROOT,
					encoding: "utf8",
					env: cleanNodeEnv({
						ANCHORMAP_FAKE_TIMEOUT_PHASE: timeoutCase.phase,
						PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
						TMPDIR: verifierTmpDir,
					}),
				},
			);

			assert.equal(result.status, 1);
			assert.match(result.stderr, /installed artifact verification failed/);
			assert.equal(existsSync(caseReportPath), true);
			assert.deepEqual(
				readdirSync(verifierTmpDir).filter((entry) =>
					entry.startsWith("anchormap-installed-artifact-"),
				),
				[],
			);

			const report = JSON.parse(readFileSync(caseReportPath, "utf8")) as {
				verdict: string;
				consumer_install: {
					status: number | null;
					timed_out: boolean;
					timeout_ms: number;
					stdout: string | null;
				};
				commands: {
					init: TimeoutReport["commands"]["init"];
				};
				checks: Record<string, boolean>;
			};
			assert.equal(report.verdict, "fail");
			assert.equal(report.checks.node_options_unset, true);
			timeoutCase.assertReport(report);
		}
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("npm shrinkwrap mirrors the full root package lock state", () => {
	const packageLock = loadPackageLockJson(PACKAGE_LOCK_PATH);
	const shrinkwrap = loadPackageLockJson(NPM_SHRINKWRAP_PATH);

	assert.deepEqual(shrinkwrap, packageLock);
	assert.deepEqual(shrinkwrap.packages?.[""]?.devDependencies, {
		"@biomejs/biome": "2.4.12",
		"@types/node": "25.6.0",
	});
	assert.ok(shrinkwrap.packages?.["node_modules/@biomejs/biome"]);
	assert.ok(shrinkwrap.packages?.["node_modules/@types/node"]);
});

test("release launcher resolves the package dist path through a bin symlink", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-bin-test-"));
	const binDir = join(tempDir, "bin");
	const fakeNodePath = join(binDir, "node");
	const symlinkPath = join(binDir, "anchormap");
	const fakeNodeLogPath = join(tempDir, "node-argv.json");

	mkdirSync(binDir);
	symlinkSync(RELEASE_LAUNCHER_PATH, symlinkPath);
	writeFileSync(fakeNodePath, `#!/bin/sh\nprintf '%s\\n' "$@" > "${fakeNodeLogPath}"\n`, "utf8");
	chmodSync(fakeNodePath, 0o755);

	const result = spawnSync("sh", ["-c", "anchormap --version"], {
		env: {
			...process.env,
			PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
		},
		encoding: "utf8",
	});

	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(readFileSync(fakeNodeLogPath, "utf8").trim().split("\n"), [
		"--no-opt",
		"--max-semi-space-size=1",
		"--no-expose-wasm",
		resolve(REPO_ROOT, "dist", "anchormap.js"),
		"--version",
	]);
});

test("release benchmark validator rejects forged pass verdicts over budget", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-bench-report-test-"));
	const reportPath = join(tempDir, "gate-f-report.json");
	const report = JSON.parse(
		readFileSync(resolve(REPO_ROOT, "bench", "reports", "gate-f-report.json"), "utf8"),
	) as {
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
	};
	const smallResult = report.results.find((result) => result.corpus_id === "small");
	assert.ok(smallResult);
	for (const [index, run] of smallResult.measured_runs.entries()) {
		run.wall_clock_ms = index < 28 ? 100 : 401;
		run.peak_rss_mib = index < 29 ? 80 : 121;
	}
	smallResult.p95_wall_clock_ms = 401;
	smallResult.peak_rss_mib = 121;
	smallResult.verdict = "pass";
	writeFileSync(reportPath, `${JSON.stringify(report, null, "\t")}\n`, "utf8");

	const result = spawnSync(process.execPath, [VALIDATE_BENCHMARK_REPORT_PATH, reportPath], {
		cwd: REPO_ROOT,
		encoding: "utf8",
	});

	assert.equal(result.status, 1);
	assert.match(result.stderr, /small verdict must be fail/);
});

test("release benchmark validator rejects forged inflated budgets", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-bench-report-test-"));
	const reportPath = join(tempDir, "gate-f-report.json");
	const report = JSON.parse(
		readFileSync(resolve(REPO_ROOT, "bench", "reports", "gate-f-report.json"), "utf8"),
	) as {
		results: Array<{
			corpus_id: string;
			p95_wall_clock_ms: number;
			peak_rss_mib: number;
			budgets: {
				p95_wall_clock_ms: number;
				peak_rss_mib: number;
			};
			measured_runs: Array<{
				wall_clock_ms: number;
				peak_rss_mib: number;
				exit_code: number;
			}>;
			verdict: string;
		}>;
	};
	const smallResult = report.results.find((result) => result.corpus_id === "small");
	assert.ok(smallResult);
	for (const [index, run] of smallResult.measured_runs.entries()) {
		run.wall_clock_ms = index < 28 ? 100 : 401;
		run.peak_rss_mib = index < 29 ? 80 : 121;
	}
	smallResult.p95_wall_clock_ms = 401;
	smallResult.peak_rss_mib = 121;
	smallResult.budgets.p95_wall_clock_ms = 9999;
	smallResult.budgets.peak_rss_mib = 9999;
	smallResult.verdict = "pass";
	writeFileSync(reportPath, `${JSON.stringify(report, null, "\t")}\n`, "utf8");

	const result = spawnSync(process.execPath, [VALIDATE_BENCHMARK_REPORT_PATH, reportPath], {
		cwd: REPO_ROOT,
		encoding: "utf8",
	});

	assert.equal(result.status, 1);
	assert.match(result.stderr, /small budget p95_wall_clock_ms does not match expected definition/);
});

test("release benchmark validator rejects weakened manifest corpus shape", () => {
	const report = loadBenchmarkReport();
	const manifest = loadBenchmarkManifest();
	const mediumCorpus = manifest.corpora.find((corpus) => corpus.id === "medium");
	assert.ok(mediumCorpus);
	mediumCorpus.product_files = 10;
	mediumCorpus.observed_anchors = 2;
	mediumCorpus.supported_edges = 4;
	mediumCorpus.gate = false;

	const result = validateBenchmarkReportWithManifest(report, manifest);

	assert.equal(result.status, 1);
	assert.match(result.stderr, /expected corpus medium product_files must match Gate F definition/);
});

test("release benchmark validator rejects mutated mapped anchors in manifest and report", () => {
	const report = loadBenchmarkReport();
	const manifest = loadBenchmarkManifest();
	const mediumCorpus = manifest.corpora.find((corpus) => corpus.id === "medium");
	const mediumResult = report.results.find((result) => result.corpus_id === "medium");
	assert.ok(mediumCorpus);
	assert.ok(mediumResult);
	mediumCorpus.mapped_anchors = 20;
	mediumResult.mapped_anchors = 20;

	const result = validateBenchmarkReportWithManifest(report, manifest);

	assert.equal(result.status, 1);
	assert.match(result.stderr, /expected corpus medium mapped_anchors must match Gate F definition/);
});

test("release benchmark validator rejects inflated manifest budgets", () => {
	const report = loadBenchmarkReport();
	const manifest = loadBenchmarkManifest();
	const smallCorpus = manifest.corpora.find((corpus) => corpus.id === "small");
	assert.ok(smallCorpus);
	smallCorpus.p95_wall_clock_ms_budget = 9999;
	smallCorpus.peak_rss_mib_budget = 9999;

	const result = validateBenchmarkReportWithManifest(report, manifest);

	assert.equal(result.status, 1);
	assert.match(
		result.stderr,
		/expected corpus small p95_wall_clock_ms_budget must match Gate F budget/,
	);
});

test("release benchmark validator rejects forged smaller corpus shape", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-bench-report-test-"));
	const reportPath = join(tempDir, "gate-f-report.json");
	const report = JSON.parse(
		readFileSync(resolve(REPO_ROOT, "bench", "reports", "gate-f-report.json"), "utf8"),
	) as {
		results: Array<{
			corpus_id: string;
			product_files: number;
			observed_anchors: number;
			mapped_anchors: number;
			supported_edges: number;
			gate: boolean;
		}>;
	};
	const mediumResult = report.results.find((result) => result.corpus_id === "medium");
	assert.ok(mediumResult);
	mediumResult.product_files = 10;
	mediumResult.observed_anchors = 2;
	mediumResult.mapped_anchors = 1;
	mediumResult.supported_edges = 4;
	mediumResult.gate = false;
	writeFileSync(reportPath, `${JSON.stringify(report, null, "\t")}\n`, "utf8");

	const result = spawnSync(process.execPath, [VALIDATE_BENCHMARK_REPORT_PATH, reportPath], {
		cwd: REPO_ROOT,
		encoding: "utf8",
	});

	assert.equal(result.status, 1);
	assert.match(result.stderr, /medium product_files does not match expected corpus definition/);
});

test("release benchmark validator rejects stale aggregates that differ from measured runs", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-bench-report-test-"));
	const reportPath = join(tempDir, "gate-f-report.json");
	const report = JSON.parse(
		readFileSync(resolve(REPO_ROOT, "bench", "reports", "gate-f-report.json"), "utf8"),
	) as {
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
	};
	const smallResult = report.results.find((result) => result.corpus_id === "small");
	assert.ok(smallResult);
	for (const [index, run] of smallResult.measured_runs.entries()) {
		run.wall_clock_ms = index < 28 ? 100 : 401;
		run.peak_rss_mib = index < 29 ? 80 : 121;
	}
	smallResult.p95_wall_clock_ms = 100;
	smallResult.peak_rss_mib = 80;
	smallResult.verdict = "pass";
	writeFileSync(reportPath, `${JSON.stringify(report, null, "\t")}\n`, "utf8");

	const result = spawnSync(process.execPath, [VALIDATE_BENCHMARK_REPORT_PATH, reportPath], {
		cwd: REPO_ROOT,
		encoding: "utf8",
	});

	assert.equal(result.status, 1);
	assert.match(result.stderr, /small p95_wall_clock_ms does not match measured runs/);
});

test("release benchmark validator runs validation when invoked through a symlink", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-bench-symlink-test-"));
	const reportPath = join(tempDir, "gate-f-report.json");
	const scriptSymlinkPath = join(tempDir, "validate-release-benchmark-report.mjs");
	try {
		symlinkSync(VALIDATE_BENCHMARK_REPORT_PATH, scriptSymlinkPath);
		writeFileSync(reportPath, "{}\n", "utf8");

		const result = spawnSync(process.execPath, [scriptSymlinkPath, reportPath], {
			cwd: REPO_ROOT,
			encoding: "utf8",
		});

		assert.equal(result.status, 1);
		assert.match(result.stderr, /benchmark-report: schema_version must be 1/);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("release benchmark validator rejects forged gated corpus verdicts", () => {
	const report = loadBenchmarkReport() as BenchmarkReport & {
		results: Array<{
			corpus_id: string;
			verdict: string;
		}>;
	};
	const mediumResult = report.results.find((result) => result.corpus_id === "medium");
	assert.ok(mediumResult);
	mediumResult.verdict = "fail";

	const result = validateBenchmarkReport(report);

	assert.equal(result.status, 1);
	assert.match(result.stderr, /medium verdict must be pass/);
});

test("Gate F Linux evidence workflow runs when durable release-gate authority changes", () => {
	const workflow = readFileSync(T9_3_CROSS_PLATFORM_WORKFLOW_PATH, "utf8");

	assert.match(workflow, /\n {6}- "docs\/contract\.md"\n/);
	assert.match(workflow, /\n {6}- "docs\/evals\.md"\n/);
});

test("release benchmark validator rejects forged protocol metadata", () => {
	const cases: Array<{
		name: string;
		mutate: (report: BenchmarkReport) => void;
		expectedError: RegExp;
	}> = [
		{
			name: "wrong warm-up count",
			mutate: (report) => {
				report.protocol.warmup_runs = 4;
			},
			expectedError: /warmup_runs must be 5/,
		},
		{
			name: "wrong measured-run count",
			mutate: (report) => {
				report.protocol.measured_runs = 29;
			},
			expectedError: /measured_runs must be 30/,
		},
		{
			name: "not process-separated",
			mutate: (report) => {
				report.protocol.process_separated_runs = false;
			},
			expectedError: /process_separated_runs must be true/,
		},
		{
			name: "non-launch-to-exit wall clock",
			mutate: (report) => {
				report.protocol.wall_clock_from_process_launch_to_exit = false;
			},
			expectedError: /wall_clock_from_process_launch_to_exit must be true/,
		},
		{
			name: "non-external RSS",
			mutate: (report) => {
				report.protocol.peak_rss_from_external_time_command = false;
			},
			expectedError: /peak_rss_from_external_time_command must be true/,
		},
		{
			name: "large included in protocol pass/fail",
			mutate: (report) => {
				report.protocol.large_excluded_from_pass_fail = false;
			},
			expectedError: /large_excluded_from_pass_fail must be true/,
		},
		{
			name: "protocol non-compliant",
			mutate: (report) => {
				report.protocol.protocol_compliant = false;
			},
			expectedError: /protocol_compliant must be true/,
		},
	];

	for (const testCase of cases) {
		const report = loadBenchmarkReport();
		testCase.mutate(report);

		const result = validateBenchmarkReport(report);

		assert.equal(result.status, 1, testCase.name);
		assert.match(result.stderr, testCase.expectedError, testCase.name);
	}
});

test("release benchmark validator computes supported platform from platform and arch", () => {
	const cases: Array<{
		name: string;
		mutate: (report: BenchmarkReport) => void;
		expectedError: RegExp;
	}> = [
		{
			name: "unsupported platform with forged boolean",
			mutate: (report) => {
				report.reference_machine.platform = "win32";
				report.reference_machine.arch = "x64";
				report.reference_machine.supported_platform = true;
			},
			expectedError: /reference_machine\.supported_platform must match platform and arch/,
		},
		{
			name: "supported platform with false boolean",
			mutate: (report) => {
				report.reference_machine.platform = "darwin";
				report.reference_machine.arch = "arm64";
				report.reference_machine.supported_platform = false;
			},
			expectedError: /reference_machine\.supported_platform must match platform and arch/,
		},
		{
			name: "unsupported platform honestly reported",
			mutate: (report) => {
				report.reference_machine.platform = "linux";
				report.reference_machine.arch = "arm64";
				report.reference_machine.supported_platform = false;
			},
			expectedError: /reference machine must be a supported platform/,
		},
	];

	for (const testCase of cases) {
		const report = loadBenchmarkReport();
		report.gate_f.evaluable = true;
		report.gate_f.verdict = "pass";
		testCase.mutate(report);

		const result = validateBenchmarkReport(report);

		assert.equal(result.status, 1, testCase.name);
		assert.match(result.stderr, testCase.expectedError, testCase.name);
	}
});

test("release benchmark validator requires both supported platform artifacts", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-bench-artifacts-test-"));
	const report = loadBenchmarkReport();
	const macosReportDir = join(tempDir, "macos-arm64");
	const linuxReportDir = join(tempDir, "linux-x86_64");
	const linuxReport: BenchmarkReport = {
		...report,
		reference_machine: {
			...report.reference_machine,
			platform: "linux",
			arch: "x64",
			supported_platform: true,
		},
	};

	try {
		mkdirSync(macosReportDir, { recursive: true });
		mkdirSync(linuxReportDir, { recursive: true });
		writeFileSync(
			join(macosReportDir, "gate-f-report.json"),
			`${JSON.stringify(report, null, "\t")}\n`,
			"utf8",
		);
		writeFileSync(
			join(linuxReportDir, "gate-f-report.json"),
			`${JSON.stringify(linuxReport, null, "\t")}\n`,
			"utf8",
		);

		const result = spawnSync(
			process.execPath,
			[VALIDATE_BENCHMARK_REPORT_PATH, "--require-supported-platform-artifacts", tempDir],
			{ cwd: REPO_ROOT, encoding: "utf8" },
		);

		assert.equal(result.status, 0, result.stderr);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("release benchmark validator rejects incomplete supported platform artifacts", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-bench-artifacts-test-"));
	const report = loadBenchmarkReport();
	const macosReportDir = join(tempDir, "macos-arm64");

	try {
		mkdirSync(macosReportDir, { recursive: true });
		writeFileSync(
			join(macosReportDir, "gate-f-report.json"),
			`${JSON.stringify(report, null, "\t")}\n`,
			"utf8",
		);

		const result = spawnSync(
			process.execPath,
			[VALIDATE_BENCHMARK_REPORT_PATH, "--require-supported-platform-artifacts", tempDir],
			{ cwd: REPO_ROOT, encoding: "utf8" },
		);

		assert.equal(result.status, 1);
		assert.match(
			result.stderr,
			/missing supported-platform artifact linux-x86_64\/gate-f-report\.json/,
		);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("release benchmark validator rejects forged release build metadata", () => {
	const cases: Array<{
		name: string;
		mutate: (report: BenchmarkReport) => void;
		expectedError: RegExp;
	}> = [
		{
			name: "wrong build command",
			mutate: (report) => {
				report.release_build.command = "node scripts/release-benchmark.mjs";
			},
			expectedError: /release_build\.command must be npm run build/,
		},
		{
			name: "direct dist CLI",
			mutate: (report) => {
				report.release_build.cli = "dist/anchormap.js";
			},
			expectedError: /release_build\.cli must be bin\/anchormap/,
		},
		{
			name: "old-space capped node flags",
			mutate: (report) => {
				report.release_build.node_flags = [
					"--no-opt",
					"--max-semi-space-size=1",
					"--max-old-space-size=128",
					"--no-expose-wasm",
				];
			},
			expectedError: /release_build\.node_flags must match release launcher profile/,
		},
	];

	for (const testCase of cases) {
		const report = loadBenchmarkReport();
		testCase.mutate(report);

		const result = validateBenchmarkReport(report);

		assert.equal(result.status, 1, testCase.name);
		assert.match(result.stderr, testCase.expectedError, testCase.name);
	}
});

test("release benchmark validator rejects failed or invalid warm-up records", () => {
	const cases: Array<{
		name: string;
		mutate: (run: BenchmarkRunRecord, warmups: BenchmarkRunRecord[]) => void;
		expectedError: RegExp;
	}> = [
		{
			name: "missing run",
			mutate: (_run, warmups) => {
				warmups.pop();
			},
			expectedError: /small must record 5 warm-up runs/,
		},
		{
			name: "failed exit",
			mutate: (run) => {
				run.exit_code = 1;
			},
			expectedError: /small warmup run 1 exit_code must be 0/,
		},
		{
			name: "invalid wall clock",
			mutate: (run) => {
				(run as { wall_clock_ms: unknown }).wall_clock_ms = "12";
			},
			expectedError: /small warmup run 1 wall_clock_ms must be a positive number/,
		},
		{
			name: "invalid RSS",
			mutate: (run) => {
				run.peak_rss_mib = Number.NaN;
			},
			expectedError: /small warmup run 1 peak_rss_mib must be a positive number/,
		},
	];

	for (const testCase of cases) {
		const report = loadBenchmarkReport();
		const smallResult = report.results.find((result) => result.corpus_id === "small");
		assert.ok(smallResult, testCase.name);
		const firstWarmup = smallResult.warmup_runs[0];
		assert.ok(firstWarmup, testCase.name);
		testCase.mutate(firstWarmup, smallResult.warmup_runs);

		const result = validateBenchmarkReport(report);

		assert.equal(result.status, 1, testCase.name);
		assert.match(result.stderr, testCase.expectedError, testCase.name);
	}
});

test("release benchmark runner cleans generated corpus after CLI failure", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-bench-cleanup-test-"));
	const binDir = join(tempDir, "bin");
	const fakeNodePath = join(binDir, "node");
	const reportDir = join(tempDir, "reports");
	const before = new Set(
		readdirSync(tmpdir()).filter((entry) => entry.startsWith("anchormap-bench-small-")),
	);

	mkdirSync(binDir);
	writeFileSync(fakeNodePath, "#!/bin/sh\nexit 42\n", "utf8");
	chmodSync(fakeNodePath, 0o755);

	try {
		const result = spawnSync(
			process.execPath,
			[
				RELEASE_BENCHMARK_PATH,
				"--corpus",
				"small",
				"--warmups",
				"1",
				"--runs",
				"1",
				"--out-dir",
				reportDir,
			],
			{
				cwd: REPO_ROOT,
				env: benchmarkRunnerEnv({
					PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
				}),
				encoding: "utf8",
			},
		);
		const after = readdirSync(tmpdir()).filter((entry) =>
			entry.startsWith("anchormap-bench-small-"),
		);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /benchmark: CLI exited [1-9][0-9]*/);
		assert.deepEqual(new Set(after), before);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("release benchmark runner rejects inherited NODE_OPTIONS before measurement", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-bench-node-options-test-"));
	const reportDir = join(tempDir, "reports");

	try {
		const result = spawnSync(
			process.execPath,
			[
				RELEASE_BENCHMARK_PATH,
				"--corpus",
				"small",
				"--warmups",
				"1",
				"--runs",
				"1",
				"--out-dir",
				reportDir,
			],
			{
				cwd: REPO_ROOT,
				env: benchmarkRunnerEnv({
					NODE_OPTIONS: "--trace-warnings",
				}),
				encoding: "utf8",
			},
		);

		assert.equal(result.status, 1);
		assert.match(
			result.stderr,
			/benchmark: NODE_OPTIONS must be unset for release benchmark measurement/,
		);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
