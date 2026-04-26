import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

const REPO_ROOT = resolve(__dirname, "..");
const SCRIPT_PATH = resolve(REPO_ROOT, "scripts", "reproducibility-audit.mjs");
const SOURCE_PACKAGE_JSON_PATH = resolve(REPO_ROOT, "package.json");
const SOURCE_LOCKFILE_PATH = resolve(REPO_ROOT, "package-lock.json");

interface RootPackageJson {
	name: string;
	version: string;
	packageManager: string;
	engines: { node: string };
	dependencies: Record<string, string>;
	devDependencies: Record<string, string>;
}

interface LockPackageEntry {
	version?: string;
	integrity?: string;
	dev?: boolean;
	optional?: boolean;
}

interface PackageLockJson {
	name: string;
	version: string;
	lockfileVersion: number;
	requires: boolean;
	packages: Record<
		string,
		LockPackageEntry & {
			name?: string;
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
			engines?: Record<string, string>;
		}
	>;
}

interface TempAuditRepo {
	dir: string;
	packageJsonPath: string;
	lockfilePath: string;
	reportPath: string;
}

function run(command: string, args: string[], cwd: string): void {
	const result = spawnSync(command, args, {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
		encoding: "utf8",
	});
	assert.equal(
		result.status,
		0,
		`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
	);
}

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`, "utf8");
}

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

function createInstalledPackage(repoDir: string, packageName: string, version: string): void {
	const packageDir = resolve(repoDir, "node_modules", packageName);
	mkdirSync(packageDir, { recursive: true });
	writeJson(resolve(packageDir, "package.json"), { name: packageName, version });
}

function createTempAuditRepo(): TempAuditRepo {
	const dir = mkdtempSync(join(tmpdir(), "anchormap-audit-test-"));
	const packageJsonPath = resolve(dir, "package.json");
	const lockfilePath = resolve(dir, "package-lock.json");
	const reportPath = resolve(dir, "reports", "t9.5", "dependency-audit.json");
	const packageJson = readJson<RootPackageJson>(SOURCE_PACKAGE_JSON_PATH);
	const lockfile = readJson<PackageLockJson>(SOURCE_LOCKFILE_PATH);

	writeJson(packageJsonPath, packageJson);
	writeJson(lockfilePath, lockfile);

	for (const [packageName, spec] of [
		...Object.entries(packageJson.dependencies),
		...Object.entries(packageJson.devDependencies),
	]) {
		createInstalledPackage(dir, packageName, spec);
	}

	const goldenPath = resolve(dir, "fixtures", "B-scan", "fx01_scan_min_clean", "stdout.golden");
	mkdirSync(dirname(goldenPath), { recursive: true });
	writeFileSync(goldenPath, '{"analysis_health":"clean"}\n', "utf8");

	run("git", ["init"], dir);
	run("git", ["add", "package.json", "package-lock.json", "fixtures"], dir);

	return { dir, packageJsonPath, lockfilePath, reportPath };
}

function runAudit(repoDir: string, args: string[] = []) {
	return spawnSync(process.execPath, [SCRIPT_PATH, "--repo-root", repoDir, ...args], {
		cwd: repoDir,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

test("reproducibility audit writes and validates deterministic dependency report", () => {
	const repo = createTempAuditRepo();
	try {
		const writeResult = runAudit(repo.dir, ["--write"]);
		assert.equal(writeResult.status, 0, writeResult.stderr);

		const validateResult = runAudit(repo.dir);
		assert.equal(validateResult.status, 0, validateResult.stderr);

		const report = readJson<{
			task: string;
			release_candidate: { lockfile_sha256: string };
			contract_dependency_policy: {
				floating_semver_ranges_rejected: boolean;
				full_lockfile_hash_checked: boolean;
			};
			contract_affecting_dependencies: Array<{
				package_name: string;
				package_spec: string;
				lockfile_version: string;
				installed_version: string;
			}>;
			goldens: { count: number; versioned: boolean };
			gate_g_dependency_verdict: string;
		}>(repo.reportPath);
		assert.equal(report.task, "T9.5");
		assert.match(report.release_candidate.lockfile_sha256, /^[0-9a-f]{64}$/);
		assert.equal(report.contract_dependency_policy.floating_semver_ranges_rejected, true);
		assert.equal(report.contract_dependency_policy.full_lockfile_hash_checked, true);
		assert.deepEqual(
			report.contract_affecting_dependencies.map((dependency) => [
				dependency.package_name,
				dependency.package_spec,
				dependency.lockfile_version,
				dependency.installed_version,
			]),
			[
				["commonmark", "0.30.0", "0.30.0", "0.30.0"],
				["yaml", "2.8.3", "2.8.3", "2.8.3"],
				["typescript", "6.0.3", "6.0.3", "6.0.3"],
			],
		);
		assert.equal(report.goldens.versioned, true);
		assert.equal(report.goldens.count, 1);
		assert.equal(report.gate_g_dependency_verdict, "pass");
	} finally {
		rmSync(repo.dir, { recursive: true, force: true });
	}
});

test("reproducibility audit rejects floating package dependency ranges", () => {
	const repo = createTempAuditRepo();
	try {
		const packageJson = readJson<RootPackageJson>(repo.packageJsonPath);
		packageJson.dependencies.commonmark = "^0.30.0";
		writeJson(repo.packageJsonPath, packageJson);

		const result = runAudit(repo.dir, ["--write"]);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /package\.json dependencies\.commonmark must use an exact version/);
	} finally {
		rmSync(repo.dir, { recursive: true, force: true });
	}
});

test("reproducibility audit rejects package-lock root drift", () => {
	const repo = createTempAuditRepo();
	try {
		const lockfile = readJson<PackageLockJson>(repo.lockfilePath);
		const rootPackage = lockfile.packages[""];
		assert.ok(rootPackage.dependencies);
		rootPackage.dependencies.yaml = "2.8.2";
		writeJson(repo.lockfilePath, lockfile);

		const result = runAudit(repo.dir, ["--write"]);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /package-lock\.json root dependencies is out of sync/);
	} finally {
		rmSync(repo.dir, { recursive: true, force: true });
	}
});

test("reproducibility audit rejects an untracked package lockfile", () => {
	const repo = createTempAuditRepo();
	try {
		run("git", ["rm", "--cached", "--", "package-lock.json"], repo.dir);

		const result = runAudit(repo.dir, ["--write"]);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /package-lock\.json must be tracked by git/);
	} finally {
		rmSync(repo.dir, { recursive: true, force: true });
	}
});

test("reproducibility audit rejects untracked fixture goldens", () => {
	const repo = createTempAuditRepo();
	try {
		const untrackedGoldenPath = resolve(repo.dir, "fixtures", "B-scan", "fx02", "stdout.golden");
		mkdirSync(dirname(untrackedGoldenPath), { recursive: true });
		writeFileSync(untrackedGoldenPath, "{}\n", "utf8");

		const result = runAudit(repo.dir, ["--write"]);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /fixture golden files must be tracked by git/);
	} finally {
		rmSync(repo.dir, { recursive: true, force: true });
	}
});

test("reproducibility audit rejects transitive package-lock drift after report archival", () => {
	const repo = createTempAuditRepo();
	try {
		const writeResult = runAudit(repo.dir, ["--write"]);
		assert.equal(writeResult.status, 0, writeResult.stderr);

		const lockfile = readJson<PackageLockJson>(repo.lockfilePath);
		const transitiveEntry = lockfile.packages["node_modules/entities"];
		assert.ok(transitiveEntry);
		transitiveEntry.version = "2.2.1";
		transitiveEntry.integrity = "sha512-transitive-lock-drift";
		writeJson(repo.lockfilePath, lockfile);

		const result = runAudit(repo.dir);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /archived report is stale/);
	} finally {
		rmSync(repo.dir, { recursive: true, force: true });
	}
});

test("reproducibility audit rejects stale archived reports", () => {
	const repo = createTempAuditRepo();
	try {
		const writeResult = runAudit(repo.dir, ["--write"]);
		assert.equal(writeResult.status, 0, writeResult.stderr);

		const goldenPath = resolve(
			repo.dir,
			"fixtures",
			"B-scan",
			"fx01_scan_min_clean",
			"stdout.golden",
		);
		writeFileSync(goldenPath, '{"analysis_health":"degraded"}\n', "utf8");

		const result = runAudit(repo.dir);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /archived report is stale/);
	} finally {
		rmSync(repo.dir, { recursive: true, force: true });
	}
});
