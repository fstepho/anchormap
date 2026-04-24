import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
	type AnchormapCommandContext,
	type AnchormapCommandHandlers,
	runAnchormap,
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
	function record(command: string): (context: AnchormapCommandContext) => number {
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
			return 0;
		};
	}

	return {
		init: record("init"),
		map: record("map"),
		scan: record("scan"),
	};
}

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
	assert.match(stderr.read(), /missing command/);
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
	assert.match(stderr.read(), /unknown command "unknown"/);
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
	const cases: Array<{
		argv: readonly string[];
		expectedStderr: RegExp;
	}> = [
		{ argv: ["init", "--spec-root", "specs"], expectedStderr: /--root is required/ },
		{ argv: ["init", "--root", "src"], expectedStderr: /--spec-root is required/ },
		{
			argv: ["init", "--root", "src", "--root", "lib", "--spec-root", "specs"],
			expectedStderr: /--root may be provided at most once/,
		},
		{
			argv: ["init", "--root", "src", "--spec-root"],
			expectedStderr: /--spec-root requires a value/,
		},
		{
			argv: ["init", "--unknown", "value", "--root", "src", "--spec-root", "specs"],
			expectedStderr: /unknown option "--unknown"/,
		},
		{
			argv: ["init", "--root", "src", "--spec-root", "specs", "extra"],
			expectedStderr: /unsupported argument "extra"/,
		},
	];

	for (const { argv, expectedStderr } of cases) {
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
		assert.match(stderr.read(), expectedStderr);
		assert.deepEqual(calls, []);
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
	const cases: Array<{
		argv: readonly string[];
		expectedStderr: RegExp;
	}> = [
		{ argv: ["map", "--seed", "src/index.ts"], expectedStderr: /--anchor is required/ },
		{ argv: ["map", "--anchor", "FR-014"], expectedStderr: /--seed is required/ },
		{
			argv: [
				"map",
				"--anchor",
				"FR-014",
				"--anchor",
				"DOC.README.PRESENT",
				"--seed",
				"src/index.ts",
			],
			expectedStderr: /--anchor may be provided at most once/,
		},
		{
			argv: ["map", "--anchor", "FR-014", "--seed"],
			expectedStderr: /--seed requires a value/,
		},
		{
			argv: ["map", "--anchor", "--seed", "src/index.ts"],
			expectedStderr: /--anchor requires a value/,
		},
		{
			argv: ["map", "--anchor", "FR-014", "--seed", "src/index.ts", "--replace", "--replace"],
			expectedStderr: /--replace may be provided at most once/,
		},
		{
			argv: ["map", "--anchor", "FR-014", "--seed", "src/index.ts", "--replace", "yes"],
			expectedStderr: /--replace does not take a value/,
		},
		{
			argv: ["map", "--unknown", "value", "--anchor", "FR-014", "--seed", "src/index.ts"],
			expectedStderr: /unknown option "--unknown"/,
		},
		{
			argv: ["map", "--anchor", "FR-014", "--seed", "src/index.ts", "extra"],
			expectedStderr: /unsupported argument "extra"/,
		},
	];

	for (const { argv, expectedStderr } of cases) {
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
		assert.match(stderr.read(), expectedStderr);
		assert.deepEqual(calls, []);
	}
});

test("parses supported scan forms before dispatch", () => {
	const cases: Array<{
		argv: readonly string[];
		expectedCall: string;
	}> = [
		{ argv: ["scan"], expectedCall: "scan::human" },
		{ argv: ["scan", "--json"], expectedCall: "scan:--json:json" },
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

test("rejects invalid scan options and combinations before dispatch", () => {
	const cases: Array<{
		argv: readonly string[];
		expectedStderr: RegExp;
	}> = [
		{ argv: ["scan", "--unknown"], expectedStderr: /unknown option "--unknown"/ },
		{ argv: ["scan", "--json", "--json"], expectedStderr: /unsupported option combination/ },
		{ argv: ["scan", "extra"], expectedStderr: /unsupported option combination/ },
	];

	for (const { argv, expectedStderr } of cases) {
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
		assert.match(stderr.read(), expectedStderr);
		assert.deepEqual(calls, []);
	}
});
