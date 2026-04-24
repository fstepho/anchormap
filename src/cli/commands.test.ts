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
			const suffix = context.scanMode ? `:${context.scanMode}` : "";
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

test("dispatches init and map argument validation to their command handlers", () => {
	for (const command of ["init", "map"] as const) {
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();
		const calls: string[] = [];

		const exitCode = runAnchormap([command, "--example"], {
			stdout: stdout.writer,
			stderr: stderr.writer,
			handlers: createRecordingHandlers(calls),
		});

		assert.equal(exitCode, 0);
		assert.equal(stdout.read(), "");
		assert.equal(stderr.read(), "");
		assert.deepEqual(calls, [`${command}:--example`]);
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
