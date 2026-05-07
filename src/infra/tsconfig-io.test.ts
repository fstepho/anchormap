import { strict as assert } from "node:assert";
import { Buffer } from "node:buffer";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { type RepoPath, validateRepoPath } from "../domain/repo-path";
import type { Config } from "./config-io";
import { loadLocalAliases, type TsconfigAliasFs, type TsconfigAliasState } from "./tsconfig-io";

const CWD = "/repo";

test("missing tsconfig.json returns an empty alias state without reading parents", () => {
	const result = loadLocalAliases(config(), {
		cwd: CWD,
		fs: createVirtualFs({}),
	});

	const state = assertLocalAliasesOk(result);
	assert.equal(state.tsconfigPath, null);
	assert.deepEqual(state.localAliases, []);
	assert.deepEqual(state.resolutionAliases, []);
});

test("decodes UTF-8 with an initial BOM and parses JSONC aliases in canonical order", () => {
	const result = loadLocalAliases(config(), {
		cwd: CWD,
		fs: createVirtualFs({
			"tsconfig.json": `\uFEFF{
				// JSONC comments and trailing commas are accepted by the pinned TypeScript parser.
				"compilerOptions": {
					"paths": {
						"@/*": ["src/root/*"],
						"@long/*": ["src/long/*"],
						"#/*": ["src/hash/*"],
					},
				},
			}`,
		}),
	});

	const state = assertLocalAliasesOk(result);
	assert.equal(state.tsconfigPath, repoPath("tsconfig.json"));
	assert.deepEqual(state.localAliases, [
		{ prefix: "@long/", targetPrefix: "src/long/" },
		{ prefix: "#/", targetPrefix: "src/hash/" },
		{ prefix: "@/", targetPrefix: "src/root/" },
	]);
	assert.deepEqual(state.resolutionAliases, [
		{ prefix: "@long/", targetPrefix: "src/long/", visibility: "public_local" },
		{ prefix: "#/", targetPrefix: "src/hash/", visibility: "public_local" },
		{ prefix: "@/", targetPrefix: "src/root/", visibility: "public_local" },
	]);
});

test("sorts escaped isolated surrogate alias prefixes by canonical UTF-8 order", () => {
	const result = loadLocalAliases(config(), {
		cwd: CWD,
		fs: createVirtualFs({
			"tsconfig.json":
				'{ "compilerOptions": { "paths": { "\\uD801/*": ["src/high/*"], "\\uD800/*": ["src/low/*"] } } }',
		}),
	});

	assert.deepEqual(assertLocalAliasesOk(result).localAliases, [
		{ prefix: "\uD800/", targetPrefix: "src/low/" },
		{ prefix: "\uD801/", targetPrefix: "src/high/" },
	]);
});

test("rejects non-UTF-8 and invalid JSONC tsconfig inputs as UnsupportedRepoError", () => {
	const cases: ReadonlyArray<Readonly<Record<string, string | Uint8Array>>> = [
		{ "tsconfig.json": Uint8Array.from([0xff]) },
		{ "tsconfig.json": '{ "compilerOptions": {' },
	];

	for (const files of cases) {
		const result = loadLocalAliases(config(), {
			cwd: CWD,
			fs: createVirtualFs(files),
		});

		assertUnsupportedRepoError(result);
	}
});

test("classifies a dangling root tsconfig symlink as UnsupportedRepoError", () => {
	const cwd = mkdtempSync(join(tmpdir(), "anchormap-tsconfig-symlink-"));
	try {
		symlinkSync("missing.json", join(cwd, "tsconfig.json"));

		const result = loadLocalAliases(config(), { cwd });

		assertUnsupportedRepoError(result);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("rejects root and extended tsconfig symlinks before reading through them", () => {
	const cwd = mkdtempSync(join(tmpdir(), "anchormap-tsconfig-link-"));
	const outsideRoot = join(tmpdir(), `anchormap-tsconfig-outside-${process.pid}.json`);
	const outsideDirectory = mkdtempSync(join(tmpdir(), "anchormap-tsconfig-outside-dir-"));
	try {
		writeFileSync(outsideRoot, '{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }');
		symlinkSync(outsideRoot, join(cwd, "tsconfig.json"));

		assertUnsupportedRepoError(loadLocalAliases(config(), { cwd }));

		rmSync(join(cwd, "tsconfig.json"));
		writeFileSync(join(cwd, "tsconfig.json"), '{ "extends": "./base.json" }');
		symlinkSync(outsideRoot, join(cwd, "base.json"));

		assertUnsupportedRepoError(loadLocalAliases(config(), { cwd }));

		rmSync(join(cwd, "base.json"));
		mkdirSync(join(cwd, "src"));
		writeFileSync(
			join(outsideDirectory, "base.json"),
			'{ "compilerOptions": { "baseUrl": "..", "paths": { "@/*": ["src/*"] } } }',
		);
		symlinkSync(outsideDirectory, join(cwd, "link"));
		writeFileSync(join(cwd, "tsconfig.json"), '{ "extends": "./link/base.json" }');

		assertUnsupportedRepoError(loadLocalAliases(config(), { cwd }));
	} finally {
		rmSync(cwd, { recursive: true, force: true });
		rmSync(outsideRoot, { force: true });
		rmSync(outsideDirectory, { recursive: true, force: true });
	}
});

test("present tsconfig without effective paths returns empty aliases after validating the read chain", () => {
	const result = loadLocalAliases(config(), {
		cwd: CWD,
		fs: createVirtualFs({
			"tsconfig.json": '{ "extends": "./base.json", "compilerOptions": { "baseUrl": "." } }',
			"base.json": '{ "compilerOptions": { "baseUrl": "." } }',
		}),
	});

	const state = assertLocalAliasesOk(result);
	assert.equal(state.tsconfigPath, repoPath("tsconfig.json"));
	assert.deepEqual(state.localAliases, []);

	const invalidChain = loadLocalAliases(config(), {
		cwd: CWD,
		fs: createVirtualFs({
			"tsconfig.json": '{ "extends": "./base.json" }',
			"base.json": '{ "compilerOptions": 1 }',
		}),
	});

	assertUnsupportedRepoError(invalidChain);
});

test("local relative extends obey nearest paths without merging inherited mappings", () => {
	const rootPaths = loadLocalAliases(config(), {
		cwd: CWD,
		fs: createVirtualFs({
			"tsconfig.json":
				'{ "extends": "./base.json", "compilerOptions": { "paths": { "@root/*": ["src/root/*"] } } }',
			"base.json": '{ "compilerOptions": { "paths": { "@base/*": ["src/base/*"] } } }',
		}),
	});

	assert.deepEqual(assertLocalAliasesOk(rootPaths).localAliases, [
		{ prefix: "@root/", targetPrefix: "src/root/" },
	]);

	const basePaths = loadLocalAliases(config(), {
		cwd: CWD,
		fs: createVirtualFs({
			"tsconfig.json": '{ "extends": "./configs/base.json" }',
			"configs/base.json":
				'{ "compilerOptions": { "baseUrl": "..", "paths": { "@base/*": ["src/base/*"] } } }',
		}),
	});

	assert.deepEqual(assertLocalAliasesOk(basePaths).localAliases, [
		{ prefix: "@base/", targetPrefix: "src/base/" },
	]);

	const invalidBasePaths = loadLocalAliases(config(), {
		cwd: CWD,
		fs: createVirtualFs({
			"tsconfig.json":
				'{ "extends": "./base.json", "compilerOptions": { "paths": { "@root/*": ["src/root/*"] } } }',
			"base.json": '{ "compilerOptions": { "paths": { "bad": ["lib"] } } }',
		}),
	});

	assertUnsupportedRepoError(invalidBasePaths);
});

test("rejects package extends, escaping extends, unreadable extends, and extends cycles", () => {
	const cases: ReadonlyArray<Readonly<Record<string, string>>> = [
		{ "tsconfig.json": '{ "extends": "@scope/tsconfig" }' },
		{ "tsconfig.json": '{ "extends": "../outside.json" }' },
		{ "tsconfig.json": '{ "extends": "./missing.json" }' },
		{
			"tsconfig.json": '{ "extends": "./configs/base.json" }',
			"configs/base.json": '{ "extends": "../tsconfig.json" }',
		},
	];

	for (const files of cases) {
		const result = loadLocalAliases(config(), {
			cwd: CWD,
			fs: createVirtualFs(files),
		});

		assertUnsupportedRepoError(result);
	}
});

test("rejects unsupported baseUrl and paths shapes", () => {
	const cases: readonly string[] = [
		'{ "compilerOptions": { "baseUrl": 1 } }',
		'{ "compilerOptions": { "baseUrl": "../outside", "paths": { "@/*": ["src/*"] } } }',
		'{ "compilerOptions": { "paths": [] } }',
		'{ "compilerOptions": { "paths": { "@/*": "src/*" } } }',
		'{ "compilerOptions": { "paths": { "@/*": [] } } }',
		'{ "compilerOptions": { "paths": { "@/*": ["src/*", "lib/*"] } } }',
		'{ "compilerOptions": { "paths": { "@": ["src/*"] } } }',
		'{ "compilerOptions": { "paths": { "./*": ["src/*"] } } }',
		'{ "compilerOptions": { "paths": { "@/*": ["src"] } } }',
		'{ "compilerOptions": { "paths": { "@/*": ["src/**"] } } }',
		'{ "compilerOptions": { "paths": { "@/*": ["../src/*"] } } }',
	];

	for (const source of cases) {
		const result = loadLocalAliases(config(), {
			cwd: CWD,
			fs: createVirtualFs({ "tsconfig.json": source }),
		});

		assertUnsupportedRepoError(result);
	}
});

test("rejects prototype-polluted tsconfig objects instead of reading inherited fields", () => {
	const cases: ReadonlyArray<Readonly<Record<string, string>>> = [
		{
			"tsconfig.json": '{ "__proto__": { "extends": "./base.json" } }',
			"base.json": '{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }',
		},
		{
			"tsconfig.json": '{ "compilerOptions": { "__proto__": { "paths": { "@/*": ["src/*"] } } } }',
		},
		{
			"tsconfig.json":
				'{ "compilerOptions": { "paths": { "__proto__": ["bad"], "@/*": ["src/*"] } } }',
		},
	];

	for (const files of cases) {
		const result = loadLocalAliases(config(), {
			cwd: CWD,
			fs: createVirtualFs(files),
		});

		assertUnsupportedRepoError(result);
	}
});

test("separates public local aliases from internal resolution aliases in canonical order", () => {
	const result = loadLocalAliases(config(), {
		cwd: CWD,
		fs: createVirtualFs({
			"tsconfig.json":
				'{ "compilerOptions": { "paths": { "@/*": ["src/root/*"], "@shared/*": ["shared/*"], "@long/*": ["src/long/*"] } } }',
		}),
	});

	const state = assertLocalAliasesOk(result);
	assert.deepEqual(state.localAliases, [
		{ prefix: "@long/", targetPrefix: "src/long/" },
		{ prefix: "@/", targetPrefix: "src/root/" },
	]);
	assert.deepEqual(state.resolutionAliases, [
		{ prefix: "@shared/", targetPrefix: "shared/", visibility: "internal_resolution" },
		{ prefix: "@long/", targetPrefix: "src/long/", visibility: "public_local" },
		{ prefix: "@/", targetPrefix: "src/root/", visibility: "public_local" },
	]);
});

test("rejects alias targets that normalize outside repo root", () => {
	const result = loadLocalAliases(config(), {
		cwd: CWD,
		fs: createVirtualFs({
			"tsconfig.json":
				'{ "compilerOptions": { "baseUrl": "src", "paths": { "@/*": ["../../outside/*"] } } }',
		}),
	});

	assertUnsupportedRepoError(result);
});

function createVirtualFs(files: Readonly<Record<string, string | Uint8Array>>): TsconfigAliasFs {
	return {
		exists(path: string): boolean {
			return relativePath(path) in files;
		},
		readFile(path: string): Uint8Array {
			const relative = relativePath(path);
			const content = files[relative];
			if (content === undefined) {
				throw Object.assign(new Error(`missing file: ${relative}`), { code: "ENOENT" });
			}
			return typeof content === "string" ? Buffer.from(content, "utf8") : content;
		},
	};
}

function relativePath(path: string): string {
	assert.ok(path.startsWith(`${CWD}/`));
	return path.slice(CWD.length + 1);
}

function config(productRoot = "src"): Config {
	return {
		version: 1,
		productRoot: repoPath(productRoot),
		specRoots: [repoPath("specs")],
		ignoreRoots: [],
		mappings: {},
	};
}

function assertLocalAliasesOk(result: ReturnType<typeof loadLocalAliases>): TsconfigAliasState {
	assert.equal(result.kind, "ok");
	if (result.kind !== "ok") {
		throw new Error("expected ok result");
	}
	return result.state;
}

function assertUnsupportedRepoError(result: ReturnType<typeof loadLocalAliases>): void {
	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.error.kind, "UnsupportedRepoError");
	}
}

function repoPath(value: string): RepoPath {
	const result = validateRepoPath(value);
	if (result.kind !== "ok") {
		throw new Error(`invalid test RepoPath ${value}`);
	}
	return result.repoPath;
}
