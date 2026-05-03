import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import {
	FIXTURE_STDOUT_GOLDEN_FILENAME,
	type FixtureManifest,
	FixtureManifestValidationError,
	loadFixtureManifest,
	resolveFixtureLayout,
	validateFixtureManifest,
} from "./fixture-manifest";

const REPO_ROOT = resolve(__dirname, "..", "..");
const FIXTURES_ROOT = resolve(REPO_ROOT, "fixtures");
const MANIFEST_TESTDATA_ROOT = resolve(REPO_ROOT, "testdata", "fixture-manifest");

function fixtureDir(family: string, id: string): string {
	return resolve(FIXTURES_ROOT, family, id);
}

function manifestTestdataDir(family: string, id: string): string {
	return resolve(MANIFEST_TESTDATA_ROOT, family, id);
}

function minimalFailureManifest(): FixtureManifest {
	return {
		id: "harness_schema_failure_inline",
		family: "harness-schema",
		purpose: "Inline manifest used for validator unit checks.",
		command: ["node", "dist/cli-stub.js", "scan", "--json"],
		cwd: ".",
		exit_code: 2,
		stdout: { kind: "empty" },
		stderr: { kind: "ignored" },
		filesystem: { kind: "no_mutation" },
	};
}

function withTempFixture(
	manifest: FixtureManifest,
	callback: (fixturePath: string) => void,
	setup?: (fixturePath: string) => void,
	options?: { createRepo?: boolean },
): void {
	const rootDir = mkdtempSync(resolve(tmpdir(), "anchormap-fixture-manifest-"));
	const path = resolve(rootDir, manifest.family, manifest.id);

	try {
		mkdirSync(path, { recursive: true });
		if (options?.createRepo !== false) {
			mkdirSync(resolve(path, "repo"), { recursive: true });
		}
		writeFileSync(resolve(path, "manifest.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
		setup?.(path);
		callback(path);
	} finally {
		rmSync(rootDir, { recursive: true, force: true });
	}
}

test("loads the minimal success fixture manifest and exposes the directory contract", () => {
	const loaded = loadFixtureManifest(fixtureDir("harness-schema", "harness_schema_success"));

	assert.equal(loaded.manifest.id, "harness_schema_success");
	assert.equal(loaded.manifest.family, "harness-schema");
	assert.equal(loaded.manifest.stdout.kind, "golden");
	assert.equal(loaded.manifest.filesystem.kind, "no_mutation");
	assert.ok(existsSync(loaded.layout.repoDir));
	assert.ok(existsSync(loaded.layout.stdoutGoldenPath));
	assert.equal(
		resolve(loaded.layout.fixtureDir, FIXTURE_STDOUT_GOLDEN_FILENAME),
		loaded.layout.stdoutGoldenPath,
	);
});

test("loads the minimal failure fixture manifest", () => {
	const loaded = loadFixtureManifest(fixtureDir("harness-schema", "harness_schema_failure"));

	assert.equal(loaded.manifest.id, "harness_schema_failure");
	assert.equal(loaded.manifest.exit_code, 2);
	assert.equal(loaded.manifest.stdout.kind, "empty");
	assert.equal(loaded.manifest.stderr.kind, "ignored");
	assert.equal(loaded.manifest.filesystem.kind, "no_mutation");
});

test("rejects a manifest with a missing id", () => {
	const manifestWithoutId = {
		family: "harness-schema",
		purpose: "Missing id should fail closed.",
		command: ["node", "dist/cli-stub.js", "scan", "--json"],
		cwd: ".",
		exit_code: 2,
		stdout: { kind: "empty" },
		stderr: { kind: "ignored" },
		filesystem: { kind: "no_mutation" },
	};

	assert.throws(() => validateFixtureManifest(manifestWithoutId), /missing required key "id"/i);
});

test("includes the fixture id when an on-disk manifest is readable JSON but missing id", () => {
	const rootDir = mkdtempSync(resolve(tmpdir(), "anchormap-fixture-manifest-"));
	const path = resolve(rootDir, "harness-schema", "harness_schema_missing_id_on_disk");

	try {
		mkdirSync(resolve(path, "repo"), { recursive: true });
		writeFileSync(
			resolve(path, "manifest.json"),
			`${JSON.stringify(
				{
					family: "harness-schema",
					purpose: "Missing id should retain the fixture directory identifier.",
					command: ["node", "dist/cli-stub.js", "scan", "--json"],
					cwd: ".",
					exit_code: 2,
					stdout: { kind: "empty" },
					stderr: { kind: "ignored" },
					filesystem: { kind: "no_mutation" },
				},
				null,
				"\t",
			)}\n`,
		);

		assert.throws(
			() => loadFixtureManifest(path),
			(error: unknown) => {
				assert.ok(error instanceof FixtureManifestValidationError);
				assert.match(error.message, /\[fixture harness_schema_missing_id_on_disk\]/);
				assert.match(error.message, /missing required key "id"/);
				return true;
			},
		);
	} finally {
		rmSync(rootDir, { recursive: true, force: true });
	}
});

test("rejects unknown top-level keys and includes the fixture id when available", () => {
	assert.throws(
		() =>
			loadFixtureManifest(
				manifestTestdataDir("harness-schema", "harness_schema_invalid_unknown_field"),
			),
		(error: unknown) => {
			assert.ok(error instanceof Error);
			assert.match(error.message, /\[fixture harness_schema_invalid_unknown_field\]/);
			assert.match(error.message, /unknown top-level key "unexpected"/);
			return true;
		},
	);
});

test("rejects unsupported stdout, stderr, and filesystem oracles", () => {
	const base = minimalFailureManifest();

	assert.throws(
		() =>
			validateFixtureManifest({
				...base,
				stdout: { kind: "binary" },
			}),
		/unsupported stdout oracle "binary"/,
	);

	assert.throws(
		() =>
			validateFixtureManifest({
				...base,
				stderr: { kind: "golden" },
			}),
		/unsupported stderr oracle "golden"/,
	);

	assert.throws(
		() =>
			validateFixtureManifest({
				...base,
				filesystem: { kind: "snapshot" },
			}),
		/unsupported filesystem oracle "snapshot"/,
	);
});

test("accepts human-output fixtures when stdout is ignored", () => {
	assert.doesNotThrow(() =>
		validateFixtureManifest({
			...minimalFailureManifest(),
			id: "harness_schema_valid_scan_human_stdout_ignored",
			command: ["node", "dist/cli-stub.js", "scan"],
			exit_code: 0,
			stdout: { kind: "ignored" },
			stderr: { kind: "ignored" },
			filesystem: { kind: "no_mutation" },
		}),
	);

	assert.doesNotThrow(() =>
		validateFixtureManifest({
			...minimalFailureManifest(),
			id: "harness_schema_valid_map_human_stdout_ignored",
			command: ["node", "dist/cli-stub.js", "map"],
			exit_code: 0,
			stdout: { kind: "ignored" },
			stderr: { kind: "ignored" },
			filesystem: { kind: "expected_files", files: ["anchormap.yaml"] },
		}),
	);
});

test("rejects exit codes outside the published contract range", () => {
	assert.throws(
		() =>
			validateFixtureManifest({
				...minimalFailureManifest(),
				exit_code: 5,
			}),
		/exit_code must be an integer in the contract range 0\.\.4/,
	);
});

test("rejects `scan --json` success fixtures that expect mutation", () => {
	withTempFixture(
		{
			...minimalFailureManifest(),
			id: "harness_schema_invalid_scan_json_mutation",
			exit_code: 0,
			stdout: { kind: "golden" },
			stderr: { kind: "empty" },
			filesystem: { kind: "expected_files", files: ["anchormap.yaml"] },
		},
		(path) => {
			assert.throws(
				() => loadFixtureManifest(path),
				/scan --json success fixtures must use filesystem\.kind "no_mutation"/,
			);
		},
		(path) => {
			writeFileSync(resolve(path, "stdout.golden"), '{"schema_version":1}\n');
			mkdirSync(resolve(path, "expected", "repo"), { recursive: true });
			writeFileSync(resolve(path, "expected", "repo", "anchormap.yaml"), "version: 1\n");
		},
	);
});

test('rejects `stdout.kind = "golden"` when `stdout.golden` is missing', () => {
	withTempFixture(
		{
			...minimalFailureManifest(),
			id: "harness_schema_invalid_missing_golden",
			exit_code: 0,
			stdout: { kind: "golden" },
			stderr: { kind: "empty" },
		},
		(path) => {
			assert.throws(
				() => loadFixtureManifest(path),
				/stdout\.kind "golden" requires companion artifact "stdout\.golden"/,
			);
		},
	);
});

test('rejects `stdout.kind = "golden"` when `stdout.golden` is a directory', () => {
	withTempFixture(
		{
			...minimalFailureManifest(),
			id: "harness_schema_invalid_golden_directory",
			exit_code: 0,
			stdout: { kind: "golden" },
			stderr: { kind: "empty" },
		},
		(path) => {
			assert.throws(
				() => loadFixtureManifest(path),
				/fixture artifact "stdout\.golden" must be a regular file/,
			);
		},
		(path) => {
			mkdirSync(resolve(path, "stdout.golden"));
		},
	);
});

test('rejects `stdout.kind = "golden"` when `stdout.golden` is a symlink', () => {
	withTempFixture(
		{
			...minimalFailureManifest(),
			id: "harness_schema_invalid_golden_symlink",
			exit_code: 0,
			stdout: { kind: "golden" },
			stderr: { kind: "empty" },
		},
		(path) => {
			assert.throws(
				() => loadFixtureManifest(path),
				/fixture artifact "stdout\.golden" must not be a symlink/,
			);
		},
		(path) => {
			const target = resolve(path, "..", "external-stdout.golden");
			writeFileSync(target, '{"schema_version":1}\n');
			symlinkSync(target, resolve(path, "stdout.golden"));
		},
	);
});

test("rejects fixtures that omit the required `repo/` tree", () => {
	withTempFixture(
		{
			...minimalFailureManifest(),
			id: "harness_schema_invalid_missing_repo",
		},
		(path) => {
			assert.throws(
				() => loadFixtureManifest(path),
				/fixture directory must contain companion directory "repo"/,
			);
		},
		undefined,
		{ createRepo: false },
	);
});

test("rejects fixtures whose required `repo/` tree is a symlink", () => {
	withTempFixture(
		{
			...minimalFailureManifest(),
			id: "harness_schema_invalid_repo_symlink",
		},
		(path) => {
			assert.throws(
				() => loadFixtureManifest(path),
				/fixture artifact "repo" must not be a symlink/,
			);
		},
		(path) => {
			const target = resolve(path, "..", "external-repo");
			mkdirSync(target, { recursive: true });
			writeFileSync(resolve(target, "anchor.ts"), 'export const value = "x";\n');
			symlinkSync(target, resolve(path, "repo"));
		},
		{ createRepo: false },
	);
});

test('rejects `filesystem.kind = "expected_files"` when `expected/repo` is missing', () => {
	withTempFixture(
		{
			...minimalFailureManifest(),
			id: "harness_schema_invalid_missing_expected_repo",
			command: ["node", "dist/cli-stub.js", "map"],
			exit_code: 0,
			stdout: { kind: "ignored" },
			stderr: { kind: "empty" },
			filesystem: { kind: "expected_files", files: ["anchormap.yaml"] },
		},
		(path) => {
			assert.throws(
				() => loadFixtureManifest(path),
				/fixture directory must contain companion directory "expected\/repo"/,
			);
		},
	);
});

test('rejects `filesystem.kind = "expected_files"` when a declared file is missing', () => {
	withTempFixture(
		{
			...minimalFailureManifest(),
			id: "harness_schema_invalid_missing_expected_file",
			command: ["node", "dist/cli-stub.js", "map"],
			exit_code: 0,
			stdout: { kind: "ignored" },
			stderr: { kind: "empty" },
			filesystem: { kind: "expected_files", files: ["anchormap.yaml"] },
		},
		(path) => {
			assert.throws(
				() => loadFixtureManifest(path),
				/filesystem\.kind "expected_files" requires declared artifact "expected\/repo\/anchormap\.yaml"/,
			);
		},
		(path) => {
			mkdirSync(resolve(path, "expected", "repo"), { recursive: true });
		},
	);
});

test('rejects `filesystem.kind = "expected_files"` when a declared artifact is a directory', () => {
	withTempFixture(
		{
			...minimalFailureManifest(),
			id: "harness_schema_invalid_expected_file_directory",
			command: ["node", "dist/cli-stub.js", "map"],
			exit_code: 0,
			stdout: { kind: "ignored" },
			stderr: { kind: "empty" },
			filesystem: { kind: "expected_files", files: ["anchormap.yaml"] },
		},
		(path) => {
			assert.throws(
				() => loadFixtureManifest(path),
				/fixture artifact "expected\/repo\/anchormap\.yaml" must be a regular file/,
			);
		},
		(path) => {
			mkdirSync(resolve(path, "expected", "repo", "anchormap.yaml"), {
				recursive: true,
			});
		},
	);
});

test('rejects `filesystem.kind = "expected_files"` when a declared artifact is a symlink', () => {
	withTempFixture(
		{
			...minimalFailureManifest(),
			id: "harness_schema_invalid_expected_file_symlink",
			command: ["node", "dist/cli-stub.js", "map"],
			exit_code: 0,
			stdout: { kind: "ignored" },
			stderr: { kind: "empty" },
			filesystem: { kind: "expected_files", files: ["anchormap.yaml"] },
		},
		(path) => {
			assert.throws(
				() => loadFixtureManifest(path),
				/fixture artifact "expected\/repo\/anchormap\.yaml" must not be a symlink/,
			);
		},
		(path) => {
			const target = resolve(path, "..", "external-anchormap.yaml");
			writeFileSync(target, "version: 1\n");
			mkdirSync(resolve(path, "expected", "repo"), { recursive: true });
			symlinkSync(target, resolve(path, "expected", "repo", "anchormap.yaml"));
		},
	);
});

test("rejects scan --json success fixtures that do not use golden stdout and empty stderr", () => {
	assert.throws(
		() =>
			validateFixtureManifest({
				...minimalFailureManifest(),
				id: "harness_schema_invalid_scan_json_success_stdout",
				exit_code: 0,
				stdout: { kind: "exact", value: '{"schema_version":1}\n' },
				stderr: { kind: "empty" },
			}),
		/scan --json success fixtures must use stdout\.kind "golden"/,
	);

	assert.throws(
		() =>
			validateFixtureManifest({
				...minimalFailureManifest(),
				id: "harness_schema_invalid_scan_json_success_stderr",
				exit_code: 0,
				stdout: { kind: "golden" },
				stderr: { kind: "ignored" },
			}),
		/scan --json success fixtures must use stderr\.kind "empty"/,
	);
});

test("rejects scan --json failure fixtures that oracle stdout or pattern-match stderr", () => {
	assert.throws(
		() =>
			validateFixtureManifest({
				...minimalFailureManifest(),
				id: "harness_schema_invalid_scan_json_failure_stdout",
				stdout: { kind: "exact", value: "unexpected\n" },
			}),
		/scan --json failure fixtures must use stdout\.kind "empty"/,
	);

	assert.throws(
		() =>
			validateFixtureManifest({
				...minimalFailureManifest(),
				id: "harness_schema_invalid_scan_json_failure_stderr",
				stderr: { kind: "pattern", value: "ERR" },
			}),
		/scan --json failure fixtures may only use stderr\.kind "ignored" or "empty"/,
	);
});

test("rejects scan fixtures without --json that oracle human output", () => {
	assert.throws(
		() =>
			validateFixtureManifest({
				...minimalFailureManifest(),
				id: "harness_schema_invalid_scan_human_stdout",
				command: ["node", "dist/cli-stub.js", "scan"],
				stdout: { kind: "exact", value: "human output\n" },
			}),
		/scan fixtures without --json must use stdout\.kind "ignored"/,
	);

	assert.throws(
		() =>
			validateFixtureManifest({
				...minimalFailureManifest(),
				id: "harness_schema_invalid_scan_human_stderr",
				command: ["node", "dist/cli-stub.js", "scan"],
				stdout: { kind: "ignored" },
				stderr: { kind: "contains", value: "warning" },
			}),
		/scan fixtures without --json may only use stderr\.kind "ignored" or "empty"/,
	);
});

test("rejects init/map/scaffold fixtures that oracle human output", () => {
	assert.throws(
		() =>
			validateFixtureManifest({
				...minimalFailureManifest(),
				id: "harness_schema_invalid_map_stdout",
				command: ["node", "dist/cli-stub.js", "map"],
				exit_code: 0,
				stdout: { kind: "exact", value: "mapped\n" },
				filesystem: { kind: "expected_files", files: ["anchormap.yaml"] },
			}),
		/init\/map\/scaffold fixtures must not oracle human stdout/,
	);

	assert.throws(
		() =>
			validateFixtureManifest({
				...minimalFailureManifest(),
				id: "harness_schema_invalid_map_stderr",
				command: ["node", "dist/cli-stub.js", "map"],
				exit_code: 0,
				stdout: { kind: "ignored" },
				stderr: { kind: "contains", value: "warning" },
				filesystem: { kind: "expected_files", files: ["anchormap.yaml"] },
			}),
		/init\/map\/scaffold fixtures must not oracle human stderr/,
	);
});

test("classifies the CLI subcommand from the command slot, not from argument values", () => {
	assert.doesNotThrow(() =>
		validateFixtureManifest({
			...minimalFailureManifest(),
			id: "harness_schema_valid_map_seed_named_scan",
			command: ["node", "dist/cli-stub.js", "map", "--anchor", "FR-001", "--seed", "scan"],
			exit_code: 0,
			stdout: { kind: "ignored" },
			stderr: { kind: "ignored" },
			filesystem: { kind: "expected_files", files: ["anchormap.yaml"] },
		}),
	);

	assert.doesNotThrow(() =>
		validateFixtureManifest({
			...minimalFailureManifest(),
			id: "harness_schema_valid_scaffold_output",
			command: ["node", "dist/cli-stub.js", "scaffold", "--output", "specs/generated.md"],
			exit_code: 0,
			stdout: { kind: "ignored" },
			stderr: { kind: "ignored" },
			filesystem: { kind: "expected_files", files: ["specs/generated.md"] },
		}),
	);
});

test("classifies `scan --json` only from the contract flag position", () => {
	assert.doesNotThrow(() =>
		validateFixtureManifest({
			...minimalFailureManifest(),
			id: "harness_schema_valid_scan_value_named_json",
			command: ["node", "dist/cli-stub.js", "scan", "--note", "--json"],
			exit_code: 0,
			stdout: { kind: "ignored" },
			stderr: { kind: "ignored" },
			filesystem: { kind: "no_mutation" },
		}),
	);
});

test("accepts unknown and missing command fixtures as usage-error fixtures", () => {
	assert.doesNotThrow(() =>
		validateFixtureManifest({
			...minimalFailureManifest(),
			id: "harness_schema_valid_unknown_command",
			command: ["node", "dist/anchormap.js", "unknown"],
			exit_code: 4,
			stdout: { kind: "empty" },
			stderr: { kind: "ignored" },
			filesystem: { kind: "no_mutation" },
		}),
	);

	assert.doesNotThrow(() =>
		validateFixtureManifest({
			...minimalFailureManifest(),
			id: "harness_schema_valid_missing_command",
			command: ["node", "dist/anchormap.js"],
			exit_code: 4,
			stdout: { kind: "empty" },
			stderr: { kind: "empty" },
			filesystem: { kind: "no_mutation" },
		}),
	);
});

test("rejects unknown or missing command fixtures with non-usage-error oracles", () => {
	assert.throws(
		() =>
			validateFixtureManifest({
				...minimalFailureManifest(),
				id: "harness_schema_invalid_unknown_subcommand",
				command: ["node", "dist/cli-stub.js", "status"],
				exit_code: 2,
			}),
		/unknown or missing command fixtures must expect exit_code 4/,
	);

	assert.throws(
		() =>
			validateFixtureManifest({
				...minimalFailureManifest(),
				id: "harness_schema_invalid_missing_subcommand_stdout",
				command: ["node", "dist/cli-stub.js"],
				exit_code: 4,
				stdout: { kind: "ignored" },
			}),
		/unknown or missing command fixtures must use stdout\.kind "empty"/,
	);

	assert.throws(
		() =>
			validateFixtureManifest({
				...minimalFailureManifest(),
				id: "harness_schema_invalid_node_wrapper_flags",
				command: ["node", "--eval", "scan", "dist/cli-stub.js", "status"],
			}),
		/command using "node" must place the CLI script path in argv\[1\] and the subcommand in argv\[2\]/,
	);

	assert.throws(
		() =>
			validateFixtureManifest({
				...minimalFailureManifest(),
				id: "harness_schema_invalid_wrapper_launcher_npm",
				command: ["npm", "init"],
			}),
		/command must use a direct CLI launcher, not wrapper launcher "npm"/,
	);
});

test("rejects init/map/scaffold success fixtures that do not declare expected filesystem outputs", () => {
	assert.throws(
		() =>
			validateFixtureManifest({
				...minimalFailureManifest(),
				id: "harness_schema_invalid_map_success_no_expected_files",
				command: ["node", "dist/cli-stub.js", "map"],
				exit_code: 0,
				stdout: { kind: "ignored" },
				stderr: { kind: "empty" },
				filesystem: { kind: "no_mutation" },
			}),
		/init\/map\/scaffold success fixtures must use filesystem\.kind "expected_files"/,
	);

	assert.throws(
		() =>
			validateFixtureManifest({
				...minimalFailureManifest(),
				id: "harness_schema_invalid_init_success_no_expected_files",
				command: ["node", "dist/cli-stub.js", "init"],
				exit_code: 0,
				stdout: { kind: "ignored" },
				stderr: { kind: "empty" },
				filesystem: { kind: "no_mutation" },
			}),
		/init\/map\/scaffold success fixtures must use filesystem\.kind "expected_files"/,
	);
});

test("rejects init/map/scaffold failure fixtures that expect file mutations", () => {
	assert.throws(
		() =>
			validateFixtureManifest({
				...minimalFailureManifest(),
				id: "harness_schema_invalid_map_failure_expected_files",
				command: ["node", "dist/cli-stub.js", "map"],
				exit_code: 2,
				stdout: { kind: "ignored" },
				filesystem: { kind: "expected_files", files: ["anchormap.yaml"] },
			}),
		/init\/map\/scaffold failure fixtures must use filesystem\.kind "no_mutation"/,
	);

	assert.throws(
		() =>
			validateFixtureManifest({
				...minimalFailureManifest(),
				id: "harness_schema_invalid_init_failure_expected_files",
				command: ["node", "dist/cli-stub.js", "init"],
				exit_code: 1,
				stdout: { kind: "ignored" },
				filesystem: { kind: "expected_files", files: ["anchormap.yaml"] },
			}),
		/init\/map\/scaffold failure fixtures must use filesystem\.kind "no_mutation"/,
	);
});

test("wraps missing manifest.json in a structured fixture validation error", () => {
	const rootDir = mkdtempSync(resolve(tmpdir(), "anchormap-fixture-manifest-"));
	const path = resolve(rootDir, "harness-schema", "harness_schema_missing_manifest");

	try {
		mkdirSync(resolve(path, "repo"), { recursive: true });

		assert.throws(
			() => loadFixtureManifest(path),
			(error: unknown) => {
				assert.ok(error instanceof FixtureManifestValidationError);
				assert.match(error.message, /\[fixture harness_schema_missing_manifest\]/);
				assert.match(error.message, /unable to read manifest:/);
				assert.match(error.message, /manifest\.json/);
				return true;
			},
		);
	} finally {
		rmSync(rootDir, { recursive: true, force: true });
	}
});

test("wraps invalid manifest.json parse failures with the fixture id when available", () => {
	const rootDir = mkdtempSync(resolve(tmpdir(), "anchormap-fixture-manifest-"));
	const path = resolve(rootDir, "harness-schema", "harness_schema_invalid_json_manifest");

	try {
		mkdirSync(resolve(path, "repo"), { recursive: true });
		writeFileSync(resolve(path, "manifest.json"), "{not-json}\n");

		assert.throws(
			() => loadFixtureManifest(path),
			(error: unknown) => {
				assert.ok(error instanceof FixtureManifestValidationError);
				assert.match(error.message, /\[fixture harness_schema_invalid_json_manifest\]/);
				assert.match(error.message, /manifest is not valid JSON:/);
				return true;
			},
		);
	} finally {
		rmSync(rootDir, { recursive: true, force: true });
	}
});

test("computes fixture layout paths deterministically", () => {
	const layout = resolveFixtureLayout(fixtureDir("harness-schema", "harness_schema_success"));

	assert.equal(layout.manifestPath, resolve(layout.fixtureDir, "manifest.json"));
	assert.equal(layout.repoDir, resolve(layout.fixtureDir, "repo"));
	assert.equal(layout.expectedRepoDir, resolve(layout.fixtureDir, "expected", "repo"));
});
