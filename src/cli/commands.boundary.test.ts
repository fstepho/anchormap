import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
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
import {
	createBufferingWriter,
	createHandlersReturning,
	createRecordingHandlers,
} from "./commands-test-support";

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
