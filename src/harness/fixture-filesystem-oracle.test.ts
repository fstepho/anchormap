import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import {
	assertFixtureFilesystemOracle,
	FixtureFilesystemOracleError,
} from "./fixture-filesystem-oracle";
import type { FixtureManifest } from "./fixture-manifest";
import { loadFixtureManifest } from "./fixture-manifest";
import { executeFixtureCommand } from "./fixture-process";
import { materializeFixtureSandbox } from "./fixture-sandbox";

function withTempFixture(
	manifest: FixtureManifest,
	setup: (fixtureDir: string) => void,
	callback: (fixtureDir: string) => Promise<void> | void,
): Promise<void> {
	const rootDir = mkdtempSync(resolve(tmpdir(), "anchormap-fixture-filesystem-oracle-"));
	const fixtureDir = resolve(rootDir, manifest.family, manifest.id);

	try {
		mkdirSync(resolve(fixtureDir, "repo"), { recursive: true });
		writeFileSync(
			resolve(fixtureDir, "manifest.json"),
			`${JSON.stringify(manifest, null, "\t")}\n`,
		);
		setup(fixtureDir);
		return Promise.resolve(callback(fixtureDir)).finally(() => {
			rmSync(rootDir, { recursive: true, force: true });
		});
	} catch (error) {
		rmSync(rootDir, { recursive: true, force: true });
		throw error;
	}
}

function noMutationFixture(id: string, exitCode = 0): FixtureManifest {
	return {
		id,
		family: "harness-filesystem-oracle",
		purpose: "Fixture filesystem oracle unit test.",
		command: ["node", "./cli-stub.cjs", "scan"],
		cwd: ".",
		exit_code: exitCode,
		stdout: { kind: "ignored" },
		stderr: { kind: "ignored" },
		filesystem: { kind: "no_mutation" },
	};
}

function expectedFilesFixture(id: string): FixtureManifest {
	return {
		id,
		family: "harness-filesystem-oracle",
		purpose: "Fixture filesystem oracle unit test.",
		command: ["node", "./cli-stub.cjs", "init"],
		cwd: ".",
		exit_code: 0,
		stdout: { kind: "ignored" },
		stderr: { kind: "ignored" },
		filesystem: { kind: "expected_files", files: ["anchormap.yaml"] },
	};
}

test("accepts a no-mutation fixture when the command leaves the repo byte-identical", async () => {
	await withTempFixture(
		noMutationFixture("fixture_filesystem_oracle_no_mutation_pass"),
		(fixtureDir) => {
			mkdirSync(resolve(fixtureDir, "repo", "src"), { recursive: true });
			writeFileSync(resolve(fixtureDir, "repo", "src", "index.ts"), "export {};\n");
			writeFileSync(resolve(fixtureDir, "repo", "cli-stub.cjs"), "process.exit(0);\n");
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				await executeFixtureCommand(fixture, sandbox, { timeoutMs: 1_000 });
				assert.doesNotThrow(() => assertFixtureFilesystemOracle(fixture, sandbox));
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("fails when a tracked file changes under filesystem.kind no_mutation", async () => {
	await withTempFixture(
		noMutationFixture("fixture_filesystem_oracle_changed_file"),
		(fixtureDir) => {
			mkdirSync(resolve(fixtureDir, "repo", "src"), { recursive: true });
			writeFileSync(resolve(fixtureDir, "repo", "src", "index.ts"), "export const value = 1;\n");
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"require('node:fs').writeFileSync(",
					"\t'src/index.ts',",
					"\t'export const value = 2;\\n',",
					");",
					"process.exit(0);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				await executeFixtureCommand(fixture, sandbox, { timeoutMs: 1_000 });

				assert.throws(
					() => assertFixtureFilesystemOracle(fixture, sandbox),
					(error: unknown) => {
						assert.ok(error instanceof FixtureFilesystemOracleError);
						assert.equal(error.oracleKind, "no_mutation");
						assert.match(
							error.message,
							/filesystem\.kind "no_mutation" forbids repository mutations/,
						);
						assert.match(error.message, /changed:/);
						assert.match(error.message, /src\/index\.ts \(file bytes changed\)/);
						return true;
					},
				);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("fails when an unexpected file is created under filesystem.kind no_mutation", async () => {
	await withTempFixture(
		noMutationFixture("fixture_filesystem_oracle_added_file", 1),
		(fixtureDir) => {
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"require('node:fs').writeFileSync('anchormap.yaml.tmp', 'temp\\n');",
					"process.exit(1);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				await executeFixtureCommand(fixture, sandbox, { timeoutMs: 1_000 });

				assert.throws(
					() => assertFixtureFilesystemOracle(fixture, sandbox),
					(error: unknown) => {
						assert.ok(error instanceof FixtureFilesystemOracleError);
						assert.equal(error.oracleKind, "no_mutation");
						assert.match(error.message, /added:/);
						assert.match(error.message, /anchormap\.yaml\.tmp \[file 5 bytes\]/);
						return true;
					},
				);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("fails when a tracked file is removed under filesystem.kind no_mutation", async () => {
	await withTempFixture(
		noMutationFixture("fixture_filesystem_oracle_removed_file"),
		(fixtureDir) => {
			mkdirSync(resolve(fixtureDir, "repo", "src"), { recursive: true });
			writeFileSync(resolve(fixtureDir, "repo", "src", "index.ts"), "export const value = 1;\n");
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				["require('node:fs').rmSync('src/index.ts');", "process.exit(0);", ""].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				await executeFixtureCommand(fixture, sandbox, { timeoutMs: 1_000 });

				assert.throws(
					() => assertFixtureFilesystemOracle(fixture, sandbox),
					(error: unknown) => {
						assert.ok(error instanceof FixtureFilesystemOracleError);
						assert.equal(error.oracleKind, "no_mutation");
						assert.match(error.message, /removed:/);
						assert.match(error.message, /src\/index\.ts \[file 24 bytes\]/);
						return true;
					},
				);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("fails when a tracked path changes type under filesystem.kind no_mutation", async () => {
	await withTempFixture(
		noMutationFixture("fixture_filesystem_oracle_type_changed_path"),
		(fixtureDir) => {
			mkdirSync(resolve(fixtureDir, "repo", "src", "target"), { recursive: true });
			writeFileSync(
				resolve(fixtureDir, "repo", "src", "target", "index.ts"),
				"export const value = 1;\n",
			);
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"const fs = require('node:fs');",
					"fs.rmSync('src/target', { recursive: true, force: true });",
					"fs.writeFileSync('src/target', 'now a file\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				await executeFixtureCommand(fixture, sandbox, { timeoutMs: 1_000 });

				assert.throws(
					() => assertFixtureFilesystemOracle(fixture, sandbox),
					(error: unknown) => {
						assert.ok(error instanceof FixtureFilesystemOracleError);
						assert.equal(error.oracleKind, "no_mutation");
						assert.match(error.message, /type-changed:/);
						assert.match(error.message, /src\/target \(dir -> file\)/);
						return true;
					},
				);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("compares expected anchormap.yaml bytes byte-for-byte for successful write fixtures", async () => {
	await withTempFixture(
		expectedFilesFixture("fixture_filesystem_oracle_expected_yaml"),
		(fixtureDir) => {
			mkdirSync(resolve(fixtureDir, "expected", "repo"), { recursive: true });
			writeFileSync(resolve(fixtureDir, "expected", "repo", "anchormap.yaml"), "version: 1\n");
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"require('node:fs').writeFileSync('anchormap.yaml', 'version: 1\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				await executeFixtureCommand(fixture, sandbox, { timeoutMs: 1_000 });
				assert.doesNotThrow(() => assertFixtureFilesystemOracle(fixture, sandbox));
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("fails successful write fixtures when a declared expected file is missing after the command", async () => {
	await withTempFixture(
		expectedFilesFixture("fixture_filesystem_oracle_expected_yaml_missing"),
		(fixtureDir) => {
			mkdirSync(resolve(fixtureDir, "expected", "repo"), { recursive: true });
			writeFileSync(resolve(fixtureDir, "expected", "repo", "anchormap.yaml"), "version: 1\n");
			writeFileSync(resolve(fixtureDir, "repo", "cli-stub.cjs"), "process.exit(0);\n");
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				await executeFixtureCommand(fixture, sandbox, { timeoutMs: 1_000 });

				assert.throws(
					() => assertFixtureFilesystemOracle(fixture, sandbox),
					(error: unknown) => {
						assert.ok(error instanceof FixtureFilesystemOracleError);
						assert.equal(error.oracleKind, "expected_files");
						assert.match(
							error.message,
							/declared expected file is missing after command: anchormap\.yaml/,
						);
						return true;
					},
				);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("fails successful write fixtures when a declared expected file is not a regular file", async () => {
	await withTempFixture(
		expectedFilesFixture("fixture_filesystem_oracle_expected_yaml_non_regular"),
		(fixtureDir) => {
			mkdirSync(resolve(fixtureDir, "expected", "repo"), { recursive: true });
			writeFileSync(resolve(fixtureDir, "expected", "repo", "anchormap.yaml"), "version: 1\n");
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				["require('node:fs').mkdirSync('anchormap.yaml');", "process.exit(0);", ""].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				await executeFixtureCommand(fixture, sandbox, { timeoutMs: 1_000 });

				assert.throws(
					() => assertFixtureFilesystemOracle(fixture, sandbox),
					(error: unknown) => {
						assert.ok(error instanceof FixtureFilesystemOracleError);
						assert.equal(error.oracleKind, "expected_files");
						assert.match(
							error.message,
							/declared expected file must remain a regular file: anchormap\.yaml/,
						);
						assert.match(error.message, /actual entry kind: dir/);
						return true;
					},
				);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("fails successful write fixtures when declared expected bytes do not match", async () => {
	await withTempFixture(
		expectedFilesFixture("fixture_filesystem_oracle_expected_yaml_mismatch"),
		(fixtureDir) => {
			mkdirSync(resolve(fixtureDir, "expected", "repo"), { recursive: true });
			writeFileSync(resolve(fixtureDir, "expected", "repo", "anchormap.yaml"), "version: 1\n");
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"require('node:fs').writeFileSync('anchormap.yaml', 'version: 2\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				await executeFixtureCommand(fixture, sandbox, { timeoutMs: 1_000 });

				assert.throws(
					() => assertFixtureFilesystemOracle(fixture, sandbox),
					(error: unknown) => {
						assert.ok(error instanceof FixtureFilesystemOracleError);
						assert.equal(error.oracleKind, "expected_files");
						assert.match(
							error.message,
							/declared expected file did not match fixture golden: anchormap\.yaml/,
						);
						assert.match(error.message, /first difference: offset 9/);
						return true;
					},
				);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("reports mutation diff paths in canonical order", async () => {
	await withTempFixture(
		noMutationFixture("fixture_filesystem_oracle_canonical_diff_order"),
		(fixtureDir) => {
			mkdirSync(resolve(fixtureDir, "repo", "src"), { recursive: true });
			writeFileSync(resolve(fixtureDir, "repo", "src", "zeta.ts"), "export const zeta = 0;\n");
			writeFileSync(
				resolve(fixtureDir, "repo", "cli-stub.cjs"),
				[
					"const fs = require('node:fs');",
					"fs.mkdirSync('src/nested', { recursive: true });",
					"fs.writeFileSync('src/alpha.ts', 'export const alpha = 1;\\n');",
					"fs.writeFileSync('src/zeta.ts', 'export const zeta = 1;\\n');",
					"process.exit(0);",
					"",
				].join("\n"),
			);
		},
		async (fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				await executeFixtureCommand(fixture, sandbox, { timeoutMs: 1_000 });

				assert.throws(
					() => assertFixtureFilesystemOracle(fixture, sandbox),
					(error: unknown) => {
						assert.ok(error instanceof FixtureFilesystemOracleError);
						const alphaIndex = error.message.indexOf("src/alpha.ts");
						const nestedIndex = error.message.indexOf("src/nested");
						const zetaIndex = error.message.indexOf("src/zeta.ts");
						assert.ok(alphaIndex !== -1);
						assert.ok(nestedIndex !== -1);
						assert.ok(zetaIndex !== -1);
						assert.ok(alphaIndex < nestedIndex);
						assert.ok(nestedIndex < zetaIndex);
						return true;
					},
				);
			} finally {
				sandbox.dispose();
			}
		},
	);
});
