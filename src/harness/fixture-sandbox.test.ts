import { strict as assert } from "node:assert";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
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
import { FixtureSandboxError, materializeFixtureSandbox } from "./fixture-sandbox";

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
