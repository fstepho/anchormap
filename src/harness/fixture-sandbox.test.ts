import { strict as assert } from "node:assert";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import { test } from "node:test";

import { type FixtureManifest, loadFixtureManifest } from "./fixture-manifest";
import {
	captureFilesystemSnapshot,
	FixtureSandboxError,
	materializeFixtureSandbox,
} from "./fixture-sandbox";

function minimalFixtureManifest(id: string): FixtureManifest {
	return {
		id,
		family: "harness-sandbox",
		purpose: "Fixture sandbox materialization test fixture.",
		command: ["node", "dist/cli-stub.js", "scan", "--json"],
		cwd: ".",
		exit_code: 0,
		stdout: { kind: "golden" },
		stderr: { kind: "empty" },
		filesystem: { kind: "no_mutation" },
	};
}

function withTempFixture(
	manifest: FixtureManifest,
	setup: (fixtureDir: string) => void,
	callback: (fixtureDir: string) => void,
): void {
	const rootDir = mkdtempSync(resolve(tmpdir(), "anchormap-fixture-sandbox-"));
	const fixtureDir = resolve(rootDir, manifest.family, manifest.id);

	try {
		mkdirSync(resolve(fixtureDir, "repo"), { recursive: true });
		writeFileSync(
			resolve(fixtureDir, "manifest.json"),
			`${JSON.stringify(manifest, null, "\t")}\n`,
		);
		writeFileSync(resolve(fixtureDir, "stdout.golden"), "{}\n");
		setup(fixtureDir);
		callback(fixtureDir);
	} finally {
		rmSync(rootDir, { recursive: true, force: true });
	}
}

test("materializes fixture repo bytes, preserves symlink targets, and captures a pre-run snapshot", () => {
	withTempFixture(
		minimalFixtureManifest("harness_sandbox_materializes_bytes"),
		(fixtureDir) => {
			mkdirSync(resolve(fixtureDir, "repo", "specs"), { recursive: true });
			mkdirSync(resolve(fixtureDir, "repo", "src"), { recursive: true });

			writeFileSync(resolve(fixtureDir, "repo", "specs", "anchor.md"), "# US-001 Example\n");
			writeFileSync(
				resolve(fixtureDir, "repo", "src", "payload.bin"),
				Buffer.from([0x00, 0x01, 0x02, 0x09, 0x0a, 0x0d, 0x1f, 0x20, 0x7f, 0x80, 0xff]),
			);
			symlinkSync("payload.bin", resolve(fixtureDir, "repo", "src", "payload-link.bin"));
		},
		(fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				assert.notEqual(sandbox.sandboxDir, fixture.layout.repoDir);
				assert.equal(sandbox.cwd, realpathSync(sandbox.sandboxDir));
				assert.deepEqual(
					readFileSync(resolve(sandbox.sandboxDir, "src", "payload.bin")),
					Buffer.from([0x00, 0x01, 0x02, 0x09, 0x0a, 0x0d, 0x1f, 0x20, 0x7f, 0x80, 0xff]),
				);
				assert.equal(
					readFileSync(resolve(sandbox.sandboxDir, "specs", "anchor.md"), "utf8"),
					"# US-001 Example\n",
				);

				assert.deepEqual(
					sandbox.preRunSnapshot.map((entry) =>
						entry.kind === "file"
							? {
									path: entry.path,
									kind: entry.kind,
									bytes: [...entry.bytes.values()],
								}
							: entry.kind === "symlink"
								? {
										path: entry.path,
										kind: entry.kind,
										target_raw: [...entry.target_raw.values()],
									}
								: entry,
					),
					[
						{ path: "specs", kind: "dir" },
						{
							path: "specs/anchor.md",
							kind: "file",
							bytes: [...Buffer.from("# US-001 Example\n", "utf8").values()],
						},
						{ path: "src", kind: "dir" },
						{
							path: "src/payload-link.bin",
							kind: "symlink",
							target_raw: [...Buffer.from("payload.bin", "utf8").values()],
						},
						{
							path: "src/payload.bin",
							kind: "file",
							bytes: [0x00, 0x01, 0x02, 0x09, 0x0a, 0x0d, 0x1f, 0x20, 0x7f, 0x80, 0xff],
						},
					],
				);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("materializes product case-collision marker as native files when the filesystem supports it", () => {
	const supportsNativeCaseCollision = canMaterializeNativeCaseCollisionFixture();
	const manifest: FixtureManifest = {
		...minimalFixtureManifest("harness_sandbox_product_case_collision"),
		fault_injection: { marker: "product_case_collision_in_scope" },
	};

	withTempFixture(
		manifest,
		(fixtureDir) => {
			mkdirSync(resolve(fixtureDir, "repo", "src"), { recursive: true });
		},
		(fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);

			if (!supportsNativeCaseCollision && !isMacOsArm64()) {
				assert.throws(
					() => materializeFixtureSandbox(fixture),
					/native fx39 case-collision files could not be materialized/,
				);
				return;
			}

			const sandbox = materializeFixtureSandbox(fixture);

			try {
				const srcNames = new Set(readdirSync(resolve(sandbox.sandboxDir, "src")));
				const snapshotPaths = new Set(sandbox.preRunSnapshot.map((entry) => entry.path));

				if (supportsNativeCaseCollision) {
					assert.equal(srcNames.has("CASE.ts"), true);
					assert.equal(srcNames.has("case.ts"), true);
					assert.equal(snapshotPaths.has("src/CASE.ts"), true);
					assert.equal(snapshotPaths.has("src/case.ts"), true);
				} else {
					assert.equal(isMacOsArm64(), true);
					assert.equal(srcNames.has("CASE.ts"), false);
					assert.equal(srcNames.has("case.ts"), false);
					assert.equal(snapshotPaths.has("src/CASE.ts"), false);
					assert.equal(snapshotPaths.has("src/case.ts"), false);
				}
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("materializes product/spec-root case-collision marker as native directories when supported", () => {
	const supportsNativeRootCaseCollision = canMaterializeNativeRootCaseCollisionFixture();
	const manifest: FixtureManifest = {
		...minimalFixtureManifest("harness_sandbox_product_spec_root_case_collision"),
		fault_injection: { marker: "product_spec_root_case_collision" },
	};

	withTempFixture(
		manifest,
		(fixtureDir) => {
			mkdirSync(resolve(fixtureDir, "repo", "src"), { recursive: true });
		},
		(fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);

			if (!supportsNativeRootCaseCollision && !isMacOsArm64()) {
				assert.throws(
					() => materializeFixtureSandbox(fixture),
					/native cross-root case-collision directory could not be materialized/,
				);
				return;
			}

			const sandbox = materializeFixtureSandbox(fixture);

			try {
				const rootNames = new Set(readdirSync(sandbox.sandboxDir));
				const snapshotPaths = new Set(sandbox.preRunSnapshot.map((entry) => entry.path));

				if (supportsNativeRootCaseCollision) {
					assert.equal(rootNames.has("SRC"), true);
					assert.equal(rootNames.has("src"), true);
					assert.equal(snapshotPaths.has("SRC"), true);
					assert.equal(snapshotPaths.has("src"), true);
				} else {
					assert.equal(isMacOsArm64(), true);
					assert.equal(rootNames.has("SRC"), false);
					assert.equal(rootNames.has("src"), true);
					assert.equal(snapshotPaths.has("SRC"), false);
					assert.equal(snapshotPaths.has("src"), true);
				}
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("materializes product non-canonical path marker before pre-run snapshot and preserves it through post-run snapshot", () => {
	const manifest: FixtureManifest = {
		...minimalFixtureManifest("harness_sandbox_product_noncanonical_path"),
		fault_injection: { marker: "product_noncanonical_path_in_scope" },
	};

	withTempFixture(
		manifest,
		(fixtureDir) => {
			mkdirSync(resolve(fixtureDir, "repo", "src"), { recursive: true });
		},
		(fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				const faultPath = resolve(sandbox.sandboxDir, "src", "bad\tname.ts");
				assert.equal(readFileSync(faultPath, "utf8"), "export const bad = true;\n");
				assertSnapshotContainsPath(sandbox.preRunSnapshot, "src/bad\tname.ts");
				assertSnapshotContainsPath(
					captureFilesystemSnapshot(sandbox.sandboxDir),
					"src/bad\tname.ts",
				);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

test("preserves raw non-UTF-8 symlink targets byte-for-byte", () => {
	withTempFixture(
		minimalFixtureManifest("harness_sandbox_preserves_raw_symlink_targets"),
		(fixtureDir) => {
			const rawTarget = Buffer.from([0x72, 0x61, 0x77, 0x80, 0xff]);
			symlinkSync(rawTarget, resolve(fixtureDir, "repo", "raw-link"));
		},
		(fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				assert.deepEqual(
					readlinkSync(resolve(sandbox.sandboxDir, "raw-link"), { encoding: "buffer" }),
					Buffer.from([0x72, 0x61, 0x77, 0x80, 0xff]),
				);
				assert.deepEqual(
					sandbox.preRunSnapshot.map((entry) =>
						entry.kind === "symlink"
							? { path: entry.path, target_raw: [...entry.target_raw.values()] }
							: { path: entry.path },
					),
					[
						{
							path: "raw-link",
							target_raw: [0x72, 0x61, 0x77, 0x80, 0xff],
						},
					],
				);
			} finally {
				sandbox.dispose();
			}
		},
	);
});

function canMaterializeNativeCaseCollisionFixture(): boolean {
	const rootDir = mkdtempSync(resolve(tmpdir(), "anchormap-fixture-case-collision-probe-"));
	const srcDir = resolve(rootDir, "src");

	try {
		mkdirSync(srcDir, { recursive: true });
		writeFileSync(resolve(srcDir, "CASE.ts"), "export const upper = true;\n", { flag: "wx" });
		writeFileSync(resolve(srcDir, "case.ts"), "export const lower = true;\n", { flag: "wx" });
		const names = new Set(readdirSync(srcDir));
		return names.has("CASE.ts") && names.has("case.ts");
	} catch {
		return false;
	} finally {
		rmSync(rootDir, { recursive: true, force: true });
	}
}

function canMaterializeNativeRootCaseCollisionFixture(): boolean {
	const rootDir = mkdtempSync(resolve(tmpdir(), "anchormap-fixture-root-case-collision-probe-"));

	try {
		mkdirSync(resolve(rootDir, "src"));
		mkdirSync(resolve(rootDir, "SRC"));
		const names = new Set(readdirSync(rootDir));
		return names.has("SRC") && names.has("src");
	} catch {
		return false;
	} finally {
		rmSync(rootDir, { recursive: true, force: true });
	}
}

function isMacOsArm64(): boolean {
	return process.platform === "darwin" && process.arch === "arm64";
}

function assertSnapshotContainsPath(
	snapshot: ReturnType<typeof captureFilesystemSnapshot>,
	expectedPath: string,
): void {
	assert.equal(
		snapshot.some((entry) => entry.path === expectedPath),
		true,
	);
}

test("rejects fixture cwd values that resolve outside the sandbox through a symlink", () => {
	withTempFixture(
		{
			...minimalFixtureManifest("harness_sandbox_rejects_escaped_cwd"),
			cwd: "escape",
		},
		(fixtureDir) => {
			symlinkSync(tmpdir(), resolve(fixtureDir, "repo", "escape"));
		},
		(fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);

			assert.throws(
				() => materializeFixtureSandbox(fixture),
				(error: unknown) => {
					assert.ok(error instanceof FixtureSandboxError);
					assert.match(error.message, /fixture cwd must not resolve outside the sandbox: escape/);
					return true;
				},
			);
		},
	);
});

test("rejects fixture cwd values that resolve to a regular file through a symlink", () => {
	withTempFixture(
		{
			...minimalFixtureManifest("harness_sandbox_rejects_file_cwd"),
			cwd: "entrypoint",
		},
		(fixtureDir) => {
			mkdirSync(resolve(fixtureDir, "repo", "src"), { recursive: true });
			writeFileSync(resolve(fixtureDir, "repo", "src", "index.ts"), "export {};\n");
			symlinkSync("src/index.ts", resolve(fixtureDir, "repo", "entrypoint"));
		},
		(fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);

			assert.throws(
				() => materializeFixtureSandbox(fixture),
				(error: unknown) => {
					assert.ok(error instanceof FixtureSandboxError);
					assert.match(
						error.message,
						/fixture cwd must resolve to a directory inside the sandbox: entrypoint/,
					);
					return true;
				},
			);
		},
	);
});

test("wraps broken fixture cwd symlink failures in FixtureSandboxError", () => {
	withTempFixture(
		{
			...minimalFixtureManifest("harness_sandbox_rejects_broken_cwd_symlink"),
			cwd: "missing-dir",
		},
		(fixtureDir) => {
			symlinkSync("does-not-exist", resolve(fixtureDir, "repo", "missing-dir"));
		},
		(fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);

			assert.throws(
				() => materializeFixtureSandbox(fixture),
				(error: unknown) => {
					assert.ok(error instanceof FixtureSandboxError);
					assert.match(
						error.message,
						/fixture cwd must resolve to an existing directory inside the sandbox: missing-dir/,
					);
					return true;
				},
			);
		},
	);
});

test("creates a unique sandbox per materialization run", () => {
	withTempFixture(
		minimalFixtureManifest("harness_sandbox_unique_tempdirs"),
		(fixtureDir) => {
			mkdirSync(resolve(fixtureDir, "repo", "src"), { recursive: true });
			writeFileSync(resolve(fixtureDir, "repo", "src", "index.ts"), "export {};\n");
		},
		(fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const first = materializeFixtureSandbox(fixture);
			const second = materializeFixtureSandbox(fixture);

			try {
				assert.notEqual(first.sandboxDir, second.sandboxDir);
				assert.equal(relative(first.cwd, resolve(first.cwd, "src", "index.ts")), "src/index.ts");
				assert.equal(relative(second.cwd, resolve(second.cwd, "src", "index.ts")), "src/index.ts");
				assert.ok(existsSync(resolve(first.sandboxDir, "src", "index.ts")));
				assert.ok(existsSync(resolve(second.sandboxDir, "src", "index.ts")));
			} finally {
				first.dispose();
				second.dispose();
			}
		},
	);
});

test("sorts pre-run snapshots by canonical relative path across directory boundaries", () => {
	withTempFixture(
		minimalFixtureManifest("harness_sandbox_snapshot_path_order"),
		(fixtureDir) => {
			mkdirSync(resolve(fixtureDir, "repo", "a"), { recursive: true });
			writeFileSync(resolve(fixtureDir, "repo", "a", "z.txt"), "z\n");
			writeFileSync(resolve(fixtureDir, "repo", "a-b.txt"), "b\n");
		},
		(fixtureDir) => {
			const fixture = loadFixtureManifest(fixtureDir);
			const sandbox = materializeFixtureSandbox(fixture);

			try {
				assert.deepEqual(
					sandbox.preRunSnapshot.map((entry) => entry.path),
					["a", "a-b.txt", "a/z.txt"],
				);
			} finally {
				sandbox.dispose();
			}
		},
	);
});
