import { strict as assert } from "node:assert";
import { Buffer } from "node:buffer";
import { test } from "node:test";

import { anchorIdToString } from "../domain/anchor-id";
import { type RepoPath, validateRepoPath } from "../domain/repo-path";
import type { Config } from "./config-io";
import {
	buildSpecIndex,
	type SpecAnchorOccurrence,
	type SpecIndexFs,
	type SpecIndexStats,
} from "./spec-index";

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

function occurrenceView(
	occurrences: readonly SpecAnchorOccurrence[],
): ReadonlyArray<readonly [string, string, string]> {
	return occurrences.map((occurrence) => [
		anchorIdToString(occurrence.anchorId),
		occurrence.specPath,
		occurrence.sourceKind,
	]);
}

function observedAnchorView(
	observedAnchors: ReadonlyMap<unknown, SpecAnchorOccurrence>,
): ReadonlyArray<readonly [string, string, string]> {
	return occurrenceView([...observedAnchors.values()]);
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
		assert.deepEqual(occurrenceView(result.specIndex.anchorOccurrences), [
			["A-001", "specs/a.md", "markdown"],
			["B-001", "specs/nested/b.yml", "yaml"],
			["DOC.README.PRESENT", "docs/readme.md", "markdown"],
			["Z-001", "specs/z.yaml", "yaml"],
		]);
		assert.deepEqual(observedAnchorView(result.specIndex.observedAnchors), [
			["A-001", "specs/a.md", "markdown"],
			["B-001", "specs/nested/b.yml", "yaml"],
			["DOC.README.PRESENT", "docs/readme.md", "markdown"],
			["Z-001", "specs/z.yaml", "yaml"],
		]);
	}
});

test("returns observed anchors in canonical anchor ID order independent of file discovery order", () => {
	const expected: ReadonlyArray<readonly [string, string, string]> = [
		["A-001", "specs/a.md", "markdown"],
		["B-001", "specs/b.yaml", "yaml"],
		["Z-001", "specs/z.md", "markdown"],
	];
	const cases: ReadonlyArray<readonly string[]> = [
		["z.md", "noise.md", "b.yaml", "a.md", "nested"],
		["nested", "a.md", "b.yaml", "noise.md", "z.md"],
	];

	for (const directoryEntries of cases) {
		const result = buildSpecIndex(configWithSpecRoots(["specs"]), {
			cwd: CWD,
			fs: createVirtualFs({
				directories: {
					specs: directoryEntries,
					"specs/nested": ["empty.yaml"],
				},
				files: {
					"specs/z.md": Buffer.from("# Z-001\n"),
					"specs/noise.md": Buffer.from("# Editorial heading\nFree text\n"),
					"specs/b.yaml": Buffer.from("id: B-001\n"),
					"specs/a.md": Buffer.from("# A-001\n"),
					"specs/nested/empty.yaml": Buffer.from("title: Valid spec without id\n"),
				},
			}),
		});

		assert.equal(result.kind, "ok");
		if (result.kind === "ok") {
			assert.deepEqual(observedAnchorView(result.specIndex.observedAnchors), expected);
			assert.deepEqual(occurrenceView(result.specIndex.anchorOccurrences), expected);
		}
	}
});

test("classifies duplicate anchors across spec files as UnsupportedRepoError", () => {
	const result = buildSpecIndex(configWithSpecRoots(["specs"]), {
		cwd: CWD,
		fs: createVirtualFs({
			directories: {
				specs: ["a.md", "b.yaml"],
			},
			files: {
				"specs/a.md": Buffer.from("# DUP-001\n"),
				"specs/b.yaml": Buffer.from("id: DUP-001\n"),
			},
		}),
	});

	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.error.kind, "UnsupportedRepoError");
	}
});

test("classifies duplicate anchors within one Markdown spec file as UnsupportedRepoError", () => {
	const result = buildSpecIndex(configWithSpecRoots(["specs"]), {
		cwd: CWD,
		fs: createVirtualFs({
			directories: {
				specs: ["duplicates.md"],
			},
			files: {
				"specs/duplicates.md": Buffer.from("# DUP-001\n\n## DUP-001 duplicate\n"),
			},
		}),
	});

	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.error.kind, "UnsupportedRepoError");
	}
});

test("extracts supported anchors from ATX Markdown headings", () => {
	const result = buildSpecIndex(configWithSpecRoots(["specs"]), {
		cwd: CWD,
		fs: createVirtualFs({
			directories: {
				specs: ["anchors.md"],
			},
			files: {
				"specs/anchors.md": Buffer.from(
					[
						"# AA-001",
						"## DOC.README.PRESENT Readme present",
						"### BB-002: Colon suffix",
						"#### CC-003- Dash suffix",
						"##### DD-004_not-supported",
						"###### EE-005extra-not-supported",
						"",
					].join("\n"),
				),
			},
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(occurrenceView(result.specIndex.anchorOccurrences), [
			["AA-001", "specs/anchors.md", "markdown"],
			["BB-002", "specs/anchors.md", "markdown"],
			["CC-003", "specs/anchors.md", "markdown"],
			["DOC.README.PRESENT", "specs/anchors.md", "markdown"],
		]);
	}
});

test("extracts repository documentation anchors from ATX Markdown heading prefixes", () => {
	const result = buildSpecIndex(configWithSpecRoots(["specs"]), {
		cwd: CWD,
		fs: createVirtualFs({
			directories: {
				specs: ["repo-docs.md"],
			},
			files: {
				"specs/repo-docs.md": Buffer.from(
					[
						"# T10.6 Implement docs anchors",
						"## T0.0a: Bootstrap task suffix",
						"### M10 - Release milestone",
						"#### S5 Spike report",
						"##### ADR-0012",
						"",
					].join("\n"),
				),
			},
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(occurrenceView(result.specIndex.anchorOccurrences), [
			["ADR-0012", "specs/repo-docs.md", "markdown"],
			["M10", "specs/repo-docs.md", "markdown"],
			["S5", "specs/repo-docs.md", "markdown"],
			["T0.0a", "specs/repo-docs.md", "markdown"],
			["T10.6", "specs/repo-docs.md", "markdown"],
		]);
	}
});

test("rejects near-miss repository documentation anchors from ATX Markdown prefixes", () => {
	const result = buildSpecIndex(configWithSpecRoots(["specs"]), {
		cwd: CWD,
		fs: createVirtualFs({
			directories: {
				specs: ["near-misses.md"],
			},
			files: {
				"specs/near-misses.md": Buffer.from(
					[
						"# t10.6 Lowercase prefix",
						"## T10 Missing minor",
						"### T10. Missing minor digits",
						"#### T10.6A Uppercase suffix",
						"##### M10.1 Milestone dotted form",
						"###### S05 Spike leading zero",
						"# ADR-12 Malformed ADR",
						"## ADR0012 Malformed ADR",
						"",
					].join("\n"),
				),
			},
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.specIndex.anchorOccurrences, []);
	}
});

test("normalizes Markdown heading inline text according to the contract", () => {
	const result = buildSpecIndex(configWithSpecRoots(["specs"]), {
		cwd: CWD,
		fs: createVirtualFs({
			directories: {
				specs: ["inline.md"],
			},
			files: {
				"specs/inline.md": Buffer.from(
					[
						"## **FR-014**\tValidate",
						"## `DOC.README.PRESENT`   - README present",
						"## <!-- US-001 --> Hidden html does not count",
						"",
					].join("\n"),
				),
			},
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(occurrenceView(result.specIndex.anchorOccurrences), [
			["DOC.README.PRESENT", "specs/inline.md", "markdown"],
			["FR-014", "specs/inline.md", "markdown"],
		]);
	}
});

test("ignores Markdown Setext headings and anchors outside the heading prefix", () => {
	const result = buildSpecIndex(configWithSpecRoots(["specs"]), {
		cwd: CWD,
		fs: createVirtualFs({
			directories: {
				specs: ["ignored.md"],
			},
			files: {
				"specs/ignored.md": Buffer.from(
					[
						"FR-014 Setext is outside support",
						"===============================",
						"",
						"## Validate changelog FR-014",
						"",
					].join("\n"),
				),
			},
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.specIndex.anchorOccurrences, []);
	}
});

test("extracts Markdown anchors after an initial UTF-8 BOM is removed", () => {
	const result = buildSpecIndex(configWithSpecRoots(["specs"]), {
		cwd: CWD,
		fs: createVirtualFs({
			directories: {
				specs: ["bom.md"],
			},
			files: {
				"specs/bom.md": Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from("# BOM-001\n")]),
			},
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(occurrenceView(result.specIndex.anchorOccurrences), [
			["BOM-001", "specs/bom.md", "markdown"],
		]);
	}
});

test("extracts YAML anchors only from a valid root string id", () => {
	const result = buildSpecIndex(configWithSpecRoots(["specs"]), {
		cwd: CWD,
		fs: createVirtualFs({
			directories: {
				specs: [
					"root.yaml",
					"profile.yaml",
					"nested.yml",
					"no-id.yaml",
					"invalid-id.yaml",
					"non-string.yaml",
				],
			},
			files: {
				"specs/root.yaml": Buffer.from("id: YAML.ROOT.ID\ntitle: Root id\n"),
				"specs/profile.yaml": Buffer.from("%YAML 1.2\n---\nid: YAML.PROFILE.OK\nflag: on\n"),
				"specs/nested.yml": Buffer.from("feature:\n  id: NEST-001\n"),
				"specs/no-id.yaml": Buffer.from("title: No root id\n"),
				"specs/invalid-id.yaml": Buffer.from("id: not-supported\n"),
				"specs/non-string.yaml": Buffer.from("id: 123\n"),
			},
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(occurrenceView(result.specIndex.anchorOccurrences), [
			["YAML.PROFILE.OK", "specs/profile.yaml", "yaml"],
			["YAML.ROOT.ID", "specs/root.yaml", "yaml"],
		]);
	}
});

test("extracts YAML anchors after an initial UTF-8 BOM is removed", () => {
	const result = buildSpecIndex(configWithSpecRoots(["specs"]), {
		cwd: CWD,
		fs: createVirtualFs({
			directories: {
				specs: ["bom.yaml"],
			},
			files: {
				"specs/bom.yaml": Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from("id: BOM-001\n")]),
			},
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(occurrenceView(result.specIndex.anchorOccurrences), [
			["BOM-001", "specs/bom.yaml", "yaml"],
		]);
	}
});

test("classifies invalid YAML spec inputs as UnsupportedRepoError", () => {
	const cases: ReadonlyArray<readonly [string, string]> = [
		["invalid.yaml", "id: [unterminated\n"],
		["multidoc.yaml", "id: ONE-001\n---\nid: TWO-002\n"],
		["duplicate-root.yaml", "id: ONE-001\nid: TWO-002\n"],
		["duplicate-nested.yaml", "items:\n  key: one\n  key: two\n"],
		["yaml-1-1.yaml", "%YAML 1.1\n---\nid: OLD-001\n"],
	];

	for (const [path, text] of cases) {
		const result = buildSpecIndex(configWithSpecRoots(["specs"]), {
			cwd: CWD,
			fs: createVirtualFs({
				directories: {
					specs: [path],
				},
				files: {
					[`specs/${path}`]: Buffer.from(text),
				},
			}),
		});

		assert.equal(result.kind, "error", path);
		if (result.kind === "error") {
			assert.equal(result.error.kind, "UnsupportedRepoError", path);
		}
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
