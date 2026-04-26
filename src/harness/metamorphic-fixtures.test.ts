import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const METAMORPHIC_FIXTURES_ROOT = resolve(PROJECT_ROOT, "fixtures", "C-metamorphic");
const DEFAULT_TIMEOUT_MS = 5_000;

interface RunResult {
	readonly fixture: LoadedFixtureManifest;
	readonly sandbox: MaterializedFixtureSandbox;
	readonly process: FixtureProcessResult;
}

interface RunOptions {
	readonly readdirOrder?: "reverse";
}

interface MetamorphicPair {
	readonly baseline: string;
	readonly transformed: string;
	readonly oracle: string;
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
	const sandbox = materializeFixtureSandbox(fixture);
	const readdirPreload = options.readdirOrder === "reverse" ? createReverseReaddirPreload() : null;

	try {
		const process = await withNodeOptionsPreload(readdirPreload, () =>
			executeFixtureCommand(fixture, sandbox, {
				timeoutMs: DEFAULT_TIMEOUT_MS,
				traceCaptureFactory: () => null,
			}),
		);
		assert.equal(process.exitCode, fixture.manifest.exit_code, `${fixtureId} exit code`);
		assert.equal(process.stderr.toString("utf8"), "", `${fixtureId} stderr must be empty`);
		const postRunSnapshot = captureFilesystemSnapshot(sandbox.sandboxDir);
		const diff = diffFilesystemSnapshots(sandbox.preRunSnapshot, postRunSnapshot);
		assertFixtureFilesystemOracleFromSnapshots(fixture, postRunSnapshot, diff);
		return { fixture, sandbox, process };
	} catch (error) {
		sandbox.dispose();
		throw error;
	} finally {
		readdirPreload?.dispose();
	}
}

function assertBuffersEqual(actual: Buffer, expected: Buffer, message: string): void {
	assert.equal(actual.equals(expected), true, bufferMismatchMessage(message, actual, expected));
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
	const preloadDir = resolve(tmpdir(), `anchormap-metamorphic-readdir-${process.pid}`);
	rmSync(preloadDir, { recursive: true, force: true });
	mkdirSync(preloadDir, { recursive: true });
	const preloadPath = resolve(preloadDir, "reverse-readdir.cjs");
	writeFileSync(
		preloadPath,
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
