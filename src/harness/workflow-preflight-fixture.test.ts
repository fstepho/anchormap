import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
	appendFileSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { test } from "node:test";

type TextSpec = { kind: "empty" } | { kind: "contains"; value: string };

type WorkflowPreflightFixtureManifest = {
	id: string;
	args: string[];
	baseline_files?: string[];
	changed_file_appends?: string[];
	changed_files?: string[];
	exit_code: number;
	renamed_files?: Array<{ from: string; to: string }>;
	stdout: TextSpec;
	stderr: TextSpec;
};

const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT_PATH = resolve(REPO_ROOT, "scripts", "workflow-preflight.sh");
const FAMILY_DIR = resolve(REPO_ROOT, "testdata", "workflow-preflight");

function loadManifest(dir: string): WorkflowPreflightFixtureManifest {
	const raw = readFileSync(resolve(dir, "case.json"), "utf8");
	return JSON.parse(raw) as WorkflowPreflightFixtureManifest;
}

function runGit(root: string, args: string[]): void {
	const result = spawnSync(
		"git",
		[
			"-c",
			"commit.gpgsign=false",
			"-c",
			"tag.gpgsign=false",
			"-c",
			"gpg.format=openpgp",
			"-c",
			"core.hooksPath=/dev/null",
			"-C",
			root,
			...args,
		],
		{
			env: {
				...process.env,
				GIT_CONFIG_GLOBAL: "/dev/null",
				GIT_CONFIG_SYSTEM: "/dev/null",
				HUSKY: "0",
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	if (result.status !== 0) {
		throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString("utf8")}`);
	}
}

function writeFileUnder(root: string, path: string, content: string): void {
	const target = resolve(root, path);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content);
}

function prepareRepo(fixtureDir: string, manifest: WorkflowPreflightFixtureManifest): string {
	const root = mkdtempSync(resolve(tmpdir(), "anchormap-preflight-"));
	const tasks = readFileSync(resolve(fixtureDir, "tasks.md"), "utf8");
	writeFileUnder(root, "docs/tasks.md", tasks);
	for (const file of manifest.baseline_files ?? []) {
		writeFileUnder(root, file, `fixture baseline for ${file}\n`);
	}

	runGit(root, ["init"]);
	runGit(root, ["add", "."]);
	runGit(root, [
		"-c",
		"user.name=AnchorMap Test",
		"-c",
		"user.email=anchormap@example.invalid",
		"commit",
		"-m",
		"baseline",
	]);

	for (const file of manifest.changed_files ?? []) {
		writeFileUnder(root, file, `fixture change for ${file}\n`);
	}
	for (const file of manifest.changed_file_appends ?? []) {
		appendFileSync(resolve(root, file), `\nfixture append for ${file}\n`);
	}
	for (const rename of manifest.renamed_files ?? []) {
		mkdirSync(dirname(resolve(root, rename.to)), { recursive: true });
		runGit(root, ["mv", rename.from, rename.to]);
	}

	return root;
}

function runScript(
	fixtureDir: string,
	manifest: WorkflowPreflightFixtureManifest,
): {
	stdout: Buffer;
	stderr: Buffer;
	status: number | null;
} {
	const root = prepareRepo(fixtureDir, manifest);
	try {
		const result = spawnSync("sh", [SCRIPT_PATH, ...manifest.args], {
			env: {
				...process.env,
				TASKS_FILE: resolve(root, "docs", "tasks.md"),
				WORKFLOW_PREFLIGHT_ROOT: root,
			},
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
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

function assertText(spec: TextSpec, actual: Buffer, streamName: string): void {
	if (spec.kind === "empty") {
		assert.equal(actual.length, 0, `expected empty ${streamName}, got: ${actual.toString()}`);
		return;
	}
	const text = actual.toString("utf8");
	assert.ok(
		text.includes(spec.value),
		`expected ${streamName} to contain ${JSON.stringify(spec.value)}, got: ${text}`,
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
	test(`workflow-preflight fixture: ${fixtureId}`, () => {
		const manifest = loadManifest(fixtureDir);
		assert.equal(manifest.id, fixtureId, "manifest.id must match directory name");
		const { stdout, stderr, status } = runScript(fixtureDir, manifest);
		assert.equal(status, manifest.exit_code, `exit code; stderr was: ${stderr.toString()}`);
		assertText(manifest.stdout, stdout, "stdout");
		assertText(manifest.stderr, stderr, "stderr");
	});
}
