import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutDir = join(repoRoot, "reports", "t10.5");
const defaultEvidenceDir = join(repoRoot, "reports", "t9.6", "evidence");
const defaultM9ReleaseReport = join(repoRoot, "reports", "t9.6", "release-report.json");
const defaultInstalledArtifactReport = join(
	repoRoot,
	"reports",
	"t10.3",
	"installed-artifact-report.json",
);
const defaultCommandTimeoutMs = 60_000;
const packageJsonPath = join(repoRoot, "package.json");
const packageLockPath = join(repoRoot, "package-lock.json");
const shrinkwrapPath = join(repoRoot, "npm-shrinkwrap.json");
const expectedPackageName = "anchormap";
const expectedPackageVersion = JSON.parse(readFileSync(packageJsonPath, "utf8")).version;
const rootConventionFiles = ["README.md", "LICENSE", "LICENSE.md"];
const adr0009RequiredPackageFiles = [
	"package.json",
	"npm-shrinkwrap.json",
	"bin/anchormap",
	"dist/anchormap.js",
	"dist/cli/command-args.js",
	"dist/cli/commands.js",
	"dist/domain/anchor-id.js",
	"dist/domain/canonical-order.js",
	"dist/domain/finding.js",
	"dist/domain/repo-path.js",
	"dist/domain/scan-engine.js",
	"dist/domain/scan-result.js",
	"dist/infra/config-io.js",
	"dist/infra/config-yaml-render.js",
	"dist/infra/product-files.js",
	"dist/infra/repo-fs.js",
	"dist/infra/spec-index.js",
	"dist/infra/ts-graph.js",
	"dist/render/render-json.js",
];
const forbiddenPackagePrefixes = [
	"src/",
	"fixtures/",
	"bench/",
	"reports/",
	"docs/adr/",
	"scripts/",
	"spikes/",
	".agents/",
	".github/",
];

function parseArgs(argv) {
	const options = {
		outDir: defaultOutDir,
		evidenceDir: defaultEvidenceDir,
		m9ReleaseReport: defaultM9ReleaseReport,
		installedArtifactReport: defaultInstalledArtifactReport,
		commandTimeoutMs: defaultCommandTimeoutMs,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--out-dir") {
			options.outDir = resolvePath(requireValue(argv, index, arg));
			index += 1;
			continue;
		}
		if (arg === "--evidence-dir") {
			options.evidenceDir = resolvePath(requireValue(argv, index, arg));
			index += 1;
			continue;
		}
		if (arg === "--m9-release-report") {
			options.m9ReleaseReport = resolvePath(requireValue(argv, index, arg));
			index += 1;
			continue;
		}
		if (arg === "--installed-artifact-report") {
			options.installedArtifactReport = resolvePath(requireValue(argv, index, arg));
			index += 1;
			continue;
		}
		if (arg === "--timeout-ms") {
			options.commandTimeoutMs = parsePositiveInteger(requireValue(argv, index, arg), arg);
			index += 1;
			continue;
		}
		failUsage(`publication-dry-run: invalid argument ${arg}`);
	}

	return options;
}

function requireValue(argv, index, flag) {
	const value = argv[index + 1];
	if (value === undefined || value.startsWith("--")) {
		failUsage(`publication-dry-run: ${flag} requires a value`);
	}
	return value;
}

function parsePositiveInteger(value, flag) {
	if (!/^[0-9]+$/.test(value)) {
		failUsage(`publication-dry-run: ${flag} must be a positive integer`);
	}
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 1) {
		failUsage(`publication-dry-run: ${flag} must be a positive integer`);
	}
	return parsed;
}

function failUsage(message) {
	process.stderr.write(`${message}\n`);
	process.exit(2);
}

function resolvePath(value) {
	return isAbsolute(value) ? value : resolve(repoRoot, value);
}

function relativePath(path) {
	const result = relative(repoRoot, path);
	return result === "" ? "." : result.split(sep).join("/");
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`, "utf8");
}

function sha256File(path) {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function run(command, args, options) {
	const result = spawnSync(command, args, {
		cwd: repoRoot,
		env: options.env,
		encoding: "utf8",
		timeout: options.timeoutMs,
		killSignal: "SIGTERM",
	});
	return {
		command: [command, ...args].join(" "),
		status: result.status,
		signal: result.signal,
		timed_out: result.error?.code === "ETIMEDOUT",
		error: result.error === undefined ? null : result.error.message,
		timeout_ms: options.timeoutMs,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

function cleanCommandEnvironment(extra) {
	const env = {
		...process.env,
		...extra,
	};
	delete env.NODE_OPTIONS;
	delete env.NODE_PATH;
	return env;
}

function requirePassingPreconditions(options) {
	const failures = [];
	const m9Release = readRequiredJson(options.m9ReleaseReport, "M9 release report", failures);
	const installedArtifact = readRequiredJson(
		options.installedArtifactReport,
		"T10.3 installed-artifact report",
		failures,
	);

	if (m9Release !== null && m9Release.release_verdict !== "pass") {
		failures.push("M9 release report must have release_verdict pass");
	}
	if (installedArtifact !== null && installedArtifact.verdict !== "pass") {
		failures.push("T10.3 installed-artifact report must have verdict pass");
	}

	if (failures.length > 0) {
		const report = {
			schema_version: 1,
			task: "T10.5",
			status: "fail",
			failures,
			preconditions: {
				m9_release_report: relativePath(options.m9ReleaseReport),
				installed_artifact_report: relativePath(options.installedArtifactReport),
			},
		};
		const preconditionFailurePath = join(options.outDir, "precondition-failure.json");
		writeJson(preconditionFailurePath, report);
		process.stderr.write(`publication-dry-run: preconditions failed: ${failures.join("; ")}\n`);
		return { ok: false, installedArtifact: null };
	}

	return { ok: true, installedArtifact };
}

function readRequiredJson(path, label, failures) {
	if (!existsSync(path)) {
		failures.push(`${label} is missing: ${relativePath(path)}`);
		return null;
	}
	try {
		const report = readJson(path);
		if (!isObject(report)) {
			failures.push(`${label} must be a JSON object`);
			return null;
		}
		return report;
	} catch (error) {
		failures.push(`${label} is not valid JSON: ${error.message}`);
		return null;
	}
}

function parsePackMetadata(packResult) {
	if (packResult.status !== 0) {
		return { metadata: null, error: "npm pack exited non-zero" };
	}
	try {
		const [metadata] = JSON.parse(packResult.stdout);
		if (metadata === undefined) {
			return { metadata: null, error: "npm pack returned no package metadata" };
		}
		return { metadata, error: null };
	} catch (error) {
		return {
			metadata: null,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function adr0009AllowedFiles() {
	const files = new Set(adr0009RequiredPackageFiles);
	for (const conventionFile of rootConventionFiles) {
		if (existsSync(join(repoRoot, conventionFile))) {
			files.add(conventionFile);
		}
	}
	return [...files].sort(compareStrings);
}

function validatePackageContents(includedFiles) {
	const allowed = adr0009AllowedFiles();
	const allowedSet = new Set(allowed);
	const requiredCompiledFiles = adr0009RequiredPackageFiles.filter((path) =>
		path.startsWith("dist/"),
	);
	const requiredFiles = [...adr0009RequiredPackageFiles];
	const missingRequiredFiles = requiredFiles.filter((path) => !includedFiles.includes(path));
	const outsideAllowlistFiles = includedFiles.filter((path) => !allowedSet.has(path));
	const forbiddenFiles = includedFiles.filter((path) =>
		forbiddenPackagePrefixes.some(
			(prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix),
		),
	);

	return {
		allowed_files: allowed,
		required_files: requiredFiles.sort(compareStrings),
		required_compiled_dist_modules: requiredCompiledFiles.sort(compareStrings),
		missing_required_files: missingRequiredFiles,
		files_outside_adr_0009_allowlist: outsideAllowlistFiles,
		forbidden_files: forbiddenFiles,
		package_contents_ok:
			missingRequiredFiles.length === 0 &&
			outsideAllowlistFiles.length === 0 &&
			forbiddenFiles.length === 0,
	};
}

function validateInstalledArtifactCoherence(installedArtifact, packMetadata, includedFiles) {
	const installedPackage = installedArtifact?.package;
	const failures = [];
	if (!isObject(installedPackage)) {
		failures.push("T10.3 installed-artifact report must include package metadata");
		return { status: "fail", failures };
	}

	if (installedPackage.name !== packMetadata.name) {
		failures.push("T10.3 installed package name must match current tarball");
	}
	if (installedPackage.version !== packMetadata.version) {
		failures.push("T10.3 installed package version must match current tarball");
	}
	if (installedPackage.filename !== packMetadata.filename) {
		failures.push("T10.3 installed tarball filename must match current tarball");
	}
	if (installedPackage.integrity !== packMetadata.integrity) {
		failures.push("T10.3 installed tarball integrity must match current tarball");
	}
	if (installedPackage.shasum !== packMetadata.shasum) {
		failures.push("T10.3 installed tarball shasum must match current tarball");
	}
	if (!Array.isArray(installedPackage.files)) {
		failures.push("T10.3 installed package files must be recorded");
	} else {
		const installedFiles = installedPackage.files
			.filter((file) => typeof file === "string")
			.sort(compareStrings);
		if (
			installedFiles.length !== includedFiles.length ||
			installedFiles.some((file, index) => file !== includedFiles[index])
		) {
			failures.push("T10.3 installed package file list must match current tarball");
		}
	}

	return {
		status: failures.length === 0 ? "pass" : "fail",
		failures,
	};
}

function isObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function runtimeClosure(lockfile) {
	const packages = lockfile.packages ?? {};
	const rootPackage = packages[""] ?? {};
	const rootDependencies = rootPackage.dependencies ?? {};
	const visited = new Map();

	function visit(name) {
		if (visited.has(name)) {
			return;
		}
		const entry = packages[`node_modules/${name}`];
		if (entry === undefined) {
			visited.set(name, { missing: true });
			return;
		}
		visited.set(name, {
			version: entry.version ?? null,
			integrity: entry.integrity ?? null,
			dependencies: entry.dependencies ?? {},
		});
		for (const dependency of Object.keys(entry.dependencies ?? {}).sort(compareStrings)) {
			visit(dependency);
		}
	}

	for (const dependency of Object.keys(rootDependencies).sort(compareStrings)) {
		visit(dependency);
	}

	return {
		root_dependencies: rootDependencies,
		entries: Object.fromEntries(
			[...visited.entries()].sort(([left], [right]) => compareStrings(left, right)),
		),
	};
}

function validateConsumerLockback(packageJson) {
	const shrinkwrap = readJson(shrinkwrapPath);
	const packageLock = readJson(packageLockPath);
	const shrinkwrapClosure = runtimeClosure(shrinkwrap);
	const packageLockClosure = runtimeClosure(packageLock);
	const failures = [];

	for (const [name, version] of Object.entries(packageJson.dependencies ?? {})) {
		const shrinkwrapEntry = shrinkwrapClosure.entries[name];
		if (shrinkwrapClosure.root_dependencies[name] !== version) {
			failures.push(`npm-shrinkwrap root dependency ${name} must be ${version}`);
		}
		if (shrinkwrapEntry === undefined || shrinkwrapEntry.missing === true) {
			failures.push(`npm-shrinkwrap runtime dependency ${name} is missing`);
			continue;
		}
		if (shrinkwrapEntry.version !== version) {
			failures.push(`npm-shrinkwrap runtime dependency ${name} version must be ${version}`);
		}
		if (typeof shrinkwrapEntry.integrity !== "string" || shrinkwrapEntry.integrity.length === 0) {
			failures.push(`npm-shrinkwrap runtime dependency ${name} must include integrity`);
		}
	}

	for (const [name, entry] of Object.entries(shrinkwrapClosure.entries)) {
		const lockEntry = packageLockClosure.entries[name];
		if (entry.missing === true) {
			failures.push(`npm-shrinkwrap closure dependency ${name} is missing`);
			continue;
		}
		if (typeof entry.integrity !== "string" || entry.integrity.length === 0) {
			failures.push(`npm-shrinkwrap closure dependency ${name} must include integrity`);
		}
		if (
			lockEntry === undefined ||
			lockEntry.missing === true ||
			lockEntry.version !== entry.version ||
			lockEntry.integrity !== entry.integrity
		) {
			failures.push(`npm-shrinkwrap closure dependency ${name} must match package-lock.json`);
		}
	}

	for (const [name, lockEntry] of Object.entries(packageLockClosure.entries)) {
		const shrinkwrapEntry = shrinkwrapClosure.entries[name];
		if (lockEntry.missing === true) {
			failures.push(`package-lock closure dependency ${name} is missing`);
			continue;
		}
		if (
			shrinkwrapEntry === undefined ||
			shrinkwrapEntry.missing === true ||
			shrinkwrapEntry.version !== lockEntry.version ||
			shrinkwrapEntry.integrity !== lockEntry.integrity
		) {
			failures.push(`package-lock closure dependency ${name} must match npm-shrinkwrap.json`);
		}
	}

	return {
		mechanism: "npm-shrinkwrap.json",
		path: "npm-shrinkwrap.json",
		shrinkwrap_sha256: sha256File(shrinkwrapPath),
		package_lock_sha256: sha256File(packageLockPath),
		root_runtime_dependencies: packageJson.dependencies ?? {},
		transitive_runtime_closure: Object.fromEntries(
			Object.entries(shrinkwrapClosure.entries).map(([name, entry]) => [
				name,
				entry.missing === true
					? { missing: true }
					: {
							version: entry.version,
							integrity: entry.integrity,
						},
			]),
		),
		runtime_closure_matches_gate_g: failures.length === 0,
		failures,
	};
}

function compareStrings(left, right) {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function copyEvidence(source, evidenceDir, targetFilename) {
	const target = join(evidenceDir, targetFilename);
	mkdirSync(dirname(target), { recursive: true });
	copyFileSync(source, target);
	return target;
}

function main() {
	const options = parseArgs(process.argv.slice(2));
	mkdirSync(options.outDir, { recursive: true });
	const preconditions = requirePassingPreconditions(options);
	if (!preconditions.ok) {
		return 1;
	}

	const packageJson = readJson(packageJsonPath);
	const npmCacheDir = mkdtempSync(join(tmpdir(), "anchormap-publication-npm-cache-"));
	const commandEnv = cleanCommandEnvironment({
		npm_config_cache: npmCacheDir,
	});

	try {
		const packDestination = relativePath(options.outDir);

		const packResult = run("npm", ["pack", "--pack-destination", packDestination, "--json"], {
			env: commandEnv,
			timeoutMs: options.commandTimeoutMs,
		});
		const { metadata: packMetadata, error: packMetadataError } = parsePackMetadata(packResult);
		if (packMetadata === null) {
			const packFailureReport = {
				schema_version: 1,
				task: "T10.5",
				status: "fail",
				pack: packResult,
				pack_metadata_error: packMetadataError,
			};
			const packFailurePath = join(options.outDir, "t10.5-tarball-artifact.json");
			writeJson(packFailurePath, packFailureReport);
			const dryRunFailureReport = {
				schema_version: 1,
				task: "T10.5",
				status: "fail",
				reason: "npm pack failed before publication dry-run",
				tarball_artifact_report: relativePath(packFailurePath),
			};
			const dryRunFailurePath = join(options.outDir, "t10.5-publication-dry-run.json");
			writeJson(dryRunFailurePath, dryRunFailureReport);
			process.stderr.write(`publication-dry-run: npm pack failed: ${packMetadataError}\n`);
			return 1;
		}

		const tarballPath = join(options.outDir, packMetadata.filename);
		const tarballSha256 = existsSync(tarballPath) ? sha256File(tarballPath) : null;
		const includedFiles = packMetadata.files.map((file) => file.path).sort(compareStrings);
		const contentValidation = validatePackageContents(includedFiles);
		const lockback = validateConsumerLockback(packageJson);
		const installedArtifactCoherence = validateInstalledArtifactCoherence(
			preconditions.installedArtifact,
			packMetadata,
			includedFiles,
		);
		const packageIdentityOk =
			packMetadata.name === expectedPackageName &&
			packMetadata.version === expectedPackageVersion &&
			packageJson.name === expectedPackageName &&
			packageJson.version === expectedPackageVersion;
		const checksumPath = join(options.outDir, `${packMetadata.filename}.sha256`);
		if (tarballSha256 !== null) {
			writeFileSync(checksumPath, `${tarballSha256}  ${packMetadata.filename}\n`, "utf8");
		}
		const runtimeClosureProof = {
			compiled_dist_entry_present: includedFiles.includes("dist/anchormap.js"),
			required_compiled_dist_modules_present:
				contentValidation.missing_required_files.filter((path) => path.startsWith("dist/"))
					.length === 0,
			typescript_source_absent: !includedFiles.some(
				(path) => path === "src" || path.startsWith("src/") || path.endsWith(".ts"),
			),
			developer_harness_absent: !includedFiles.some(
				(path) => path.startsWith("dist/harness/") || path.includes(".test."),
			),
		};
		const runtimeClosureOk = Object.values(runtimeClosureProof).every(Boolean);

		const consumerLockbackReport = {
			schema_version: 1,
			task: "T10.5",
			package_name: expectedPackageName,
			package_version: expectedPackageVersion,
			mechanism: lockback.mechanism,
			runtime_closure_matches_gate_g: lockback.runtime_closure_matches_gate_g,
			shrinkwrap: {
				included_in_package: includedFiles.includes("npm-shrinkwrap.json"),
				path: lockback.path,
				sha256: lockback.shrinkwrap_sha256,
			},
			package_lock_sha256: lockback.package_lock_sha256,
			root_runtime_dependencies: lockback.root_runtime_dependencies,
			transitive_runtime_closure: lockback.transitive_runtime_closure,
			failures: lockback.failures,
		};
		const consumerLockbackPath = join(options.outDir, "consumer-lockback.json");
		writeJson(consumerLockbackPath, consumerLockbackReport);

		const tarballArtifactReport = {
			schema_version: 1,
			task: "T10.5",
			status:
				tarballSha256 !== null &&
				packageIdentityOk &&
				contentValidation.package_contents_ok &&
				installedArtifactCoherence.status === "pass" &&
				runtimeClosureOk &&
				lockback.runtime_closure_matches_gate_g
					? "pass"
					: "fail",
			package_name: packMetadata.name,
			package_version: packMetadata.version,
			tarball_file: packMetadata.filename,
			tarball_path: relativePath(tarballPath),
			included_files: includedFiles,
			npm_integrity: packMetadata.integrity,
			npm_shasum: packMetadata.shasum,
			sha256: tarballSha256,
			consumer_lockback_evidence: lockback.runtime_closure_matches_gate_g,
			consumer_lockback_report: relativePath(consumerLockbackPath),
			content_validation: contentValidation,
			installed_artifact_coherence: installedArtifactCoherence,
			runtime_closure_proof: runtimeClosureProof,
			release_evidence_links: {
				m9_release_gate_report: relativePath(options.m9ReleaseReport),
				m9_release_gate_summary: "reports/t9.6/release-report.md",
				t9_7_entropy_review: "reports/t9.7/entropy-review.json",
				t10_3_installed_artifact_report: relativePath(options.installedArtifactReport),
				checksum_evidence: relativePath(checksumPath),
				consumer_lockback_evidence: relativePath(consumerLockbackPath),
			},
			pack: {
				command: `npm pack --pack-destination ${packDestination} --json`,
				status: packResult.status,
				signal: packResult.signal,
				timed_out: packResult.timed_out,
				error: packResult.error,
				timeout_ms: packResult.timeout_ms,
			},
		};
		const tarballArtifactPath = join(options.outDir, "t10.5-tarball-artifact.json");
		writeJson(tarballArtifactPath, tarballArtifactReport);

		if (tarballArtifactReport.status !== "pass") {
			const dryRunFailureReport = {
				schema_version: 1,
				task: "T10.5",
				status: "fail",
				package_name: packMetadata.name,
				package_version: packMetadata.version,
				tarball_file: packMetadata.filename,
				reason: "tarball artifact validation failed before publication dry-run",
			};
			const dryRunFailurePath = join(options.outDir, "t10.5-publication-dry-run.json");
			writeJson(dryRunFailurePath, dryRunFailureReport);
			process.stderr.write("publication-dry-run: tarball artifact validation failed\n");
			return 1;
		}

		const tarballArg = relativePath(tarballPath);
		const publishDryRunArgs = [
			"publish",
			"--dry-run",
			tarballArg,
			"--tag",
			"latest",
			"--access",
			"public",
			"--registry",
			"https://registry.npmjs.org/",
			"--json",
		];
		const publishDryRun = run("npm", publishDryRunArgs, {
			env: commandEnv,
			timeoutMs: options.commandTimeoutMs,
		});
		const dryRunStatus = publishDryRun.status === 0 ? "pass" : "fail";
		const dryRunReport = {
			schema_version: 1,
			task: "T10.5",
			status: dryRunStatus,
			package_name: expectedPackageName,
			package_version: expectedPackageVersion,
			tarball_file: packMetadata.filename,
			tarball_path: tarballArg,
			command: `npm ${publishDryRunArgs.join(" ")}`,
			exit_status: publishDryRun.status,
			signal: publishDryRun.signal,
			timed_out: publishDryRun.timed_out,
			error: publishDryRun.error,
			timeout_ms: publishDryRun.timeout_ms,
			stdout: publishDryRun.stdout,
			stderr: publishDryRun.stderr,
			tarball_artifact_report: relativePath(tarballArtifactPath),
		};
		const dryRunPath = join(options.outDir, "t10.5-publication-dry-run.json");
		writeJson(dryRunPath, dryRunReport);

		if (dryRunStatus !== "pass") {
			process.stderr.write("publication-dry-run: npm publish dry-run failed\n");
			return 1;
		}

		copyEvidence(consumerLockbackPath, options.evidenceDir, "consumer-lockback.json");
		copyEvidence(tarballArtifactPath, options.evidenceDir, "t10.5-tarball-artifact.json");
		copyEvidence(dryRunPath, options.evidenceDir, "t10.5-publication-dry-run.json");

		process.stdout.write(
			`publication-dry-run: archived ${relativePath(tarballArtifactPath)} and ${relativePath(dryRunPath)}\n`,
		);
		return 0;
	} finally {
		rmSync(npmCacheDir, { recursive: true, force: true });
	}
}

process.exitCode = main();
