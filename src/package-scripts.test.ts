import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const REPO_ROOT = resolve(__dirname, "..");
const PACKAGE_JSON_PATH = resolve(REPO_ROOT, "package.json");

interface PackageJson {
	bin?: Record<string, string>;
	scripts?: Record<string, string>;
}

function loadPackageJson(): PackageJson {
	return JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as PackageJson;
}

test("package.json exposes the stable repo-local check and harness command surface", () => {
	const packageJson = loadPackageJson();
	const scripts = packageJson.scripts ?? {};

	assert.deepEqual(packageJson.bin, {
		anchormap: "dist/anchormap.js",
	});
	assert.equal(scripts["check:docs"], "sh scripts/check-docs-consistency.sh");
	assert.equal(scripts.test, "npm run test:unit");
	assert.equal(
		scripts["test:docs"],
		'npm run check:docs && npm run build && node --test "dist/package-scripts.test.js" "dist/harness/docs-consistency.test.js" "dist/harness/lint-tasks-fixture.test.js" "dist/harness/workflow-preflight-fixture.test.js"',
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
