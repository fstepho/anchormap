import { strict as assert } from "node:assert";
import { Buffer } from "node:buffer";
import { test } from "node:test";

import { type RepoPath, validateRepoPath } from "../domain/repo-path";
import type { Config } from "./config-io";
import { buildSpecIndex, type SpecIndexFs, type SpecIndexStats } from "./spec-index";

const CWD = "/repo";

function repoPath(value: string): RepoPath {
	const result = validateRepoPath(value);
	if (result.kind !== "ok") {
		throw new Error(`invalid test RepoPath ${value}`);
	}
	return result.repoPath;
}

function configWithSpecRoots(specRoots: readonly string[]): Config {
	return {
		version: 1,
		productRoot: repoPath("src"),
		specRoots: specRoots.map(repoPath),
		ignoreRoots: [],
		mappings: {},
	};
}

function fileStats(): SpecIndexStats {
	return {
		isDirectory: () => false,
		isFile: () => true,
		isSymbolicLink: () => false,
	};
}

function directoryStats(): SpecIndexStats {
	return {
		isDirectory: () => true,
		isFile: () => false,
		isSymbolicLink: () => false,
	};
}

function symlinkStats(): SpecIndexStats {
	return {
		isDirectory: () => false,
		isFile: () => false,
		isSymbolicLink: () => true,
	};
}

interface VirtualSpecTree {
	readonly directories: Readonly<Record<string, readonly string[]>>;
	readonly files: Readonly<Record<string, Uint8Array>>;
	readonly symlinks?: ReadonlySet<string>;
	readonly lstatFailures?: ReadonlySet<string>;
	readonly readdirFailures?: ReadonlySet<string>;
	readonly readFailures?: ReadonlySet<string>;
}

function createVirtualFs(tree: VirtualSpecTree): SpecIndexFs {
	return {
		lstat(path: string): SpecIndexStats {
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
		readFile(path: string): Uint8Array {
			const relative = relativePath(path);
			if (tree.readFailures?.has(relative)) {
				throw new Error(`read failed: ${relative}`);
			}
			const bytes = tree.files[relative];
			if (bytes === undefined) {
				throw new Error(`not a file: ${relative}`);
			}
			return bytes;
		},
	};
}

function relativePath(path: string): string {
	assert.ok(path.startsWith(`${CWD}/`));
	return path.slice(CWD.length + 1);
}

test("discovers supported spec files under configured roots in stable order", () => {
	const result = buildSpecIndex(configWithSpecRoots(["specs", "docs"]), {
		cwd: CWD,
		fs: createVirtualFs({
			directories: {
				specs: ["z.yaml", "nested", "note.txt", "a.md"],
				"specs/nested": ["b.yml"],
				docs: ["readme.md"],
			},
			files: {
				"specs/z.yaml": Buffer.from("id: Z-001\n"),
				"specs/note.txt": Buffer.from("ignored\n"),
				"specs/a.md": Buffer.from("# A-001\n"),
				"specs/nested/b.yml": Buffer.from("id: B-001\n"),
				"docs/readme.md": Buffer.from("# DOC.README.PRESENT\n"),
			},
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(
			result.specIndex.specFiles.map((file) => [file.path, file.sourceKind, file.text]),
			[
				["docs/readme.md", "markdown", "# DOC.README.PRESENT\n"],
				["specs/a.md", "markdown", "# A-001\n"],
				["specs/nested/b.yml", "yaml", "id: B-001\n"],
				["specs/z.yaml", "yaml", "id: Z-001\n"],
			],
		);
	}
});

test("classifies spec-root enumeration failure as UnsupportedRepoError", () => {
	const result = buildSpecIndex(configWithSpecRoots(["specs"]), {
		cwd: CWD,
		fs: createVirtualFs({
			directories: {
				specs: [],
			},
			files: {},
			readdirFailures: new Set(["specs"]),
		}),
	});

	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.error.kind, "UnsupportedRepoError");
	}
});

test("classifies spec read and strict UTF-8 decode failures as UnsupportedRepoError", () => {
	const readFailure = buildSpecIndex(configWithSpecRoots(["specs"]), {
		cwd: CWD,
		fs: createVirtualFs({
			directories: {
				specs: ["a.md"],
			},
			files: {
				"specs/a.md": Buffer.from("# A-001\n"),
			},
			readFailures: new Set(["specs/a.md"]),
		}),
	});

	assert.equal(readFailure.kind, "error");
	if (readFailure.kind === "error") {
		assert.equal(readFailure.error.kind, "UnsupportedRepoError");
	}

	const decodeFailure = buildSpecIndex(configWithSpecRoots(["specs"]), {
		cwd: CWD,
		fs: createVirtualFs({
			directories: {
				specs: ["a.yaml"],
			},
			files: {
				"specs/a.yaml": Uint8Array.from([0x66, 0x80, 0x67]),
			},
		}),
	});

	assert.equal(decodeFailure.kind, "error");
	if (decodeFailure.kind === "error") {
		assert.equal(decodeFailure.error.kind, "UnsupportedRepoError");
	}
});

test("classifies symlinks, case collisions, and non-canonical discovered paths as UnsupportedRepoError", () => {
	const cases: VirtualSpecTree[] = [
		{
			directories: {
				specs: ["linked.md"],
			},
			files: {},
			symlinks: new Set(["specs/linked.md"]),
		},
		{
			directories: {
				specs: ["A.md", "a.md"],
			},
			files: {
				"specs/A.md": Buffer.from("# A-001\n"),
				"specs/a.md": Buffer.from("# A-002\n"),
			},
		},
		{
			directories: {
				specs: ["bad\u0000name.md"],
			},
			files: {},
		},
	];

	for (const tree of cases) {
		const result = buildSpecIndex(configWithSpecRoots(["specs"]), {
			cwd: CWD,
			fs: createVirtualFs(tree),
		});

		assert.equal(result.kind, "error");
		if (result.kind === "error") {
			assert.equal(result.error.kind, "UnsupportedRepoError");
		}
	}
});
