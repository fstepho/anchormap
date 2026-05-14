import { strict as assert } from "node:assert";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { runAnchormap } from "./commands";
import {
	createBufferingWriter,
	createRecordingHandlers,
	createTempRepo,
} from "./commands-test-support";

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
