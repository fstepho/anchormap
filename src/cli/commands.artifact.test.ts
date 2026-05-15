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
		{
			argv: [
				"bundle",
				"--scan",
				"./artifacts/scan.json",
				"--check",
				"check.json",
				"--diff",
				"diff.json",
				"--metadata",
				"metadata.json",
				"--json",
			],
			expectedCall:
				"bundle:--scan ./artifacts/scan.json --check check.json --diff diff.json --metadata metadata.json --json:scan=artifacts/scan.json:check=check.json:diff=diff.json:metadata=metadata.json:json=true",
			expectedStdout: "{}\n",
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
		{
			argv: [
				"bundle",
				"--scan",
				"scan.json",
				"--check",
				"check.json",
				"--diff",
				"diff.json",
				"--metadata",
				"metadata.json",
				"--json",
			],
			handler: { bundle: () => commandSuccess({ stdout: "{}\nextra\n" }) },
			expectedMessage: /bundle --json success stdout is not a single physical line/,
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
		["bundle", "--scan", "scan.json", "--check", "check.json", "--diff", "diff.json", "--json"],
		[
			"bundle",
			"--scan",
			"scan.json",
			"--check",
			"check.json",
			"--diff",
			"diff.json",
			"--metadata",
			"metadata.json",
		],
		[
			"bundle",
			"--scan",
			"scan.json",
			"--check",
			"check.json",
			"--diff",
			"diff.json",
			"--metadata",
			"metadata.json",
			"--json",
			"value",
		],
		[
			"bundle",
			"--scan",
			"scan.json",
			"--check",
			"",
			"--diff",
			"diff.json",
			"--metadata",
			"metadata.json",
			"--json",
		],
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

test("report artifact mode renders markdown from explicit artifacts", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "artifacts"));
		writeFileSync(join(cwd, "artifacts", "scan.json"), minimalScanArtifactJson());

		const result = runCommand(cwd, [
			"report",
			"--scan",
			"artifacts/scan.json",
			"--format",
			"markdown",
		]);

		assert.equal(result.exitCode, 0);
		assert.equal(result.stderr, "");
		assert.equal(
			result.stdout,
			[
				"# AnchorMap traceability report",
				"",
				"## Summary",
				"- Analysis health: clean",
				"- Observed anchors: 0",
				"- Usable mappings: 0",
				"- Covered product files: 0/0 (100%)",
				"- Findings: 0",
				"",
				"## Findings",
				"- none",
				"",
			].join("\n"),
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("report rejects invalid optional check and diff artifacts with empty stdout", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "artifacts"));
		writeFileSync(join(cwd, "artifacts", "scan.json"), minimalScanArtifactJson());
		writeFileSync(join(cwd, "artifacts", "invalid.json"), '{"schema_version":1,"extra":true}\n');

		const check = runCommand(cwd, [
			"report",
			"--scan",
			"artifacts/scan.json",
			"--check",
			"artifacts/invalid.json",
			"--format",
			"markdown",
		]);
		assert.equal(check.exitCode, 4);
		assert.equal(check.stdout, "");
		assert.notEqual(check.stderr, "");

		const diff = runCommand(cwd, [
			"report",
			"--scan",
			"artifacts/scan.json",
			"--diff",
			"artifacts/invalid.json",
			"--format",
			"markdown",
		]);
		assert.equal(diff.exitCode, 4);
		assert.equal(diff.stdout, "");
		assert.notEqual(diff.stderr, "");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("bundle artifact mode renders explicit artifacts, metadata, and canonical hashes", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "artifacts"));
		writeFileSync(join(cwd, "artifacts", "scan.json"), minimalScanArtifactJson());
		writeFileSync(join(cwd, "artifacts", "check.json"), minimalPolicyResultJson());
		writeFileSync(join(cwd, "artifacts", "diff.json"), minimalTraceabilityDiffJson());
		writeFileSync(join(cwd, "artifacts", "metadata.json"), bundleMetadataJson());

		const result = runCommand(cwd, [
			"bundle",
			"--scan",
			"artifacts/scan.json",
			"--check",
			"artifacts/check.json",
			"--diff",
			"artifacts/diff.json",
			"--metadata",
			"artifacts/metadata.json",
			"--json",
		]);

		assert.equal(result.exitCode, 0);
		assert.equal(result.stderr, "");
		assert.match(
			result.stdout,
			/^{"schema_version":1,"tool":{"name":"anchormap","version":"1\.2\.1"}/,
		);
		assert.match(result.stdout, /"metadata":{"provider":"github","repository":"owner\/repo"/);
		assert.match(result.stdout, /"artifacts":{"scan":{"schema_version":4/);
		assert.match(result.stdout, /"scan_sha256":"[0-9a-f]{64}"/);
		assert.equal(result.stdout.endsWith("\n"), true);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("bundle rejects invalid metadata or artifacts with empty stdout", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "artifacts"));
		writeFileSync(join(cwd, "artifacts", "scan.json"), minimalScanArtifactJson());
		writeFileSync(join(cwd, "artifacts", "check.json"), minimalPolicyResultJson());
		writeFileSync(join(cwd, "artifacts", "diff.json"), minimalTraceabilityDiffJson());
		writeFileSync(join(cwd, "artifacts", "metadata.json"), bundleMetadataJson());
		writeFileSync(join(cwd, "artifacts", "invalid-metadata.json"), '{"provider":"github"}\n');
		writeFileSync(
			join(cwd, "artifacts", "invalid-check.json"),
			'{"schema_version":1,"extra":true}\n',
		);

		for (const argv of [
			[
				"bundle",
				"--scan",
				"artifacts/scan.json",
				"--check",
				"artifacts/check.json",
				"--diff",
				"artifacts/diff.json",
				"--metadata",
				"artifacts/invalid-metadata.json",
				"--json",
			],
			[
				"bundle",
				"--scan",
				"artifacts/scan.json",
				"--check",
				"artifacts/invalid-check.json",
				"--diff",
				"artifacts/diff.json",
				"--metadata",
				"artifacts/metadata.json",
				"--json",
			],
		] as const) {
			const result = runCommand(cwd, argv);
			assert.equal(result.exitCode, 4, argv.join(" "));
			assert.equal(result.stdout, "", argv.join(" "));
			assert.notEqual(result.stderr, "", argv.join(" "));
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

		const pass = runCommand(cwd, [
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

		const fail = runCommand(cwd, [
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

test("artifact commands accept supported scan schema v4 and v5 inputs", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "artifacts"));
		writeFileSync(join(cwd, "artifacts", "scan-v4.json"), minimalScanArtifactJson(4));
		writeFileSync(join(cwd, "artifacts", "scan-v5.json"), minimalScanArtifactJson(5));
		writeFileSync(join(cwd, "artifacts", "explain-v5.json"), explainScanArtifactJson(5));
		writeFileSync(
			join(cwd, "policy.yaml"),
			[
				"version: 1",
				"fail_on:",
				"  finding_kinds: []",
				"thresholds:",
				"  min_covered_product_file_percent: 100",
				"  max_untraced_product_files: 0",
				"",
			].join("\n"),
		);

		const check = runCommand(cwd, [
			"check",
			"--scan",
			"artifacts/scan-v5.json",
			"--policy",
			"policy.yaml",
			"--json",
		]);
		assert.equal(check.exitCode, 0);
		assert.equal(check.stderr, "");
		assert.match(check.stdout, /"source_scan_schema_version":5/);

		const diffV4V5 = runCommand(cwd, [
			"diff",
			"--base",
			"artifacts/scan-v4.json",
			"--head",
			"artifacts/scan-v5.json",
			"--json",
		]);
		assert.equal(diffV4V5.exitCode, 0);
		assert.equal(diffV4V5.stderr, "");
		assert.match(diffV4V5.stdout, /"base_scan_schema_version":4,"head_scan_schema_version":5/);

		const diffV5V4 = runCommand(cwd, [
			"diff",
			"--base",
			"artifacts/scan-v5.json",
			"--head",
			"artifacts/scan-v4.json",
			"--json",
		]);
		assert.equal(diffV5V4.exitCode, 0);
		assert.equal(diffV5V4.stderr, "");
		assert.match(diffV5V4.stdout, /"base_scan_schema_version":5,"head_scan_schema_version":4/);

		const explain = runCommand(cwd, [
			"explain",
			"--anchor",
			"QA-001",
			"--scan",
			"artifacts/explain-v5.json",
			"--json",
		]);
		assert.equal(explain.exitCode, 0);
		assert.equal(explain.stderr, "");
		assert.match(explain.stdout, /"anchor_id":"QA-001"/);

		const report = runCommand(cwd, [
			"report",
			"--scan",
			"artifacts/scan-v5.json",
			"--format",
			"markdown",
		]);
		assert.equal(report.exitCode, 0);
		assert.equal(report.stderr, "");
		assert.match(report.stdout, /^# AnchorMap traceability report\n/);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("diff artifact mode compares two explicit scans with machine and human output", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "artifacts"));
		writeFileSync(join(cwd, "artifacts", "base.json"), minimalScanArtifactJson());
		writeFileSync(join(cwd, "artifacts", "head.json"), scanWithOneUncoveredFileJson());

		const machine = runCommand(cwd, [
			"diff",
			"--base",
			"artifacts/base.json",
			"--head",
			"artifacts/head.json",
			"--json",
		]);
		assert.equal(machine.exitCode, 0);
		assert.equal(machine.stderr, "");
		assert.equal(
			machine.stdout,
			'{"schema_version":1,"base_scan_schema_version":4,"head_scan_schema_version":4,"comparability":"same_scope","analysis_health_change":{"from":"clean","to":"clean"},"anchors":{"added":[],"removed":[],"mapping_state_changed":[]},"mappings":{"added":[],"removed":[],"state_changed":[]},"files":{"added":["src/uncovered.ts"],"removed":[],"became_covered":[],"lost_coverage":[],"covering_anchor_ids_changed":[],"supported_local_targets_changed":[]},"findings":{"added":[{"kind":"untraced_product_file","path":"src/uncovered.ts"}],"removed":[]},"metrics_delta":{"product_file_count":1,"stored_mapping_count":0,"usable_mapping_count":0,"observed_anchor_count":0,"active_anchor_count":0,"draft_anchor_count":0,"covered_product_file_count":0,"uncovered_product_file_count":1,"directly_seeded_product_file_count":0,"single_cover_product_file_count":0,"multi_cover_product_file_count":0}}\n',
		);

		const human = runCommand(cwd, [
			"diff",
			"--base",
			"artifacts/base.json",
			"--head",
			"artifacts/head.json",
		]);
		assert.equal(human.exitCode, 0);
		assert.equal(human.stderr, "");
		assert.equal(human.stdout, "comparability: same_scope\n");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("explain artifact mode explains anchor and file subjects from one explicit scan", () => {
	const cwd = createTempRepo();
	try {
		mkdirSync(join(cwd, "artifacts"));
		writeFileSync(join(cwd, "artifacts", "scan.json"), explainScanArtifactJson());

		const anchor = runCommand(cwd, [
			"explain",
			"--anchor",
			"QA-001",
			"--scan",
			"artifacts/scan.json",
			"--json",
		]);
		assert.equal(anchor.exitCode, 0);
		assert.equal(anchor.stderr, "");
		assert.equal(
			anchor.stdout,
			'{"schema_version":1,"subject":{"kind":"anchor","anchor_id":"QA-001"},"observed":{"present":true,"spec_path":"specs/requirements.md","mapping_state":"usable"},"mapping":{"present":true,"state":"usable","seed_files":["src/root.ts"],"reached_file_count":2},"file":null,"coverage":{"reached_files":[{"path":"src/leaf.ts","path_from_seed":["src/root.ts","src/leaf.ts"]},{"path":"src/root.ts","path_from_seed":["src/root.ts"]}]},"findings":[]}\n',
		);

		const file = runCommand(cwd, [
			"explain",
			"--file",
			"src/leaf.ts",
			"--scan",
			"artifacts/scan.json",
			"--json",
		]);
		assert.equal(file.exitCode, 0);
		assert.equal(file.stderr, "");
		assert.equal(
			file.stdout,
			'{"schema_version":1,"subject":{"kind":"file","path":"src/leaf.ts"},"observed":null,"mapping":null,"file":{"present":true,"covering_anchor_ids":["QA-001","QA-002"],"supported_local_targets":[]},"coverage":{"covered":true,"single_cover":false,"multi_cover":true},"findings":[]}\n',
		);

		const human = runCommand(cwd, [
			"explain",
			"--file",
			"src/leaf.ts",
			"--scan",
			"artifacts/scan.json",
		]);
		assert.equal(human.exitCode, 0);
		assert.equal(human.stderr, "");
		assert.equal(human.stdout, "file: src/leaf.ts\npresent: true\ncovered: true\n");
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

		const result = runCommand(cwd, [
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

function runCommand(
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
	return scanWithOneUncoveredFileJson();
}

function scanWithOneUncoveredFileJson(): string {
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

function explainScanArtifactJson(schemaVersion: 4 | 5 = 4): string {
	const scan = JSON.parse(minimalScanArtifactJson(schemaVersion));
	scan.observed_anchors = {
		"QA-001": {
			spec_path: "specs/requirements.md",
			mapping_state: "usable",
			...(schemaVersion === 5
				? {
						source: {
							kind: "markdown_atx_heading",
							line: 1,
							column: 3,
							heading_level: 1,
						},
					}
				: {}),
		},
	};
	scan.stored_mappings = {
		"QA-001": {
			state: "usable",
			seed_files: ["src/root.ts"],
			reached_files: ["src/root.ts", "src/leaf.ts"],
		},
	};
	scan.files = {
		"src/root.ts": {
			covering_anchor_ids: ["QA-001"],
			supported_local_targets: ["src/leaf.ts"],
		},
		"src/leaf.ts": {
			covering_anchor_ids: ["QA-002", "QA-001"],
			supported_local_targets: [],
		},
	};
	scan.traceability_metrics.summary.product_file_count = 2;
	scan.traceability_metrics.summary.stored_mapping_count = 1;
	scan.traceability_metrics.summary.usable_mapping_count = 1;
	scan.traceability_metrics.summary.observed_anchor_count = 1;
	scan.traceability_metrics.summary.active_anchor_count = 1;
	scan.traceability_metrics.summary.covered_product_file_count = 2;
	scan.traceability_metrics.summary.directly_seeded_product_file_count = 1;
	scan.traceability_metrics.summary.single_cover_product_file_count = 1;
	scan.traceability_metrics.summary.multi_cover_product_file_count = 1;
	scan.traceability_metrics.anchors = {
		"QA-001": {
			seed_file_count: 1,
			direct_seed_file_count: 1,
			reached_file_count: 2,
			transitive_reached_file_count: 1,
			unique_reached_file_count: 1,
			shared_reached_file_count: 1,
		},
	};
	return `${JSON.stringify(scan)}\n`;
}

function minimalPolicyResultJson(): string {
	return [
		'{"schema_version":1,"decision":"pass","source_scan_schema_version":4,"analysis_health":"clean",',
		'"violations":[],"summary":{"observed_anchor_count":0,"usable_mapping_count":0,',
		'"product_file_count":0,"covered_product_file_count":0,"uncovered_product_file_count":0,',
		'"covered_product_file_percent":100,"untraced_product_file_count":0}}\n',
	].join("");
}

function minimalTraceabilityDiffJson(): string {
	return [
		'{"schema_version":1,"base_scan_schema_version":4,"head_scan_schema_version":4,',
		'"comparability":"same_scope","analysis_health_change":{"from":"clean","to":"clean"},',
		'"anchors":{"added":[],"removed":[],"mapping_state_changed":[]},',
		'"mappings":{"added":[],"removed":[],"state_changed":[]},',
		'"files":{"added":[],"removed":[],"became_covered":[],"lost_coverage":[],',
		'"covering_anchor_ids_changed":[],"supported_local_targets_changed":[]},',
		'"findings":{"added":[],"removed":[]},"metrics_delta":{"product_file_count":0,',
		'"stored_mapping_count":0,"usable_mapping_count":0,"observed_anchor_count":0,',
		'"active_anchor_count":0,"draft_anchor_count":0,"covered_product_file_count":0,',
		'"uncovered_product_file_count":0,"directly_seeded_product_file_count":0,',
		'"single_cover_product_file_count":0,"multi_cover_product_file_count":0}}\n',
	].join("");
}

function bundleMetadataJson(): string {
	return [
		"{",
		'"provider":"github",',
		'"repository":"owner/repo",',
		'"commit":"abc123",',
		'"branch":"main",',
		'"pull_request":7,',
		'"run_url":"https://ci.example/run/7"',
		"}\n",
	].join("");
}
