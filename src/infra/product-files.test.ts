import { strict as assert } from "node:assert";
import { test } from "node:test";

import { type RepoPath, validateRepoPath } from "../domain/repo-path";
import type { Config } from "./config-io";
import {
	discoverProductFiles,
	type ProductFileDiscoveryFs,
	type ProductFileDiscoveryStats,
} from "./product-files";

const CWD = "/repo";

function repoPath(value: string): RepoPath {
	const result = validateRepoPath(value);
	if (result.kind !== "ok") {
		throw new Error(`invalid test RepoPath ${value}`);
	}
	return result.repoPath;
}

function configWithProductRoot(options: {
	readonly productRoot?: string;
	readonly ignoreRoots?: readonly string[];
}): Config {
	return {
		version: 1,
		productRoot: repoPath(options.productRoot ?? "src"),
		specRoots: [repoPath("specs")],
		ignoreRoots: (options.ignoreRoots ?? []).map(repoPath),
		mappings: {},
	};
}

function fileStats(): ProductFileDiscoveryStats {
	return {
		isDirectory: () => false,
		isFile: () => true,
		isSymbolicLink: () => false,
	};
}

function directoryStats(): ProductFileDiscoveryStats {
	return {
		isDirectory: () => true,
		isFile: () => false,
		isSymbolicLink: () => false,
	};
}

function symlinkStats(): ProductFileDiscoveryStats {
	return {
		isDirectory: () => false,
		isFile: () => false,
		isSymbolicLink: () => true,
	};
}

interface VirtualProductTree {
	readonly directories: Readonly<Record<string, readonly string[]>>;
	readonly files: Readonly<Record<string, Uint8Array>>;
	readonly symlinks?: ReadonlySet<string>;
	readonly lstatFailures?: ReadonlySet<string>;
	readonly readdirFailures?: ReadonlySet<string>;
}

function createVirtualFs(tree: VirtualProductTree): ProductFileDiscoveryFs {
	return {
		lstat(path: string): ProductFileDiscoveryStats {
			const relative = relativePath(path);
			if (tree.lstatFailures?.has(relative)) {
				throw new Error(`lstat failed: ${relative}`);
			}
			if (tree.symlinks?.has(relative)) {
				return symlinkStats();
			}
			if (relative in tree.directories) {
				return directoryStats();
			}
			if (relative in tree.files) {
				return fileStats();
			}
			throw new Error(`missing path: ${relative}`);
		},
		readdir(path: string): readonly string[] {
			const relative = relativePath(path);
			if (tree.readdirFailures?.has(relative)) {
				throw new Error(`readdir failed: ${relative}`);
			}
			const names = tree.directories[relative];
			if (names === undefined) {
				throw new Error(`not a directory: ${relative}`);
			}
			return names;
		},
	};
}

function relativePath(path: string): string {
	assert.ok(path.startsWith(`${CWD}/`));
	return path.slice(CWD.length + 1);
}

test("discovers only supported product files under product_root in stable order", () => {
	const result = discoverProductFiles(configWithProductRoot({ ignoreRoots: ["src/generated"] }), {
		cwd: CWD,
		fs: createVirtualFs({
			directories: {
				src: ["z.ts", "component.tsx", "types.d.ts", "nested", "helper.js", "a.ts", "generated"],
				"src/nested": ["index.ts", "ignored.txt"],
				"src/generated": ["generated.ts"],
			},
			files: {
				"src/z.ts": new Uint8Array(),
				"src/component.tsx": new Uint8Array(),
				"src/types.d.ts": new Uint8Array(),
				"src/helper.js": new Uint8Array(),
				"src/a.ts": new Uint8Array(),
				"src/nested/index.ts": new Uint8Array(),
				"src/nested/ignored.txt": new Uint8Array(),
				"src/generated/generated.ts": new Uint8Array(),
			},
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.productFiles, ["src/a.ts", "src/nested/index.ts", "src/z.ts"]);
	}
});

test("returns product files independent of filesystem discovery order", () => {
	const expected = ["src/a.ts", "src/nested/b.ts", "src/z.ts"];
	const cases: ReadonlyArray<readonly string[]> = [
		["z.ts", "noise.js", "nested", "a.ts"],
		["nested", "a.ts", "noise.js", "z.ts"],
	];

	for (const directoryEntries of cases) {
		const result = discoverProductFiles(configWithProductRoot({}), {
			cwd: CWD,
			fs: createVirtualFs({
				directories: {
					src: directoryEntries,
					"src/nested": ["b.ts", "ignored.d.ts"],
				},
				files: {
					"src/z.ts": new Uint8Array(),
					"src/noise.js": new Uint8Array(),
					"src/a.ts": new Uint8Array(),
					"src/nested/b.ts": new Uint8Array(),
					"src/nested/ignored.d.ts": new Uint8Array(),
				},
			}),
		});

		assert.equal(result.kind, "ok");
		if (result.kind === "ok") {
			assert.deepEqual(result.productFiles, expected);
		}
	}
});

test("does not inspect ignored subtrees or unrelated repo noise", () => {
	const result = discoverProductFiles(configWithProductRoot({ ignoreRoots: ["src/ignored"] }), {
		cwd: CWD,
		fs: createVirtualFs({
			directories: {
				src: ["index.ts", "ignored"],
				"src/ignored": ["linked.ts", "bad\u0000name.ts"],
				specs: ["spec.md"],
				noise: ["outside.ts"],
			},
			files: {
				"src/index.ts": new Uint8Array(),
				"src/ignored/bad\u0000name.ts": new Uint8Array(),
				"specs/spec.md": new Uint8Array(),
				"noise/outside.ts": new Uint8Array(),
			},
			symlinks: new Set(["src/ignored/linked.ts"]),
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.productFiles, ["src/index.ts"]);
	}
});

test("classifies product root enumeration failure as UnsupportedRepoError", () => {
	const result = discoverProductFiles(configWithProductRoot({}), {
		cwd: CWD,
		fs: createVirtualFs({
			directories: {
				src: [],
			},
			files: {},
			readdirFailures: new Set(["src"]),
		}),
	});

	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.error.kind, "UnsupportedRepoError");
	}
});

test("shares inspected-path case collision state with other discovery roots", () => {
	const result = discoverProductFiles(configWithProductRoot({}), {
		cwd: CWD,
		fs: createVirtualFs({
			directories: {
				src: [],
			},
			files: {},
		}),
		inspectedPathCaseIndex: new Map([["src", repoPath("SRC")]]),
	});

	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.error.kind, "UnsupportedRepoError");
	}
});

test("classifies symlinks, case collisions, and non-canonical discovered paths as UnsupportedRepoError", () => {
	const cases: VirtualProductTree[] = [
		{
			directories: {
				src: ["linked.ts"],
			},
			files: {},
			symlinks: new Set(["src/linked.ts"]),
		},
		{
			directories: {
				src: ["A.ts", "a.ts"],
			},
			files: {
				"src/A.ts": new Uint8Array(),
				"src/a.ts": new Uint8Array(),
			},
		},
		{
			directories: {
				src: ["bad\u0000name.ts"],
			},
			files: {},
		},
	];

	for (const tree of cases) {
		const result = discoverProductFiles(configWithProductRoot({}), {
			cwd: CWD,
			fs: createVirtualFs(tree),
		});

		assert.equal(result.kind, "error");
		if (result.kind === "error") {
			assert.equal(result.error.kind, "UnsupportedRepoError");
		}
	}
});
