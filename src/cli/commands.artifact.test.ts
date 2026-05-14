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

test("check artifact mode evaluates policy pass and fail with machine stdout", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "artifacts"));
		writeFileSync(join(cwd, "artifacts", "pass.json"), minimalScanArtifactJson());
		writeFileSync(join(cwd, "artifacts", "fail.json"), untracedScanArtifactJson());
		writeFileSync(
			join(cwd, "policy.yaml"),
			[
				"version: 1",
				"fail_on:",
				"  finding_kinds:",
				"    - untraced_product_file",
				"thresholds:",
				"  min_covered_product_file_percent: 100",
				"  max_untraced_product_files: 0",
				"",
			].join("\n"),
		);

		const pass = runCheck(cwd, [
			"check",
			"--scan",
			"artifacts/pass.json",
			"--policy",
			"policy.yaml",
			"--json",
		]);
		assert.equal(pass.exitCode, 0);
		assert.equal(pass.stderr, "");
		assert.equal(
			pass.stdout,
			'{"schema_version":1,"decision":"pass","source_scan_schema_version":4,"analysis_health":"clean","violations":[],"summary":{"observed_anchor_count":0,"usable_mapping_count":0,"product_file_count":0,"covered_product_file_count":0,"uncovered_product_file_count":0,"covered_product_file_percent":100,"untraced_product_file_count":0}}\n',
		);

		const fail = runCheck(cwd, [
			"check",
			"--scan",
			"artifacts/fail.json",
			"--policy",
			"policy.yaml",
			"--json",
		]);
		assert.equal(fail.exitCode, 5);
		assert.equal(fail.stderr, "");
		assert.equal(
			fail.stdout,
			'{"schema_version":1,"decision":"fail","source_scan_schema_version":4,"analysis_health":"clean","violations":[{"kind":"covered_product_file_percent_below_threshold","actual":0,"threshold":100},{"kind":"finding_kind_present","finding_kind":"untraced_product_file","count":1},{"kind":"untraced_product_files_above_threshold","actual":1,"threshold":0}],"summary":{"observed_anchor_count":0,"usable_mapping_count":0,"product_file_count":1,"covered_product_file_count":0,"uncovered_product_file_count":1,"covered_product_file_percent":0,"untraced_product_file_count":1}}\n',
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("check validates policy before loading scan artifacts", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "artifacts"));
		writeFileSync(join(cwd, "artifacts", "invalid.json"), '{"schema_version":4,"extra":true}\n');
		writeFileSync(join(cwd, "invalid-policy.yaml"), "version: 2\n");

		const result = runCheck(cwd, [
			"check",
			"--scan",
			"artifacts/invalid.json",
			"--policy",
			"invalid-policy.yaml",
			"--json",
		]);

		assert.equal(result.exitCode, 4);
		assert.equal(result.stdout, "");
		assert.match(result.stderr, /policy\.version must be 1|--policy\.version must be 1/);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

function runCheck(
	cwd: string,
	argv: readonly string[],
): { exitCode: number; stdout: string; stderr: string } {
	const stdout = createBufferingWriter();
	const stderr = createBufferingWriter();
	const exitCode = runAnchormap(argv, {
		cwd,
		stdout: stdout.writer,
		stderr: stderr.writer,
	});

	return { exitCode, stdout: stdout.read(), stderr: stderr.read() };
}

function untracedScanArtifactJson(): string {
	const scan = JSON.parse(minimalScanArtifactJson());
	scan.files = {
		"src/uncovered.ts": {
			covering_anchor_ids: [],
			supported_local_targets: [],
		},
	};
	scan.traceability_metrics.summary.product_file_count = 1;
	scan.traceability_metrics.summary.uncovered_product_file_count = 1;
	scan.findings = [{ kind: "untraced_product_file", path: "src/uncovered.ts" }];
	return `${JSON.stringify(scan)}\n`;
}
