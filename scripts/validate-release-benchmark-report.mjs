import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath =
	process.env.ANCHORMAP_BENCH_CORPORA_MANIFEST ??
	join(repoRoot, "bench", "corpora", "v1", "corpora.json");
const expectedCorpusIds = ["small", "medium", "large"];
const expectedCorpusVersion = "release-benchmark-corpus-v1";
const gateFCorpora = new Map([
	[
		"small",
		{
			product_files: 200,
			observed_anchors: 50,
			mapped_anchors: 10,
			supported_edges: 1500,
			gate: true,
			p95_wall_clock_ms_budget: 400,
			peak_rss_mib_budget: 120,
		},
	],
	[
		"medium",
		{
			product_files: 1000,
			observed_anchors: 200,
			mapped_anchors: 40,
			supported_edges: 8000,
			gate: true,
			p95_wall_clock_ms_budget: 2000,
			peak_rss_mib_budget: 300,
		},
	],
	[
		"large",
		{
			product_files: 5000,
			observed_anchors: 500,
			mapped_anchors: 50,
			supported_edges: 40000,
			gate: false,
			p95_wall_clock_ms_budget: null,
			peak_rss_mib_budget: null,
		},
	],
]);
const expectedReleaseBuild = {
	command: "npm run build",
	cli: "bin/anchormap",
	node_flags: ["--no-opt", "--max-semi-space-size=1", "--no-expose-wasm"],
};
const expectedWarmupRuns = 5;
const expectedMeasuredRuns = 30;
const supportedPlatformArtifacts = [
	{
		key: "darwin:arm64",
		reportPath: ["macos-arm64", "gate-f-report.json"],
	},
	{
		key: "linux:x64",
		reportPath: ["linux-x86_64", "gate-f-report.json"],
	},
];
const supportedPlatformKeys = new Set(supportedPlatformArtifacts.map((platform) => platform.key));

export class BenchmarkReportValidationError extends Error {
	constructor(message) {
		super(message);
		this.name = "BenchmarkReportValidationError";
	}
}

function fail(message) {
	throw new BenchmarkReportValidationError(message);
}

function requirePositiveNumber(value, field) {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		fail(`benchmark-report: ${field} must be a positive number`);
	}
	return value;
}

function p95(values) {
	const sorted = [...values].sort((left, right) => left - right);
	const index = Math.ceil(sorted.length * 0.95) - 1;
	return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function round(value, digits) {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function requireRunMetrics(runs, corpusId, runKind) {
	return runs.map((run, index) => {
		if (run?.exit_code !== 0) {
			fail(`benchmark-report: ${corpusId} ${runKind} run ${index + 1} exit_code must be 0`);
		}
		return {
			wall_clock_ms: requirePositiveNumber(
				run?.wall_clock_ms,
				`${corpusId} ${runKind} run ${index + 1} wall_clock_ms`,
			),
			peak_rss_mib: requirePositiveNumber(
				run?.peak_rss_mib,
				`${corpusId} ${runKind} run ${index + 1} peak_rss_mib`,
			),
		};
	});
}

function parseArgs(argv) {
	if (argv.length === 0) {
		return {
			mode: "single",
			reportPath: resolve("bench/reports/gate-f-report.json"),
			requiredPlatformKey: undefined,
		};
	}
	if (argv[0] === "--require-platform") {
		const requiredPlatformKey = argv[1];
		if (!supportedPlatformKeys.has(requiredPlatformKey)) {
			fail(`benchmark-report: unsupported required platform ${requiredPlatformKey}`);
		}
		if (argv[3] !== undefined) {
			fail(`benchmark-report: invalid argument ${argv[3]}`);
		}
		return {
			mode: "single",
			reportPath: resolve(argv[2] ?? "bench/reports/gate-f-report.json"),
			requiredPlatformKey,
		};
	}
	if (argv[0] === "--require-supported-platform-artifacts") {
		if (argv[1] === undefined || argv[1].startsWith("--")) {
			fail("benchmark-report: --require-supported-platform-artifacts requires a directory");
		}
		if (argv[2] !== undefined) {
			fail(`benchmark-report: invalid argument ${argv[2]}`);
		}
		return {
			mode: "supported-platform-artifacts",
			artifactRoot: resolve(argv[1]),
		};
	}
	if (argv[0].startsWith("--")) {
		fail(`benchmark-report: invalid argument ${argv[0]}`);
	}
	if (argv.length > 1) {
		fail(`benchmark-report: invalid argument ${argv[1]}`);
	}
	return {
		mode: "single",
		reportPath: resolve(argv[0]),
		requiredPlatformKey: undefined,
	};
}

function requireExactReleaseBuild(report) {
	if (report.release_build?.command !== expectedReleaseBuild.command) {
		fail("benchmark-report: release_build.command must be npm run build");
	}
	if (report.release_build?.cli !== expectedReleaseBuild.cli) {
		fail("benchmark-report: release_build.cli must be bin/anchormap");
	}
	if (!Array.isArray(report.release_build?.node_flags)) {
		fail("benchmark-report: release_build.node_flags must match release launcher profile");
	}
	if (report.release_build.node_flags.length !== expectedReleaseBuild.node_flags.length) {
		fail("benchmark-report: release_build.node_flags must match release launcher profile");
	}
	for (const [index, expectedFlag] of expectedReleaseBuild.node_flags.entries()) {
		if (report.release_build.node_flags[index] !== expectedFlag) {
			fail("benchmark-report: release_build.node_flags must match release launcher profile");
		}
	}
}

function requireProtocolFlag(report, field) {
	if (report.protocol?.[field] !== true) {
		fail(`benchmark-report: ${field} must be true`);
	}
}

function requireSupportedReferenceMachine(report, requiredPlatformKey) {
	const platform = report.reference_machine?.platform;
	const arch = report.reference_machine?.arch;
	if (typeof platform !== "string" || platform.length === 0) {
		fail("benchmark-report: reference_machine.platform must be documented");
	}
	if (typeof arch !== "string" || arch.length === 0) {
		fail("benchmark-report: reference_machine.arch must be documented");
	}

	const supportedPlatform = supportedPlatformKeys.has(`${platform}:${arch}`);
	if (report.reference_machine?.supported_platform !== supportedPlatform) {
		fail("benchmark-report: reference_machine.supported_platform must match platform and arch");
	}
	if (supportedPlatform !== true) {
		fail("benchmark-report: reference machine must be a supported platform");
	}
	const platformKey = `${platform}:${arch}`;
	if (requiredPlatformKey !== undefined && platformKey !== requiredPlatformKey) {
		fail(`benchmark-report: expected ${requiredPlatformKey} report, found ${platformKey}`);
	}
	return platformKey;
}

function requireExpectedNumber(corpus, field) {
	const value = corpus?.[field];
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		fail(`benchmark-report: expected corpus ${corpus?.id} ${field} must be a positive number`);
	}
	return value;
}

function requireExpectedGate(corpus, expectedGate) {
	if (corpus?.gate !== expectedGate) {
		fail(`benchmark-report: expected corpus ${corpus?.id} gate status must be ${expectedGate}`);
	}
}

function requireAuthoritativeField(corpus, expected, corpusId, field) {
	if (corpus?.[field] !== expected[field]) {
		fail(`benchmark-report: expected corpus ${corpusId} ${field} must match Gate F definition`);
	}
}

function requireAuthoritativeBudget(corpus, expected, corpusId, field) {
	if (corpus?.[field] !== expected[field]) {
		fail(`benchmark-report: expected corpus ${corpusId} ${field} must match Gate F budget`);
	}
}

function readExpectedCorpora() {
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	if (manifest.schema_version !== 1) {
		fail("benchmark-report: expected corpus manifest schema_version must be 1");
	}
	if (manifest.corpus_version !== expectedCorpusVersion) {
		fail("benchmark-report: expected corpus manifest has unexpected corpus version");
	}
	if (!Array.isArray(manifest.corpora)) {
		fail("benchmark-report: expected corpus manifest corpora must be an array");
	}
	const corpora = new Map();
	for (const corpus of manifest.corpora) {
		const corpusId = corpus?.id;
		if (!expectedCorpusIds.includes(corpusId)) {
			fail(`benchmark-report: expected corpus manifest has unsupported corpus ${corpusId}`);
		}
		if (corpora.has(corpusId)) {
			fail(`benchmark-report: expected corpus manifest has duplicate ${corpusId} corpus`);
		}
		const gateFCorpus = gateFCorpora.get(corpusId);
		for (const field of [
			"product_files",
			"observed_anchors",
			"mapped_anchors",
			"supported_edges",
		]) {
			requireExpectedNumber(corpus, field);
		}
		for (const field of [
			"product_files",
			"observed_anchors",
			"mapped_anchors",
			"supported_edges",
		]) {
			requireAuthoritativeField(corpus, gateFCorpus, corpusId, field);
		}
		requireExpectedGate(corpus, gateFCorpus.gate);
		requireAuthoritativeBudget(corpus, gateFCorpus, corpusId, "p95_wall_clock_ms_budget");
		requireAuthoritativeBudget(corpus, gateFCorpus, corpusId, "peak_rss_mib_budget");
		corpora.set(corpusId, {
			...corpus,
			...gateFCorpus,
		});
	}
	for (const corpusId of expectedCorpusIds) {
		if (!corpora.has(corpusId)) {
			fail(`benchmark-report: expected corpus manifest missing ${corpusId} corpus`);
		}
	}
	return { corpusVersion: expectedCorpusVersion, corpora };
}

function requireExactField(result, expected, corpusId, field) {
	if (result[field] !== expected[field]) {
		fail(`benchmark-report: ${corpusId} ${field} does not match expected corpus definition`);
	}
}

function requireExactBudget(result, expected, corpusId, reportField, manifestField) {
	const value = result.budgets?.[reportField];
	if (value !== expected[manifestField]) {
		fail(`benchmark-report: ${corpusId} budget ${reportField} does not match expected definition`);
	}
	return value;
}

function requireExactVerdict(result, corpusId, expectedVerdict) {
	if (result.verdict !== expectedVerdict) {
		fail(`benchmark-report: ${corpusId} verdict must be ${expectedVerdict}`);
	}
}

function validateReportObject(report, expected, requiredPlatformKey) {
	if (report.schema_version !== 1) {
		fail("benchmark-report: schema_version must be 1");
	}
	if (report.task !== "T9.4") {
		fail("benchmark-report: task must be T9.4");
	}
	if (report.corpus_version !== expected.corpusVersion) {
		fail("benchmark-report: unexpected corpus version");
	}
	requireExactReleaseBuild(report);
	if (report.protocol?.warmup_runs !== expectedWarmupRuns) {
		fail("benchmark-report: warmup_runs must be 5");
	}
	if (report.protocol?.measured_runs !== expectedMeasuredRuns) {
		fail("benchmark-report: measured_runs must be 30");
	}
	requireProtocolFlag(report, "process_separated_runs");
	requireProtocolFlag(report, "wall_clock_from_process_launch_to_exit");
	requireProtocolFlag(report, "peak_rss_from_external_time_command");
	requireProtocolFlag(report, "large_excluded_from_pass_fail");
	requireProtocolFlag(report, "protocol_compliant");
	const platformKey = requireSupportedReferenceMachine(report, requiredPlatformKey);
	if (report.gate_f?.evaluable !== true) {
		fail("benchmark-report: Gate F must be evaluable");
	}
	if (report.gate_f?.verdict !== "pass") {
		fail("benchmark-report: Gate F verdict must pass");
	}
	if (report.gate_f?.large_excluded_from_pass_fail !== true) {
		fail("benchmark-report: large must be excluded from pass/fail");
	}

	if (!Array.isArray(report.results) || report.results.length !== expectedCorpusIds.length) {
		fail("benchmark-report: results must contain exactly small, medium, and large");
	}
	const results = new Map();
	for (const result of report.results) {
		if (!expectedCorpusIds.includes(result?.corpus_id)) {
			fail(`benchmark-report: unexpected corpus result ${result?.corpus_id}`);
		}
		if (results.has(result.corpus_id)) {
			fail(`benchmark-report: duplicate ${result.corpus_id} result`);
		}
		results.set(result.corpus_id, result);
	}

	for (const corpusId of expectedCorpusIds) {
		const result = results.get(corpusId);
		if (result === undefined) {
			fail(`benchmark-report: missing ${corpusId} result`);
		}
		const expectedCorpus = expected.corpora.get(corpusId);
		for (const field of ["product_files", "observed_anchors", "supported_edges", "gate"]) {
			requireExactField(result, expectedCorpus, corpusId, field);
		}
		if (expectedCorpus.mapped_anchors !== undefined || result.mapped_anchors !== undefined) {
			requireExactField(result, expectedCorpus, corpusId, "mapped_anchors");
		}
		if (!Array.isArray(result.warmup_runs) || result.warmup_runs.length !== expectedWarmupRuns) {
			fail(`benchmark-report: ${corpusId} must record 5 warm-up runs`);
		}
		if (
			!Array.isArray(result.measured_runs) ||
			result.measured_runs.length !== expectedMeasuredRuns
		) {
			fail(`benchmark-report: ${corpusId} must record 30 measured runs`);
		}
		const aggregateP95WallClockMs = requirePositiveNumber(
			result.p95_wall_clock_ms,
			`${corpusId} p95_wall_clock_ms`,
		);
		const aggregatePeakRssMib = requirePositiveNumber(
			result.peak_rss_mib,
			`${corpusId} peak_rss_mib`,
		);
		requireRunMetrics(result.warmup_runs, corpusId, "warmup");
		const measuredRuns = requireRunMetrics(result.measured_runs, corpusId, "measured");
		const computedP95WallClockMs = round(p95(measuredRuns.map((run) => run.wall_clock_ms)), 3);
		const computedPeakRssMib = round(Math.max(...measuredRuns.map((run) => run.peak_rss_mib)), 3);
		if (aggregateP95WallClockMs !== computedP95WallClockMs) {
			fail(`benchmark-report: ${corpusId} p95_wall_clock_ms does not match measured runs`);
		}
		if (aggregatePeakRssMib !== computedPeakRssMib) {
			fail(`benchmark-report: ${corpusId} peak_rss_mib does not match measured runs`);
		}
		if (expectedCorpus.gate === true) {
			const p95Budget = requireExactBudget(
				result,
				expectedCorpus,
				corpusId,
				"p95_wall_clock_ms",
				"p95_wall_clock_ms_budget",
			);
			const rssBudget = requireExactBudget(
				result,
				expectedCorpus,
				corpusId,
				"peak_rss_mib",
				"peak_rss_mib_budget",
			);
			const budgetVerdict =
				computedP95WallClockMs <= p95Budget && computedPeakRssMib <= rssBudget ? "pass" : "fail";
			requireExactVerdict(result, corpusId, budgetVerdict);
			if (computedP95WallClockMs > p95Budget) {
				fail(`benchmark-report: gated corpus ${corpusId} exceeds p95 budget`);
			}
			if (computedPeakRssMib > rssBudget) {
				fail(`benchmark-report: gated corpus ${corpusId} exceeds RSS budget`);
			}
		}
	}

	if (results.get("large").gate === true) {
		fail("benchmark-report: large must not be marked as gated");
	}

	if (results.get("large").verdict !== "informational") {
		fail("benchmark-report: large verdict must be informational");
	}

	return platformKey;
}

function validateReportFile(reportPath, expected, requiredPlatformKey) {
	return validateReportObject(
		JSON.parse(readFileSync(reportPath, "utf8")),
		expected,
		requiredPlatformKey,
	);
}

export function validateBenchmarkReportObject(report, options = {}) {
	return validateReportObject(report, readExpectedCorpora(), options.requiredPlatformKey);
}

function validateSupportedPlatformArtifacts(artifactRoot, expected) {
	const seen = new Set();
	for (const platform of supportedPlatformArtifacts) {
		const reportPath = join(artifactRoot, ...platform.reportPath);
		if (!existsSync(reportPath)) {
			fail(
				`benchmark-report: missing supported-platform artifact ${platform.reportPath.join("/")}`,
			);
		}
		const platformKey = validateReportFile(reportPath, expected, platform.key);
		if (seen.has(platformKey)) {
			fail(`benchmark-report: duplicate supported-platform report ${platformKey}`);
		}
		seen.add(platformKey);
	}
	for (const platformKey of supportedPlatformKeys) {
		if (!seen.has(platformKey)) {
			fail(`benchmark-report: missing supported-platform report ${platformKey}`);
		}
	}
}

function isMainModule() {
	return (
		process.argv[1] !== undefined &&
		pathToFileURL(realpathSync(process.argv[1])).href ===
			pathToFileURL(realpathSync(fileURLToPath(import.meta.url))).href
	);
}

if (isMainModule()) {
	try {
		const options = parseArgs(process.argv.slice(2));
		const expected = readExpectedCorpora();

		if (options.mode === "supported-platform-artifacts") {
			validateSupportedPlatformArtifacts(options.artifactRoot, expected);
		} else {
			validateReportFile(options.reportPath, expected, options.requiredPlatformKey);
		}
	} catch (error) {
		if (error instanceof BenchmarkReportValidationError) {
			process.stderr.write(`${error.message}\n`);
			process.exit(1);
		}
		throw error;
	}
}
