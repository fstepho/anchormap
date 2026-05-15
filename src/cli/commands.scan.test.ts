import { strict as assert } from "node:assert";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { runAnchormap } from "./commands";
import {
	anchorTraceabilityMetrics,
	assertNoAnchormapTemps,
	createBufferingWriter,
	createRecordingHandlers,
	createTempRepo,
	traceabilityMetrics,
	tsconfigWithAtAlias,
	writeMinimalScanConfig,
} from "./commands-test-support";

test("default scan --json handler loads config first and fails missing config with code 2", () => {
	const cwd = createTempRepo();
	try {
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["scan", "--json"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 2);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.equal(existsSync(join(cwd, "anchormap.yaml")), false);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("default scan --json handler classifies spec decode failures as code 3 with empty stdout", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "src"), { recursive: true });
		mkdirSync(join(cwd, "specs"), { recursive: true });
		writeFileSync(
			join(cwd, "anchormap.yaml"),
			"version: 1\nproduct_root: 'src'\nspec_roots:\n  - 'specs'\nmappings: {}\n",
		);
		writeFileSync(join(cwd, "specs", "invalid.md"), Uint8Array.from([0x66, 0x80, 0x67]));

		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["scan", "--json"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 3);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.equal(
			readFileSync(join(cwd, "anchormap.yaml"), "utf8"),
			"version: 1\nproduct_root: 'src'\nspec_roots:\n  - 'specs'\nmappings: {}\n",
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("default scan --json handler classifies product guardrail failures as code 3", () => {
	const cwd = createTempRepo();
	const configBytes = "version: 1\nproduct_root: 'src'\nspec_roots:\n  - 'specs'\nmappings: {}\n";
	try {
		mkdirSync(join(cwd, "src"), { recursive: true });
		mkdirSync(join(cwd, "specs"), { recursive: true });
		writeFileSync(join(cwd, "anchormap.yaml"), configBytes);
		writeFileSync(join(cwd, "specs", "present.md"), "# FR-014 Present\n");
		writeFileSync(join(cwd, "src", "target.ts"), "export const value = 1;\n");
		symlinkSync("target.ts", join(cwd, "src", "linked.ts"));

		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["scan", "--json"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 3);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.equal(readFileSync(join(cwd, "anchormap.yaml"), "utf8"), configBytes);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("default human scan handler fails missing config with code 2 and no mutation", () => {
	const cwd = createTempRepo();
	try {
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["scan"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 2);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.deepEqual(readdirSync(cwd), []);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("parses supported scan forms before dispatch", () => {
	const cases: Array<{
		argv: readonly string[];
		expectedCall: string;
		expectedStdout: string;
	}> = [
		{ argv: ["scan"], expectedCall: "scan::human", expectedStdout: "" },
		{ argv: ["scan", "--json"], expectedCall: "scan:--json:json", expectedStdout: "{}\n" },
	];

	for (const { argv, expectedCall, expectedStdout } of cases) {
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();
		const calls: string[] = [];

		const exitCode = runAnchormap(argv, {
			stdout: stdout.writer,
			stderr: stderr.writer,
			handlers: createRecordingHandlers(calls),
		});

		assert.equal(exitCode, 0);
		assert.equal(stdout.read(), expectedStdout);
		assert.equal(stderr.read(), "");
		assert.deepEqual(calls, [expectedCall]);
	}
});

test("scan --json validates product files through UTF-8 decode and TypeScript parse", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "src"));
		mkdirSync(join(cwd, "specs"));
		writeMinimalScanConfig(cwd);
		writeFileSync(
			join(cwd, "src/index.ts"),
			Buffer.from("\uFEFFexport const value = 1;\n", "utf8"),
		);

		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["scan", "--json"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 0);
		assert.equal(stderr.read(), "");
		assert.deepEqual(JSON.parse(stdout.read()), {
			schema_version: 5,
			config: {
				version: 1,
				product_root: "src",
				spec_roots: ["specs"],
				ignore_roots: [],
				tsconfig_path: null,
				local_aliases: [],
			},
			analysis_health: "clean",
			observed_anchors: {},
			stored_mappings: {},
			files: {
				"src/index.ts": {
					covering_anchor_ids: [],
					supported_local_targets: [],
				},
			},
			traceability_metrics: traceabilityMetrics({
				productFileCount: 1,
				uncoveredProductFileCount: 1,
			}),
			findings: [],
		});
		assert.equal(
			readFileSync(join(cwd, "anchormap.yaml"), "utf8"),
			["version: 1", "product_root: 'src'", "spec_roots:", "  - 'specs'", "mappings: {}", ""].join(
				"\n",
			),
		);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("scan --json rejects invalid product file decode and parse boundaries", () => {
	const cases: Array<{
		name: string;
		bytes: Uint8Array;
	}> = [
		{
			name: "invalid UTF-8",
			bytes: new Uint8Array([0xff]),
		},
		{
			name: "invalid TypeScript",
			bytes: Buffer.from("export const = ;\n", "utf8"),
		},
		{
			name: "JSX in TS",
			bytes: Buffer.from("const node = <div />;\n", "utf8"),
		},
	];

	for (const testCase of cases) {
		const cwd = createTempRepo();
		try {
			mkdirSync(join(cwd, "src"));
			mkdirSync(join(cwd, "specs"));
			writeMinimalScanConfig(cwd);
			writeFileSync(join(cwd, "src/index.ts"), testCase.bytes);

			const stdout = createBufferingWriter();
			const stderr = createBufferingWriter();

			const exitCode = runAnchormap(["scan", "--json"], {
				cwd,
				stdout: stdout.writer,
				stderr: stderr.writer,
			});

			assert.equal(exitCode, 3, testCase.name);
			assert.equal(stdout.read(), "", testCase.name);
			assert.notEqual(stderr.read(), "", testCase.name);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}
});

test("scan --json renders unsupported local require and dynamic import findings", () => {
	const cases: Array<{
		name: string;
		source: string;
		syntaxKind: string;
		specifier: string;
	}> = [
		{
			name: "require call",
			source: "const value = require('./dep');\n",
			syntaxKind: "require_call",
			specifier: "./dep",
		},
		{
			name: "dynamic import",
			source: "const value = import('./dep');\n",
			syntaxKind: "dynamic_import",
			specifier: "./dep",
		},
	];

	for (const testCase of cases) {
		const cwd = createTempRepo();
		try {
			mkdirSync(join(cwd, "src"));
			mkdirSync(join(cwd, "specs"));
			writeMinimalScanConfig(cwd);
			writeFileSync(join(cwd, "src/index.ts"), testCase.source);
			writeFileSync(join(cwd, "src/dep.ts"), "export const dep = 1;\n");

			const stdout = createBufferingWriter();
			const stderr = createBufferingWriter();

			const exitCode = runAnchormap(["scan", "--json"], {
				cwd,
				stdout: stdout.writer,
				stderr: stderr.writer,
			});

			assert.equal(exitCode, 0, testCase.name);
			assert.equal(stderr.read(), "", testCase.name);
			assert.deepEqual(JSON.parse(stdout.read()), {
				schema_version: 5,
				config: {
					version: 1,
					product_root: "src",
					spec_roots: ["specs"],
					ignore_roots: [],
					tsconfig_path: null,
					local_aliases: [],
				},
				analysis_health: "degraded",
				observed_anchors: {},
				stored_mappings: {},
				files: {
					"src/dep.ts": {
						covering_anchor_ids: [],
						supported_local_targets: [],
					},
					"src/index.ts": {
						covering_anchor_ids: [],
						supported_local_targets: [],
					},
				},
				traceability_metrics: traceabilityMetrics({
					productFileCount: 2,
					uncoveredProductFileCount: 2,
				}),
				findings: [
					{
						kind: "unsupported_static_edge",
						importer: "src/index.ts",
						syntax_kind: testCase.syntaxKind,
						specifier: testCase.specifier,
					},
				],
			});
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}
});

test("scan --json runs scan orchestration through supported local graph syntax", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "src"));
		mkdirSync(join(cwd, "specs"));
		writeMinimalScanConfig(cwd);
		writeFileSync(
			join(cwd, "src/index.ts"),
			"import { dep } from './dep';\nexport const value = dep;\n",
		);
		writeFileSync(join(cwd, "src/dep.ts"), "export const dep = 1;\n");

		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["scan", "--json"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 0);
		assert.equal(stderr.read(), "");
		assert.deepEqual(JSON.parse(stdout.read()), {
			schema_version: 5,
			config: {
				version: 1,
				product_root: "src",
				spec_roots: ["specs"],
				ignore_roots: [],
				tsconfig_path: null,
				local_aliases: [],
			},
			analysis_health: "clean",
			observed_anchors: {},
			stored_mappings: {},
			files: {
				"src/dep.ts": {
					covering_anchor_ids: [],
					supported_local_targets: [],
				},
				"src/index.ts": {
					covering_anchor_ids: [],
					supported_local_targets: ["src/dep.ts"],
				},
			},
			traceability_metrics: traceabilityMetrics({
				productFileCount: 2,
				uncoveredProductFileCount: 2,
			}),
			findings: [],
		});
		assert.equal(
			readFileSync(join(cwd, "anchormap.yaml"), "utf8"),
			["version: 1", "product_root: 'src'", "spec_roots:", "  - 'specs'", "mappings: {}", ""].join(
				"\n",
			),
		);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("scan --json renders tsconfig alias state and resolves alias imports", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "src"));
		mkdirSync(join(cwd, "specs"));
		writeMinimalScanConfig(cwd);
		writeFileSync(join(cwd, "tsconfig.json"), tsconfigWithAtAlias());
		writeFileSync(
			join(cwd, "src/index.ts"),
			"import { dep } from '@/dep';\nexport const value = dep;\n",
		);
		writeFileSync(join(cwd, "src/dep.ts"), "export const dep = 1;\n");

		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["scan", "--json"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 0);
		assert.equal(stderr.read(), "");
		assert.deepEqual(JSON.parse(stdout.read()), {
			schema_version: 5,
			config: {
				version: 1,
				product_root: "src",
				spec_roots: ["specs"],
				ignore_roots: [],
				tsconfig_path: "tsconfig.json",
				local_aliases: [{ prefix: "@/", target: "src/" }],
			},
			analysis_health: "clean",
			observed_anchors: {},
			stored_mappings: {},
			files: {
				"src/dep.ts": {
					covering_anchor_ids: [],
					supported_local_targets: [],
				},
				"src/index.ts": {
					covering_anchor_ids: [],
					supported_local_targets: ["src/dep.ts"],
				},
			},
			traceability_metrics: traceabilityMetrics({
				productFileCount: 2,
				uncoveredProductFileCount: 2,
			}),
			findings: [],
		});
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("scan --json classifies invalid tsconfig as code 3 with empty stdout", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "src"));
		mkdirSync(join(cwd, "specs"));
		writeMinimalScanConfig(cwd);
		writeFileSync(join(cwd, "tsconfig.json"), "{ invalid jsonc\n");
		writeFileSync(join(cwd, "src/index.ts"), "export const value = 1;\n");

		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["scan", "--json"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 3);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.equal(
			readFileSync(join(cwd, "anchormap.yaml"), "utf8"),
			["version: 1", "product_root: 'src'", "spec_roots:", "  - 'specs'", "mappings: {}", ""].join(
				"\n",
			),
		);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("scan --json renders usable mapping reachability through supported graph edges", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "src"));
		mkdirSync(join(cwd, "specs"));
		const configBytes = [
			"version: 1",
			"product_root: 'src'",
			"spec_roots:",
			"  - 'specs'",
			"mappings:",
			"  FR-014:",
			"    seed_files:",
			"      - 'src/index.ts'",
			"",
		].join("\n");
		writeFileSync(join(cwd, "anchormap.yaml"), configBytes);
		writeFileSync(
			join(cwd, "src/index.ts"),
			"import { dep } from './dep';\nexport const value = dep;\n",
		);
		writeFileSync(join(cwd, "src/dep.ts"), "export const dep = 1;\n");
		writeFileSync(join(cwd, "specs/requirements.md"), "# FR-014 Requirement\n");
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["scan", "--json"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 0);
		assert.equal(stderr.read(), "");
		assert.deepEqual(JSON.parse(stdout.read()), {
			schema_version: 5,
			config: {
				version: 1,
				product_root: "src",
				spec_roots: ["specs"],
				ignore_roots: [],
				tsconfig_path: null,
				local_aliases: [],
			},
			analysis_health: "clean",
			observed_anchors: {
				"FR-014": {
					spec_path: "specs/requirements.md",
					mapping_state: "usable",
					source: {
						kind: "markdown_atx_heading",
						line: 1,
						column: 3,
						heading_level: 1,
					},
				},
			},
			stored_mappings: {
				"FR-014": {
					state: "usable",
					seed_files: ["src/index.ts"],
					reached_files: ["src/dep.ts", "src/index.ts"],
				},
			},
			files: {
				"src/dep.ts": {
					covering_anchor_ids: ["FR-014"],
					supported_local_targets: [],
				},
				"src/index.ts": {
					covering_anchor_ids: ["FR-014"],
					supported_local_targets: ["src/dep.ts"],
				},
			},
			traceability_metrics: traceabilityMetrics({
				productFileCount: 2,
				storedMappingCount: 1,
				usableMappingCount: 1,
				observedAnchorCount: 1,
				coveredProductFileCount: 2,
				directlySeededProductFileCount: 1,
				singleCoverProductFileCount: 2,
				anchors: {
					"FR-014": anchorTraceabilityMetrics({
						seedFileCount: 1,
						directSeedFileCount: 1,
						reachedFileCount: 2,
						transitiveReachedFileCount: 1,
						uniqueReachedFileCount: 2,
					}),
				},
			}),
			findings: [],
		});
		assert.equal(readFileSync(join(cwd, "anchormap.yaml"), "utf8"), configBytes);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("scan --json renders observed anchors without stored mappings", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "src"));
		mkdirSync(join(cwd, "specs"));
		writeMinimalScanConfig(cwd);
		writeFileSync(join(cwd, "src/index.ts"), "export const value = 1;\n");
		writeFileSync(join(cwd, "specs/requirements.md"), "# FR-014 Requirement\n");
		const initialConfig = readFileSync(join(cwd, "anchormap.yaml"), "utf8");
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["scan", "--json"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 0);
		assert.equal(stderr.read(), "");
		assert.deepEqual(JSON.parse(stdout.read()), {
			schema_version: 5,
			config: {
				version: 1,
				product_root: "src",
				spec_roots: ["specs"],
				ignore_roots: [],
				tsconfig_path: null,
				local_aliases: [],
			},
			analysis_health: "clean",
			observed_anchors: {
				"FR-014": {
					spec_path: "specs/requirements.md",
					mapping_state: "absent",
					source: {
						kind: "markdown_atx_heading",
						line: 1,
						column: 3,
						heading_level: 1,
					},
				},
			},
			stored_mappings: {},
			files: {
				"src/index.ts": {
					covering_anchor_ids: [],
					supported_local_targets: [],
				},
			},
			traceability_metrics: traceabilityMetrics({
				productFileCount: 1,
				observedAnchorCount: 1,
				uncoveredProductFileCount: 1,
				anchors: {
					"FR-014": anchorTraceabilityMetrics(),
				},
			}),
			findings: [
				{
					kind: "unmapped_anchor",
					anchor_id: "FR-014",
				},
			],
		});
		assert.equal(readFileSync(join(cwd, "anchormap.yaml"), "utf8"), initialConfig);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("scan --json renders stale stored mappings without evaluating seeds", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "src"));
		mkdirSync(join(cwd, "specs"));
		const configBytes = [
			"version: 1",
			"product_root: 'src'",
			"spec_roots:",
			"  - 'specs'",
			"mappings:",
			"  FR-014:",
			"    seed_files:",
			"      - 'src/index.ts'",
			"",
		].join("\n");
		writeFileSync(join(cwd, "anchormap.yaml"), configBytes);
		writeFileSync(join(cwd, "src/index.ts"), "export const value = 1;\n");
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["scan", "--json"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 0);
		assert.equal(stderr.read(), "");
		assert.deepEqual(JSON.parse(stdout.read()), {
			schema_version: 5,
			config: {
				version: 1,
				product_root: "src",
				spec_roots: ["specs"],
				ignore_roots: [],
				tsconfig_path: null,
				local_aliases: [],
			},
			analysis_health: "degraded",
			observed_anchors: {},
			stored_mappings: {
				"FR-014": {
					state: "stale",
					seed_files: ["src/index.ts"],
					reached_files: [],
				},
			},
			files: {
				"src/index.ts": {
					covering_anchor_ids: [],
					supported_local_targets: [],
				},
			},
			traceability_metrics: traceabilityMetrics({
				productFileCount: 1,
				storedMappingCount: 1,
				uncoveredProductFileCount: 1,
				anchors: {
					"FR-014": anchorTraceabilityMetrics({
						seedFileCount: 1,
					}),
				},
			}),
			findings: [
				{
					kind: "stale_mapping_anchor",
					anchor_id: "FR-014",
				},
			],
		});
		assert.equal(readFileSync(join(cwd, "anchormap.yaml"), "utf8"), configBytes);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("human scan runs successful orchestration without repository mutation", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "src"));
		mkdirSync(join(cwd, "specs"));
		writeMinimalScanConfig(cwd);
		writeFileSync(join(cwd, "src/index.ts"), "export const value = 1;\n");
		const initialConfig = readFileSync(join(cwd, "anchormap.yaml"), "utf8");
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["scan"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 0);
		assert.notEqual(stdout.read(), "");
		assert.equal(stderr.read(), "");
		assert.equal(readFileSync(join(cwd, "anchormap.yaml"), "utf8"), initialConfig);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("rejects invalid scan options and combinations before dispatch", () => {
	const cases: readonly (readonly string[])[] = [
		["scan", "--unknown"],
		["scan", "--json", "--json"],
		["scan", "extra"],
	];

	for (const argv of cases) {
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();
		const calls: string[] = [];

		const exitCode = runAnchormap(argv, {
			stdout: stdout.writer,
			stderr: stderr.writer,
			handlers: createRecordingHandlers(calls),
		});

		assert.equal(exitCode, 4);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.deepEqual(calls, []);
	}
});
