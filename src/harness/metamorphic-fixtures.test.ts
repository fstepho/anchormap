import { strict as assert } from "node:assert";
import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import {
	assertFixtureFilesystemOracleFromSnapshots,
	diffFilesystemSnapshots,
} from "./fixture-filesystem-oracle";
import { type LoadedFixtureManifest, loadFixtureManifest } from "./fixture-manifest";
import { executeFixtureCommand, type FixtureProcessResult } from "./fixture-process";
import {
	captureFilesystemSnapshot,
	type MaterializedFixtureSandbox,
	materializeFixtureSandbox,
} from "./fixture-sandbox";

const PROJECT_ROOT = resolve(__dirname, "..", "..");
const FIXTURES_ROOT = resolve(PROJECT_ROOT, "fixtures");
const METAMORPHIC_FIXTURES_ROOT = resolve(PROJECT_ROOT, "fixtures", "C-metamorphic");
const DEFAULT_TIMEOUT_MS = 5_000;
const DETERMINISTIC_RERUN_COUNT = 20;
const C8_UTF8_LOCALE = {
	env: "en_US.UTF-8",
	intl: "en-US",
};
const C8_LOCALE_COLLATION_PROBE_PATHS = ["src/z.ts", "src/ä.ts"];
const SUPPORTED_SCAN_JSON_ENTRYPOINTS = new Set(["dist/anchormap.js", "dist/cli-stub.js"]);
const SUCCESSFUL_SCAN_JSON_FIXTURES = discoverSuccessfulScanJsonFixtureTargets();
const REPRESENTATIVE_SCAN_FIXTURES = requireFixtureTargets([
	"fx01_scan_min_clean",
	"fx09_scan_findings_canonical_order",
	"c1_filesystem_order_baseline",
]);
const REPRESENTATIVE_JSON_AND_YAML_FIXTURES = requireFixtureTargets([
	"fx09_scan_findings_canonical_order",
	"c2_yaml_reorder_map_baseline",
]);
const C8_LOCALE_SENSITIVE_FIXTURES = requireFixtureTargets(["c8_locale_collation_order"]);

interface RunResult {
	readonly fixture: LoadedFixtureManifest;
	readonly sandbox: MaterializedFixtureSandbox;
	readonly process: FixtureProcessResult;
}

interface RunOptions {
	readonly readdirOrder?: "reverse";
	readonly env?: Readonly<Record<string, string | undefined>>;
	readonly setupSandbox?: (sandbox: MaterializedFixtureSandbox) => void;
	readonly preload?: PreloadFile | null;
}

interface MetamorphicPair {
	readonly baseline: string;
	readonly transformed: string;
	readonly oracle: string;
}

interface FixtureTarget {
	readonly fixtureId: string;
	readonly fixtureDir: string;
}

interface PreloadFile {
	readonly path: string;
	dispose(): void;
}

interface NetworkBlockPreload extends PreloadFile {
	readonly attemptLogPath: string;
	clearAttempts(): void;
	readAttempts(): string[];
}

test("C1 filesystem order invariance: baseline=c1_filesystem_order_baseline transformed=c1_filesystem_order_transformed oracle=scan stdout bytes equal", async () => {
	await withMetamorphicRuns(
		{
			baseline: "c1_filesystem_order_baseline",
			transformed: "c1_filesystem_order_transformed",
			oracle: "scan stdout byte-for-byte equality under reversed filesystem enumeration",
		},
		async (baseline, transformed) => {
			assertBuffersEqual(
				baseline.process.stdout,
				transformed.process.stdout,
				"C1 scan stdout bytes must be identical",
			);
		},
		{
			transformed: {
				readdirOrder: "reverse",
			},
		},
	);
});

test("C2 YAML editorial reorder invariance: baseline=c2_yaml_reorder_scan_baseline transformed=c2_yaml_reorder_scan_transformed oracle=scan stdout bytes equal", async () => {
	await withMetamorphicRuns(
		{
			baseline: "c2_yaml_reorder_scan_baseline",
			transformed: "c2_yaml_reorder_scan_transformed",
			oracle: "same YAML semantics produce byte-identical scan JSON",
		},
		async (baseline, transformed) => {
			assertBuffersEqual(
				baseline.process.stdout,
				transformed.process.stdout,
				"C2 scan stdout bytes must be identical",
			);
		},
	);
});

test("C2 YAML editorial reorder invariance: baseline=c2_yaml_reorder_map_baseline transformed=c2_yaml_reorder_map_transformed oracle=map YAML bytes equal", async () => {
	await withMetamorphicRuns(
		{
			baseline: "c2_yaml_reorder_map_baseline",
			transformed: "c2_yaml_reorder_map_transformed",
			oracle: "same YAML semantics produce byte-identical canonical map rewrite",
		},
		async (baseline, transformed) => {
			assertBuffersEqual(
				readSandboxFile(baseline, "anchormap.yaml"),
				readSandboxFile(transformed, "anchormap.yaml"),
				"C2 map YAML bytes must be identical",
			);
		},
	);
});

test("C3 spec noise invariance: baseline=c3_spec_noise_baseline transformed=c3_spec_noise_transformed oracle=scan stdout bytes equal", async () => {
	await withMetamorphicRuns(
		{
			baseline: "c3_spec_noise_baseline",
			transformed: "c3_spec_noise_transformed",
			oracle: "spec noise without anchors leaves scan JSON byte-identical",
		},
		async (baseline, transformed) => {
			assertBuffersEqual(
				baseline.process.stdout,
				transformed.process.stdout,
				"C3 scan stdout bytes must be identical",
			);
		},
	);
});

test("C4 seed movement: baseline=c4_seed_movement_baseline transformed=c4_seed_movement_transformed oracle=exact contracted degradation", async () => {
	await withMetamorphicRuns(
		{
			baseline: "c4_seed_movement_baseline",
			transformed: "c4_seed_movement_transformed",
			oracle:
				"missing stored seed produces broken_seed_path, degraded health, and suppresses untraced_product_file",
		},
		async (baseline, transformed) => {
			const baselineJson = readScanJson(baseline);
			const transformedJson = readScanJson(transformed);

			assert.equal(baselineJson.analysis_health, "clean");
			assert.deepEqual(baselineJson.findings, [
				{
					kind: "untraced_product_file",
					path: "src/unused.ts",
				},
			]);

			assert.equal(transformedJson.analysis_health, "degraded");
			assert.deepEqual(transformedJson.findings, [
				{
					kind: "broken_seed_path",
					anchor_id: "FR-014",
					seed_path: "src/index.ts",
				},
			]);
			assert.equal(transformedJson.observed_anchors["FR-014"].mapping_state, "invalid");
			assert.deepEqual(transformedJson.stored_mappings["FR-014"], {
				state: "invalid",
				seed_files: ["src/index.ts"],
				reached_files: [],
			});
			assert.equal(hasFindingKind(transformedJson, "untraced_product_file"), false);
			assert.deepEqual(Object.keys(transformedJson.files), ["src/unused.ts"]);
			assert.deepEqual(transformedJson.files["src/unused.ts"], {
				covering_anchor_ids: [],
				supported_local_targets: [],
			});
		},
	);
});

test("C5 external import addition: baseline=c5_external_import_baseline transformed=c5_external_import_transformed oracle=scan stdout bytes equal", async () => {
	await withMetamorphicRuns(
		{
			baseline: "c5_external_import_baseline",
			transformed: "c5_external_import_transformed",
			oracle: "non-relative imports have no graph or finding effect",
		},
		async (baseline, transformed) => {
			assertBuffersEqual(
				baseline.process.stdout,
				transformed.process.stdout,
				"C5 scan stdout bytes must be identical",
			);
		},
	);
});

test("C6 unsupported extension conversion: baseline=c6_unsupported_extension_baseline transformed=c6_unsupported_extension_transformed oracle=exact contracted edge loss", async () => {
	await withMetamorphicRuns(
		{
			baseline: "c6_unsupported_extension_baseline",
			transformed: "c6_unsupported_extension_transformed",
			oracle:
				"supported target edge disappears and unsupported_local_target appears for the exact .tsx target",
		},
		async (baseline, transformed) => {
			const baselineJson = readScanJson(baseline);
			const transformedJson = readScanJson(transformed);

			assert.equal(baselineJson.analysis_health, "clean");
			assert.deepEqual(baselineJson.files["src/index.ts"].supported_local_targets, ["src/view.ts"]);
			assert.deepEqual(baselineJson.stored_mappings["FR-014"].reached_files, [
				"src/index.ts",
				"src/view.ts",
			]);
			assert.deepEqual(baselineJson.findings, []);

			assert.equal(transformedJson.analysis_health, "degraded");
			assert.deepEqual(transformedJson.files["src/index.ts"].supported_local_targets, []);
			assert.deepEqual(transformedJson.stored_mappings["FR-014"].reached_files, ["src/index.ts"]);
			assert.deepEqual(transformedJson.findings, [
				{
					kind: "unsupported_local_target",
					importer: "src/index.ts",
					target_path: "src/view.tsx",
				},
			]);
			assert.equal(hasFindingKind(transformedJson, "untraced_product_file"), false);
			assert.equal(transformedJson.files["src/view.ts"], undefined);
			assert.deepEqual(Object.keys(transformedJson.files), ["src/index.ts"]);
		},
	);
});

test("C7 deterministic reruns: every successful scan --json fixture has 20 process-isolated byte-identical stdout reruns and empty stderr", async () => {
	assert.ok(
		SUCCESSFUL_SCAN_JSON_FIXTURES.length > 0,
		"C7 requires at least one successful scan --json fixture",
	);

	for (const target of SUCCESSFUL_SCAN_JSON_FIXTURES) {
		const outputs: Buffer[] = [];
		for (let rerunIndex = 0; rerunIndex < DETERMINISTIC_RERUN_COUNT; rerunIndex += 1) {
			const run = await runFixtureTarget(target);
			outputs.push(run.process.stdout);
			run.sandbox.dispose();
		}

		for (const [index, output] of outputs.entries()) {
			assertBuffersEqual(
				output,
				outputs[0],
				`C7 ${target.fixtureId} rerun ${index + 1} stdout must match rerun 1`,
			);
		}
	}
});

test("C8 locale independence: representative JSON and YAML fixtures are byte-identical under C and UTF-8 locales", async () => {
	for (const target of [
		...REPRESENTATIVE_JSON_AND_YAML_FIXTURES,
		...C8_LOCALE_SENSITIVE_FIXTURES,
	]) {
		const cLocaleRun = await runFixtureTarget(target, {
			env: {
				LANG: "C",
				LC_ALL: "C",
			},
		});
		try {
			if (target.fixtureId === "c8_locale_collation_order") {
				assertC8LocaleSensitiveFixtureCoversProbePaths(cLocaleRun);
			}

			const utf8LocaleRun = await runFixtureTarget(target, {
				env: {
					LANG: C8_UTF8_LOCALE.env,
					LC_ALL: C8_UTF8_LOCALE.env,
				},
			});
			try {
				assertEquivalentFixtureRunBytes(
					cLocaleRun,
					utf8LocaleRun,
					`C8 ${target.fixtureId} locale output bytes must be identical`,
				);
			} finally {
				utf8LocaleRun.sandbox.dispose();
			}
		} finally {
			cLocaleRun.sandbox.dispose();
		}
	}
});

test("C9 Git independence: representative JSON and YAML fixtures are byte-identical with and without Git metadata", async () => {
	for (const target of REPRESENTATIVE_JSON_AND_YAML_FIXTURES) {
		const withoutGitRun = await runFixtureTarget(target);
		try {
			const withGitRun = await runFixtureTarget(target, {
				setupSandbox: writeValidGitMetadata,
			});
			try {
				assertEquivalentFixtureRunBytes(
					withoutGitRun,
					withGitRun,
					`C9 ${target.fixtureId} Git metadata must not change output bytes`,
				);
			} finally {
				withGitRun.sandbox.dispose();
			}
		} finally {
			withoutGitRun.sandbox.dispose();
		}
	}
});

test("C10 time and timezone independence: representative JSON and YAML fixtures are byte-identical under changed TZ and fixed Date preloads", async () => {
	const earlyDatePreload = createFixedDatePreload("2001-02-03T04:05:06.789Z");
	const lateDatePreload = createFixedDatePreload("2040-11-12T13:14:15.160Z");
	try {
		for (const target of REPRESENTATIVE_JSON_AND_YAML_FIXTURES) {
			const utcRun = await runFixtureTarget(target, {
				env: { TZ: "UTC" },
				preload: earlyDatePreload,
			});
			try {
				const shiftedRun = await runFixtureTarget(target, {
					env: { TZ: "Pacific/Kiritimati" },
					preload: lateDatePreload,
				});
				try {
					assertEquivalentFixtureRunBytes(
						utcRun,
						shiftedRun,
						`C10 ${target.fixtureId} time and timezone must not change output bytes`,
					);
				} finally {
					shiftedRun.sandbox.dispose();
				}
			} finally {
				utcRun.sandbox.dispose();
			}
		}
	} finally {
		earlyDatePreload.dispose();
		lateDatePreload.dispose();
	}
});

test("C11 no network or non-contract environment source of truth: representative scan fixtures do not vary with network blocked or env changed", async () => {
	const networkBlockPreload = createNetworkBlockPreload();
	try {
		await assertNetworkBlockPreloadCoversCommonNodeApis(networkBlockPreload);

		for (const target of REPRESENTATIVE_SCAN_FIXTURES) {
			const baselineRun = await runFixtureTarget(target);
			try {
				networkBlockPreload.clearAttempts();
				const networkBlockedRun = await runFixtureTarget(target, {
					preload: networkBlockPreload,
					env: {
						ANCHORMAP_C11_NETWORK_ATTEMPT_LOG: networkBlockPreload.attemptLogPath,
					},
				});
				try {
					assertNoNetworkAttempts(
						networkBlockPreload,
						`C11 ${target.fixtureId} blocked network run must not attempt network APIs`,
					);
					assertEquivalentFixtureRunBytes(
						baselineRun,
						networkBlockedRun,
						`C11 ${target.fixtureId} blocked network must not change scan output bytes`,
					);
				} finally {
					networkBlockedRun.sandbox.dispose();
				}

				const envChangedRun = await runFixtureTarget(target, {
					env: {
						ANCHORMAP_NON_CONTRACT_PROBE: "changed",
						CI: "true",
						NO_COLOR: "1",
					},
				});
				try {
					assertEquivalentFixtureRunBytes(
						baselineRun,
						envChangedRun,
						`C11 ${target.fixtureId} non-contract environment must not change scan output bytes`,
					);
				} finally {
					envChangedRun.sandbox.dispose();
				}
			} finally {
				baselineRun.sandbox.dispose();
			}
		}
	} finally {
		networkBlockPreload.dispose();
	}
});

test("C12 no persistent cache and no scan writes: representative scan fixtures leave repository and sandboxed cache dirs unchanged with byte-identical output", async () => {
	for (const target of REPRESENTATIVE_SCAN_FIXTURES) {
		const cacheSandbox = createCacheSandbox();
		try {
			const cachePreRunSnapshot = captureFilesystemSnapshot(cacheSandbox.rootDir);
			const firstCacheRun = await runFixtureTarget(target, {
				env: cacheSandbox.env,
			});
			try {
				const cacheMidRunSnapshot = captureFilesystemSnapshot(cacheSandbox.rootDir);
				const firstCacheDiff = diffFilesystemSnapshots(cachePreRunSnapshot, cacheMidRunSnapshot);
				assertNoFilesystemDiff(
					firstCacheDiff,
					`C12 ${target.fixtureId} first run must not create or modify persistent cache artifacts`,
				);

				const secondCacheRun = await runFixtureTarget(target, {
					env: cacheSandbox.env,
				});
				try {
					assertEquivalentFixtureRunBytes(
						firstCacheRun,
						secondCacheRun,
						`C12 ${target.fixtureId} second cache sandbox run must match first run bytes`,
					);

					const cachePostRunSnapshot = captureFilesystemSnapshot(cacheSandbox.rootDir);
					const secondCacheDiff = diffFilesystemSnapshots(
						cacheMidRunSnapshot,
						cachePostRunSnapshot,
					);
					assertNoFilesystemDiff(
						secondCacheDiff,
						`C12 ${target.fixtureId} second run must not create or modify persistent cache artifacts`,
					);
				} finally {
					secondCacheRun.sandbox.dispose();
				}
			} finally {
				firstCacheRun.sandbox.dispose();
			}
		} finally {
			cacheSandbox.dispose();
		}
	}
});

async function withMetamorphicRuns(
	pair: MetamorphicPair,
	callback: (baseline: RunResult, transformed: RunResult) => Promise<void> | void,
	options: {
		readonly baseline?: RunOptions;
		readonly transformed?: RunOptions;
	} = {},
): Promise<void> {
	const baseline = await runMetamorphicFixture(pair.baseline, options.baseline);
	try {
		const transformed = await runMetamorphicFixture(pair.transformed, options.transformed);
		try {
			await callback(baseline, transformed);
		} catch (error) {
			throw annotateMetamorphicFailure(pair, error);
		} finally {
			transformed.sandbox.dispose();
		}
	} finally {
		baseline.sandbox.dispose();
	}
}

async function runMetamorphicFixture(
	fixtureId: string,
	options: RunOptions = {},
): Promise<RunResult> {
	const fixture = loadFixtureManifest(resolve(METAMORPHIC_FIXTURES_ROOT, fixtureId));
	return await runLoadedFixture(fixture, options);
}

async function runFixtureTarget(
	target: FixtureTarget,
	options: RunOptions = {},
): Promise<RunResult> {
	return await runLoadedFixture(loadFixtureManifest(target.fixtureDir), options);
}

async function runLoadedFixture(
	fixture: LoadedFixtureManifest,
	options: RunOptions = {},
): Promise<RunResult> {
	const sandbox = materializeFixtureSandbox(fixture);
	options.setupSandbox?.(sandbox);
	const preRunSnapshot = captureFilesystemSnapshot(sandbox.sandboxDir);
	const readdirPreload = options.readdirOrder === "reverse" ? createReverseReaddirPreload() : null;
	const preload = readdirPreload ?? options.preload ?? null;

	try {
		const process = await withProcessEnv(options.env ?? {}, () =>
			withNodeOptionsPreload(preload, () =>
				executeFixtureCommand(fixture, sandbox, {
					timeoutMs: DEFAULT_TIMEOUT_MS,
					traceCaptureFactory: () => null,
				}),
			),
		);
		assert.equal(
			process.exitCode,
			fixture.manifest.exit_code,
			[
				`${fixture.manifest.id} exit code`,
				`stdout preview: ${JSON.stringify(process.stdout.toString("utf8").slice(0, 240))}`,
				`stderr preview: ${JSON.stringify(process.stderr.toString("utf8").slice(0, 240))}`,
			].join("\n"),
		);
		assert.equal(
			process.stderr.toString("utf8"),
			"",
			`${fixture.manifest.id} stderr must be empty`,
		);
		const postRunSnapshot = captureFilesystemSnapshot(sandbox.sandboxDir);
		const diff = diffFilesystemSnapshots(preRunSnapshot, postRunSnapshot);
		assertFixtureFilesystemOracleFromSnapshots(fixture, postRunSnapshot, diff);
		return { fixture, sandbox, process };
	} catch (error) {
		sandbox.dispose();
		throw error;
	} finally {
		readdirPreload?.dispose();
	}
}

function assertEquivalentFixtureRunBytes(left: RunResult, right: RunResult, message: string): void {
	assert.equal(left.process.exitCode, right.process.exitCode, `${message}: exit code`);
	if (left.fixture.manifest.stdout.kind !== "ignored") {
		assertBuffersEqual(left.process.stdout, right.process.stdout, `${message}: stdout`);
	}
	assertBuffersEqual(left.process.stderr, right.process.stderr, `${message}: stderr`);
	if (left.fixture.manifest.filesystem.kind === "expected_files") {
		for (const path of left.fixture.manifest.filesystem.files) {
			assertBuffersEqual(
				readSandboxFile(left, path),
				readSandboxFile(right, path),
				`${message}: ${path}`,
			);
		}
	}
}

function assertBuffersEqual(actual: Buffer, expected: Buffer, message: string): void {
	assert.equal(actual.equals(expected), true, bufferMismatchMessage(message, actual, expected));
}

function assertNoFilesystemDiff(
	diff: ReturnType<typeof diffFilesystemSnapshots>,
	message: string,
): void {
	assert.deepEqual(
		{
			added: diff.added.map((entry) => entry.path),
			removed: diff.removed.map((entry) => entry.path),
			changed: diff.changed.map((entry) => entry.path),
			typeChanged: diff.typeChanged.map((entry) => entry.path),
		},
		{
			added: [],
			removed: [],
			changed: [],
			typeChanged: [],
		},
		message,
	);
}

function assertNoNetworkAttempts(preload: NetworkBlockPreload, message: string): void {
	assert.deepEqual(preload.readAttempts(), [], message);
}

function assertLocaleCollationCanExposeBinaryOrderRegression(
	values: readonly string[],
	locale: string,
): void {
	const binaryOrder = [...values].sort(compareBinaryUtf8);
	const localeOrder = [...values].sort(new Intl.Collator(locale).compare);
	assert.equal(
		localeOrder.join("\0") === binaryOrder.join("\0"),
		false,
		`C8 locale ${locale} must order tested paths differently than binary UTF-8 order`,
	);
}

function assertC8LocaleSensitiveFixtureCoversProbePaths(run: RunResult): void {
	const outputPaths = Object.keys(readScanJson(run).files);
	const binaryProbePaths = [...C8_LOCALE_COLLATION_PROBE_PATHS].sort(compareBinaryUtf8);
	assert.deepEqual(
		outputPaths,
		binaryProbePaths,
		"C8 locale-sensitive fixture must expose the tested paths in binary UTF-8 order",
	);
	assertLocaleCollationCanExposeBinaryOrderRegression(binaryProbePaths, C8_UTF8_LOCALE.intl);
}

function readScanJson(run: RunResult): ScanJson {
	return JSON.parse(run.process.stdout.toString("utf8")) as ScanJson;
}

function readSandboxFile(run: RunResult, path: string): Buffer {
	return readFileSync(resolve(run.sandbox.sandboxDir, path));
}

function hasFindingKind(scan: ScanJson, kind: string): boolean {
	return scan.findings.some((finding) => finding.kind === kind);
}

function annotateMetamorphicFailure(pair: MetamorphicPair, error: unknown): Error {
	const detail = error instanceof Error ? error.message : String(error);
	return new Error(
		[
			`metamorphic oracle failed: ${pair.oracle}`,
			`baseline fixture: ${pair.baseline}`,
			`transformed fixture: ${pair.transformed}`,
			detail,
		].join("\n"),
		{ cause: error },
	);
}

function bufferMismatchMessage(message: string, actual: Buffer, expected: Buffer): string {
	return [
		message,
		`actual bytes: ${actual.length}`,
		`expected bytes: ${expected.length}`,
		`actual preview: ${JSON.stringify(actual.toString("utf8").slice(0, 240))}`,
		`expected preview: ${JSON.stringify(expected.toString("utf8").slice(0, 240))}`,
	].join("\n");
}

function createReverseReaddirPreload(): { readonly path: string; dispose(): void } {
	return createPreloadFile(
		"readdir",
		[
			"const fs = require('node:fs');",
			"const originalReaddirSync = fs.readdirSync;",
			"fs.readdirSync = function readdirSyncReverse(...args) {",
			"  const result = originalReaddirSync.apply(this, args);",
			"  return Array.isArray(result) ? [...result].reverse() : result;",
			"};",
			"",
		].join("\n"),
	);
}

function createFixedDatePreload(isoTimestamp: string): { readonly path: string; dispose(): void } {
	return createPreloadFile(
		"date",
		[
			`const fixedMs = Date.parse(${JSON.stringify(isoTimestamp)});`,
			"const RealDate = Date;",
			"function FixedDate(...args) {",
			"  if (!(this instanceof FixedDate)) {",
			"    return (args.length === 0 ? new RealDate(fixedMs) : new RealDate(...args)).toString();",
			"  }",
			"  return args.length === 0 ? new RealDate(fixedMs) : new RealDate(...args);",
			"}",
			"Object.setPrototypeOf(FixedDate, RealDate);",
			"FixedDate.prototype = RealDate.prototype;",
			"FixedDate.now = () => fixedMs;",
			"FixedDate.parse = RealDate.parse;",
			"FixedDate.UTC = RealDate.UTC;",
			"globalThis.Date = FixedDate;",
			"",
		].join("\n"),
	);
}

function createNetworkBlockPreload(): NetworkBlockPreload {
	const preloadDir = mkdtempSync(resolve(tmpdir(), "anchormap-metamorphic-network-"));
	const preloadPath = resolve(preloadDir, "network.cjs");
	const attemptLogPath = resolve(preloadDir, "network-attempts.jsonl");
	writeFileSync(attemptLogPath, "");
	writeFileSync(
		preloadPath,
		[
			"const fs = require('node:fs');",
			"const attemptLogPath = process.env.ANCHORMAP_C11_NETWORK_ATTEMPT_LOG;",
			"function recordNetworkAttempt(label) {",
			"  if (attemptLogPath) {",
			"    fs.appendFileSync(attemptLogPath, JSON.stringify({ label }) + '\\n');",
			"  }",
			"}",
			"function blockNetwork(label) {",
			"  function c11BlockedNetwork() {",
			"    recordNetworkAttempt(label);",
			"    throw new Error('network access is blocked by C11 isolation test: ' + label);",
			"  }",
			"  Object.defineProperty(c11BlockedNetwork, '__anchormapNetworkBlockLabel', {",
			"    configurable: false,",
			"    enumerable: false,",
			"    value: label,",
			"  });",
			"  return c11BlockedNetwork;",
			"}",
			"function replaceMethods(target, methodNames, labelPrefix) {",
			"  if (!target) {",
			"    return;",
			"  }",
			"  for (const methodName of methodNames) {",
			"    if (methodName in target) {",
			"      target[methodName] = blockNetwork(labelPrefix + '.' + methodName);",
			"    }",
			"  }",
			"}",
			"for (const moduleName of ['node:net', 'node:tls']) {",
			"  const moduleValue = require(moduleName);",
			"  replaceMethods(moduleValue, ['connect', 'createConnection', 'createServer'], moduleName);",
			"  replaceMethods(moduleValue.Socket?.prototype, ['connect'], moduleName + '.Socket.prototype');",
			"  replaceMethods(moduleValue.Server?.prototype, ['listen'], moduleName + '.Server.prototype');",
			"  replaceMethods(moduleValue.TLSSocket?.prototype, ['connect'], moduleName + '.TLSSocket.prototype');",
			"}",
			"const dns = require('node:dns');",
			"const dnsPromiseMethods = [",
			"  'lookup',",
			"  'lookupService',",
			"  'resolve',",
			"  'resolve4',",
			"  'resolve6',",
			"  'resolveAny',",
			"  'resolveCaa',",
			"  'resolveCname',",
			"  'resolveMx',",
			"  'resolveNaptr',",
			"  'resolveNs',",
			"  'resolvePtr',",
			"  'resolveSoa',",
			"  'resolveSrv',",
			"  'resolveTxt',",
			"  'reverse',",
			"];",
			"replaceMethods(dns, dnsPromiseMethods, 'node:dns');",
			"const dnsPromises = require('node:dns/promises');",
			"for (const [moduleValue, labelPrefix] of [[dns.promises, 'node:dns.promises'], [dnsPromises, 'node:dns/promises']]) {",
			"  replaceMethods(moduleValue, dnsPromiseMethods, labelPrefix);",
			"  replaceMethods(moduleValue.Resolver?.prototype, dnsPromiseMethods, labelPrefix + '.Resolver.prototype');",
			"}",
			"replaceMethods(dns.Resolver?.prototype, dnsPromiseMethods, 'node:dns.Resolver.prototype');",
			"for (const moduleName of ['node:http', 'node:https']) {",
			"  const moduleValue = require(moduleName);",
			"  replaceMethods(moduleValue, ['request', 'get', 'createServer'], moduleName);",
			"  replaceMethods(moduleValue.Server?.prototype, ['listen'], moduleName + '.Server.prototype');",
			"}",
			"const http2 = require('node:http2');",
			"replaceMethods(http2, ['connect', 'createServer', 'createSecureServer'], 'node:http2');",
			"const dgram = require('node:dgram');",
			"replaceMethods(dgram, ['createSocket'], 'node:dgram');",
			"replaceMethods(dgram.Socket?.prototype, [",
			"  'bind',",
			"  'connect',",
			"  'send',",
			"  'addMembership',",
			"  'addSourceSpecificMembership',",
			"], 'node:dgram.Socket.prototype');",
			"globalThis.fetch = blockNetwork('globalThis.fetch');",
			"if ('WebSocket' in globalThis) {",
			"  Object.defineProperty(globalThis, 'WebSocket', {",
			"    configurable: true,",
			"    writable: true,",
			"    value: blockNetwork('globalThis.WebSocket'),",
			"  });",
			"}",
			"",
		].join("\n"),
	);

	return {
		path: preloadPath,
		attemptLogPath,
		clearAttempts() {
			writeFileSync(attemptLogPath, "");
		},
		readAttempts() {
			const source = readFileSync(attemptLogPath, "utf8").trim();
			return source.length === 0
				? []
				: source.split("\n").map((line) => JSON.parse(line).label as string);
		},
		dispose() {
			rmSync(preloadDir, { recursive: true, force: true });
		},
	};
}

async function assertNetworkBlockPreloadCoversCommonNodeApis(
	preload: NetworkBlockPreload,
): Promise<void> {
	preload.clearAttempts();
	await withNodeOptionsPreload(preload, async () => {
		const probe = spawnSync(
			process.execPath,
			[
				"-e",
				[
					"function assertBlocked(label, value) {",
					"  if (typeof value !== 'function' || value.__anchormapNetworkBlockLabel !== label) {",
					"    throw new Error(label + ' is not blocked');",
					"  }",
					"}",
					"const net = require('node:net');",
					"const tls = require('node:tls');",
					"const http = require('node:http');",
					"const https = require('node:https');",
					"const http2 = require('node:http2');",
					"const dgram = require('node:dgram');",
					"const dns = require('node:dns');",
					"const dnsPromises = require('node:dns/promises');",
					"const checks = [",
					"  ['node:net.connect', net.connect],",
					"  ['node:net.createConnection', net.createConnection],",
					"  ['node:net.Socket.prototype.connect', net.Socket.prototype.connect],",
					"  ['node:net.Server.prototype.listen', net.Server.prototype.listen],",
					"  ['node:tls.connect', tls.connect],",
					"  ['node:tls.createServer', tls.createServer],",
					"  ['node:tls.TLSSocket.prototype.connect', tls.TLSSocket.prototype.connect],",
					"  ['node:http.request', http.request],",
					"  ['node:http.get', http.get],",
					"  ['node:https.request', https.request],",
					"  ['node:https.get', https.get],",
					"  ['node:http2.connect', http2.connect],",
					"  ['node:http2.createServer', http2.createServer],",
					"  ['node:http2.createSecureServer', http2.createSecureServer],",
					"  ['node:dgram.createSocket', dgram.createSocket],",
					"  ['node:dgram.Socket.prototype.bind', dgram.Socket.prototype.bind],",
					"  ['node:dgram.Socket.prototype.connect', dgram.Socket.prototype.connect],",
					"  ['node:dgram.Socket.prototype.send', dgram.Socket.prototype.send],",
					"  ['node:dns.lookup', dns.lookup],",
					"  ['node:dns.resolve4', dns.resolve4],",
					"  ['node:dns/promises.lookup', dns.promises.lookup],",
					"  ['node:dns/promises.resolve4', dnsPromises.resolve4],",
					"  ['globalThis.fetch', globalThis.fetch],",
					"  ['globalThis.WebSocket', globalThis.WebSocket],",
					"];",
					"for (const [label, value] of checks) {",
					"  assertBlocked(label, value);",
					"}",
					"try {",
					"  net.connect();",
					"} catch {",
					"  process.exit(0);",
					"}",
					"throw new Error('net.connect did not throw');",
					"",
				].join("\n"),
			],
			{
				encoding: "utf8",
				env: {
					...process.env,
					ANCHORMAP_C11_NETWORK_ATTEMPT_LOG: preload.attemptLogPath,
				},
				timeout: DEFAULT_TIMEOUT_MS,
			},
		);

		assert.equal(
			probe.status,
			0,
			[
				"C11 network block preload must cover common Node network APIs",
				`signal: ${probe.signal ?? ""}`,
				`error: ${probe.error?.message ?? ""}`,
				`stdout: ${probe.stdout}`,
				`stderr: ${probe.stderr}`,
			].join("\n"),
		);
	});
	assert.deepEqual(
		preload.readAttempts(),
		["node:net.connect"],
		"C11 network block preload must record blocked network attempts",
	);
	preload.clearAttempts();
}

function createPreloadFile(
	label: string,
	source: string,
): { readonly path: string; dispose(): void } {
	const preloadDir = mkdtempSync(resolve(tmpdir(), `anchormap-metamorphic-${label}-`));
	const preloadPath = resolve(preloadDir, `${label}.cjs`);
	writeFileSync(preloadPath, source);

	return {
		path: preloadPath,
		dispose() {
			rmSync(preloadDir, { recursive: true, force: true });
		},
	};
}

async function withNodeOptionsPreload<T>(
	preload: { readonly path: string } | null,
	callback: () => Promise<T>,
): Promise<T> {
	if (preload === null) {
		return await callback();
	}

	const originalNodeOptions = process.env.NODE_OPTIONS;
	const preloadOption = `--require=${preload.path}`;
	process.env.NODE_OPTIONS =
		originalNodeOptions === undefined ? preloadOption : `${originalNodeOptions} ${preloadOption}`;
	try {
		return await callback();
	} finally {
		if (originalNodeOptions === undefined) {
			delete process.env.NODE_OPTIONS;
		} else {
			process.env.NODE_OPTIONS = originalNodeOptions;
		}
	}
}

async function withProcessEnv<T>(
	env: Readonly<Record<string, string | undefined>>,
	callback: () => Promise<T>,
): Promise<T> {
	const originalValues = new Map<string, string | undefined>();
	for (const [key, value] of Object.entries(env)) {
		originalValues.set(key, process.env[key]);
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}

	try {
		return await callback();
	} finally {
		for (const [key, value] of originalValues) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}
}

function writeValidGitMetadata(sandbox: MaterializedFixtureSandbox): void {
	const init = spawnSync("git", ["init", "-q"], {
		cwd: sandbox.sandboxDir,
		encoding: "utf8",
		timeout: DEFAULT_TIMEOUT_MS,
	});
	assert.equal(init.status, 0, gitCommandFailureMessage("git init -q", init));

	const revParse = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
		cwd: sandbox.sandboxDir,
		encoding: "utf8",
		timeout: DEFAULT_TIMEOUT_MS,
	});
	assert.equal(
		revParse.status,
		0,
		gitCommandFailureMessage("git rev-parse --is-inside-work-tree", revParse),
	);
	assert.equal(
		revParse.stdout.trim(),
		"true",
		"C9 Git metadata setup must create a valid Git work tree",
	);
}

function gitCommandFailureMessage(command: string, result: SpawnSyncReturns<string>): string {
	return [
		`C9 Git metadata setup command failed: ${command}`,
		`status: ${result.status ?? ""}`,
		`signal: ${result.signal ?? ""}`,
		`error: ${result.error?.message ?? ""}`,
		`stdout: ${result.stdout ?? ""}`,
		`stderr: ${result.stderr ?? ""}`,
	].join("\n");
}

function createCacheSandbox(): {
	readonly rootDir: string;
	readonly env: Readonly<Record<string, string>>;
	dispose(): void;
} {
	const rootDir = mkdtempSync(resolve(tmpdir(), "anchormap-cache-sandbox-"));
	const homeDir = resolve(rootDir, "home");
	const cacheDir = resolve(rootDir, "xdg-cache");
	const configDir = resolve(rootDir, "xdg-config");
	const stateDir = resolve(rootDir, "xdg-state");
	const npmCacheDir = resolve(rootDir, "npm-cache");
	mkdirSync(homeDir);
	mkdirSync(cacheDir);
	mkdirSync(configDir);
	mkdirSync(stateDir);
	mkdirSync(npmCacheDir);

	return {
		rootDir,
		env: {
			HOME: homeDir,
			XDG_CACHE_HOME: cacheDir,
			XDG_CONFIG_HOME: configDir,
			XDG_STATE_HOME: stateDir,
			npm_config_cache: npmCacheDir,
		},
		dispose() {
			rmSync(rootDir, { recursive: true, force: true });
		},
	};
}

function discoverSuccessfulScanJsonFixtureTargets(): FixtureTarget[] {
	return discoverFixtureTargets(FIXTURES_ROOT).filter((target) => {
		if (!isSuccessfulScanJsonManifestCandidate(target.fixtureDir)) {
			return false;
		}

		const fixture = loadFixtureManifest(target.fixtureDir);
		return isSuccessfulScanJsonFixture(fixture);
	});
}

function discoverFixtureTargets(rootDir: string): FixtureTarget[] {
	const targets: FixtureTarget[] = [];
	for (const entry of readdirSync(rootDir, { withFileTypes: true }).sort((left, right) =>
		compareBinaryUtf8(left.name, right.name),
	)) {
		const entryPath = resolve(rootDir, entry.name);
		if (!entry.isDirectory()) {
			continue;
		}

		for (const fixtureEntry of readdirSync(entryPath, { withFileTypes: true }).sort((left, right) =>
			compareBinaryUtf8(left.name, right.name),
		)) {
			if (!fixtureEntry.isDirectory()) {
				continue;
			}
			targets.push({
				fixtureId: fixtureEntry.name,
				fixtureDir: resolve(entryPath, fixtureEntry.name),
			});
		}
	}

	return targets;
}

function requireFixtureTargets(fixtureIds: readonly string[]): FixtureTarget[] {
	const targetsById = new Map(
		discoverFixtureTargets(FIXTURES_ROOT).map((target) => [target.fixtureId, target]),
	);
	return fixtureIds.map((fixtureId) => {
		const target = targetsById.get(fixtureId);
		assert.ok(target, `required fixture target must exist: ${fixtureId}`);
		return target;
	});
}

function isSuccessfulScanJsonManifestCandidate(fixtureDir: string): boolean {
	const parsed = JSON.parse(readFileSync(resolve(fixtureDir, "manifest.json"), "utf8")) as unknown;
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		return false;
	}

	const manifest = parsed as Record<string, unknown>;
	const command = manifest.command;
	return manifest.exit_code === 0 && Array.isArray(command) && isSupportedScanJsonCommand(command);
}

function isSuccessfulScanJsonFixture(fixture: LoadedFixtureManifest): boolean {
	const command = fixture.manifest.command;
	return (
		fixture.manifest.exit_code === 0 &&
		fixture.manifest.stdout.kind === "golden" &&
		fixture.manifest.stderr.kind === "empty" &&
		isSupportedScanJsonCommand(command)
	);
}

function isSupportedScanJsonCommand(command: readonly unknown[]): boolean {
	return (
		command.length === 4 &&
		command[0] === "node" &&
		typeof command[1] === "string" &&
		SUPPORTED_SCAN_JSON_ENTRYPOINTS.has(command[1]) &&
		command[2] === "scan" &&
		command[3] === "--json"
	);
}

function compareBinaryUtf8(left: string, right: string): number {
	return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

interface ScanJson {
	readonly analysis_health: string;
	readonly observed_anchors: Record<string, { readonly mapping_state: string }>;
	readonly stored_mappings: Record<
		string,
		{
			readonly state: string;
			readonly seed_files: readonly string[];
			readonly reached_files: readonly string[];
		}
	>;
	readonly files: Record<
		string,
		{
			readonly covering_anchor_ids: readonly string[];
			readonly supported_local_targets: readonly string[];
		}
	>;
	readonly findings: ReadonlyArray<Record<string, string>>;
}
