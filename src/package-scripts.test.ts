import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { test } from "node:test";

const REPO_ROOT = resolve(__dirname, "..");
const PACKAGE_JSON_PATH = resolve(REPO_ROOT, "package.json");
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

interface PackageJson {
	bin?: Record<string, string>;
	files?: string[];
	scripts?: Record<string, string>;
}

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

function benchmarkRunnerEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
	const { NODE_OPTIONS: _nodeOptions, ...env } = process.env;
	return {
		...env,
		...overrides,
	};
}

test("package.json exposes the stable repo-local check and harness command surface", () => {
	const packageJson = loadPackageJson();
	const scripts = packageJson.scripts ?? {};

	assert.deepEqual(packageJson.bin, {
		anchormap: "bin/anchormap",
	});
	assert.deepEqual(packageJson.files, ["bin/anchormap", "dist/"]);
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

		assert.ok(packedFiles.includes("bin/anchormap"));
		assert.ok(packedFiles.includes("dist/anchormap.js"));
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
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
