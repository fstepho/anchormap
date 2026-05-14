import { strict as assert } from "node:assert";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { type AnchormapRunOptions, commandSuccess, runAnchormap } from "./commands";
import {
	createBufferingWriter,
	createRecordingHandlers,
	createTempRepo,
	minimalScanArtifactJson,
} from "./commands-test-support";

test("parses supported SaaS-ready artifact command forms before dispatch", () => {
	const cases: Array<{
		argv: readonly string[];
		expectedCall: string;
		expectedStdout: string;
	}> = [
		{
			argv: ["check", "--policy", "policy.yaml"],
			expectedCall: "check:--policy policy.yaml:policy=policy.yaml:scan=:json=false",
			expectedStdout: "",
		},
		{
			argv: ["check", "--scan", "./artifacts/scan.json", "--policy", "policy.yaml", "--json"],
			expectedCall:
				"check:--scan ./artifacts/scan.json --policy policy.yaml --json:policy=policy.yaml:scan=artifacts/scan.json:json=true",
			expectedStdout: "{}\n",
		},
		{
			argv: ["diff", "--base", "base.json", "--head", "head.json", "--json"],
			expectedCall:
				"diff:--base base.json --head head.json --json:base=base.json:head=head.json:json=true",
			expectedStdout: "{}\n",
		},
		{
			argv: ["explain", "--anchor", "FR-014", "--scan", "scan.json", "--json"],
			expectedCall:
				"explain:--anchor FR-014 --scan scan.json --json:scan=scan.json:anchor=FR-014:file=:json=true",
			expectedStdout: "{}\n",
		},
		{
			argv: ["explain", "--file", "./src/index.ts", "--scan", "scan.json"],
			expectedCall:
				"explain:--file ./src/index.ts --scan scan.json:scan=scan.json:anchor=:file=src/index.ts:json=false",
			expectedStdout: "",
		},
		{
			argv: [
				"report",
				"--scan",
				"scan.json",
				"--check",
				"check.json",
				"--diff",
				"diff.json",
				"--format",
				"markdown",
			],
			expectedCall:
				"report:--scan scan.json --check check.json --diff diff.json --format markdown:scan=scan.json:check=check.json:diff=diff.json:format=markdown",
			expectedStdout: "report\n",
		},
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

		assert.equal(exitCode, 0, argv.join(" "));
		assert.equal(stdout.read(), expectedStdout, argv.join(" "));
		assert.equal(stderr.read(), "", argv.join(" "));
		assert.deepEqual(calls, [expectedCall], argv.join(" "));
	}
});

test("enforces stdout and stderr semantics for artifact machine-output successes", () => {
	const cases: Array<{
		argv: readonly string[];
		handler: AnchormapRunOptions["handlers"];
		expectedMessage: RegExp;
	}> = [
		{
			argv: ["check", "--policy", "policy.yaml", "--json"],
			handler: { check: () => commandSuccess() },
			expectedMessage: /check --json success wrote no stdout/,
		},
		{
			argv: ["diff", "--base", "base.json", "--head", "head.json", "--json"],
			handler: { diff: () => commandSuccess({ stdout: "{}\n", stderr: "leaked\n" }) },
			expectedMessage: /diff --json success wrote stderr/,
		},
		{
			argv: ["explain", "--anchor", "FR-014", "--scan", "scan.json", "--json"],
			handler: { explain: () => commandSuccess({ stdout: "{}\nextra\n" }) },
			expectedMessage: /explain --json success stdout is not a single physical line/,
		},
		{
			argv: ["report", "--scan", "scan.json", "--format", "markdown"],
			handler: { report: () => commandSuccess({ stdout: "# Report" }) },
			expectedMessage: /report --format markdown success stdout missing final newline/,
		},
	];

	for (const { argv, handler, expectedMessage } of cases) {
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runAnchormap(argv, {
			stdout: stdout.writer,
			stderr: stderr.writer,
			handlers: handler,
		});

		assert.equal(exitCode, 1, argv.join(" "));
		assert.equal(stdout.read(), "", argv.join(" "));
		assert.match(stderr.read(), expectedMessage, argv.join(" "));
	}
});

test("rejects unsupported artifact command options and combinations before dispatch", () => {
	const cases: readonly (readonly string[])[] = [
		["check", "--policy", "policy.yaml", "--unknown"],
		["check", "--policy", "policy.yaml", "--json", "--json"],
		["check", "--scan", "", "--policy", "policy.yaml"],
		["diff", "--base", "base.json"],
		["diff", "--base", "base.json", "--head", "head.json", "--json", "value"],
		["explain", "--scan", "scan.json"],
		["explain", "--anchor", "FR-014", "--file", "src/index.ts", "--scan", "scan.json"],
		["report", "--scan", "scan.json", "--format", "html"],
		["report", "--format", "markdown"],
		["report", "--scan", "scan.json", "--check", "", "--format", "markdown"],
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

		assert.equal(exitCode, 4, argv.join(" "));
		assert.equal(stdout.read(), "", argv.join(" "));
		assert.notEqual(stderr.read(), "", argv.join(" "));
		assert.deepEqual(calls, [], argv.join(" "));
	}
});

test("artifact commands fail invalid scan artifacts as usage errors with empty stdout", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "artifacts"));
		writeFileSync(join(cwd, "artifacts", "valid.json"), minimalScanArtifactJson());
		writeFileSync(join(cwd, "artifacts", "invalid.json"), '{"schema_version":4,"extra":true}\n');

		const cases: readonly (readonly string[])[] = [
			["diff", "--base", "artifacts/invalid.json", "--head", "artifacts/valid.json", "--json"],
			["diff", "--base", "artifacts/valid.json", "--head", "artifacts/invalid.json", "--json"],
			["explain", "--anchor", "FR-014", "--scan", "artifacts/invalid.json", "--json"],
			["report", "--scan", "artifacts/invalid.json", "--format", "markdown"],
		];

		for (const argv of cases) {
			const stdout = createBufferingWriter();
			const stderr = createBufferingWriter();

			const exitCode = runAnchormap(argv, {
				cwd,
				stdout: stdout.writer,
				stderr: stderr.writer,
			});

			assert.equal(exitCode, 4, argv.join(" "));
			assert.equal(stdout.read(), "", argv.join(" "));
			assert.notEqual(stderr.read(), "", argv.join(" "));
		}
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
