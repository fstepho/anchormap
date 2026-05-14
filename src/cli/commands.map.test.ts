import { strict as assert } from "node:assert";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { runAnchormap, validateMapSeedsInProductFiles } from "./commands";
import {
	assertNoAnchormapTemps,
	createBufferingWriter,
	createRecordingHandlers,
	createTempRepo,
	repoPath,
} from "./commands-test-support";

test("parses supported map forms before dispatch", () => {
	const cases: Array<{
		argv: readonly string[];
		expectedCall: string;
	}> = [
		{
			argv: ["map", "--anchor", "FR-014", "--seed", "src/index.ts"],
			expectedCall:
				"map:--anchor FR-014 --seed src/index.ts:anchor=FR-014:seeds=src/index.ts:replace=false",
		},
		{
			argv: [
				"map",
				"--seed",
				"./src//first.ts/",
				"--replace",
				"--anchor",
				"DOC.README.PRESENT",
				"--seed",
				"src/second.ts",
			],
			expectedCall:
				"map:--seed ./src//first.ts/ --replace --anchor DOC.README.PRESENT --seed src/second.ts:anchor=DOC.README.PRESENT:seeds=src/first.ts,src/second.ts:replace=true",
		},
	];

	for (const { argv, expectedCall } of cases) {
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();
		const calls: string[] = [];

		const exitCode = runAnchormap(argv, {
			stdout: stdout.writer,
			stderr: stderr.writer,
			handlers: createRecordingHandlers(calls),
		});

		assert.equal(exitCode, 0);
		assert.equal(stdout.read(), "");
		assert.equal(stderr.read(), "");
		assert.deepEqual(calls, [expectedCall]);
	}
});

test("normalizes supported map seeds before dispatch independent of option order", () => {
	const cases: readonly (readonly string[])[] = [
		["map", "--anchor", "FR-014", "--seed", "./src//index.ts/", "--replace"],
		["map", "--replace", "--seed", "src/index.ts", "--anchor", "FR-014"],
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

		assert.equal(exitCode, 0);
		assert.equal(stdout.read(), "");
		assert.equal(stderr.read(), "");
		assert.deepEqual(calls, [
			`map:${argv.slice(1).join(" ")}:anchor=FR-014:seeds=src/index.ts:replace=true`,
		]);
	}
});

test("rejects invalid map options and shapes before dispatch", () => {
	const cases: readonly (readonly string[])[] = [
		["map", "--seed", "src/index.ts"],
		["map", "--anchor", "FR-014"],
		["map", "--anchor", "FR-014", "--anchor", "DOC.README.PRESENT", "--seed", "src/index.ts"],
		["map", "--anchor", "FR-014", "--seed"],
		["map", "--anchor", "--seed", "src/index.ts"],
		["map", "--anchor", "FR-014", "--seed", "src/index.ts", "--replace", "--replace"],
		["map", "--anchor", "FR-014", "--seed", "src/index.ts", "--replace", "yes"],
		["map", "--unknown", "value", "--anchor", "FR-014", "--seed", "src/index.ts"],
		["map", "--anchor", "FR-014", "--seed", "src/index.ts", "extra"],
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

test("rejects invalid raw map semantics before dispatch", () => {
	const cases: readonly (readonly string[])[] = [
		["map", "--anchor", "bad", "--seed", "src/index.ts"],
		["map", "--anchor", "FR-014", "--seed", ""],
		["map", "--anchor", "FR-014", "--seed", "/src/index.ts"],
		["map", "--anchor", "FR-014", "--seed", "src\\index.ts"],
		["map", "--anchor", "FR-014", "--seed", "src/\u001f/index.ts"],
		["map", "--anchor", "FR-014", "--seed", "."],
		["map", "--anchor", "FR-014", "--seed", "src/../index.ts"],
		["map", "--anchor", "FR-014", "--seed", "src/index.ts", "--seed", "./src//index.ts/"],
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

test("default map handler fails invalid config with code 2 and preserves config bytes", () => {
	const cwd = createTempRepo();
	const configBytes = "version: [\n";
	try {
		writeFileSync(join(cwd, "anchormap.yaml"), configBytes);
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["map", "--anchor", "FR-014", "--seed", "src/index.ts"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 2);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.equal(readFileSync(join(cwd, "anchormap.yaml"), "utf8"), configBytes);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("default map handler rejects invalid anchor IDs before config access", () => {
	const cwd = createTempRepo();
	try {
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["map", "--anchor", "bad", "--seed", "src/index.ts"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 4);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.equal(existsSync(join(cwd, "anchormap.yaml")), false);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("default map handler checks replace guard before spec indexing", () => {
	const cwd = createTempRepo();
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
	try {
		mkdirSync(join(cwd, "src"), { recursive: true });
		mkdirSync(join(cwd, "specs"), { recursive: true });
		writeFileSync(join(cwd, "anchormap.yaml"), configBytes);
		writeFileSync(join(cwd, "src", "index.ts"), "export {};\n");
		writeFileSync(join(cwd, "specs", "invalid.md"), Uint8Array.from([0x66, 0x80, 0x67]));
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["map", "--anchor", "FR-014", "--seed", "src/index.ts"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 4);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.equal(readFileSync(join(cwd, "anchormap.yaml"), "utf8"), configBytes);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("default map handler rejects config-dependent seed preconditions before spec indexing", () => {
	const cases: Array<{
		name: string;
		seed: string;
		setup(cwd: string): void;
	}> = [
		{
			name: "outside product_root",
			seed: "lib/index.ts",
			setup: (cwd) => {
				mkdirSync(join(cwd, "lib"), { recursive: true });
				writeFileSync(join(cwd, "lib", "index.ts"), "export {};\n");
			},
		},
		{
			name: "under ignore_roots",
			seed: "src/generated/index.ts",
			setup: (cwd) => {
				mkdirSync(join(cwd, "src", "generated"), { recursive: true });
				writeFileSync(join(cwd, "src", "generated", "index.ts"), "export {};\n");
			},
		},
		{
			name: "declaration file",
			seed: "src/types.d.ts",
			setup: (cwd) => {
				writeFileSync(join(cwd, "src", "types.d.ts"), "export type Value = string;\n");
			},
		},
		{
			name: "jsx file",
			seed: "src/view.jsx",
			setup: (cwd) => {
				writeFileSync(join(cwd, "src", "view.jsx"), "export const view = null;\n");
			},
		},
		{
			name: "js file",
			seed: "src/index.js",
			setup: (cwd) => {
				writeFileSync(join(cwd, "src", "index.js"), "module.exports = {};\n");
			},
		},
		{
			name: "absent file",
			seed: "src/missing.ts",
			setup: () => {},
		},
		{
			name: "directory, not file",
			seed: "src/directory.ts",
			setup: (cwd) => {
				mkdirSync(join(cwd, "src", "directory.ts"));
			},
		},
	];

	for (const testCase of cases) {
		const cwd = createTempRepo();
		const configBytes = [
			"version: 1",
			"product_root: 'src'",
			"spec_roots:",
			"  - 'specs'",
			"ignore_roots:",
			"  - 'src/generated'",
			"mappings: {}",
			"",
		].join("\n");
		try {
			mkdirSync(join(cwd, "src"), { recursive: true });
			mkdirSync(join(cwd, "specs"), { recursive: true });
			writeFileSync(join(cwd, "anchormap.yaml"), configBytes);
			writeFileSync(join(cwd, "specs", "invalid.md"), Uint8Array.from([0x66, 0x80, 0x67]));
			testCase.setup(cwd);
			const stdout = createBufferingWriter();
			const stderr = createBufferingWriter();

			const exitCode = runAnchormap(["map", "--anchor", "FR-014", "--seed", testCase.seed], {
				cwd,
				stdout: stdout.writer,
				stderr: stderr.writer,
			});

			assert.equal(exitCode, 4, testCase.name);
			assert.equal(stdout.read(), "", testCase.name);
			assert.notEqual(stderr.read(), "", testCase.name);
			assert.equal(readFileSync(join(cwd, "anchormap.yaml"), "utf8"), configBytes, testCase.name);
			assertNoAnchormapTemps(cwd);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}
});

test("default map handler classifies required seed existence-test failure as code 3", () => {
	const cwd = createTempRepo();
	const configBytes = "version: 1\nproduct_root: 'src'\nspec_roots:\n  - 'specs'\nmappings: {}\n";
	try {
		mkdirSync(join(cwd, "src"), { recursive: true });
		mkdirSync(join(cwd, "specs"), { recursive: true });
		writeFileSync(join(cwd, "anchormap.yaml"), configBytes);
		symlinkSync("loop.ts", join(cwd, "src", "loop.ts"));
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["map", "--anchor", "FR-014", "--seed", "src/loop.ts"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 3);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.equal(readFileSync(join(cwd, "anchormap.yaml"), "utf8"), configBytes);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("default map handler rejects anchors absent from current specs with code 4", () => {
	const cwd = createTempRepo();
	const configBytes = "version: 1\nproduct_root: 'src'\nspec_roots:\n  - 'specs'\nmappings: {}\n";
	try {
		mkdirSync(join(cwd, "src"), { recursive: true });
		mkdirSync(join(cwd, "specs"), { recursive: true });
		writeFileSync(join(cwd, "anchormap.yaml"), configBytes);
		writeFileSync(join(cwd, "specs", "present.md"), "# FR-014 Present\n");
		writeFileSync(join(cwd, "src", "index.ts"), "export {};\n");
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["map", "--anchor", "FR-999", "--seed", "src/index.ts"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 4);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.equal(readFileSync(join(cwd, "anchormap.yaml"), "utf8"), configBytes);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("default map handler rejects draft-only anchors with code 4", () => {
	const cwd = createTempRepo();
	const configBytes = "version: 1\nproduct_root: 'src'\nspec_roots:\n  - 'specs'\nmappings: {}\n";
	try {
		mkdirSync(join(cwd, "src"), { recursive: true });
		mkdirSync(join(cwd, "specs"), { recursive: true });
		writeFileSync(join(cwd, "anchormap.yaml"), configBytes);
		writeFileSync(
			join(cwd, "specs", "generated.md"),
			"<!-- anchormap: draft -->\n\n# DRAFT.ONLY.ANCHOR\n",
		);
		writeFileSync(join(cwd, "src", "index.ts"), "export {};\n");
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(
			["map", "--anchor", "DRAFT.ONLY.ANCHOR", "--seed", "src/index.ts"],
			{
				cwd,
				stdout: stdout.writer,
				stderr: stderr.writer,
			},
		);

		assert.equal(exitCode, 4);
		assert.equal(stdout.read(), "");
		assert.match(stderr.read(), /draft/);
		assert.equal(readFileSync(join(cwd, "anchormap.yaml"), "utf8"), configBytes);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("map seed product-file membership validation rejects seeds missing from discovery", () => {
	assert.deepEqual(
		validateMapSeedsInProductFiles(
			["src/index.ts", "src/view.tsx"],
			[repoPath("src/index.ts"), repoPath("src/view.tsx")],
		),
		{
			kind: "ok",
		},
	);

	const result = validateMapSeedsInProductFiles(["src/other.ts"], [repoPath("src/index.ts")]);

	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.error.kind, "UsageError");
	}
});

test("default map handler creates a canonical mapping with sorted seed files", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "src"));
		mkdirSync(join(cwd, "specs"));
		writeFileSync(
			join(cwd, "anchormap.yaml"),
			"version: 1\nproduct_root: 'src'\nspec_roots:\n  - 'specs'\nmappings: {}\n",
		);
		writeFileSync(join(cwd, "specs", "requirements.md"), "# FR-014 Trace\n");
		writeFileSync(join(cwd, "src", "index.ts"), "export const index = 1;\n");
		writeFileSync(join(cwd, "src", "view.tsx"), "export const view = <main />;\n");
		writeFileSync(join(cwd, "src", "z.ts"), "export const z = 1;\n");
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(
			[
				"map",
				"--anchor",
				"FR-014",
				"--seed",
				"src/z.ts",
				"--seed",
				"src/view.tsx",
				"--seed",
				"src/index.ts",
			],
			{ cwd, stdout: stdout.writer, stderr: stderr.writer },
		);

		assert.equal(exitCode, 0);
		assert.equal(stdout.read(), "");
		assert.equal(stderr.read(), "");
		assert.equal(
			readFileSync(join(cwd, "anchormap.yaml"), "utf8"),
			[
				"version: 1",
				"product_root: 'src'",
				"spec_roots:",
				"  - 'specs'",
				"mappings:",
				"  'FR-014':",
				"    seed_files:",
				"      - 'src/index.ts'",
				"      - 'src/view.tsx'",
				"      - 'src/z.ts'",
				"",
			].join("\n"),
		);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("default map handler replaces only the requested mapping when --replace is present", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "src"));
		mkdirSync(join(cwd, "specs"));
		writeFileSync(
			join(cwd, "anchormap.yaml"),
			[
				"version: 1",
				"product_root: 'src'",
				"spec_roots:",
				"  - 'specs'",
				"mappings:",
				"  'FR-014':",
				"    seed_files:",
				"      - 'src/old.ts'",
				"  'FR-020':",
				"    seed_files:",
				"      - 'src/other.ts'",
				"",
			].join("\n"),
		);
		writeFileSync(join(cwd, "specs", "requirements.md"), "# FR-014 Trace\n# FR-020 Other\n");
		writeFileSync(join(cwd, "src", "new.ts"), "export const next = 1;\n");
		writeFileSync(join(cwd, "src", "old.ts"), "export const old = 1;\n");
		writeFileSync(join(cwd, "src", "other.ts"), "export const other = 1;\n");
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(
			["map", "--anchor", "FR-014", "--seed", "src/new.ts", "--replace"],
			{ cwd, stdout: stdout.writer, stderr: stderr.writer },
		);

		assert.equal(exitCode, 0);
		assert.equal(stdout.read(), "");
		assert.equal(stderr.read(), "");
		assert.equal(
			readFileSync(join(cwd, "anchormap.yaml"), "utf8"),
			[
				"version: 1",
				"product_root: 'src'",
				"spec_roots:",
				"  - 'specs'",
				"mappings:",
				"  'FR-014':",
				"    seed_files:",
				"      - 'src/new.ts'",
				"  'FR-020':",
				"    seed_files:",
				"      - 'src/other.ts'",
				"",
			].join("\n"),
		);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("default map handler creates an absent mapping when --replace is present", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "src"));
		mkdirSync(join(cwd, "specs"));
		writeFileSync(
			join(cwd, "anchormap.yaml"),
			[
				"version: 1",
				"product_root: 'src'",
				"spec_roots:",
				"  - 'specs'",
				"mappings:",
				"  'FR-020':",
				"    seed_files:",
				"      - 'src/other.ts'",
				"",
			].join("\n"),
		);
		writeFileSync(join(cwd, "specs", "requirements.md"), "# FR-014 Trace\n# FR-020 Other\n");
		writeFileSync(join(cwd, "src", "index.ts"), "export const index = 1;\n");
		writeFileSync(join(cwd, "src", "other.ts"), "export const other = 1;\n");
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(
			["map", "--anchor", "FR-014", "--seed", "src/index.ts", "--replace"],
			{ cwd, stdout: stdout.writer, stderr: stderr.writer },
		);

		assert.equal(exitCode, 0);
		assert.equal(stdout.read(), "");
		assert.equal(stderr.read(), "");
		assert.equal(
			readFileSync(join(cwd, "anchormap.yaml"), "utf8"),
			[
				"version: 1",
				"product_root: 'src'",
				"spec_roots:",
				"  - 'specs'",
				"mappings:",
				"  'FR-014':",
				"    seed_files:",
				"      - 'src/index.ts'",
				"  'FR-020':",
				"    seed_files:",
				"      - 'src/other.ts'",
				"",
			].join("\n"),
		);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("default map handler classifies spec decode failures as code 3 without mutation", () => {
	const cwd = createTempRepo();
	const configBytes = "version: 1\nproduct_root: 'src'\nspec_roots:\n  - 'specs'\nmappings: {}\n";
	try {
		mkdirSync(join(cwd, "src"), { recursive: true });
		mkdirSync(join(cwd, "specs"), { recursive: true });
		writeFileSync(join(cwd, "anchormap.yaml"), configBytes);
		writeFileSync(join(cwd, "src", "index.ts"), "export {};\n");
		writeFileSync(join(cwd, "specs", "invalid.md"), Uint8Array.from([0x66, 0x80, 0x67]));
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["map", "--anchor", "FR-014", "--seed", "src/index.ts"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 3);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.equal(readFileSync(join(cwd, "anchormap.yaml"), "utf8"), configBytes);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("default map handler classifies product guardrail failures as code 3 without mutation", () => {
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

		const exitCode = runAnchormap(["map", "--anchor", "FR-014", "--seed", "src/target.ts"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 3);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.equal(readFileSync(join(cwd, "anchormap.yaml"), "utf8"), configBytes);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("default map handler validates product file decode and parse before any mutation", () => {
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
		const configBytes = "version: 1\nproduct_root: 'src'\nspec_roots:\n  - 'specs'\nmappings: {}\n";
		try {
			mkdirSync(join(cwd, "src"));
			mkdirSync(join(cwd, "specs"));
			writeFileSync(join(cwd, "anchormap.yaml"), configBytes);
			writeFileSync(join(cwd, "specs", "present.md"), "# FR-014 Present\n");
			writeFileSync(join(cwd, "src", "index.ts"), testCase.bytes);
			const stdout = createBufferingWriter();
			const stderr = createBufferingWriter();

			const exitCode = runAnchormap(["map", "--anchor", "FR-014", "--seed", "src/index.ts"], {
				cwd,
				stdout: stdout.writer,
				stderr: stderr.writer,
			});

			assert.equal(exitCode, 3, testCase.name);
			assert.equal(stdout.read(), "", testCase.name);
			assert.notEqual(stderr.read(), "", testCase.name);
			assert.equal(readFileSync(join(cwd, "anchormap.yaml"), "utf8"), configBytes, testCase.name);
			assertNoAnchormapTemps(cwd);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}
});

test("default map handler classifies graph existence-test failures as code 3 without mutation", () => {
	const cwd = createTempRepo();
	const configBytes = "version: 1\nproduct_root: 'src'\nspec_roots:\n  - 'specs'\nmappings: {}\n";
	try {
		mkdirSync(join(cwd, "src"));
		mkdirSync(join(cwd, "specs"));
		mkdirSync(join(cwd, "blocked"));
		writeFileSync(join(cwd, "anchormap.yaml"), configBytes);
		writeFileSync(join(cwd, "specs", "present.md"), "# FR-014 Present\n");
		writeFileSync(join(cwd, "src", "index.ts"), "import { dep } from '../blocked/dep';\n");
		chmodSync(join(cwd, "blocked"), 0);
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["map", "--anchor", "FR-014", "--seed", "src/index.ts"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 3);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.equal(readFileSync(join(cwd, "anchormap.yaml"), "utf8"), configBytes);
		assertNoAnchormapTemps(cwd);
	} finally {
		chmodSync(join(cwd, "blocked"), 0o700);
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("default map handler classifies invalid tsconfig before mutation", () => {
	const cwd = createTempRepo();
	const configBytes = "version: 1\nproduct_root: 'src'\nspec_roots:\n  - 'specs'\nmappings: {}\n";
	try {
		mkdirSync(join(cwd, "src"));
		mkdirSync(join(cwd, "specs"));
		writeFileSync(join(cwd, "anchormap.yaml"), configBytes);
		writeFileSync(join(cwd, "tsconfig.json"), "{ invalid jsonc\n");
		writeFileSync(join(cwd, "specs", "present.md"), "# FR-014 Present\n");
		writeFileSync(join(cwd, "src", "index.ts"), "export const value = 1;\n");
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["map", "--anchor", "FR-014", "--seed", "src/index.ts"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 3);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.equal(readFileSync(join(cwd, "anchormap.yaml"), "utf8"), configBytes);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("default map handler ignores graph findings and writes the explicit mapping", () => {
	const cwd = createTempRepo();
	const configBytes = "version: 1\nproduct_root: 'src'\nspec_roots:\n  - 'specs'\nmappings: {}\n";
	try {
		mkdirSync(join(cwd, "src"));
		mkdirSync(join(cwd, "specs"));
		writeFileSync(join(cwd, "anchormap.yaml"), configBytes);
		writeFileSync(join(cwd, "specs", "present.md"), "# FR-014 Present\n");
		writeFileSync(join(cwd, "src", "index.ts"), "const dep = require('./dep');\n");
		writeFileSync(join(cwd, "src", "dep.ts"), "export const dep = 1;\n");
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["map", "--anchor", "FR-014", "--seed", "src/index.ts"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 0);
		assert.equal(stdout.read(), "");
		assert.equal(stderr.read(), "");
		assert.equal(
			readFileSync(join(cwd, "anchormap.yaml"), "utf8"),
			[
				"version: 1",
				"product_root: 'src'",
				"spec_roots:",
				"  - 'specs'",
				"mappings:",
				"  'FR-014':",
				"    seed_files:",
				"      - 'src/index.ts'",
				"",
			].join("\n"),
		);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
