import { strict as assert } from "node:assert";
import { test } from "node:test";

import ts = require("typescript");

import { type RepoPath, validateRepoPath } from "../domain/repo-path";
import type { Config } from "./config-io";
import {
	buildProductGraph,
	type ProductGraphFs,
	parseTypeScriptProductText,
	sourceFileHasLocalDependencySyntax,
} from "./ts-graph";

type ParsedSourceFile = ts.SourceFile & {
	readonly parseDiagnostics: readonly ts.Diagnostic[];
};

const CWD = "/repo";

function repoPath(value: string): RepoPath {
	const result = validateRepoPath(value);
	if (result.kind !== "ok") {
		throw new Error(`invalid test RepoPath ${value}`);
	}
	return result.repoPath;
}

function config(): Config {
	return {
		version: 1,
		productRoot: repoPath("src"),
		specRoots: [repoPath("specs")],
		ignoreRoots: [],
		mappings: {},
	};
}

function createReadFileFs(files: Readonly<Record<string, Uint8Array>>): ProductGraphFs {
	return {
		readFile(path: string): Uint8Array {
			assert.ok(path.startsWith(`${CWD}/`));
			const relative = path.slice(CWD.length + 1);
			const bytes = files[relative];
			if (bytes === undefined) {
				throw new Error(`missing product file ${relative}`);
			}
			return bytes;
		},
	};
}

function bytes(text: string): Uint8Array {
	return Buffer.from(text, "utf8");
}

test("uses the accepted pinned TypeScript parser dependency", () => {
	assert.equal(ts.version, "6.0.3");
});

test("parses minimal valid TypeScript with ScriptKind.TS", () => {
	const result = parseTypeScriptProductText(repoPath("src/index.ts"), "export const value = 1;\n");

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.equal(result.sourceFile.fileName, "src/index.ts");
		assert.equal((result.sourceFile as ParsedSourceFile).parseDiagnostics.length, 0);
	}
});

test("rejects TypeScript syntax diagnostics", () => {
	const result = parseTypeScriptProductText(repoPath("src/index.ts"), "export const = ;\n");

	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.error.kind, "UnsupportedRepoError");
	}
});

test("rejects JSX syntax in .ts under ScriptKind.TS", () => {
	const result = parseTypeScriptProductText(repoPath("src/view.ts"), "const node = <div />;\n");

	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.error.kind, "UnsupportedRepoError");
	}
});

test("reads all product files through strict UTF-8 decoding and strips one initial BOM", () => {
	const result = buildProductGraph(config(), [repoPath("src/z.ts"), repoPath("src/a.ts")], {
		cwd: CWD,
		fs: createReadFileFs({
			"src/a.ts": bytes("\uFEFFexport const a = 1;\n"),
			"src/z.ts": bytes("export const z = 1;\n"),
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.productFiles, ["src/a.ts", "src/z.ts"]);
		assert.deepEqual(
			result.productGraph.parsedFiles.map((file) => file.text),
			["export const a = 1;\n", "export const z = 1;\n"],
		);
		assert.deepEqual([...result.productGraph.edgesByImporter.keys()], ["src/a.ts", "src/z.ts"]);
	}
});

test("detects parsed local dependency syntax without extracting graph edges", () => {
	const cases: Array<{ name: string; text: string; expected: boolean }> = [
		{
			name: "local import declaration",
			text: "import { value } from './value';\n",
			expected: true,
		},
		{
			name: "local side effect import",
			text: "import '../setup';\n",
			expected: true,
		},
		{
			name: "local export declaration",
			text: "export { value } from './value';\n",
			expected: true,
		},
		{
			name: "local require call",
			text: "const value = require('./value');\n",
			expected: true,
		},
		{
			name: "local dynamic import",
			text: "const value = import('./value');\n",
			expected: true,
		},
		{
			name: "backslash import declaration",
			text: "import { value } from './\\\\value';\n",
			expected: false,
		},
		{
			name: "backslash export declaration",
			text: "export { value } from '../\\\\value';\n",
			expected: false,
		},
		{
			name: "backslash require call",
			text: "const value = require('./\\\\value');\n",
			expected: false,
		},
		{
			name: "backslash dynamic import",
			text: "const value = import('../\\\\value');\n",
			expected: false,
		},
		{
			name: "external import",
			text: "import { value } from 'pkg';\n",
			expected: false,
		},
		{
			name: "no dependency syntax",
			text: "export const value = 1;\n",
			expected: false,
		},
	];

	for (const testCase of cases) {
		const result = parseTypeScriptProductText(repoPath("src/index.ts"), testCase.text);

		assert.equal(result.kind, "ok", testCase.name);
		if (result.kind === "ok") {
			assert.equal(
				sourceFileHasLocalDependencySyntax(result.sourceFile),
				testCase.expected,
				testCase.name,
			);
		}
	}
});

test("classifies unreadable and non-UTF-8 product files as UnsupportedRepoError", () => {
	const cases: readonly ProductGraphFs[] = [
		createReadFileFs({}),
		createReadFileFs({
			"src/index.ts": new Uint8Array([0xff]),
		}),
	];

	for (const fs of cases) {
		const result = buildProductGraph(config(), [repoPath("src/index.ts")], {
			cwd: CWD,
			fs,
		});

		assert.equal(result.kind, "error");
		if (result.kind === "error") {
			assert.equal(result.error.kind, "UnsupportedRepoError");
		}
	}
});
