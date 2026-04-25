import { strict as assert } from "node:assert";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
	type AnchormapCommandContext,
	type AnchormapCommandHandlers,
	type AppError,
	commandSuccess,
	configError,
	exitCodeForAppError,
	internalError,
	runAnchormap,
	unsupportedRepoError,
	usageError,
	writeAppError,
} from "./commands";

function createBufferingWriter(): {
	writer: { write(chunk: string): boolean };
	read(): string;
} {
	const chunks: string[] = [];

	return {
		writer: {
			write(chunk: string): boolean {
				chunks.push(chunk);
				return true;
			},
		},
		read(): string {
			return chunks.join("");
		},
	};
}

function createRecordingHandlers(calls: string[]): AnchormapCommandHandlers {
	function record(
		command: string,
	): (context: AnchormapCommandContext) => ReturnType<AnchormapCommandHandlers["scan"]> {
		return (context) => {
			const initSuffix = context.initArgs
				? `:root=${context.initArgs.root}:spec=${context.initArgs.specRoots.join(",")}:ignore=${context.initArgs.ignoreRoots.join(",")}`
				: "";
			const mapSuffix = context.mapArgs
				? `:anchor=${context.mapArgs.anchor}:seeds=${context.mapArgs.seeds.join(",")}:replace=${context.mapArgs.replace}`
				: "";
			const scanSuffix = context.scanMode ? `:${context.scanMode}` : "";
			const suffix = `${initSuffix}${mapSuffix}${scanSuffix}`;
			calls.push(`${command}:${context.args.join(" ")}${suffix}`);
			if (context.scanMode === "json") {
				return commandSuccess({ stdout: "{}\n" });
			}
			return commandSuccess();
		};
	}

	return {
		init: record("init"),
		map: record("map"),
		scan: record("scan"),
	};
}

function createHandlersReturning(result: AppError): AnchormapCommandHandlers {
	return {
		init: () => result,
		map: () => result,
		scan: () => result,
	};
}

function createTempRepo(): string {
	return mkdtempSync(join(tmpdir(), "anchormap-init-"));
}

test("maps AppError kinds to the contract exit codes at the command boundary", () => {
	const cases: Array<{ error: AppError; exitCode: number }> = [
		{ error: usageError("usage"), exitCode: 4 },
		{ error: configError("config"), exitCode: 2 },
		{ error: unsupportedRepoError("repo"), exitCode: 3 },
		{ error: writeAppError("write"), exitCode: 1 },
		{ error: internalError("internal"), exitCode: 1 },
	];

	for (const { error, exitCode } of cases) {
		assert.equal(exitCodeForAppError(error), exitCode);
	}
});

test("maps AppError results from handlers without exposing module-owned exit codes", () => {
	const cases: Array<{ error: AppError; exitCode: number }> = [
		{ error: usageError("usage"), exitCode: 4 },
		{ error: configError("config"), exitCode: 2 },
		{ error: unsupportedRepoError("repo"), exitCode: 3 },
		{ error: writeAppError("write"), exitCode: 1 },
		{ error: internalError("internal"), exitCode: 1 },
	];

	for (const { error, exitCode } of cases) {
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const actualExitCode = runAnchormap(["scan"], {
			stdout: stdout.writer,
			stderr: stderr.writer,
			handlers: createHandlersReturning(error),
		});

		assert.equal(actualExitCode, exitCode);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
	}
});

test("treats thrown handler failures as InternalError code 1", () => {
	const stdout = createBufferingWriter();
	const stderr = createBufferingWriter();

	const exitCode = runAnchormap(["scan"], {
		stdout: stdout.writer,
		stderr: stderr.writer,
		handlers: {
			init: () => commandSuccess(),
			map: () => commandSuccess(),
			scan: () => {
				throw new Error("boom");
			},
		},
	});

	assert.equal(exitCode, 1);
	assert.equal(stdout.read(), "");
	assert.notEqual(stderr.read(), "");
});

test("writes scan --json success only to stdout and keeps stderr empty", () => {
	const stdout = createBufferingWriter();
	const stderr = createBufferingWriter();

	const exitCode = runAnchormap(["scan", "--json"], {
		stdout: stdout.writer,
		stderr: stderr.writer,
		handlers: {
			init: () => commandSuccess(),
			map: () => commandSuccess(),
			scan: () => commandSuccess({ stdout: '{"ok":true}\n' }),
		},
	});

	assert.equal(exitCode, 0);
	assert.equal(stdout.read(), '{"ok":true}\n');
	assert.equal(stderr.read(), "");
});

test("converts scan --json success with stderr bytes into code 1 without stdout", () => {
	const stdout = createBufferingWriter();
	const stderr = createBufferingWriter();

	const exitCode = runAnchormap(["scan", "--json"], {
		stdout: stdout.writer,
		stderr: stderr.writer,
		handlers: {
			init: () => commandSuccess(),
			map: () => commandSuccess(),
			scan: (context) => {
				context.stdout.write('{"ok":true}\n');
				context.stderr.write("warning\n");
				return commandSuccess();
			},
		},
	});

	assert.equal(exitCode, 1);
	assert.equal(stdout.read(), "");
	assert.notEqual(stderr.read(), "");
});

test("converts scan --json success with no stdout into code 1 without stdout", () => {
	const stdout = createBufferingWriter();
	const stderr = createBufferingWriter();

	const exitCode = runAnchormap(["scan", "--json"], {
		stdout: stdout.writer,
		stderr: stderr.writer,
		handlers: {
			init: () => commandSuccess(),
			map: () => commandSuccess(),
			scan: () => commandSuccess(),
		},
	});

	assert.equal(exitCode, 1);
	assert.equal(stdout.read(), "");
	assert.notEqual(stderr.read(), "");
});

test("converts scan --json success without final stdout newline into code 1", () => {
	const stdout = createBufferingWriter();
	const stderr = createBufferingWriter();

	const exitCode = runAnchormap(["scan", "--json"], {
		stdout: stdout.writer,
		stderr: stderr.writer,
		handlers: {
			init: () => commandSuccess(),
			map: () => commandSuccess(),
			scan: () => commandSuccess({ stdout: '{"ok":true}' }),
		},
	});

	assert.equal(exitCode, 1);
	assert.equal(stdout.read(), "");
	assert.notEqual(stderr.read(), "");
});

test("converts scan --json success with extra physical stdout lines into code 1", () => {
	const cases = ['{"ok":true}\n\n', '{"ok":\ntrue}\n'];

	for (const handlerStdout of cases) {
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["scan", "--json"], {
			stdout: stdout.writer,
			stderr: stderr.writer,
			handlers: {
				init: () => commandSuccess(),
				map: () => commandSuccess(),
				scan: () => commandSuccess({ stdout: handlerStdout }),
			},
		});

		assert.equal(exitCode, 1);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
	}
});

test("keeps scan --json failure stdout empty even if lower code wrote stdout", () => {
	const stdout = createBufferingWriter();
	const stderr = createBufferingWriter();

	const exitCode = runAnchormap(["scan", "--json"], {
		stdout: stdout.writer,
		stderr: stderr.writer,
		handlers: {
			init: () => commandSuccess(),
			map: () => commandSuccess(),
			scan: (context) => {
				context.stdout.write('{"not":"allowed"}\n');
				return configError("config");
			},
		},
	});

	assert.equal(exitCode, 2);
	assert.equal(stdout.read(), "");
	assert.notEqual(stderr.read(), "");
});

test("rejects a missing command as a usage error", () => {
	const stdout = createBufferingWriter();
	const stderr = createBufferingWriter();
	const calls: string[] = [];

	const exitCode = runAnchormap([], {
		stdout: stdout.writer,
		stderr: stderr.writer,
		handlers: createRecordingHandlers(calls),
	});

	assert.equal(exitCode, 4);
	assert.equal(stdout.read(), "");
	assert.notEqual(stderr.read(), "");
	assert.deepEqual(calls, []);
});

test("rejects an unknown command before dispatching to supported handlers", () => {
	const stdout = createBufferingWriter();
	const stderr = createBufferingWriter();
	const calls: string[] = [];

	const exitCode = runAnchormap(["unknown"], {
		stdout: stdout.writer,
		stderr: stderr.writer,
		handlers: createRecordingHandlers(calls),
	});

	assert.equal(exitCode, 4);
	assert.equal(stdout.read(), "");
	assert.notEqual(stderr.read(), "");
	assert.deepEqual(calls, []);
});

test("parses supported init forms before dispatch", () => {
	const cases: Array<{
		argv: readonly string[];
		expectedCall: string;
	}> = [
		{
			argv: ["init", "--root", "src", "--spec-root", "specs"],
			expectedCall: "init:--root src --spec-root specs:root=src:spec=specs:ignore=",
		},
		{
			argv: [
				"init",
				"--ignore-root",
				"src/generated",
				"--spec-root",
				"docs/specs",
				"--root",
				"src",
				"--spec-root",
				"more/specs",
			],
			expectedCall:
				"init:--ignore-root src/generated --spec-root docs/specs --root src --spec-root more/specs:root=src:spec=docs/specs,more/specs:ignore=src/generated",
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

test("rejects invalid init options and shapes before dispatch", () => {
	const cases: readonly (readonly string[])[] = [
		["init", "--spec-root", "specs"],
		["init", "--root", "src"],
		["init", "--root", "src", "--root", "lib", "--spec-root", "specs"],
		["init", "--root", "src", "--spec-root"],
		["init", "--unknown", "value", "--root", "src", "--spec-root", "specs"],
		["init", "--root", "src", "--spec-root", "specs", "extra"],
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

test("default init handler writes canonical empty config after normalizing roots", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "src", "generated"), { recursive: true });
		mkdirSync(join(cwd, "src", "vendor"), { recursive: true });
		mkdirSync(join(cwd, "specs"), { recursive: true });
		mkdirSync(join(cwd, "zspecs"), { recursive: true });
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(
			[
				"init",
				"--ignore-root",
				"./src/vendor/",
				"--spec-root",
				"zspecs",
				"--root",
				"./src/",
				"--ignore-root",
				"src/generated",
				"--spec-root",
				"./specs//",
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
				"  - 'zspecs'",
				"ignore_roots:",
				"  - 'src/generated'",
				"  - 'src/vendor'",
				"mappings: {}",
				"",
			].join("\n"),
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("default init handler is create-only and preserves existing config bytes", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "src"), { recursive: true });
		mkdirSync(join(cwd, "specs"), { recursive: true });
		writeFileSync(join(cwd, "anchormap.yaml"), "existing bytes\n");
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["init", "--root", "src", "--spec-root", "specs"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 4);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.equal(readFileSync(join(cwd, "anchormap.yaml"), "utf8"), "existing bytes\n");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("default init handler treats a broken config symlink as existing", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "src"), { recursive: true });
		mkdirSync(join(cwd, "specs"), { recursive: true });
		symlinkSync("missing-target.yaml", join(cwd, "anchormap.yaml"));
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["init", "--root", "src", "--spec-root", "specs"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 4);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.equal(lstatSync(join(cwd, "anchormap.yaml")).isSymbolicLink(), true);
		assert.equal(readlinkSync(join(cwd, "anchormap.yaml")), "missing-target.yaml");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("default init handler rejects duplicate normalized roots without writing config", () => {
	const cases: readonly (readonly string[])[] = [
		["--root", "src", "--spec-root", "specs", "--spec-root", "./specs/"],
		[
			"--root",
			"src",
			"--spec-root",
			"specs",
			"--ignore-root",
			"src/generated",
			"--ignore-root",
			"./src//generated/",
		],
	];

	for (const args of cases) {
		const cwd = createTempRepo();
		try {
			mkdirSync(join(cwd, "src", "generated"), { recursive: true });
			mkdirSync(join(cwd, "specs"), { recursive: true });
			const stdout = createBufferingWriter();
			const stderr = createBufferingWriter();

			const exitCode = runAnchormap(["init", ...args], {
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
	}
});

test("default init handler rejects overlapping normalized roots without writing config", () => {
	const cases: readonly (readonly string[])[] = [
		["--root", "src", "--spec-root", "specs/sub", "--spec-root", "specs"],
		[
			"--root",
			"src",
			"--spec-root",
			"specs",
			"--ignore-root",
			"src/generated/cache",
			"--ignore-root",
			"src/generated",
		],
	];

	for (const args of cases) {
		const cwd = createTempRepo();
		try {
			mkdirSync(join(cwd, "src", "generated", "cache"), { recursive: true });
			mkdirSync(join(cwd, "specs", "sub"), { recursive: true });
			const stdout = createBufferingWriter();
			const stderr = createBufferingWriter();

			const exitCode = runAnchormap(["init", ...args], {
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
	}
});

test("default init handler rejects missing required directories and existing ignored roots outside product root", () => {
	const cases: Array<{
		setup(cwd: string): void;
		args: readonly string[];
	}> = [
		{
			setup: () => {},
			args: ["--root", "src", "--spec-root", "specs"],
		},
		{
			setup: (cwd) => {
				mkdirSync(join(cwd, "src"), { recursive: true });
			},
			args: ["--root", "src", "--spec-root", "specs"],
		},
		{
			setup: (cwd) => {
				mkdirSync(join(cwd, "src"), { recursive: true });
				mkdirSync(join(cwd, "specs"), { recursive: true });
				mkdirSync(join(cwd, "generated"), { recursive: true });
			},
			args: ["--root", "src", "--spec-root", "specs", "--ignore-root", "generated"],
		},
	];

	for (const { setup, args } of cases) {
		const cwd = createTempRepo();
		try {
			setup(cwd);
			const stdout = createBufferingWriter();
			const stderr = createBufferingWriter();

			const exitCode = runAnchormap(["init", ...args], {
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
	}
});

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
				"src/first.ts",
				"--replace",
				"--anchor",
				"DOC.README.PRESENT",
				"--seed",
				"src/second.ts",
			],
			expectedCall:
				"map:--seed src/first.ts --replace --anchor DOC.README.PRESENT --seed src/second.ts:anchor=DOC.README.PRESENT:seeds=src/first.ts,src/second.ts:replace=true",
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

test("default map handler rejects anchors absent from current specs with code 4", () => {
	const cwd = createTempRepo();
	const configBytes = "version: 1\nproduct_root: 'src'\nspec_roots:\n  - 'specs'\nmappings: {}\n";
	try {
		mkdirSync(join(cwd, "src"), { recursive: true });
		mkdirSync(join(cwd, "specs"), { recursive: true });
		writeFileSync(join(cwd, "anchormap.yaml"), configBytes);
		writeFileSync(join(cwd, "specs", "present.md"), "# FR-014 Present\n");
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

test("default map handler classifies spec decode failures as code 3 without mutation", () => {
	const cwd = createTempRepo();
	const configBytes = "version: 1\nproduct_root: 'src'\nspec_roots:\n  - 'specs'\nmappings: {}\n";
	try {
		mkdirSync(join(cwd, "src"), { recursive: true });
		mkdirSync(join(cwd, "specs"), { recursive: true });
		writeFileSync(join(cwd, "anchormap.yaml"), configBytes);
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
			schema_version: 1,
			config: {
				version: 1,
				product_root: "src",
				spec_roots: ["specs"],
				ignore_roots: [],
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
			findings: [],
		});
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

test("scan --json does not emit temporary clean output for local graph syntax before extraction", () => {
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

		assert.equal(exitCode, 1);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

function writeMinimalScanConfig(cwd: string): void {
	writeFileSync(
		join(cwd, "anchormap.yaml"),
		["version: 1", "product_root: 'src'", "spec_roots:", "  - 'specs'", "mappings: {}", ""].join(
			"\n",
		),
	);
}

function assertNoAnchormapTemps(cwd: string): void {
	assert.equal(
		readdirSync(cwd).some(
			(entry) => entry.startsWith(".anchormap.yaml.") && entry.endsWith(".tmp"),
		),
		false,
	);
}

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
