import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, relative, sep } from "node:path";
import { test } from "node:test";

import {
	assertCanonicalPublicationEvidencePreserved,
	cleanNodeEnv,
	EXPECTED_PACKAGE_FILES,
	EXPECTED_PACKAGE_VERSION,
	PUBLICATION_DRY_RUN_PATH,
	REPO_ROOT,
	readJsonFile,
	seedCanonicalPublicationEvidence,
	writeJsonFile,
} from "./package-scripts-test-support";

test("publication dry-run script fails closed when release prerequisites are not passing", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-publication-dry-run-test-"));
	const outDir = join(tempDir, "out");
	const evidenceDir = join(tempDir, "evidence");
	const m9ReportPath = join(tempDir, "release-report.json");
	const installedArtifactReportPath = join(tempDir, "installed-artifact-report.json");

	try {
		writeJsonFile(m9ReportPath, { schema_version: 1, release_verdict: "fail" });
		writeJsonFile(installedArtifactReportPath, { task: "T10.3", verdict: "pass" });
		seedCanonicalPublicationEvidence(evidenceDir);

		const result = spawnSync(
			process.execPath,
			[
				PUBLICATION_DRY_RUN_PATH,
				"--out-dir",
				outDir,
				"--evidence-dir",
				evidenceDir,
				"--m9-release-report",
				m9ReportPath,
				"--installed-artifact-report",
				installedArtifactReportPath,
			],
			{
				cwd: REPO_ROOT,
				encoding: "utf8",
				env: cleanNodeEnv(),
			},
		);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /preconditions failed/);
		assert.equal(existsSync(join(outDir, "precondition-failure.json")), true);
		assertCanonicalPublicationEvidencePreserved(evidenceDir);

		const report = readJsonFile<{
			status: string;
			failures: string[];
		}>(join(outDir, "precondition-failure.json"));
		assert.equal(report.status, "fail");
		assert.deepEqual(report.failures, ["M9 release report must have release_verdict pass"]);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("publication dry-run script rejects null release prerequisite reports", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-publication-null-report-test-"));
	const outDir = join(tempDir, "out");
	const evidenceDir = join(tempDir, "evidence");
	const m9ReportPath = join(tempDir, "release-report.json");
	const installedArtifactReportPath = join(tempDir, "installed-artifact-report.json");

	try {
		writeJsonFile(m9ReportPath, null);
		writeJsonFile(installedArtifactReportPath, { task: "T10.3", verdict: "pass" });
		seedCanonicalPublicationEvidence(evidenceDir);

		const result = spawnSync(
			process.execPath,
			[
				PUBLICATION_DRY_RUN_PATH,
				"--out-dir",
				outDir,
				"--evidence-dir",
				evidenceDir,
				"--m9-release-report",
				m9ReportPath,
				"--installed-artifact-report",
				installedArtifactReportPath,
			],
			{
				cwd: REPO_ROOT,
				encoding: "utf8",
				env: cleanNodeEnv(),
			},
		);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /preconditions failed/);
		assert.equal(existsSync(join(outDir, "t10.5-publication-dry-run.json")), false);
		assertCanonicalPublicationEvidencePreserved(evidenceDir);

		const report = readJsonFile<{
			status: string;
			failures: string[];
		}>(join(outDir, "precondition-failure.json"));
		assert.equal(report.status, "fail");
		assert.deepEqual(report.failures, ["M9 release report must be a JSON object"]);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("publication dry-run script rejects stale installed-artifact package metadata", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-publication-stale-install-test-"));
	const outDir = join(tempDir, "out");
	const evidenceDir = join(tempDir, "evidence");
	const m9ReportPath = join(tempDir, "release-report.json");
	const installedArtifactReportPath = join(tempDir, "installed-artifact-report.json");

	try {
		writeJsonFile(m9ReportPath, { schema_version: 1, release_verdict: "pass" });
		writeJsonFile(installedArtifactReportPath, {
			task: "T10.3",
			verdict: "pass",
			package: {
				name: "anchormap",
				version: "1.0.0",
				filename: "anchormap-1.0.0.tgz",
				integrity: "sha512-stale",
				shasum: "0000000000000000000000000000000000000000",
				files: ["package.json"],
			},
		});
		seedCanonicalPublicationEvidence(evidenceDir);

		const result = spawnSync(
			process.execPath,
			[
				PUBLICATION_DRY_RUN_PATH,
				"--out-dir",
				outDir,
				"--evidence-dir",
				evidenceDir,
				"--m9-release-report",
				m9ReportPath,
				"--installed-artifact-report",
				installedArtifactReportPath,
			],
			{
				cwd: REPO_ROOT,
				encoding: "utf8",
				env: cleanNodeEnv(),
			},
		);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /tarball artifact validation failed/);
		assertCanonicalPublicationEvidencePreserved(evidenceDir);

		const report = readJsonFile<{
			status: string;
			pack: {
				command: string;
			};
			installed_artifact_coherence: {
				status: string;
				failures: string[];
			};
		}>(join(outDir, "t10.5-tarball-artifact.json"));
		const relativeOutDir = relative(REPO_ROOT, outDir).split(sep).join("/");
		assert.equal(report.status, "fail");
		assert.equal(report.pack.command, `npm pack --pack-destination ${relativeOutDir} --json`);
		assert.equal(report.installed_artifact_coherence.status, "fail");
		assert.ok(
			report.installed_artifact_coherence.failures.includes(
				"T10.3 installed tarball integrity must match current tarball",
			),
		);
		assert.ok(
			report.installed_artifact_coherence.failures.includes(
				"T10.3 installed package file list must match current tarball",
			),
		);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("publication dry-run script rejects shrinkwraps missing package-lock transitive closure entries", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-publication-lockback-test-"));
	const scriptDir = join(tempDir, "scripts");
	const scriptPath = join(scriptDir, "publication-dry-run.mjs");
	const fakeBinDir = join(tempDir, "bin");
	const fakeNpmPath = join(fakeBinDir, "npm");
	const outDir = join(tempDir, "out");
	const evidenceDir = join(tempDir, "evidence");
	const m9ReportPath = join(tempDir, "release-report.json");
	const installedArtifactReportPath = join(tempDir, "installed-artifact-report.json");
	const packageFiles = [
		"package.json",
		"npm-shrinkwrap.json",
		"bin/anchormap",
		"dist/anchormap.js",
	].sort();

	try {
		mkdirSync(scriptDir, { recursive: true });
		mkdirSync(fakeBinDir);
		writeFileSync(scriptPath, readFileSync(PUBLICATION_DRY_RUN_PATH, "utf8"), "utf8");
		writeJsonFile(join(tempDir, "package.json"), {
			name: "anchormap",
			version: "1.0.0",
			files: ["npm-shrinkwrap.json", "bin/anchormap", "dist/anchormap.js"],
			dependencies: {
				direct: "1.0.0",
			},
		});
		writeJsonFile(join(tempDir, "package-lock.json"), {
			packages: {
				"": {
					dependencies: {
						direct: "1.0.0",
					},
				},
				"node_modules/direct": {
					version: "1.0.0",
					integrity: "sha512-direct",
					dependencies: {
						transitive: "1.0.0",
					},
				},
				"node_modules/transitive": {
					version: "1.0.0",
					integrity: "sha512-transitive",
				},
			},
		});
		writeJsonFile(join(tempDir, "npm-shrinkwrap.json"), {
			packages: {
				"": {
					dependencies: {
						direct: "1.0.0",
					},
				},
				"node_modules/direct": {
					version: "1.0.0",
					integrity: "sha512-direct",
				},
			},
		});
		writeFileSync(
			fakeNpmPath,
			`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const packageFiles = ${JSON.stringify(packageFiles.map((file) => ({ path: file })))};

if (process.argv[2] === "pack") {
	const destination = process.argv[process.argv.indexOf("--pack-destination") + 1];
	fs.mkdirSync(destination, { recursive: true });
	fs.writeFileSync(path.join(destination, "anchormap-${EXPECTED_PACKAGE_VERSION}.tgz"), "fake tarball\\n");
	process.stdout.write(JSON.stringify([{
		id: "anchormap@${EXPECTED_PACKAGE_VERSION}",
		name: "anchormap",
		version: "${EXPECTED_PACKAGE_VERSION}",
		filename: "anchormap-${EXPECTED_PACKAGE_VERSION}.tgz",
		integrity: "sha512-current",
		shasum: "1111111111111111111111111111111111111111",
		files: packageFiles,
	}]) + "\\n");
	process.exit(0);
}

if (process.argv[2] === "publish") {
	process.stdout.write("{\\"dryRun\\":true}\\n");
	process.exit(0);
}

process.stderr.write("unexpected fake npm invocation: " + process.argv.slice(2).join(" ") + "\\n");
process.exit(1);
`,
			"utf8",
		);
		chmodSync(fakeNpmPath, 0o755);
		writeJsonFile(m9ReportPath, { schema_version: 1, release_verdict: "pass" });
		writeJsonFile(installedArtifactReportPath, {
			task: "T10.3",
			verdict: "pass",
			package: {
				name: "anchormap",
				version: EXPECTED_PACKAGE_VERSION,
				filename: `anchormap-${EXPECTED_PACKAGE_VERSION}.tgz`,
				integrity: "sha512-current",
				shasum: "1111111111111111111111111111111111111111",
				files: packageFiles,
			},
		});
		seedCanonicalPublicationEvidence(evidenceDir);

		const result = spawnSync(
			process.execPath,
			[
				scriptPath,
				"--out-dir",
				outDir,
				"--evidence-dir",
				evidenceDir,
				"--m9-release-report",
				m9ReportPath,
				"--installed-artifact-report",
				installedArtifactReportPath,
			],
			{
				cwd: tempDir,
				encoding: "utf8",
				env: cleanNodeEnv({
					PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
				}),
			},
		);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /tarball artifact validation failed/);
		assertCanonicalPublicationEvidencePreserved(evidenceDir);

		const lockback = readJsonFile<{
			runtime_closure_matches_gate_g: boolean;
			failures: string[];
		}>(join(outDir, "consumer-lockback.json"));
		assert.equal(lockback.runtime_closure_matches_gate_g, false);
		assert.ok(
			lockback.failures.includes(
				"package-lock closure dependency transitive must match npm-shrinkwrap.json",
			),
		);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("publication dry-run script rejects package contents widened beyond ADR-0009", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-publication-allowlist-test-"));
	const scriptDir = join(tempDir, "scripts");
	const scriptPath = join(scriptDir, "publication-dry-run.mjs");
	const fakeBinDir = join(tempDir, "bin");
	const fakeNpmPath = join(fakeBinDir, "npm");
	const outDir = join(tempDir, "out");
	const evidenceDir = join(tempDir, "evidence");
	const m9ReportPath = join(tempDir, "release-report.json");
	const installedArtifactReportPath = join(tempDir, "installed-artifact-report.json");
	const extraFile = "dist/experimental.js";
	const packageFiles = ["package.json", ...EXPECTED_PACKAGE_FILES, extraFile].sort();

	try {
		mkdirSync(scriptDir, { recursive: true });
		mkdirSync(fakeBinDir);
		writeFileSync(scriptPath, readFileSync(PUBLICATION_DRY_RUN_PATH, "utf8"), "utf8");
		writeJsonFile(join(tempDir, "package.json"), {
			name: "anchormap",
			version: "1.0.0",
			files: [...EXPECTED_PACKAGE_FILES, extraFile],
			dependencies: {},
		});
		const lockback = {
			packages: {
				"": {
					name: "anchormap",
					version: "1.0.0",
				},
			},
		};
		writeJsonFile(join(tempDir, "package-lock.json"), lockback);
		writeJsonFile(join(tempDir, "npm-shrinkwrap.json"), lockback);
		writeFileSync(
			fakeNpmPath,
			`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const packageFiles = ${JSON.stringify(packageFiles.map((file) => ({ path: file })))};

if (process.argv[2] === "pack") {
	const destination = process.argv[process.argv.indexOf("--pack-destination") + 1];
	fs.mkdirSync(destination, { recursive: true });
	fs.writeFileSync(path.join(destination, "anchormap-${EXPECTED_PACKAGE_VERSION}.tgz"), "fake tarball\\n");
	process.stdout.write(JSON.stringify([{
		id: "anchormap@${EXPECTED_PACKAGE_VERSION}",
		name: "anchormap",
		version: "${EXPECTED_PACKAGE_VERSION}",
		filename: "anchormap-${EXPECTED_PACKAGE_VERSION}.tgz",
		integrity: "sha512-current",
		shasum: "1111111111111111111111111111111111111111",
		files: packageFiles,
	}]) + "\\n");
	process.exit(0);
}

if (process.argv[2] === "publish") {
	process.stdout.write("{\\"dryRun\\":true}\\n");
	process.exit(0);
}

process.stderr.write("unexpected fake npm invocation: " + process.argv.slice(2).join(" ") + "\\n");
process.exit(1);
`,
			"utf8",
		);
		chmodSync(fakeNpmPath, 0o755);
		writeJsonFile(m9ReportPath, { schema_version: 1, release_verdict: "pass" });
		writeJsonFile(installedArtifactReportPath, {
			task: "T10.3",
			verdict: "pass",
			package: {
				name: "anchormap",
				version: EXPECTED_PACKAGE_VERSION,
				filename: `anchormap-${EXPECTED_PACKAGE_VERSION}.tgz`,
				integrity: "sha512-current",
				shasum: "1111111111111111111111111111111111111111",
				files: packageFiles,
			},
		});
		seedCanonicalPublicationEvidence(evidenceDir);

		const result = spawnSync(
			process.execPath,
			[
				scriptPath,
				"--out-dir",
				outDir,
				"--evidence-dir",
				evidenceDir,
				"--m9-release-report",
				m9ReportPath,
				"--installed-artifact-report",
				installedArtifactReportPath,
			],
			{
				cwd: tempDir,
				encoding: "utf8",
				env: cleanNodeEnv({
					PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
				}),
			},
		);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /tarball artifact validation failed/);
		assertCanonicalPublicationEvidencePreserved(evidenceDir);

		const report = readJsonFile<{
			status: string;
			content_validation: {
				files_outside_adr_0009_allowlist: string[];
				required_compiled_dist_modules: string[];
			};
		}>(join(outDir, "t10.5-tarball-artifact.json"));
		assert.equal(report.status, "fail");
		assert.deepEqual(report.content_validation.files_outside_adr_0009_allowlist, [extraFile]);
		assert.deepEqual(
			report.content_validation.required_compiled_dist_modules,
			EXPECTED_PACKAGE_FILES.filter((file) => file.startsWith("dist/")).sort(),
		);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("publication dry-run script preserves canonical evidence on dry-run failure", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-publication-evidence-test-"));
	const fakeBinDir = join(tempDir, "bin");
	const fakeNpmPath = join(fakeBinDir, "npm");
	const publishArgsPath = join(tempDir, "publish-args.json");
	const outDir = join(tempDir, "out");
	const evidenceDir = join(tempDir, "evidence");
	const m9ReportPath = join(tempDir, "release-report.json");
	const installedArtifactReportPath = join(tempDir, "installed-artifact-report.json");
	const packageFiles = ["README.md", "package.json", ...EXPECTED_PACKAGE_FILES].sort();

	try {
		mkdirSync(fakeBinDir);
		writeFileSync(
			fakeNpmPath,
			`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const packageFiles = ${JSON.stringify(packageFiles.map((file) => ({ path: file })))};

if (process.argv[2] === "pack") {
	const destination = process.argv[process.argv.indexOf("--pack-destination") + 1];
	fs.mkdirSync(destination, { recursive: true });
	fs.writeFileSync(path.join(destination, "anchormap-${EXPECTED_PACKAGE_VERSION}.tgz"), "fake tarball\\n");
	process.stdout.write(JSON.stringify([{
		id: "anchormap@${EXPECTED_PACKAGE_VERSION}",
		name: "anchormap",
		version: "${EXPECTED_PACKAGE_VERSION}",
		filename: "anchormap-${EXPECTED_PACKAGE_VERSION}.tgz",
		integrity: "sha512-current",
		shasum: "1111111111111111111111111111111111111111",
		files: packageFiles,
	}]) + "\\n");
	process.exit(0);
}

if (process.argv[2] === "publish") {
	fs.writeFileSync(process.env.PUBLISH_ARGS_PATH, JSON.stringify(process.argv.slice(2)) + "\\n");
	process.stdout.write("{\\"dryRun\\":false}\\n");
	process.stderr.write("publish dry-run failed\\n");
	process.exit(17);
}

process.stderr.write("unexpected fake npm invocation: " + process.argv.slice(2).join(" ") + "\\n");
process.exit(1);
`,
			"utf8",
		);
		chmodSync(fakeNpmPath, 0o755);
		writeJsonFile(m9ReportPath, { schema_version: 1, release_verdict: "pass" });
		writeJsonFile(installedArtifactReportPath, {
			task: "T10.3",
			verdict: "pass",
			package: {
				name: "anchormap",
				version: EXPECTED_PACKAGE_VERSION,
				filename: `anchormap-${EXPECTED_PACKAGE_VERSION}.tgz`,
				integrity: "sha512-current",
				shasum: "1111111111111111111111111111111111111111",
				files: packageFiles,
			},
		});
		seedCanonicalPublicationEvidence(evidenceDir);

		const result = spawnSync(
			process.execPath,
			[
				PUBLICATION_DRY_RUN_PATH,
				"--out-dir",
				outDir,
				"--evidence-dir",
				evidenceDir,
				"--m9-release-report",
				m9ReportPath,
				"--installed-artifact-report",
				installedArtifactReportPath,
			],
			{
				cwd: REPO_ROOT,
				encoding: "utf8",
				env: cleanNodeEnv({
					PATH: `${fakeBinDir}${delimiter}${process.env.PATH ?? ""}`,
					PUBLISH_ARGS_PATH: publishArgsPath,
				}),
			},
		);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /npm publish dry-run failed/);
		assert.equal(existsSync(join(outDir, "consumer-lockback.json")), true);
		assert.equal(existsSync(join(outDir, "t10.5-tarball-artifact.json")), true);
		assert.equal(existsSync(join(outDir, "t10.5-publication-dry-run.json")), true);
		assertCanonicalPublicationEvidencePreserved(evidenceDir);
		const dryRunEvidence = readJsonFile<{
			status: string;
			command: string;
			tarball_path: string;
			exit_status: number;
		}>(join(outDir, "t10.5-publication-dry-run.json"));
		assert.equal(dryRunEvidence.status, "fail");
		assert.equal(dryRunEvidence.exit_status, 17);
		assert.equal(
			dryRunEvidence.command,
			`npm publish --dry-run ${dryRunEvidence.tarball_path} --tag latest --access public --registry https://registry.npmjs.org/ --json`,
		);
		assert.deepEqual(readJsonFile<string[]>(publishArgsPath), [
			"publish",
			"--dry-run",
			dryRunEvidence.tarball_path,
			"--tag",
			"latest",
			"--access",
			"public",
			"--registry",
			"https://registry.npmjs.org/",
			"--json",
		]);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
