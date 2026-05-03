import { spawnSync } from "node:child_process";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultReportPath = join(repoRoot, "reports", "t10.3", "installed-artifact-report.json");
const defaultCommandTimeoutMs = 30_000;
const expectedInitYaml = `version: 1
product_root: 'src'
spec_roots:
  - 'specs'
mappings: {}
`;
const expectedMappedYaml = `version: 1
product_root: 'src'
spec_roots:
  - 'specs'
mappings:
  'AM-001':
    seed_files:
      - 'src/index.ts'
`;
const expectedScanJson = `${JSON.stringify({
	schema_version: 2,
	config: {
		version: 1,
		product_root: "src",
		spec_roots: ["specs"],
		ignore_roots: [],
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

function parseArgs(argv) {
	const options = {
		reportPath: defaultReportPath,
		commandTimeoutMs: defaultCommandTimeoutMs,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--report") {
			const value = argv[index + 1];
			if (value === undefined || value.startsWith("--")) {
				failUsage("verify-installed-artifact: --report requires a path");
			}
			options.reportPath = resolve(repoRoot, value);
			index += 1;
			continue;
		}
		if (arg === "--timeout-ms") {
			const value = argv[index + 1];
			if (value === undefined || value.startsWith("--")) {
				failUsage("verify-installed-artifact: --timeout-ms requires a positive integer");
			}
			options.commandTimeoutMs = parsePositiveInteger(value, "--timeout-ms");
			index += 1;
			continue;
		}
		failUsage(`verify-installed-artifact: invalid argument ${arg}`);
	}

	return options;
}

function parsePositiveInteger(value, flag) {
	if (!/^[0-9]+$/.test(value)) {
		failUsage(`verify-installed-artifact: ${flag} must be a positive integer`);
	}
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 1) {
		failUsage(`verify-installed-artifact: ${flag} must be a positive integer`);
	}
	return parsed;
}

function failUsage(message) {
	process.stderr.write(`${message}\n`);
	process.exit(2);
}

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: options.cwd ?? repoRoot,
		env: options.env ?? commandEnvironment(),
		encoding: "utf8",
		timeout: options.timeoutMs ?? defaultCommandTimeoutMs,
		killSignal: "SIGTERM",
	});

	return {
		command: [command, ...args].join(" "),
		cwd: options.cwdLabel ?? relativePath(options.cwd ?? repoRoot),
		status: result.status,
		signal: result.signal,
		timed_out: result.error?.code === "ETIMEDOUT",
		error: result.error === undefined ? null : result.error.message,
		timeout_ms: options.timeoutMs ?? defaultCommandTimeoutMs,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

function commandEnvironment(extra = {}) {
	const env = {
		...process.env,
		...extra,
	};
	delete env.NODE_OPTIONS;
	delete env.NODE_PATH;
	return env;
}

function inheritedNodeOptionsPresent() {
	return process.env.NODE_OPTIONS !== undefined && process.env.NODE_OPTIONS !== "";
}

function writeNodeOptionsFailureReport(reportPath) {
	const report = {
		task: "T10.3",
		verdict: "fail",
		environment: {
			node_options_inherited: true,
			node_options_rejected: true,
		},
		pack: null,
		package: null,
		consumer_install: null,
		installed_binary: null,
		runtime_source_check: null,
		commands: {
			init: null,
			map: null,
			scan_json: null,
		},
		checks: {
			node_options_unset: false,
		},
	};

	mkdirSync(dirname(reportPath), { recursive: true });
	writeFileSync(reportPath, `${JSON.stringify(report, null, "\t")}\n`, "utf8");
}

function relativePath(path) {
	const relativePath = relative(repoRoot, path);
	return relativePath === "" ? "." : relativePath;
}

function pathContains(parentPath, candidatePath) {
	const candidateRelativePath = relative(parentPath, candidatePath);
	return (
		candidateRelativePath === "" ||
		(!candidateRelativePath.startsWith("..") && !isAbsolute(candidateRelativePath))
	);
}

function listFiles(root) {
	const files = [];
	function walk(current) {
		for (const dirent of readdirSync(current, { withFileTypes: true }).sort((left, right) =>
			compareStrings(left.name, right.name),
		)) {
			const path = join(current, dirent.name);
			if (dirent.isDirectory()) {
				walk(path);
				continue;
			}
			if (dirent.isFile()) {
				files.push(relative(root, path).split(sep).join("/"));
			}
		}
	}
	walk(root);
	return files;
}

function compareStrings(left, right) {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function writeMinimalRepository(repoDir) {
	mkdirSync(join(repoDir, "src"), { recursive: true });
	mkdirSync(join(repoDir, "specs"), { recursive: true });
	writeFileSync(join(repoDir, "src", "index.ts"), "export const value = 1;\n", "utf8");
	writeFileSync(join(repoDir, "specs", "requirements.md"), "# AM-001: Minimal behavior\n", "utf8");
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function readTextForReport(path) {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

function readJsonForReport(path) {
	try {
		return readJson(path);
	} catch {
		return null;
	}
}

function lstatForReport(path) {
	try {
		return lstatSync(path);
	} catch {
		return null;
	}
}

function realpathForReport(path) {
	try {
		return realpathSync(path);
	} catch {
		return null;
	}
}

function readlinkForReport(path) {
	try {
		return readlinkSync(path);
	} catch {
		return null;
	}
}

function listFilesForReport(path) {
	try {
		return listFiles(path);
	} catch {
		return [];
	}
}

function isPackageOwnedSourceFile(path) {
	if (path === "node_modules" || path.startsWith("node_modules/")) {
		return false;
	}
	return path === "src" || path.startsWith("src/") || path.endsWith(".ts");
}

function parsePackMetadata(packResult) {
	if (packResult.status !== 0) {
		return {
			metadata: null,
			error: null,
		};
	}

	try {
		const [metadata] = JSON.parse(packResult.stdout);
		return {
			metadata: metadata ?? null,
			error: metadata === undefined ? "npm pack returned no package metadata" : null,
		};
	} catch (error) {
		return {
			metadata: null,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function main() {
	const { reportPath, commandTimeoutMs } = parseArgs(process.argv.slice(2));
	if (inheritedNodeOptionsPresent()) {
		writeNodeOptionsFailureReport(reportPath);
		process.stderr.write(
			`verify-installed-artifact: NODE_OPTIONS must be unset for installed artifact verification; report: ${reportPath}\n`,
		);
		return 1;
	}

	const workDir = mkdtempSync(join(tmpdir(), "anchormap-installed-artifact-"));
	const packDir = join(workDir, "pack");
	const consumerDir = join(workDir, "consumer");
	const repoDir = join(workDir, "repo");
	const npmCacheDir = join(workDir, "npm-cache");
	const commandEnv = commandEnvironment({
		npm_config_cache: npmCacheDir,
	});

	try {
		mkdirSync(packDir);
		mkdirSync(consumerDir);
		mkdirSync(repoDir);
		writeFileSync(
			join(consumerDir, "package.json"),
			`${JSON.stringify(
				{
					name: "anchormap-installed-artifact-consumer",
					version: "1.0.0",
					private: true,
					type: "commonjs",
				},
				null,
				"\t",
			)}\n`,
			"utf8",
		);
		writeMinimalRepository(repoDir);

		const packResult = run("npm", ["pack", "--pack-destination", packDir, "--json"], {
			env: commandEnv,
			timeoutMs: commandTimeoutMs,
		});
		const { metadata: packMetadata, error: packMetadataError } = parsePackMetadata(packResult);
		const tarballPath = packMetadata === null ? null : join(packDir, packMetadata.filename);
		const installResult =
			tarballPath === null
				? null
				: run("npm", ["install", tarballPath, "--ignore-scripts", "--no-audit", "--no-fund"], {
						cwd: consumerDir,
						cwdLabel: "consumer",
						env: commandEnv,
						timeoutMs: commandTimeoutMs,
					});
		const packageDir = join(consumerDir, "node_modules", "anchormap");
		const binPath = join(consumerDir, "node_modules", ".bin", "anchormap");
		const packageJson = readJsonForReport(join(packageDir, "package.json"));
		const binStat = lstatForReport(binPath);
		const binRealpath = realpathForReport(binPath);
		const packageRealpath = realpathForReport(packageDir);
		const binTarget =
			binStat === null
				? null
				: binStat.isSymbolicLink()
					? readlinkForReport(binPath)
					: binRealpath === null
						? null
						: relative(consumerDir, binRealpath);
		const releaseLauncherPath =
			packageRealpath === null ? null : join(packageRealpath, "bin", "anchormap");
		const installedFiles = listFilesForReport(packageDir);
		const installedSourceFiles = installedFiles.filter(isPackageOwnedSourceFile);
		const installedBinaryAvailable =
			installResult?.status === 0 && binStat !== null && binRealpath !== null;

		const initResult = installedBinaryAvailable
			? run(binPath, ["init", "--root", "src", "--spec-root", "specs"], {
					cwd: repoDir,
					cwdLabel: "minimal-supported-repo",
					env: commandEnv,
					timeoutMs: commandTimeoutMs,
				})
			: null;
		const initYaml = readTextForReport(join(repoDir, "anchormap.yaml"));

		const mapResult = installedBinaryAvailable
			? run(binPath, ["map", "--anchor", "AM-001", "--seed", "src/index.ts"], {
					cwd: repoDir,
					cwdLabel: "minimal-supported-repo",
					env: commandEnv,
					timeoutMs: commandTimeoutMs,
				})
			: null;
		const mappedYaml = readTextForReport(join(repoDir, "anchormap.yaml"));

		const scanResult = installedBinaryAvailable
			? run(binPath, ["scan", "--json"], {
					cwd: repoDir,
					cwdLabel: "minimal-supported-repo",
					env: commandEnv,
					timeoutMs: commandTimeoutMs,
				})
			: null;

		const checks = {
			node_options_unset: true,
			npm_pack_exit_zero: packResult.status === 0,
			npm_pack_metadata_valid: packMetadata !== null && packMetadataError === null,
			consumer_install_exit_zero: installResult?.status === 0,
			installed_binary_present: binStat !== null,
			package_name: packageJson?.name === "anchormap",
			package_version: packageJson?.version === packMetadata?.version,
			bin_resolves_to_installed_package:
				binRealpath !== null &&
				packageRealpath !== null &&
				pathContains(packageRealpath, binRealpath),
			bin_points_at_release_launcher:
				binRealpath !== null &&
				releaseLauncherPath !== null &&
				binRealpath === releaseLauncherPath,
			compiled_dist_entry_present: existsSync(join(packageDir, "dist", "anchormap.js")),
			typescript_source_absent: installedSourceFiles.length === 0,
			shrinkwrap_present: existsSync(join(packageDir, "npm-shrinkwrap.json")),
			init_exit_zero: initResult?.status === 0,
			init_canonical_yaml: initYaml === expectedInitYaml,
			map_exit_zero: mapResult?.status === 0,
			map_canonical_yaml: mappedYaml === expectedMappedYaml,
			scan_json_exit_zero: scanResult?.status === 0,
			scan_json_stderr_empty: scanResult?.stderr === "",
			scan_json_matches_expected: scanResult?.stdout === expectedScanJson,
		};
		const verdict = Object.values(checks).every(Boolean) ? "pass" : "fail";
		const report = {
			task: "T10.3",
			verdict,
			pack: {
				command: "npm pack --pack-destination <temp-pack-dir> --json",
				status: packResult.status,
				signal: packResult.signal,
				timed_out: packResult.timed_out,
				error: packResult.error,
				timeout_ms: packResult.timeout_ms,
				stdout: packResult.status === 0 && packMetadataError === null ? null : packResult.stdout,
				stderr: packResult.status === 0 && packMetadataError === null ? null : packResult.stderr,
				metadata_error: packMetadataError,
			},
			package:
				packMetadata === null
					? null
					: {
							id: packMetadata.id,
							name: packMetadata.name,
							version: packMetadata.version,
							filename: packMetadata.filename,
							integrity: packMetadata.integrity,
							shasum: packMetadata.shasum,
							files: packMetadata.files.map((file) => file.path).sort(),
						},
			consumer_install: {
				command:
					packMetadata === null
						? null
						: `npm install <local tarball:${packMetadata.filename}> --ignore-scripts --no-audit --no-fund`,
				status: installResult?.status ?? null,
				signal: installResult?.signal ?? null,
				timed_out: installResult?.timed_out ?? null,
				error: installResult?.error ?? null,
				timeout_ms: installResult?.timeout_ms ?? commandTimeoutMs,
				stdout: installResult?.status === 0 ? null : (installResult?.stdout ?? null),
				stderr: installResult?.status === 0 ? null : (installResult?.stderr ?? null),
				package_lock_present: existsSync(join(consumerDir, "package-lock.json")),
			},
			installed_binary: {
				invocation: relative(consumerDir, binPath).split(sep).join("/"),
				present: binStat !== null,
				link_target: binTarget === null ? null : binTarget.split(sep).join("/"),
				realpath_within_package: checks.bin_resolves_to_installed_package,
			},
			runtime_source_check: {
				compiled_dist_entry_present: checks.compiled_dist_entry_present,
				typescript_source_absent: checks.typescript_source_absent,
				unexpected_source_files: installedSourceFiles,
			},
			commands: {
				init:
					initResult === null
						? null
						: {
								status: initResult.status,
								signal: initResult.signal,
								timed_out: initResult.timed_out,
								error: initResult.error,
								timeout_ms: initResult.timeout_ms,
								stdout: initResult.stdout,
								stderr: initResult.stderr,
								anchormap_yaml: initYaml,
							},
				map:
					mapResult === null
						? null
						: {
								status: mapResult.status,
								signal: mapResult.signal,
								timed_out: mapResult.timed_out,
								error: mapResult.error,
								timeout_ms: mapResult.timeout_ms,
								stdout: mapResult.stdout,
								stderr: mapResult.stderr,
								anchormap_yaml: mappedYaml,
							},
				scan_json:
					scanResult === null
						? null
						: {
								status: scanResult.status,
								signal: scanResult.signal,
								timed_out: scanResult.timed_out,
								error: scanResult.error,
								timeout_ms: scanResult.timeout_ms,
								stdout: scanResult.stdout,
								stderr: scanResult.stderr,
							},
			},
			checks,
		};

		mkdirSync(dirname(reportPath), { recursive: true });
		writeFileSync(reportPath, `${JSON.stringify(report, null, "\t")}\n`, "utf8");

		if (verdict !== "pass") {
			process.stderr.write(`installed artifact verification failed; report: ${reportPath}\n`);
			return 1;
		}
		process.stdout.write(`installed artifact verification passed; report: ${reportPath}\n`);
		return 0;
	} finally {
		rmSync(workDir, { recursive: true, force: true });
	}
}

process.exitCode = main();
