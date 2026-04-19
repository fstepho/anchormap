import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

type StdoutSpec = { kind: "golden" } | { kind: "empty" };
type StderrSpec = { kind: "empty" } | { kind: "contains"; value: string };

type LintTasksFixtureManifest = {
	id: string;
	args: string[];
	exit_code: number;
	stdout: StdoutSpec;
	stderr: StderrSpec;
};

const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT_PATH = resolve(REPO_ROOT, "scripts", "lint-tasks.sh");
const FAMILY_DIR = resolve(REPO_ROOT, "fixtures", "lint-tasks");

function loadManifest(dir: string): LintTasksFixtureManifest {
	const raw = readFileSync(resolve(dir, "manifest.json"), "utf8");
	const parsed = JSON.parse(raw) as LintTasksFixtureManifest;
	return parsed;
}

function runScript(
	fixtureDir: string,
	args: string[],
): {
	stdout: Buffer;
	stderr: Buffer;
	status: number | null;
} {
	const tasksFile = resolve(fixtureDir, "tasks.md");
	const result = spawnSync("sh", [SCRIPT_PATH, ...args], {
		env: { ...process.env, TASKS_FILE: tasksFile },
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

function assertStdout(spec: StdoutSpec, actual: Buffer, fixtureDir: string): void {
	if (spec.kind === "golden") {
		const expected = readFileSync(resolve(fixtureDir, "stdout.golden"));
		assert.deepEqual(actual, expected, "stdout bytes did not match stdout.golden");
		return;
	}
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

for (const fixtureId of discoverFixtures()) {
	const fixtureDir = resolve(FAMILY_DIR, fixtureId);
	test(`lint-tasks fixture: ${fixtureId}`, () => {
		const manifest = loadManifest(fixtureDir);
		assert.equal(manifest.id, fixtureId, "manifest.id must match directory name");
		const { stdout, stderr, status } = runScript(fixtureDir, manifest.args);
		assert.equal(status, manifest.exit_code, `exit code; stderr was: ${stderr.toString()}`);
		assertStdout(manifest.stdout, stdout, fixtureDir);
		assertStderr(manifest.stderr, stderr);
	});
}
