import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

type StdoutSpec = { kind: "empty" };
type StderrSpec = { kind: "empty" } | { kind: "contains"; value: string };

type DocsConsistencyFixtureManifest = {
	id: string;
	args: string[];
	exit_code: number;
	stdout: StdoutSpec;
	stderr: StderrSpec;
};

const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT_PATH = resolve(REPO_ROOT, "scripts", "check-docs-consistency.sh");
const FAMILY_DIR = resolve(REPO_ROOT, "fixtures", "docs-consistency");

function loadManifest(dir: string): DocsConsistencyFixtureManifest {
	const raw = readFileSync(resolve(dir, "manifest.json"), "utf8");
	return JSON.parse(raw) as DocsConsistencyFixtureManifest;
}

function runScript(
	fixtureDir: string,
	args: string[],
): {
	stdout: Buffer;
	stderr: Buffer;
	status: number | null;
} {
	const docsRoot = resolve(fixtureDir, "docs");
	const result = spawnSync("sh", [SCRIPT_PATH, ...args], {
		env: { ...process.env, DOCS_ROOT: docsRoot },
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.error) {
		throw result.error;
	}
	return {
		stdout: result.stdout,
		stderr: result.stderr,
		status: result.status,
	};
}

function assertStdout(spec: StdoutSpec, actual: Buffer): void {
	assert.equal(spec.kind, "empty");
	assert.equal(actual.length, 0, `expected empty stdout, got ${actual.length} bytes`);
}

function assertStderr(spec: StderrSpec, actual: Buffer): void {
	if (spec.kind === "empty") {
		assert.equal(actual.length, 0, `expected empty stderr, got: ${actual.toString()}`);
		return;
	}
	const text = actual.toString("utf8");
	assert.ok(
		text.includes(spec.value),
		`expected stderr to contain ${JSON.stringify(spec.value)}, got: ${text}`,
	);
}

function discoverFixtures(): string[] {
	return readdirSync(FAMILY_DIR).filter((entry) => {
		const full = resolve(FAMILY_DIR, entry);
		return statSync(full).isDirectory();
	});
}

test("docs consistency check passes on the clean repository", () => {
	const result = spawnSync("sh", [SCRIPT_PATH], {
		cwd: REPO_ROOT,
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.error) {
		throw result.error;
	}
	assert.equal(result.status, 0, `expected success, stderr was: ${result.stderr.toString()}`);
	assert.equal(result.stdout.length, 0, "expected empty stdout on success");
	assert.equal(result.stderr.length, 0, "expected empty stderr on success");
});

for (const fixtureId of discoverFixtures()) {
	const fixtureDir = resolve(FAMILY_DIR, fixtureId);
	test(`docs-consistency fixture: ${fixtureId}`, () => {
		const manifest = loadManifest(fixtureDir);
		assert.equal(manifest.id, fixtureId, "manifest.id must match directory name");
		const { stdout, stderr, status } = runScript(fixtureDir, manifest.args);
		assert.equal(status, manifest.exit_code, `exit code; stderr was: ${stderr.toString()}`);
		assertStdout(manifest.stdout, stdout);
		assertStderr(manifest.stderr, stderr);
	});
}
