import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { test } from "node:test";

import {
	EXPECTED_PACKAGE_FILES,
	EXPECTED_PACKAGE_VERSION,
	loadPackageJson,
	loadPackageLockJson,
	NPM_SHRINKWRAP_PATH,
	PACKAGE_LOCK_PATH,
	RELEASE_LAUNCHER_PATH,
	REPO_ROOT,
} from "./package-scripts-test-support";

test("package.json exposes the stable repo-local check and harness command surface", () => {
	const packageJson = loadPackageJson();
	const scripts = packageJson.scripts ?? {};

	assert.equal(packageJson.name, "anchormap");
	assert.equal(packageJson.version, EXPECTED_PACKAGE_VERSION);
	assert.equal(packageJson.license, "MIT");
	assert.equal(packageJson.private, false);
	assert.deepEqual(packageJson.publishConfig, {
		access: "public",
		registry: "https://registry.npmjs.org/",
	});
	assert.deepEqual(packageJson.engines, {
		node: ">=22.0.0",
	});
	assert.deepEqual(packageJson.bin, {
		anchormap: "bin/anchormap",
	});
	assert.deepEqual(packageJson.files, EXPECTED_PACKAGE_FILES);
	assert.match(
		readFileSync(RELEASE_LAUNCHER_PATH, "utf8"),
		/node --no-opt --max-semi-space-size=1 --no-expose-wasm/,
	);
	assert.doesNotMatch(readFileSync(RELEASE_LAUNCHER_PATH, "utf8"), /--max-old-space-size/);
	assert.equal(scripts["check:docs"], "sh scripts/check-docs-consistency.sh");
	assert.equal(scripts["bench:release"], "npm run build && node scripts/release-benchmark.mjs");
	assert.equal(
		scripts["bench:validate"],
		"node scripts/validate-release-benchmark-report.mjs bench/reports/gate-f-report.json",
	);
	assert.equal(
		scripts["bench:validate:artifacts"],
		"node scripts/validate-release-benchmark-report.mjs --require-supported-platform-artifacts reports/t9.4",
	);
	assert.equal(scripts["adoption:tsx"], "npm run build && node scripts/tsx-adoption-corpus.mjs");
	assert.equal(scripts["audit:reproducibility"], "node scripts/reproducibility-audit.mjs");
	assert.equal(
		scripts["audit:reproducibility:update"],
		"node scripts/reproducibility-audit.mjs --write",
	);
	assert.equal(scripts["release:gates"], "node scripts/release-gate-aggregator.mjs");
	assert.equal(
		scripts["release:publication-dry-run"],
		"npm run build && node scripts/publication-dry-run.mjs",
	);
	assert.equal(
		scripts["verify:installed-artifact"],
		"npm run build && node scripts/verify-installed-artifact.mjs",
	);
	assert.equal(scripts.test, "npm run test:unit");
	assert.equal(
		scripts["test:docs"],
		'npm run check:docs && npm run build && node --test "dist/package-scripts*.test.js" "dist/harness/docs-consistency.test.js" "dist/harness/lint-tasks-fixture.test.js" "dist/harness/workflow-preflight-fixture.test.js"',
	);
	assert.equal(
		scripts["test:release"],
		'npm run build && node --test "dist/release-gate-aggregator*.test.js" "dist/package-scripts*.test.js"',
	);
	assert.equal(scripts["test:unit"], 'npm run build && node --test "dist/**/*.test.js"');
	assert.equal(
		scripts["test:product"],
		'npm run build && node --test "dist/bootstrap.test.js" "dist/cli/**/*.test.js" "dist/domain/**/*.test.js" "dist/infra/**/*.test.js" "dist/render/**/*.test.js"',
	);
	assert.equal(
		scripts["test:harness"],
		'npm run build && node --test "dist/cli-stub.test.js" "dist/harness/fixture-*.test.js" "dist/harness/harness-smoke-fixtures.test.js"',
	);
	assert.equal(scripts["test:fixtures"], "npm run build && node dist/harness/fixture-runner.js");
	assert.equal(scripts["test:fixtures:all"], "npm run test:fixtures");
	assert.equal(scripts["check:goldens"], "npm run test:fixtures -- --goldens-only");
	assert.equal(scripts["workflow:preflight"], "sh scripts/workflow-preflight.sh");
});

test("release package contents include launcher and compiled CLI target", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-pack-test-"));
	const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
		cwd: REPO_ROOT,
		env: {
			...process.env,
			npm_config_cache: join(tempDir, "npm-cache"),
		},
		encoding: "utf8",
	});
	try {
		assert.equal(result.status, 0, result.stderr);

		const [packResult] = JSON.parse(result.stdout) as Array<{
			files: Array<{ path: string }>;
		}>;
		const packedFiles = packResult.files.map((file) => file.path).sort();
		const expectedPackedFiles = [
			"LICENSE",
			"README.md",
			"package.json",
			...EXPECTED_PACKAGE_FILES,
		].sort();

		assert.deepEqual(packedFiles, expectedPackedFiles);
		assert.ok(!packedFiles.some((path) => path.includes(".test.")));
		assert.ok(!packedFiles.some((path) => path.startsWith("dist/harness/")));
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("npm shrinkwrap mirrors the full root package lock state", () => {
	const packageLock = loadPackageLockJson(PACKAGE_LOCK_PATH);
	const shrinkwrap = loadPackageLockJson(NPM_SHRINKWRAP_PATH);

	assert.deepEqual(shrinkwrap, packageLock);
	assert.deepEqual(shrinkwrap.packages?.[""]?.devDependencies, {
		"@biomejs/biome": "2.4.12",
		"@types/node": "25.6.0",
	});
	assert.ok(shrinkwrap.packages?.["node_modules/@biomejs/biome"]);
	assert.ok(shrinkwrap.packages?.["node_modules/@types/node"]);
});

test("release launcher resolves the package dist path through a bin symlink", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "anchormap-bin-test-"));
	const binDir = join(tempDir, "bin");
	const fakeNodePath = join(binDir, "node");
	const symlinkPath = join(binDir, "anchormap");
	const fakeNodeLogPath = join(tempDir, "node-argv.json");

	mkdirSync(binDir);
	symlinkSync(RELEASE_LAUNCHER_PATH, symlinkPath);
	writeFileSync(fakeNodePath, `#!/bin/sh\nprintf '%s\\n' "$@" > "${fakeNodeLogPath}"\n`, "utf8");
	chmodSync(fakeNodePath, 0o755);

	const result = spawnSync("sh", ["-c", "anchormap --version"], {
		env: {
			...process.env,
			PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
		},
		encoding: "utf8",
	});

	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(readFileSync(fakeNodeLogPath, "utf8").trim().split("\n"), [
		"--no-opt",
		"--max-semi-space-size=1",
		"--no-expose-wasm",
		resolve(REPO_ROOT, "dist", "anchormap.js"),
		"--version",
	]);
});
