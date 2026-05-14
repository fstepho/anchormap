import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";

import {
	cleanNodeEnv,
	REPO_ROOT,
	VERIFY_INSTALLED_ARTIFACT_PATH,
} from "./package-scripts-test-support";

test("installed artifact verifier archives smoke command failures before exiting", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-installed-artifact-failure-test-"));
	const fakeBinDir = join(tempDir, "bin");
	const fakeNpmPath = join(fakeBinDir, "npm");
	const initYaml = `version: 1
product_root: 'src'
spec_roots:
  - 'specs'
mappings: {}
`;

	try {
		mkdirSync(fakeBinDir);
		writeFileSync(
			fakeNpmPath,
			`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const packageFiles = [
	{ path: "bin/anchormap" },
	{ path: "dist/anchormap.js" },
	{ path: "npm-shrinkwrap.json" },
	{ path: "package.json" },
];

function writeExecutable(filePath, contents) {
	fs.writeFileSync(filePath, contents, "utf8");
	fs.chmodSync(filePath, 0o755);
}

if (process.argv[2] === "pack") {
	const destination = process.argv[process.argv.indexOf("--pack-destination") + 1];
	fs.mkdirSync(destination, { recursive: true });
	fs.writeFileSync(path.join(destination, "anchormap-1.0.0.tgz"), "");
	process.stdout.write(JSON.stringify([{
		id: "anchormap@1.0.0",
		name: "anchormap",
		version: "1.0.0",
		filename: "anchormap-1.0.0.tgz",
		integrity: "sha512-test",
		shasum: "test",
		files: packageFiles,
	}]) + "\\n");
	process.exit(0);
}

if (process.argv[2] === "install") {
	const packageDir = path.join(process.cwd(), "node_modules", "anchormap");
	const binDir = path.join(process.cwd(), "node_modules", ".bin");
	fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });
	fs.mkdirSync(path.join(packageDir, "dist"), { recursive: true });
	fs.mkdirSync(binDir, { recursive: true });
	fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
		name: "anchormap",
		version: "1.0.0",
	}), "utf8");
	fs.writeFileSync(path.join(packageDir, "npm-shrinkwrap.json"), "{}\\n", "utf8");
	fs.writeFileSync(path.join(packageDir, "dist", "anchormap.js"), "module.exports = {};\\n", "utf8");
writeExecutable(path.join(packageDir, "bin", "anchormap"), ${JSON.stringify(`#!/bin/sh
maybe_fail() {
	if [ "\${ANCHORMAP_FAKE_FAIL_COMMAND:-}" = "$1" ]; then
		printf '%s stdout\\n' "$1"
		printf '%s stderr\\n' "$1" >&2
		exit 9
	fi
}

case "$1" in
	init)
		maybe_fail init
		cat > anchormap.yaml <<'YAML'
${initYaml}YAML
		exit 0
		;;
	map)
		maybe_fail map
		exit 0
		;;
	scan)
		maybe_fail scan
		printf '{"fake":true}\\n'
		exit 0
		;;
esac
exit 4
`)});
	fs.symlinkSync("../anchormap/bin/anchormap", path.join(binDir, "anchormap"));
	fs.writeFileSync(path.join(process.cwd(), "package-lock.json"), "{}\\n", "utf8");
	process.exit(0);
}

process.stderr.write("unexpected fake npm invocation: " + process.argv.slice(2).join(" ") + "\\n");
process.exit(1);
`,
			"utf8",
		);
		chmodSync(fakeNpmPath, 0o755);

		const cases = [
			{
				failCommand: "init",
				reportCommand: "init",
				exitCheck: "init_exit_zero",
			},
			{
				failCommand: "map",
				reportCommand: "map",
				exitCheck: "map_exit_zero",
			},
			{
				failCommand: "scan",
				reportCommand: "scan_json",
				exitCheck: "scan_json_exit_zero",
			},
		];

		for (const smokeCase of cases) {
			const caseReportPath = join(tempDir, `${smokeCase.failCommand}-report.json`);
			const result = spawnSync(
				process.execPath,
				[VERIFY_INSTALLED_ARTIFACT_PATH, "--report", caseReportPath],
				{
					cwd: REPO_ROOT,
					encoding: "utf8",
					env: cleanNodeEnv({
						ANCHORMAP_FAKE_FAIL_COMMAND: smokeCase.failCommand,
						PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
					}),
				},
			);

			assert.equal(result.status, 1);
			assert.match(result.stderr, /installed artifact verification failed/);
			assert.equal(existsSync(caseReportPath), true);

			const report = JSON.parse(readFileSync(caseReportPath, "utf8")) as {
				verdict: string;
				commands: Record<
					string,
					{
						status: number;
						stdout: string;
						stderr: string;
						anchormap_yaml?: string | null;
					}
				>;
				checks: Record<string, boolean>;
			};
			const commandReport = report.commands[smokeCase.reportCommand];

			assert.equal(report.verdict, "fail");
			assert.equal(commandReport.status, 9);
			assert.equal(commandReport.stdout, `${smokeCase.failCommand} stdout\n`);
			assert.equal(commandReport.stderr, `${smokeCase.failCommand} stderr\n`);
			assert.equal(report.checks[smokeCase.exitCheck], false);
			if (smokeCase.failCommand === "map") {
				assert.equal(commandReport.anchormap_yaml, initYaml);
			}
		}
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("installed artifact verifier reports install and bin-linkage failures with cleanup", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-installed-artifact-linkage-test-"));
	const fakeBinDir = join(tempDir, "bin");
	const fakeNpmPath = join(fakeBinDir, "npm");
	const verifierTmpDir = join(tempDir, "verifier-tmp");

	try {
		mkdirSync(fakeBinDir);
		mkdirSync(verifierTmpDir);
		writeFileSync(
			fakeNpmPath,
			`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const packageFiles = [
	{ path: "bin/anchormap" },
	{ path: "dist/anchormap.js" },
	{ path: "npm-shrinkwrap.json" },
	{ path: "package.json" },
];

if (process.argv[2] === "pack") {
	const destination = process.argv[process.argv.indexOf("--pack-destination") + 1];
	fs.mkdirSync(destination, { recursive: true });
	fs.writeFileSync(path.join(destination, "anchormap-1.0.0.tgz"), "");
	process.stdout.write(JSON.stringify([{
		id: "anchormap@1.0.0",
		name: "anchormap",
		version: "1.0.0",
		filename: "anchormap-1.0.0.tgz",
		integrity: "sha512-test",
		shasum: "test",
		files: packageFiles,
	}]) + "\\n");
	process.exit(0);
}

if (process.argv[2] === "install") {
	if (process.env.ANCHORMAP_FAKE_INSTALL_FAIL === "1") {
		process.stdout.write("install stdout\\n");
		process.stderr.write("install stderr\\n");
		process.exit(42);
	}

	const packageDir = path.join(process.cwd(), "node_modules", "anchormap");
	const binDir = path.join(process.cwd(), "node_modules", ".bin");
	fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });
	fs.mkdirSync(path.join(packageDir, "dist"), { recursive: true });
	fs.mkdirSync(binDir, { recursive: true });
	fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
		name: "anchormap",
		version: "1.0.0",
	}), "utf8");
	fs.writeFileSync(path.join(packageDir, "npm-shrinkwrap.json"), "{}\\n", "utf8");
	fs.writeFileSync(path.join(packageDir, "dist", "anchormap.js"), "module.exports = {};\\n", "utf8");
	fs.writeFileSync(path.join(packageDir, "bin", "anchormap"), "#!/bin/sh\\nexit 0\\n", "utf8");
	if (process.env.ANCHORMAP_FAKE_MISSING_BIN_LINK !== "1") {
		if (process.env.ANCHORMAP_FAKE_PREFIX_SHARING_BIN_LINK === "1") {
			const siblingPackageDir = path.join(process.cwd(), "node_modules", "anchormap-copy", "anchormap");
			fs.mkdirSync(path.join(siblingPackageDir, "bin"), { recursive: true });
			fs.writeFileSync(path.join(siblingPackageDir, "bin", "anchormap"), "#!/bin/sh\\nexit 0\\n", "utf8");
			fs.symlinkSync("../anchormap-copy/anchormap/bin/anchormap", path.join(binDir, "anchormap"));
		} else {
			fs.symlinkSync("../anchormap/bin/anchormap", path.join(binDir, "anchormap"));
		}
	}
	fs.writeFileSync(path.join(process.cwd(), "package-lock.json"), "{}\\n", "utf8");
	process.exit(0);
}

process.stderr.write("unexpected fake npm invocation: " + process.argv.slice(2).join(" ") + "\\n");
process.exit(1);
`,
			"utf8",
		);
		chmodSync(fakeNpmPath, 0o755);

		const cases = [
			{
				name: "install-failure",
				env: { ANCHORMAP_FAKE_INSTALL_FAIL: "1" },
				assertReport(report: {
					consumer_install: { status: number; stdout: string; stderr: string };
					installed_binary: { present: boolean };
					commands: { init: unknown };
					checks: Record<string, boolean>;
				}) {
					assert.equal(report.consumer_install.status, 42);
					assert.equal(report.consumer_install.stdout, "install stdout\n");
					assert.equal(report.consumer_install.stderr, "install stderr\n");
					assert.equal(report.checks.consumer_install_exit_zero, false);
					assert.equal(report.installed_binary.present, false);
					assert.equal(report.commands.init, null);
				},
			},
			{
				name: "missing-bin",
				env: { ANCHORMAP_FAKE_MISSING_BIN_LINK: "1" },
				assertReport(report: {
					consumer_install: { status: number; stdout: string; stderr: string };
					installed_binary: { present: boolean; link_target: string | null };
					commands: { init: unknown };
					checks: Record<string, boolean>;
				}) {
					assert.equal(report.consumer_install.status, 0);
					assert.equal(report.checks.installed_binary_present, false);
					assert.equal(report.checks.bin_resolves_to_installed_package, false);
					assert.equal(report.installed_binary.present, false);
					assert.equal(report.installed_binary.link_target, null);
					assert.equal(report.commands.init, null);
				},
			},
			{
				name: "prefix-sharing-bin",
				env: { ANCHORMAP_FAKE_PREFIX_SHARING_BIN_LINK: "1" },
				assertReport(report: {
					consumer_install: { status: number; stdout: string; stderr: string };
					installed_binary: { present: boolean; link_target: string | null };
					checks: Record<string, boolean>;
				}) {
					assert.equal(report.consumer_install.status, 0);
					assert.equal(report.installed_binary.present, true);
					assert.equal(
						report.installed_binary.link_target,
						"../anchormap-copy/anchormap/bin/anchormap",
					);
					assert.equal(report.checks.bin_resolves_to_installed_package, false);
					assert.equal(report.checks.bin_points_at_release_launcher, false);
				},
			},
		];

		for (const failureCase of cases) {
			const caseReportPath = join(tempDir, `${failureCase.name}-report.json`);
			const result = spawnSync(
				process.execPath,
				[VERIFY_INSTALLED_ARTIFACT_PATH, "--report", caseReportPath],
				{
					cwd: REPO_ROOT,
					encoding: "utf8",
					env: cleanNodeEnv({
						...failureCase.env,
						PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
						TMPDIR: verifierTmpDir,
					}),
				},
			);

			assert.equal(result.status, 1);
			assert.match(result.stderr, /installed artifact verification failed/);
			assert.equal(existsSync(caseReportPath), true);
			assert.deepEqual(
				readdirSync(verifierTmpDir).filter((entry) =>
					entry.startsWith("anchormap-installed-artifact-"),
				),
				[],
			);

			const report = JSON.parse(readFileSync(caseReportPath, "utf8")) as {
				verdict: string;
				consumer_install: { status: number; stdout: string; stderr: string };
				installed_binary: { present: boolean; link_target: string | null };
				commands: { init: unknown };
				checks: Record<string, boolean>;
			};
			assert.equal(report.verdict, "fail");
			failureCase.assertReport(report);
		}
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("installed artifact verifier rejects inherited NODE_OPTIONS before artifact commands", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-installed-artifact-node-options-test-"));
	const reportPath = join(tempDir, "node-options-report.json");

	try {
		const result = spawnSync(
			process.execPath,
			[VERIFY_INSTALLED_ARTIFACT_PATH, "--report", reportPath],
			{
				cwd: REPO_ROOT,
				encoding: "utf8",
				env: cleanNodeEnv({
					NODE_OPTIONS: "--trace-warnings",
				}),
			},
		);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /NODE_OPTIONS must be unset for installed artifact verification/);
		assert.equal(existsSync(reportPath), true);

		const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
			verdict: string;
			environment: {
				node_options_inherited: boolean;
				node_options_rejected: boolean;
			};
			pack: unknown;
			consumer_install: unknown;
			checks: Record<string, boolean>;
		};

		assert.equal(report.verdict, "fail");
		assert.deepEqual(report.environment, {
			node_options_inherited: true,
			node_options_rejected: true,
		});
		assert.equal(report.pack, null);
		assert.equal(report.consumer_install, null);
		assert.equal(report.checks.node_options_unset, false);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("installed artifact verifier strips NODE_PATH from install and smoke command environments", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-installed-artifact-node-path-test-"));
	const fakeBinDir = join(tempDir, "bin");
	const fakeNpmPath = join(fakeBinDir, "npm");
	const externalNodePathDir = join(tempDir, "external-node-path");
	const reportPath = join(tempDir, "node-path-report.json");
	const initYaml = `version: 1
product_root: 'src'
spec_roots:
  - 'specs'
mappings: {}
`;
	const mappedYaml = `version: 1
product_root: 'src'
spec_roots:
  - 'specs'
mappings:
  'AM-001':
    seed_files:
      - 'src/index.ts'
`;
	const scanJson = `${JSON.stringify({
		schema_version: 4,
		config: {
			version: 1,
			product_root: "src",
			spec_roots: ["specs"],
			ignore_roots: [],
			tsconfig_path: null,
			local_aliases: [],
		},
		analysis_health: "clean",
		observed_anchors: {
			"AM-001": {
				spec_path: "specs/requirements.md",
				mapping_state: "usable",
			},
		},
		stored_mappings: {
			"AM-001": {
				state: "usable",
				seed_files: ["src/index.ts"],
				reached_files: ["src/index.ts"],
			},
		},
		files: {
			"src/index.ts": {
				covering_anchor_ids: ["AM-001"],
				supported_local_targets: [],
			},
		},
		traceability_metrics: {
			summary: {
				product_file_count: 1,
				stored_mapping_count: 1,
				usable_mapping_count: 1,
				observed_anchor_count: 1,
				active_anchor_count: 1,
				draft_anchor_count: 0,
				covered_product_file_count: 1,
				uncovered_product_file_count: 0,
				directly_seeded_product_file_count: 1,
				single_cover_product_file_count: 1,
				multi_cover_product_file_count: 0,
			},
			anchors: {
				"AM-001": {
					seed_file_count: 1,
					direct_seed_file_count: 1,
					reached_file_count: 1,
					transitive_reached_file_count: 0,
					unique_reached_file_count: 1,
					shared_reached_file_count: 0,
				},
			},
		},
		findings: [],
	})}\n`;

	try {
		mkdirSync(fakeBinDir);
		mkdirSync(externalNodePathDir);
		writeFileSync(
			join(externalNodePathDir, "anchormap-node-path-sentinel.js"),
			"module.exports = true;\n",
			"utf8",
		);
		writeFileSync(
			fakeNpmPath,
			`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

if (process.env.NODE_PATH !== undefined) {
	process.stderr.write("NODE_PATH leaked into npm command\\n");
	process.exit(66);
}

const packageFiles = [
	{ path: "bin/anchormap" },
	{ path: "dist/anchormap.js" },
	{ path: "npm-shrinkwrap.json" },
	{ path: "package.json" },
];

function writeExecutable(filePath, contents) {
	fs.writeFileSync(filePath, contents, "utf8");
	fs.chmodSync(filePath, 0o755);
}

if (process.argv[2] === "pack") {
	const destination = process.argv[process.argv.indexOf("--pack-destination") + 1];
	fs.mkdirSync(destination, { recursive: true });
	fs.writeFileSync(path.join(destination, "anchormap-1.0.0.tgz"), "");
	process.stdout.write(JSON.stringify([{
		id: "anchormap@1.0.0",
		name: "anchormap",
		version: "1.0.0",
		filename: "anchormap-1.0.0.tgz",
		integrity: "sha512-test",
		shasum: "test",
		files: packageFiles,
	}]) + "\\n");
	process.exit(0);
}

if (process.argv[2] === "install") {
	const packageDir = path.join(process.cwd(), "node_modules", "anchormap");
	const binDir = path.join(process.cwd(), "node_modules", ".bin");
	fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });
	fs.mkdirSync(path.join(packageDir, "dist"), { recursive: true });
	fs.mkdirSync(binDir, { recursive: true });
	fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
		name: "anchormap",
		version: "1.0.0",
	}), "utf8");
	fs.writeFileSync(path.join(packageDir, "npm-shrinkwrap.json"), "{}\\n", "utf8");
	fs.writeFileSync(path.join(packageDir, "dist", "anchormap.js"), "module.exports = {};\\n", "utf8");
writeExecutable(path.join(packageDir, "bin", "anchormap"), ${JSON.stringify(`#!/usr/bin/env node
const fs = require("node:fs");

if (process.env.NODE_PATH !== undefined) {
	process.stderr.write("NODE_PATH leaked into smoke command\\n");
	process.exit(67);
}
try {
	require("anchormap-node-path-sentinel");
	process.stderr.write("NODE_PATH module resolution contaminated smoke command\\n");
	process.exit(68);
} catch (error) {
	if (!error || error.code !== "MODULE_NOT_FOUND") {
		throw error;
	}
}

if (process.argv[2] === "init") {
	fs.writeFileSync("anchormap.yaml", ${JSON.stringify(initYaml)}, "utf8");
	process.exit(0);
}
if (process.argv[2] === "map") {
	fs.writeFileSync("anchormap.yaml", ${JSON.stringify(mappedYaml)}, "utf8");
	process.exit(0);
}
if (process.argv[2] === "scan" && process.argv[3] === "--json") {
	process.stdout.write(${JSON.stringify(scanJson)});
	process.exit(0);
}
process.exit(4);
`)});
	fs.symlinkSync("../anchormap/bin/anchormap", path.join(binDir, "anchormap"));
	fs.writeFileSync(path.join(process.cwd(), "package-lock.json"), "{}\\n", "utf8");
	process.exit(0);
}

process.stderr.write("unexpected fake npm invocation: " + process.argv.slice(2).join(" ") + "\\n");
process.exit(1);
`,
			"utf8",
		);
		chmodSync(fakeNpmPath, 0o755);

		const result = spawnSync(
			process.execPath,
			[VERIFY_INSTALLED_ARTIFACT_PATH, "--report", reportPath],
			{
				cwd: REPO_ROOT,
				encoding: "utf8",
				env: cleanNodeEnv({
					NODE_PATH: externalNodePathDir,
					PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
				}),
			},
		);

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /installed artifact verification passed/);
		assert.equal(existsSync(reportPath), true);

		const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
			verdict: string;
			pack: { status: number };
			consumer_install: { status: number };
			commands: {
				init: { status: number; stderr: string };
				map: { status: number; stderr: string };
				scan_json: { status: number; stderr: string };
			};
			checks: Record<string, boolean>;
		};

		assert.equal(report.verdict, "pass");
		assert.equal(report.pack.status, 0);
		assert.equal(report.consumer_install.status, 0);
		assert.equal(report.commands.init.status, 0);
		assert.equal(report.commands.map.status, 0);
		assert.equal(report.commands.scan_json.status, 0);
		assert.equal(report.commands.init.stderr, "");
		assert.equal(report.commands.map.stderr, "");
		assert.equal(report.commands.scan_json.stderr, "");
		assert.equal(Object.values(report.checks).every(Boolean), true);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("installed artifact verifier ignores nested dependency TypeScript while rejecting package-owned source", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-installed-artifact-source-test-"));
	const fakeBinDir = join(tempDir, "bin");
	const fakeNpmPath = join(fakeBinDir, "npm");
	const initYaml = `version: 1
product_root: 'src'
spec_roots:
  - 'specs'
mappings: {}
`;
	const mappedYaml = `version: 1
product_root: 'src'
spec_roots:
  - 'specs'
mappings:
  'AM-001':
    seed_files:
      - 'src/index.ts'
`;
	const scanJson = `${JSON.stringify({
		schema_version: 4,
		config: {
			version: 1,
			product_root: "src",
			spec_roots: ["specs"],
			ignore_roots: [],
			tsconfig_path: null,
			local_aliases: [],
		},
		analysis_health: "clean",
		observed_anchors: {
			"AM-001": {
				spec_path: "specs/requirements.md",
				mapping_state: "usable",
			},
		},
		stored_mappings: {
			"AM-001": {
				state: "usable",
				seed_files: ["src/index.ts"],
				reached_files: ["src/index.ts"],
			},
		},
		files: {
			"src/index.ts": {
				covering_anchor_ids: ["AM-001"],
				supported_local_targets: [],
			},
		},
		traceability_metrics: {
			summary: {
				product_file_count: 1,
				stored_mapping_count: 1,
				usable_mapping_count: 1,
				observed_anchor_count: 1,
				active_anchor_count: 1,
				draft_anchor_count: 0,
				covered_product_file_count: 1,
				uncovered_product_file_count: 0,
				directly_seeded_product_file_count: 1,
				single_cover_product_file_count: 1,
				multi_cover_product_file_count: 0,
			},
			anchors: {
				"AM-001": {
					seed_file_count: 1,
					direct_seed_file_count: 1,
					reached_file_count: 1,
					transitive_reached_file_count: 0,
					unique_reached_file_count: 1,
					shared_reached_file_count: 0,
				},
			},
		},
		findings: [],
	})}\n`;

	try {
		mkdirSync(fakeBinDir);
		writeFileSync(
			fakeNpmPath,
			`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const packageFiles = [
	{ path: "bin/anchormap" },
	{ path: "dist/anchormap.js" },
	{ path: "npm-shrinkwrap.json" },
	{ path: "package.json" },
];

function writeExecutable(filePath, contents) {
	fs.writeFileSync(filePath, contents, "utf8");
	fs.chmodSync(filePath, 0o755);
}

if (process.argv[2] === "pack") {
	const destination = process.argv[process.argv.indexOf("--pack-destination") + 1];
	fs.mkdirSync(destination, { recursive: true });
	fs.writeFileSync(path.join(destination, "anchormap-1.0.0.tgz"), "");
	process.stdout.write(JSON.stringify([{
		id: "anchormap@1.0.0",
		name: "anchormap",
		version: "1.0.0",
		filename: "anchormap-1.0.0.tgz",
		integrity: "sha512-test",
		shasum: "test",
		files: packageFiles,
	}]) + "\\n");
	process.exit(0);
}

if (process.argv[2] === "install") {
	const packageDir = path.join(process.cwd(), "node_modules", "anchormap");
	const binDir = path.join(process.cwd(), "node_modules", ".bin");
	fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });
	fs.mkdirSync(path.join(packageDir, "dist"), { recursive: true });
	fs.mkdirSync(path.join(packageDir, "node_modules", "typescript", "lib"), { recursive: true });
	fs.mkdirSync(path.join(packageDir, "node_modules", "nested-dep", "src"), { recursive: true });
	fs.mkdirSync(binDir, { recursive: true });
	fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
		name: "anchormap",
		version: "1.0.0",
	}), "utf8");
	fs.writeFileSync(path.join(packageDir, "npm-shrinkwrap.json"), "{}\\n", "utf8");
	fs.writeFileSync(path.join(packageDir, "dist", "anchormap.js"), "module.exports = {};\\n", "utf8");
	fs.writeFileSync(
		path.join(packageDir, "node_modules", "typescript", "lib", "typescript.d.ts"),
		"export {};\\n",
		"utf8",
	);
	fs.writeFileSync(
		path.join(packageDir, "node_modules", "nested-dep", "src", "index.ts"),
		"export {};\\n",
		"utf8",
	);
	if (process.env.ANCHORMAP_FAKE_OWN_SOURCE === "src") {
		fs.mkdirSync(path.join(packageDir, "src"), { recursive: true });
		fs.writeFileSync(path.join(packageDir, "src", "index.ts"), "export {};\\n", "utf8");
	}
	if (process.env.ANCHORMAP_FAKE_OWN_SOURCE === "root-ts") {
		fs.writeFileSync(path.join(packageDir, "runtime.d.ts"), "export {};\\n", "utf8");
	}
writeExecutable(path.join(packageDir, "bin", "anchormap"), ${JSON.stringify(`#!/usr/bin/env node
const fs = require("node:fs");

if (process.argv[2] === "init") {
	fs.writeFileSync("anchormap.yaml", ${JSON.stringify(initYaml)}, "utf8");
	process.exit(0);
}
if (process.argv[2] === "map") {
	fs.writeFileSync("anchormap.yaml", ${JSON.stringify(mappedYaml)}, "utf8");
	process.exit(0);
}
if (process.argv[2] === "scan" && process.argv[3] === "--json") {
	process.stdout.write(${JSON.stringify(scanJson)});
	process.exit(0);
}
process.exit(4);
`)});
	fs.symlinkSync("../anchormap/bin/anchormap", path.join(binDir, "anchormap"));
	fs.writeFileSync(path.join(process.cwd(), "package-lock.json"), "{}\\n", "utf8");
	process.exit(0);
}

process.stderr.write("unexpected fake npm invocation: " + process.argv.slice(2).join(" ") + "\\n");
process.exit(1);
`,
			"utf8",
		);
		chmodSync(fakeNpmPath, 0o755);

		const passReportPath = join(tempDir, "nested-dependency-source-report.json");
		const passResult = spawnSync(
			process.execPath,
			[VERIFY_INSTALLED_ARTIFACT_PATH, "--report", passReportPath],
			{
				cwd: REPO_ROOT,
				encoding: "utf8",
				env: cleanNodeEnv({
					PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
				}),
			},
		);

		assert.equal(passResult.status, 0, passResult.stderr);
		const passReport = JSON.parse(readFileSync(passReportPath, "utf8")) as {
			verdict: string;
			runtime_source_check: {
				typescript_source_absent: boolean;
				unexpected_source_files: string[];
			};
		};
		assert.equal(passReport.verdict, "pass");
		assert.deepEqual(passReport.runtime_source_check, {
			compiled_dist_entry_present: true,
			typescript_source_absent: true,
			unexpected_source_files: [],
		});

		for (const sourceCase of [
			{
				name: "own-src",
				value: "src",
				unexpectedSourceFiles: ["src/index.ts"],
			},
			{
				name: "own-root-ts",
				value: "root-ts",
				unexpectedSourceFiles: ["runtime.d.ts"],
			},
		]) {
			const caseReportPath = join(tempDir, `${sourceCase.name}-report.json`);
			const result = spawnSync(
				process.execPath,
				[VERIFY_INSTALLED_ARTIFACT_PATH, "--report", caseReportPath],
				{
					cwd: REPO_ROOT,
					encoding: "utf8",
					env: cleanNodeEnv({
						ANCHORMAP_FAKE_OWN_SOURCE: sourceCase.value,
						PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
					}),
				},
			);

			assert.equal(result.status, 1);
			assert.match(result.stderr, /installed artifact verification failed/);

			const report = JSON.parse(readFileSync(caseReportPath, "utf8")) as {
				verdict: string;
				runtime_source_check: {
					typescript_source_absent: boolean;
					unexpected_source_files: string[];
				};
				checks: Record<string, boolean>;
			};
			assert.equal(report.verdict, "fail");
			assert.equal(report.runtime_source_check.typescript_source_absent, false);
			assert.deepEqual(
				report.runtime_source_check.unexpected_source_files,
				sourceCase.unexpectedSourceFiles,
			);
			assert.equal(report.checks.typescript_source_absent, false);
		}
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("installed artifact verifier records timeout evidence for install and smoke commands", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-installed-artifact-timeout-test-"));
	const fakeBinDir = join(tempDir, "bin");
	const fakeNpmPath = join(fakeBinDir, "npm");
	const verifierTmpDir = join(tempDir, "verifier-tmp");
	const initYaml = `version: 1
product_root: 'src'
spec_roots:
  - 'specs'
mappings: {}
`;

	try {
		mkdirSync(fakeBinDir);
		mkdirSync(verifierTmpDir);
		writeFileSync(
			fakeNpmPath,
			`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const packageFiles = [
	{ path: "bin/anchormap" },
	{ path: "dist/anchormap.js" },
	{ path: "npm-shrinkwrap.json" },
	{ path: "package.json" },
];

function hang() {
	setInterval(() => {}, 1000);
}

function writeExecutable(filePath, contents) {
	fs.writeFileSync(filePath, contents, "utf8");
	fs.chmodSync(filePath, 0o755);
}

if (process.argv[2] === "pack") {
	const destination = process.argv[process.argv.indexOf("--pack-destination") + 1];
	fs.mkdirSync(destination, { recursive: true });
	fs.writeFileSync(path.join(destination, "anchormap-1.0.0.tgz"), "");
	process.stdout.write(JSON.stringify([{
		id: "anchormap@1.0.0",
		name: "anchormap",
		version: "1.0.0",
		filename: "anchormap-1.0.0.tgz",
		integrity: "sha512-test",
		shasum: "test",
		files: packageFiles,
	}]) + "\\n");
	process.exit(0);
}

if (process.argv[2] === "install") {
	if (process.env.ANCHORMAP_FAKE_TIMEOUT_PHASE === "install") {
		process.stdout.write("install started\\n");
		return hang();
	}

	const packageDir = path.join(process.cwd(), "node_modules", "anchormap");
	const binDir = path.join(process.cwd(), "node_modules", ".bin");
	fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });
	fs.mkdirSync(path.join(packageDir, "dist"), { recursive: true });
	fs.mkdirSync(binDir, { recursive: true });
	fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
		name: "anchormap",
		version: "1.0.0",
	}), "utf8");
	fs.writeFileSync(path.join(packageDir, "npm-shrinkwrap.json"), "{}\\n", "utf8");
	fs.writeFileSync(path.join(packageDir, "dist", "anchormap.js"), "module.exports = {};\\n", "utf8");
writeExecutable(path.join(packageDir, "bin", "anchormap"), ${JSON.stringify(`#!/usr/bin/env node
const fs = require("node:fs");

function hang() {
	setInterval(() => {}, 1000);
}

if (process.env.ANCHORMAP_FAKE_TIMEOUT_PHASE === "init" && process.argv[2] === "init") {
	process.stdout.write("init started\\n");
	return hang();
}

if (process.argv[2] === "init") {
	fs.writeFileSync("anchormap.yaml", ${JSON.stringify(initYaml)}, "utf8");
	process.exit(0);
}
if (process.argv[2] === "map") {
	process.exit(0);
}
if (process.argv[2] === "scan") {
	process.stdout.write('{"fake":true}\\n');
	process.exit(0);
}
process.exit(4);
`)});
	fs.symlinkSync("../anchormap/bin/anchormap", path.join(binDir, "anchormap"));
	fs.writeFileSync(path.join(process.cwd(), "package-lock.json"), "{}\\n", "utf8");
	process.exit(0);
}

process.stderr.write("unexpected fake npm invocation: " + process.argv.slice(2).join(" ") + "\\n");
process.exit(1);
`,
			"utf8",
		);
		chmodSync(fakeNpmPath, 0o755);

		interface TimeoutReport {
			consumer_install: {
				status: number | null;
				timed_out: boolean;
				timeout_ms: number;
				stdout: string | null;
			};
			commands: {
				init: null | {
					status: number | null;
					timed_out: boolean;
					timeout_ms: number;
					stdout: string;
				};
			};
			checks: Record<string, boolean>;
		}

		const cases: Array<{
			name: string;
			phase: string;
			assertReport(report: TimeoutReport): void;
		}> = [
			{
				name: "install-timeout",
				phase: "install",
				assertReport(report) {
					assert.equal(report.consumer_install.status, null);
					assert.equal(report.consumer_install.timed_out, true);
					assert.equal(report.consumer_install.timeout_ms, 500);
					assert.equal(report.consumer_install.stdout, "install started\n");
					assert.equal(report.checks.consumer_install_exit_zero, false);
					assert.equal(report.commands.init, null);
				},
			},
			{
				name: "init-timeout",
				phase: "init",
				assertReport(report) {
					assert.notEqual(report.commands.init, null);
					assert.equal(report.consumer_install.status, 0);
					assert.equal(report.consumer_install.timed_out, false);
					assert.equal(report.commands.init?.status, null);
					assert.equal(report.commands.init?.timed_out, true);
					assert.equal(report.commands.init?.timeout_ms, 500);
					assert.equal(report.commands.init?.stdout, "init started\n");
					assert.equal(report.checks.init_exit_zero, false);
				},
			},
		];

		for (const timeoutCase of cases) {
			const caseReportPath = join(tempDir, `${timeoutCase.name}-report.json`);
			const result = spawnSync(
				process.execPath,
				[VERIFY_INSTALLED_ARTIFACT_PATH, "--timeout-ms", "500", "--report", caseReportPath],
				{
					cwd: REPO_ROOT,
					encoding: "utf8",
					env: cleanNodeEnv({
						ANCHORMAP_FAKE_TIMEOUT_PHASE: timeoutCase.phase,
						PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
						TMPDIR: verifierTmpDir,
					}),
				},
			);

			assert.equal(result.status, 1);
			assert.match(result.stderr, /installed artifact verification failed/);
			assert.equal(existsSync(caseReportPath), true);
			assert.deepEqual(
				readdirSync(verifierTmpDir).filter((entry) =>
					entry.startsWith("anchormap-installed-artifact-"),
				),
				[],
			);

			const report = JSON.parse(readFileSync(caseReportPath, "utf8")) as {
				verdict: string;
				consumer_install: {
					status: number | null;
					timed_out: boolean;
					timeout_ms: number;
					stdout: string | null;
				};
				commands: {
					init: TimeoutReport["commands"]["init"];
				};
				checks: Record<string, boolean>;
			};
			assert.equal(report.verdict, "fail");
			assert.equal(report.checks.node_options_unset, true);
			timeoutCase.assertReport(report);
		}
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
