import { strict as assert } from "node:assert";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { runAnchormap } from "./commands";
import {
	assertNoAnchormapTemps,
	createBufferingWriter,
	createRecordingHandlers,
	createTempRepo,
	writeMinimalScanConfig,
} from "./commands-test-support";

test("parses supported scaffold forms before dispatch", () => {
	const stdout = createBufferingWriter();
	const stderr = createBufferingWriter();
	const calls: string[] = [];

	const exitCode = runAnchormap(["scaffold", "--output", "./specs//draft.md"], {
		stdout: stdout.writer,
		stderr: stderr.writer,
		handlers: createRecordingHandlers(calls),
	});

	assert.equal(exitCode, 0);
	assert.equal(stdout.read(), "");
	assert.equal(stderr.read(), "");
	assert.deepEqual(calls, ["scaffold:--output ./specs//draft.md:output=specs/draft.md"]);
});

test("rejects invalid scaffold options and output paths before dispatch", () => {
	const cases: readonly (readonly string[])[] = [
		["scaffold"],
		["scaffold", "--output"],
		["scaffold", "--output", "specs/draft.md", "--output", "specs/other.md"],
		["scaffold", "--unknown", "value"],
		["scaffold", "--output", "specs/draft.md", "extra"],
		["scaffold", "--output", ""],
		["scaffold", "--output", "/specs/draft.md"],
		["scaffold", "--output", "specs\\draft.md"],
		["scaffold", "--output", "specs/\u001f/draft.md"],
		["scaffold", "--output", "specs/../draft.md"],
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

test("default scaffold handler writes create-only markdown without mutating config", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "src", "auth"), { recursive: true });
		mkdirSync(join(cwd, "specs"), { recursive: true });
		writeMinimalScanConfig(cwd);
		const initialConfig = readFileSync(join(cwd, "anchormap.yaml"), "utf8");
		writeFileSync(join(cwd, "src", "auth", "token.ts"), "export function verifyToken() {}\n");
		writeFileSync(join(cwd, "src", "z.ts"), "export const lastValue = 1;\n");
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["scaffold", "--output", "specs/generated.md"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 0);
		assert.equal(stdout.read(), "");
		assert.equal(stderr.read(), "");
		assert.equal(readFileSync(join(cwd, "anchormap.yaml"), "utf8"), initialConfig);
		assert.equal(
			readFileSync(join(cwd, "specs", "generated.md"), "utf8"),
			[
				"<!-- anchormap: draft -->",
				"",
				"# AUTH.TOKEN.VERIFY_TOKEN",
				"<!-- anchormap scaffold: source=src/auth/token.ts export=verifyToken kind=function -->",
				"",
				"TODO: describe intent.",
				"",
				"# Z.LAST_VALUE",
				"<!-- anchormap scaffold: source=src/z.ts export=lastValue kind=variable -->",
				"",
				"TODO: describe intent.",
				"",
			].join("\n"),
		);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("default scaffold handler rejects case-only output collisions with existing specs", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "src"));
		mkdirSync(join(cwd, "specs"));
		writeMinimalScanConfig(cwd);
		const initialConfig = readFileSync(join(cwd, "anchormap.yaml"), "utf8");
		writeFileSync(join(cwd, "src", "index.ts"), "export const value = 1;\n");
		writeFileSync(join(cwd, "specs", "Generated.md"), "# EXISTING.ANCHOR\n");
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(["scaffold", "--output", "specs/generated.md"], {
			cwd,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 4);
		assert.equal(stdout.read(), "");
		assert.notEqual(stderr.read(), "");
		assert.equal(readFileSync(join(cwd, "anchormap.yaml"), "utf8"), initialConfig);
		assert.deepEqual(readdirSync(join(cwd, "specs")).sort(), ["Generated.md"]);
		assertNoAnchormapTemps(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
