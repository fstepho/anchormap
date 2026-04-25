import { strict as assert } from "node:assert";
import { test } from "node:test";

import ts = require("typescript");

import { type RepoPath, validateRepoPath } from "../domain/repo-path";
import type { Config } from "./config-io";
import {
	buildProductGraph,
	extractSupportedStaticEdgeInputs,
	type ProductGraphFs,
	parseTypeScriptProductText,
	productGraphHasLocalDependencySyntax,
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

test("extracts supported static import and export edge inputs in source order", () => {
	const result = parseTypeScriptProductText(
		repoPath("src/index.ts"),
		[
			"import { value } from './value';",
			"import type { Value } from '../types';",
			"import './setup';",
			"export * from './all';",
			"export { item } from './item';",
			"export {} from './empty';",
			"export type { Value } from './type';",
			"export const local = value;",
		].join("\n"),
	);

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(extractSupportedStaticEdgeInputs(result.sourceFile), [
			{ syntaxKind: "import_declaration", specifier: "./value" },
			{ syntaxKind: "import_declaration", specifier: "../types" },
			{ syntaxKind: "import_declaration", specifier: "./setup" },
			{ syntaxKind: "export_declaration", specifier: "./all" },
			{ syntaxKind: "export_declaration", specifier: "./item" },
			{ syntaxKind: "export_declaration", specifier: "./empty" },
			{ syntaxKind: "export_declaration", specifier: "./type" },
		]);
	}
});

test("ignores non-relative and backslash static import and export specifiers", () => {
	const result = buildProductGraph(config(), [repoPath("src/index.ts")], {
		cwd: CWD,
		fs: createReadFileFs({
			"src/index.ts": bytes(
				[
					"import { external } from 'pkg';",
					"import type { External } from '@scope/pkg';",
					"import './\\\\generated';",
					"export * from 'pkg/subpath';",
					"export { item } from '../\\\\item';",
				].join("\n"),
			),
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.parsedFiles[0]?.supportedStaticEdgeInputs, []);
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), []);
		assert.deepEqual(result.productGraph.graphFindings, []);
		assert.equal(productGraphHasLocalDependencySyntax(result.productGraph), false);
	}
});

test("stores supported static edge inputs on parsed product files", () => {
	const result = buildProductGraph(config(), [repoPath("src/index.ts")], {
		cwd: CWD,
		fs: createReadFileFs({
			"src/index.ts": bytes("import './setup';\nexport type { Value } from './types';\n"),
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.parsedFiles[0]?.supportedStaticEdgeInputs, [
			{ syntaxKind: "import_declaration", specifier: "./setup" },
			{ syntaxKind: "export_declaration", specifier: "./types" },
		]);
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), []);
		assert.deepEqual(result.productGraph.graphFindings, []);
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
