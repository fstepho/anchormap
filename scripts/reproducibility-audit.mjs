import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const defaultRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const defaultReportPath = join("reports", "t9.5", "dependency-audit.json")
const exactSemverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const exactPackageManagerPattern = /^npm@\d+\.\d+\.\d+$/

const contractDependencyPins = [
	{
		surface: "markdown_parsing",
		package_name: "commonmark",
		section: "dependencies",
		expected_version: "0.30.0",
		role: "MARKDOWN_PROFILE CommonMark 0.30 input parser",
		authority: ["contract.md §1.1", "ADR-0004", "design.md §11"],
		compatibility_evidence: ["S1", "T0.1", "B-decodage", "B-specs"],
	},
	{
		surface: "yaml_parsing",
		package_name: "yaml",
		section: "dependencies",
		expected_version: "2.8.3",
		role: "YAML_PROFILE YAML 1.2-compatible input parser wrapper",
		authority: ["contract.md §1.1", "ADR-0005", "design.md §11"],
		compatibility_evidence: ["S1", "T0.1", "B-decodage", "B-config", "B-specs"],
	},
	{
		surface: "typescript_parsing",
		package_name: "typescript",
		section: "dependencies",
		expected_version: "6.0.3",
		role: "TS_PROFILE parser API and build compiler",
		authority: ["contract.md §1.1", "ADR-0006", "design.md §11"],
		compatibility_evidence: ["S1", "T0.1", "B-decodage", "B-graph"],
	},
]

const projectOwnedSurfaces = [
	{
		surface: "filesystem_enumeration",
		implementation: "project-owned node:fs traversal with canonical sorting",
		package_dependency: null,
		authority: ["contract.md §4.1", "contract.md §12.6", "design.md §7.1", "design.md §11"],
	},
	{
		surface: "json_serialization",
		implementation: "project-owned closed-shape JSON renderer",
		package_dependency: null,
		authority: ["contract.md §13.7", "ADR-0007", "design.md §5.7", "design.md §11"],
	},
	{
		surface: "yaml_canonical_writing",
		implementation: "project-owned closed-shape YAML writer",
		package_dependency: null,
		authority: ["contract.md §7.5", "ADR-0007", "design.md §5.2", "design.md §11"],
	},
	{
		surface: "cli_parsing",
		implementation: "project-owned command parser and dispatcher",
		package_dependency: null,
		authority: ["ADR-0002", "contract.md §9", "design.md §5.6"],
	},
	{
		surface: "fixture_harness",
		implementation: "project-owned fixture harness on node:test",
		package_dependency: null,
		authority: ["ADR-0003", "evals.md §4.2", "evals.md §6"],
	},
]

function fail(message) {
	process.stderr.write(`${message}\n`)
	process.exit(1)
}

function parseArgs(argv) {
	const options = {
		repoRoot: defaultRepoRoot,
		reportPath: defaultReportPath,
		write: false,
	}

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		if (arg === "--write") {
			options.write = true
			continue
		}
		if (arg === "--repo-root") {
			const value = argv[index + 1]
			if (value === undefined || value.startsWith("--")) {
				fail("dependency-audit: --repo-root requires a path")
			}
			options.repoRoot = resolve(value)
			index += 1
			continue
		}
		if (arg === "--report") {
			const value = argv[index + 1]
			if (value === undefined || value.startsWith("--")) {
				fail("dependency-audit: --report requires a path")
			}
			options.reportPath = value
			index += 1
			continue
		}
		fail(`dependency-audit: invalid argument ${arg}`)
	}

	return options
}

function readJson(path, label) {
	if (!existsSync(path)) {
		fail(`dependency-audit: ${label} is missing at ${path}`)
	}
	try {
		return JSON.parse(readFileSync(path, "utf8"))
	} catch (error) {
		fail(`dependency-audit: ${label} is not valid JSON: ${error.message}`)
	}
}

function requireObject(value, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		fail(`dependency-audit: ${label} must be an object`)
	}
	return value
}

function compareStrings(left, right) {
	if (left < right) return -1
	if (left > right) return 1
	return 0
}

function sortedEntries(record) {
	return Object.entries(record ?? {}).sort(([left], [right]) => compareStrings(left, right))
}

function stableRecord(record) {
	return Object.fromEntries(sortedEntries(record))
}

function fileSha256(path) {
	return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function collectRootDependencySpecs(packageJson) {
	const dependencySections = ["dependencies", "devDependencies", "optionalDependencies"]
	const specs = []
	for (const section of dependencySections) {
		const dependencies = requireObject(packageJson[section] ?? {}, `package.json ${section}`)
		for (const [name, spec] of sortedEntries(dependencies)) {
			if (typeof spec !== "string") {
				fail(`dependency-audit: package.json ${section}.${name} must be a string`)
			}
			specs.push({ section, name, spec })
		}
	}
	return specs
}

function requireExactRootSpecs(packageJson) {
	const specs = collectRootDependencySpecs(packageJson)
	for (const { section, name, spec } of specs) {
		if (!exactSemverPattern.test(spec)) {
			fail(
				`dependency-audit: package.json ${section}.${name} must use an exact version, found ${spec}`,
			)
		}
	}
	return specs
}

function requirePackageManager(packageJson) {
	if (typeof packageJson.packageManager !== "string") {
		fail("dependency-audit: package.json packageManager must be npm@x.y.z")
	}
	if (!exactPackageManagerPattern.test(packageJson.packageManager)) {
		fail(
			`dependency-audit: package.json packageManager must pin npm exactly, found ${packageJson.packageManager}`,
		)
	}
	return packageJson.packageManager
}

function requireLockfileRoot(packageJson, lockfile) {
	if (lockfile.lockfileVersion !== 3) {
		fail("dependency-audit: package-lock.json lockfileVersion must be 3")
	}
	if (lockfile.requires !== true) {
		fail("dependency-audit: package-lock.json requires must be true")
	}

	const packages = requireObject(lockfile.packages, "package-lock.json packages")
	const rootPackage = requireObject(packages[""], 'package-lock.json packages[""]')
	if (rootPackage.name !== packageJson.name) {
		fail("dependency-audit: package-lock.json root name does not match package.json")
	}
	if (rootPackage.version !== packageJson.version) {
		fail("dependency-audit: package-lock.json root version does not match package.json")
	}

	for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
		const packageJsonSection = stableRecord(packageJson[section] ?? {})
		const lockfileSection = stableRecord(rootPackage[section] ?? {})
		if (JSON.stringify(packageJsonSection) !== JSON.stringify(lockfileSection)) {
			fail(`dependency-audit: package-lock.json root ${section} is out of sync with package.json`)
		}
	}

	return { packages, rootPackage }
}

function lockPackagePath(packageName) {
	return `node_modules/${packageName}`
}

function requireLockedRootDependency(lockPackages, dependency) {
	const lockEntry = requireObject(
		lockPackages[lockPackagePath(dependency.name)],
		`package-lock.json ${lockPackagePath(dependency.name)}`,
	)
	if (lockEntry.version !== dependency.spec) {
		fail(
			`dependency-audit: package-lock.json ${dependency.name} resolved version ${lockEntry.version} does not match ${dependency.spec}`,
		)
	}
	if (typeof lockEntry.integrity !== "string" || lockEntry.integrity.length === 0) {
		fail(`dependency-audit: package-lock.json ${dependency.name} must include integrity`)
	}
	return lockEntry
}

function readInstalledVersion(repoRoot, packageName) {
	const packagePath = join(repoRoot, "node_modules", packageName, "package.json")
	if (!existsSync(packagePath)) {
		fail(`dependency-audit: installed package ${packageName} is missing from node_modules`)
	}
	const installedPackage = readJson(packagePath, `${packageName} package.json`)
	if (typeof installedPackage.version !== "string") {
		fail(`dependency-audit: installed package ${packageName} has no version`)
	}
	return installedPackage.version
}

function requireContractDependencyPins(packageJson, lockPackages, repoRoot) {
	return contractDependencyPins.map((pin) => {
		const spec = packageJson[pin.section]?.[pin.package_name]
		if (spec !== pin.expected_version) {
			fail(
				`dependency-audit: ${pin.package_name} must be pinned to ${pin.expected_version}, found ${spec}`,
			)
		}
		const lockEntry = requireLockedRootDependency(lockPackages, {
			section: pin.section,
			name: pin.package_name,
			spec,
		})
		const installedVersion = readInstalledVersion(repoRoot, pin.package_name)
		if (installedVersion !== pin.expected_version) {
			fail(
				`dependency-audit: installed ${pin.package_name} version ${installedVersion} does not match ${pin.expected_version}`,
			)
		}
		return {
			...pin,
			package_spec: spec,
			lockfile_version: lockEntry.version,
			installed_version: installedVersion,
			lockfile_integrity: lockEntry.integrity,
		}
	})
}

function collectGoldenFiles(fixturesDir) {
	if (!existsSync(fixturesDir)) {
		fail(`dependency-audit: fixtures directory is missing at ${fixturesDir}`)
	}

	const files = []
	function visit(dir) {
		const entries = readdirSync(dir, { withFileTypes: true }).sort((left, right) =>
			compareStrings(left.name, right.name),
		)
		for (const entry of entries) {
			const fullPath = join(dir, entry.name)
			if (entry.isDirectory()) {
				visit(fullPath)
				continue
			}
			if (!entry.isFile()) {
				continue
			}
			const rel = relative(fixturesDir, fullPath).split("\\").join("/")
			const parts = rel.split("/")
			if (entry.name.endsWith(".golden") || parts.includes("expected")) {
				const content = readFileSync(fullPath)
				files.push({
					path: `fixtures/${rel}`,
					bytes: content.length,
					sha256: createHash("sha256").update(content).digest("hex"),
				})
			}
		}
	}
	visit(fixturesDir)

	if (files.length === 0) {
		fail("dependency-audit: no fixture golden files were found")
	}

	return files.sort((left, right) => compareStrings(left.path, right.path))
}

function requireGitTrackedGoldens(repoRoot, goldenFiles) {
	const relativePaths = goldenFiles.map((file) => file.path)
	const result = spawnSync("git", ["-C", repoRoot, "ls-files", "--error-unmatch", "--", ...relativePaths], {
		encoding: "utf8",
		maxBuffer: 10 * 1024 * 1024,
	})
	if (result.error) {
		fail(`dependency-audit: unable to verify versioned goldens with git: ${result.error.message}`)
	}
	if (result.status !== 0) {
		const detail = result.stderr.trim() || result.stdout.trim()
		fail(`dependency-audit: fixture golden files must be tracked by git${detail ? `: ${detail}` : ""}`)
	}
	const tracked = new Set(result.stdout.trim().split(/\r?\n/).filter(Boolean))
	for (const goldenPath of relativePaths) {
		if (!tracked.has(goldenPath)) {
			fail(`dependency-audit: fixture golden file is not tracked by git: ${goldenPath}`)
		}
	}
}

function requireGitTrackedLockfile(repoRoot) {
	const lockfilePath = "package-lock.json"
	const result = spawnSync("git", ["-C", repoRoot, "ls-files", "--error-unmatch", "--", lockfilePath], {
		encoding: "utf8",
		maxBuffer: 1024 * 1024,
	})
	if (result.error) {
		fail(`dependency-audit: unable to verify versioned lockfile with git: ${result.error.message}`)
	}
	if (result.status !== 0) {
		const detail = result.stderr.trim() || result.stdout.trim()
		fail(`dependency-audit: package-lock.json must be tracked by git${detail ? `: ${detail}` : ""}`)
	}
	const tracked = new Set(result.stdout.trim().split(/\r?\n/).filter(Boolean))
	if (!tracked.has(lockfilePath)) {
		fail("dependency-audit: package-lock.json is not tracked by git")
	}
}

function buildReport(repoRoot) {
	const packageJsonPath = join(repoRoot, "package.json")
	const lockfilePath = join(repoRoot, "package-lock.json")
	const fixturesDir = join(repoRoot, "fixtures")
	const packageJson = requireObject(readJson(packageJsonPath, "package.json"), "package.json")
	requireGitTrackedLockfile(repoRoot)
	const lockfile = requireObject(readJson(lockfilePath, "package-lock.json"), "package-lock.json")
	const packageManager = requirePackageManager(packageJson)
	const rootDependencySpecs = requireExactRootSpecs(packageJson)
	const { packages: lockPackages } = requireLockfileRoot(packageJson, lockfile)

	const lockedRootDependencies = rootDependencySpecs.map((dependency) => {
		const lockEntry = requireLockedRootDependency(lockPackages, dependency)
		return {
			section: dependency.section,
			package_name: dependency.name,
			package_spec: dependency.spec,
			lockfile_version: lockEntry.version,
			dev: lockEntry.dev === true,
			optional: lockEntry.optional === true,
		}
	})
	const contractDependencies = requireContractDependencyPins(packageJson, lockPackages, repoRoot)
	const goldenFiles = collectGoldenFiles(fixturesDir)
	requireGitTrackedGoldens(repoRoot, goldenFiles)

	return {
		schema_version: 1,
		task: "T9.5",
		release_candidate: {
			package_name: packageJson.name,
			package_version: packageJson.version,
			package_manager: packageManager,
			node_engine: packageJson.engines?.node ?? null,
			lockfile: "package-lock.json",
			lockfile_version: lockfile.lockfileVersion,
			lockfile_sha256: fileSha256(lockfilePath),
		},
		contract_dependency_policy: {
			floating_semver_ranges_rejected: true,
			lockfile_required: true,
			lockfile_root_consistency_checked: true,
			full_lockfile_hash_checked: true,
			installed_parser_versions_checked: true,
			versioned_goldens_checked_with_git: true,
		},
		contract_affecting_dependencies: contractDependencies,
		project_owned_contract_surfaces: projectOwnedSurfaces,
		root_package_dependencies: lockedRootDependencies,
		goldens: {
			versioned: true,
			count: goldenFiles.length,
			files: goldenFiles,
		},
		gate_g_dependency_verdict: "pass",
	}
}

function writeOrValidateReport(report, reportPath, write) {
	const expected = `${JSON.stringify(report, null, "\t")}\n`
	if (write) {
		mkdirSync(dirname(reportPath), { recursive: true })
		writeFileSync(reportPath, expected, "utf8")
		return
	}
	if (!existsSync(reportPath)) {
		fail(`dependency-audit: archived report is missing at ${reportPath}`)
	}
	const actual = readFileSync(reportPath, "utf8")
	if (actual !== expected) {
		fail(
			`dependency-audit: archived report is stale; run npm run audit:reproducibility:update`,
		)
	}
}

const options = parseArgs(process.argv.slice(2))
const repoRoot = resolve(options.repoRoot)
const reportPath = resolve(repoRoot, options.reportPath)
const report = buildReport(repoRoot)
writeOrValidateReport(report, reportPath, options.write)
