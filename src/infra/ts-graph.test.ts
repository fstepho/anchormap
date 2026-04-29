import { strict as assert } from "node:assert";
import { test } from "node:test";

import ts = require("typescript");

import { type RepoPath, validateRepoPath } from "../domain/repo-path";
import type { Config } from "./config-io";
import {
	buildProductGraph,
	buildStaticEdgeResolutionCandidates,
	extractSupportedStaticEdgeInputs,
	extractUnsupportedStaticEdgeInputs,
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

function config(options: { readonly ignoreRoots?: readonly string[] } = {}): Config {
	return {
		version: 1,
		productRoot: repoPath("src"),
		specRoots: [repoPath("specs")],
		ignoreRoots: (options.ignoreRoots ?? []).map(repoPath),
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
		exists(path: string): boolean {
			assert.ok(path.startsWith(`${CWD}/`));
			const relative = path.slice(CWD.length + 1);
			return files[relative] !== undefined;
		},
	};
}

function bytes(text: string): Uint8Array {
	return Buffer.from(text, "utf8");
}

function candidatePaths(
	importer: string,
	specifier: string,
): Array<{ path: string; support: "supported" | "diagnostic_only" }> {
	return buildStaticEdgeResolutionCandidates(repoPath(importer), specifier).map((candidate) => ({
		path: candidate.path,
		support: candidate.support,
	}));
}

function edgesByImporterEntries(
	edgesByImporter: ReadonlyMap<RepoPath, readonly RepoPath[]>,
): Array<[string, readonly string[]]> {
	return [...edgesByImporter.entries()].map(([importer, targets]) => [importer, targets]);
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
			result.productGraph.parsedFiles.map((file) => file.path),
			["src/a.ts", "src/z.ts"],
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

test("extracts unsupported local require and dynamic import inputs in source order", () => {
	const result = parseTypeScriptProductText(
		repoPath("src/index.ts"),
		[
			"const required = require('./required');",
			"const dynamic = import('./dynamic');",
			"const externalRequire = require('pkg');",
			"const externalDynamic = import('pkg');",
			"const computedRequire = require(name);",
			"const computedDynamic = import(name);",
		].join("\n"),
	);

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(extractUnsupportedStaticEdgeInputs(result.sourceFile), [
			{ syntaxKind: "require_call", specifier: "./required" },
			{ syntaxKind: "dynamic_import", specifier: "./dynamic" },
		]);
	}
});

test("builds local static edge candidates exactly by supported specifier shape", () => {
	assert.deepEqual(candidatePaths("src/features/index.ts", "./model.ts"), [
		{ path: "src/features/model.ts", support: "supported" },
	]);
	assert.deepEqual(candidatePaths("src/features/index.ts", "./view.tsx"), [
		{ path: "src/features/view.tsx", support: "diagnostic_only" },
	]);
	assert.deepEqual(candidatePaths("src/features/index.ts", "./compiled.js"), [
		{ path: "src/features/compiled.ts", support: "supported" },
		{ path: "src/features/compiled.js", support: "diagnostic_only" },
	]);
	assert.deepEqual(candidatePaths("src/features/index.ts", "./types.d.js"), [
		{ path: "src/features/types.d.ts", support: "diagnostic_only" },
		{ path: "src/features/types.d.js", support: "diagnostic_only" },
	]);
	assert.deepEqual(candidatePaths("src/features/index.ts", "./types.d.ts"), [
		{ path: "src/features/types.d.ts", support: "diagnostic_only" },
	]);
	assert.deepEqual(candidatePaths("src/features/index.ts", "./model"), [
		{ path: "src/features/model.ts", support: "supported" },
		{ path: "src/features/model/index.ts", support: "supported" },
		{ path: "src/features/model.tsx", support: "diagnostic_only" },
		{ path: "src/features/model.js", support: "diagnostic_only" },
		{ path: "src/features/model.d.ts", support: "diagnostic_only" },
		{ path: "src/features/model/index.tsx", support: "diagnostic_only" },
		{ path: "src/features/model/index.js", support: "diagnostic_only" },
		{ path: "src/features/model/index.d.ts", support: "diagnostic_only" },
	]);
	assert.deepEqual(candidatePaths("src/features/index.ts", "./model.json"), []);
	assert.deepEqual(candidatePaths("src/features/index.ts", "./model/"), []);
});

test("builds explicit .js static edge candidates with source .ts before exact .js", () => {
	assert.deepEqual(candidatePaths("src/features/index.ts", "./dep.js"), [
		{ path: "src/features/dep.ts", support: "supported" },
		{ path: "src/features/dep.js", support: "diagnostic_only" },
	]);
	assert.deepEqual(candidatePaths("src/features/index.ts", "./dir/index.js"), [
		{ path: "src/features/dir/index.ts", support: "supported" },
		{ path: "src/features/dir/index.js", support: "diagnostic_only" },
	]);
	assert.deepEqual(candidatePaths("src/features/index.ts", "./dir.js"), [
		{ path: "src/features/dir.ts", support: "supported" },
		{ path: "src/features/dir.js", support: "diagnostic_only" },
	]);
});

test("omits outside-root static edge candidates before existence testing", () => {
	assert.deepEqual(candidatePaths("src/index.ts", "../../outside"), []);
	assert.deepEqual(candidatePaths("src/index.ts", "../outside"), [
		{ path: "outside.ts", support: "supported" },
		{ path: "outside/index.ts", support: "supported" },
		{ path: "outside.tsx", support: "diagnostic_only" },
		{ path: "outside.js", support: "diagnostic_only" },
		{ path: "outside.d.ts", support: "diagnostic_only" },
		{ path: "outside/index.tsx", support: "diagnostic_only" },
		{ path: "outside/index.js", support: "diagnostic_only" },
		{ path: "outside/index.d.ts", support: "diagnostic_only" },
	]);
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
		assert.deepEqual(result.productGraph.graphFindings, [
			{
				kind: "unresolved_static_edge",
				importer: "src/index.ts",
				specifier: "./setup",
			},
			{
				kind: "unresolved_static_edge",
				importer: "src/index.ts",
				specifier: "./types",
			},
		]);
	}
});

test("resolves simple declaration-only product files without changing graph semantics", () => {
	const result = buildProductGraph(config(), [repoPath("src/index.ts"), repoPath("src/dep.ts")], {
		cwd: CWD,
		fs: createReadFileFs({
			"src/index.ts": bytes(
				[
					'import { value0001 as dep0001 } from "./dep";',
					"",
					"export const value0000 = 0;",
					"export const linked0000 = [dep0001];",
					"",
				].join("\n"),
			),
			"src/dep.ts": bytes("export const value0001 = 1;\n"),
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		const indexFile = result.productGraph.parsedFiles.find((file) => file.path === "src/index.ts");
		assert.deepEqual(indexFile?.supportedStaticEdgeInputs, [
			{ syntaxKind: "import_declaration", specifier: "./dep" },
		]);
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), [
			"src/dep.ts",
		]);
		assert.deepEqual(result.productGraph.graphFindings, []);
	}
});

test("keeps simple-looking invalid TypeScript on the parser rejection path", () => {
	const cases = [
		"export const class = 1;\n",
		'import { value0001 as class } from "./dep";\nexport const value0000 = 0;\n',
		"export const value0000 = 08;\n",
	];

	for (const source of cases) {
		const result = buildProductGraph(config(), [repoPath("src/index.ts")], {
			cwd: CWD,
			fs: createReadFileFs({
				"src/index.ts": bytes(source),
			}),
		});

		assert.equal(result.kind, "error", source);
		if (result.kind === "error") {
			assert.equal(result.error.kind, "UnsupportedRepoError", source);
		}
	}
});

test("emits unsupported_static_edge for local require without resolving or adding edges", () => {
	let existenceChecks = 0;
	const readFile = createReadFileFs({
		"src/index.ts": bytes("const value = require('./lib');\n"),
		"src/lib.ts": bytes("export const lib = 1;\n"),
	}).readFile;
	const result = buildProductGraph(config(), [repoPath("src/index.ts"), repoPath("src/lib.ts")], {
		cwd: CWD,
		fs: {
			readFile,
			exists(_path: string): boolean {
				existenceChecks += 1;
				return true;
			},
		},
	});

	assert.equal(result.kind, "ok");
	assert.equal(existenceChecks, 0);
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), []);
		assert.deepEqual(result.productGraph.parsedFiles[0]?.unsupportedStaticEdgeInputs, [
			{ syntaxKind: "require_call", specifier: "./lib" },
		]);
		assert.deepEqual(result.productGraph.graphFindings, [
			{
				kind: "unsupported_static_edge",
				importer: "src/index.ts",
				syntax_kind: "require_call",
				specifier: "./lib",
			},
		]);
	}
});

test("emits unsupported_static_edge for local dynamic import without resolving or adding edges", () => {
	let existenceChecks = 0;
	const readFile = createReadFileFs({
		"src/index.ts": bytes("const value = import('./lib');\n"),
		"src/lib.ts": bytes("export const lib = 1;\n"),
	}).readFile;
	const result = buildProductGraph(config(), [repoPath("src/index.ts"), repoPath("src/lib.ts")], {
		cwd: CWD,
		fs: {
			readFile,
			exists(_path: string): boolean {
				existenceChecks += 1;
				return true;
			},
		},
	});

	assert.equal(result.kind, "ok");
	assert.equal(existenceChecks, 0);
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), []);
		assert.deepEqual(result.productGraph.parsedFiles[0]?.unsupportedStaticEdgeInputs, [
			{ syntaxKind: "dynamic_import", specifier: "./lib" },
		]);
		assert.deepEqual(result.productGraph.graphFindings, [
			{
				kind: "unsupported_static_edge",
				importer: "src/index.ts",
				syntax_kind: "dynamic_import",
				specifier: "./lib",
			},
		]);
	}
});

test("ignores non-relative require and dynamic import calls", () => {
	const result = buildProductGraph(config(), [repoPath("src/index.ts")], {
		cwd: CWD,
		fs: createReadFileFs({
			"src/index.ts": bytes(
				[
					"const required = require('pkg');",
					"const dynamic = import('pkg');",
					"const computedRequire = require(name);",
					"const computedDynamic = import(name);",
				].join("\n"),
			),
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.parsedFiles[0]?.unsupportedStaticEdgeInputs, []);
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), []);
		assert.deepEqual(result.productGraph.graphFindings, []);
		assert.equal(productGraphHasLocalDependencySyntax(result.productGraph), false);
	}
});

test("resolves supported static edges with .ts before index.ts and deduplicates targets", () => {
	const result = buildProductGraph(config(), [repoPath("src/index.ts"), repoPath("src/lib.ts")], {
		cwd: CWD,
		fs: createReadFileFs({
			"src/index.ts": bytes("import './lib';\nexport * from './lib';\n"),
			"src/lib.ts": bytes("export const lib = 1;\n"),
			"src/lib/index.ts": bytes("export const fallback = 1;\n"),
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), [
			"src/lib.ts",
		]);
		assert.deepEqual(result.productGraph.graphFindings, []);
	}
});

test("short-circuits extensionless resolution from discovered product files", () => {
	const checkedPaths: string[] = [];
	const readFile = createReadFileFs({
		"src/index.ts": bytes("import './lib';\n"),
		"src/lib.ts": bytes("export const lib = 1;\n"),
	}).readFile;
	const result = buildProductGraph(config(), [repoPath("src/index.ts"), repoPath("src/lib.ts")], {
		cwd: CWD,
		fs: {
			readFile,
			exists(path: string): boolean {
				checkedPaths.push(path);
				return true;
			},
		},
	});

	assert.equal(result.kind, "ok");
	assert.deepEqual(checkedPaths, []);
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), [
			"src/lib.ts",
		]);
		assert.deepEqual(result.productGraph.graphFindings, []);
	}
});

test("caches candidate existence from discovered product files across duplicate static edge inputs", () => {
	let existenceChecks = 0;
	const readFile = createReadFileFs({
		"src/index.ts": bytes("import './lib';\nexport * from './lib';\n"),
		"src/lib.ts": bytes("export const lib = 1;\n"),
	}).readFile;
	const result = buildProductGraph(config(), [repoPath("src/index.ts"), repoPath("src/lib.ts")], {
		cwd: CWD,
		fs: {
			readFile,
			exists(path: string): boolean {
				assert.equal(path, `${CWD}/src/lib.ts`);
				existenceChecks += 1;
				return true;
			},
		},
	});

	assert.equal(result.kind, "ok");
	assert.equal(existenceChecks, 0);
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), [
			"src/lib.ts",
		]);
		assert.deepEqual(result.productGraph.graphFindings, []);
	}
});

test("normalizes product files, importers, and edges independent of discovery order", () => {
	const files = {
		"src/a.ts": bytes("import './c';\nimport './b';\n"),
		"src/b.ts": bytes("export const b = 1;\n"),
		"src/c.ts": bytes("export const c = 1;\n"),
		"src/empty.ts": bytes("export const empty = 1;\n"),
	};
	const first = buildProductGraph(
		config(),
		[
			repoPath("src/empty.ts"),
			repoPath("src/c.ts"),
			repoPath("src/a.ts"),
			repoPath("src/b.ts"),
			repoPath("src/a.ts"),
		],
		{
			cwd: CWD,
			fs: createReadFileFs(files),
		},
	);
	const second = buildProductGraph(
		config(),
		[repoPath("src/b.ts"), repoPath("src/a.ts"), repoPath("src/empty.ts"), repoPath("src/c.ts")],
		{
			cwd: CWD,
			fs: createReadFileFs(files),
		},
	);

	assert.equal(first.kind, "ok");
	assert.equal(second.kind, "ok");
	if (first.kind === "ok" && second.kind === "ok") {
		assert.deepEqual(first.productGraph.productFiles, [
			"src/a.ts",
			"src/b.ts",
			"src/c.ts",
			"src/empty.ts",
		]);
		assert.deepEqual(second.productGraph.productFiles, first.productGraph.productFiles);
		assert.deepEqual(edgesByImporterEntries(first.productGraph.edgesByImporter), [
			["src/a.ts", ["src/b.ts", "src/c.ts"]],
			["src/b.ts", []],
			["src/c.ts", []],
			["src/empty.ts", []],
		]);
		assert.deepEqual(
			edgesByImporterEntries(second.productGraph.edgesByImporter),
			edgesByImporterEntries(first.productGraph.edgesByImporter),
		);
		assert.deepEqual(second.productGraph.graphFindings, first.productGraph.graphFindings);
	}
});

test("deduplicates graph findings with identical canonical tuples", () => {
	const result = buildProductGraph(config(), [repoPath("src/index.ts")], {
		cwd: CWD,
		fs: createReadFileFs({
			"src/index.ts": bytes("import './missing';\nexport * from './missing';\n"),
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), []);
		assert.deepEqual(result.productGraph.graphFindings, [
			{
				kind: "unresolved_static_edge",
				importer: "src/index.ts",
				specifier: "./missing",
			},
		]);
	}
});

test("represents cyclic supported dependencies without recursive graph expansion", () => {
	const result = buildProductGraph(
		config(),
		[repoPath("src/a.ts"), repoPath("src/b.ts"), repoPath("src/c.ts")],
		{
			cwd: CWD,
			fs: createReadFileFs({
				"src/a.ts": bytes("import './b';\n"),
				"src/b.ts": bytes("import './a';\nimport './c';\n"),
				"src/c.ts": bytes("export const c = 1;\n"),
			}),
		},
	);

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(edgesByImporterEntries(result.productGraph.edgesByImporter), [
			["src/a.ts", ["src/b.ts"]],
			["src/b.ts", ["src/a.ts", "src/c.ts"]],
			["src/c.ts", []],
		]);
		assert.deepEqual(result.productGraph.graphFindings, []);
	}
});

test("falls back to index.ts when extensionless .ts candidate is absent", () => {
	const result = buildProductGraph(
		config(),
		[repoPath("src/index.ts"), repoPath("src/lib/index.ts")],
		{
			cwd: CWD,
			fs: createReadFileFs({
				"src/index.ts": bytes("import './lib';\n"),
				"src/lib/index.ts": bytes("export const lib = 1;\n"),
			}),
		},
	);

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), [
			"src/lib/index.ts",
		]);
		assert.deepEqual(result.productGraph.graphFindings, []);
	}
});

test("resolves explicit .js import declarations to sibling .ts source files", () => {
	const result = buildProductGraph(config(), [repoPath("src/index.ts"), repoPath("src/dep.ts")], {
		cwd: CWD,
		fs: createReadFileFs({
			"src/index.ts": bytes("import './dep.js';\n"),
			"src/dep.ts": bytes("export const dep = 1;\n"),
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), [
			"src/dep.ts",
		]);
		assert.deepEqual(result.productGraph.graphFindings, []);
	}
});

test("resolves explicit .js export declarations to sibling .ts source files", () => {
	const result = buildProductGraph(config(), [repoPath("src/index.ts"), repoPath("src/dep.ts")], {
		cwd: CWD,
		fs: createReadFileFs({
			"src/index.ts": bytes("export * from './dep.js';\nexport { dep } from './dep.js';\n"),
			"src/dep.ts": bytes("export const dep = 1;\n"),
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), [
			"src/dep.ts",
		]);
		assert.deepEqual(result.productGraph.graphFindings, []);
	}
});

test("resolves explicit .js specifiers to .ts when both source and exact .js exist", () => {
	const result = buildProductGraph(config(), [repoPath("src/index.ts"), repoPath("src/dep.ts")], {
		cwd: CWD,
		fs: createReadFileFs({
			"src/index.ts": bytes("import './dep.js';\n"),
			"src/dep.ts": bytes("export const dep = 1;\n"),
			"src/dep.js": bytes("export const dep = 1;\n"),
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), [
			"src/dep.ts",
		]);
		assert.deepEqual(result.productGraph.graphFindings, []);
	}
});

test("emits unsupported_local_target for exact .js when no .ts source candidate is retained", () => {
	const result = buildProductGraph(config(), [repoPath("src/index.ts")], {
		cwd: CWD,
		fs: createReadFileFs({
			"src/index.ts": bytes("import './dep.js';\n"),
			"src/dep.js": bytes("export const dep = 1;\n"),
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), []);
		assert.deepEqual(result.productGraph.graphFindings, [
			{
				kind: "unsupported_local_target",
				importer: "src/index.ts",
				target_path: "src/dep.js",
			},
		]);
	}
});

test("emits unresolved_static_edge with original explicit .js specifier when no candidate exists", () => {
	const result = buildProductGraph(config(), [repoPath("src/index.ts")], {
		cwd: CWD,
		fs: createReadFileFs({
			"src/index.ts": bytes("import './dep.js';\n"),
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), []);
		assert.deepEqual(result.productGraph.graphFindings, [
			{
				kind: "unresolved_static_edge",
				importer: "src/index.ts",
				specifier: "./dep.js",
			},
		]);
	}
});

test("emits out_of_scope_static_edge for explicit .js source .ts candidate before exact .js", () => {
	const result = buildProductGraph(
		config({ ignoreRoots: ["src/generated"] }),
		[repoPath("src/index.ts")],
		{
			cwd: CWD,
			fs: createReadFileFs({
				"src/index.ts": bytes("import './generated/dep.js';\nexport * from '../shared/dep.js';\n"),
				"src/generated/dep.ts": bytes("export const ignored = 1;\n"),
				"src/generated/dep.js": bytes("export const ignored = 1;\n"),
				"shared/dep.ts": bytes("export const outside = 1;\n"),
				"shared/dep.js": bytes("export const outside = 1;\n"),
			}),
		},
	);

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), []);
		assert.deepEqual(result.productGraph.graphFindings, [
			{
				kind: "out_of_scope_static_edge",
				importer: "src/index.ts",
				target_path: "shared/dep.ts",
			},
			{
				kind: "out_of_scope_static_edge",
				importer: "src/index.ts",
				target_path: "src/generated/dep.ts",
			},
		]);
	}
});

test("does not fall back from explicit ./dir.js specifiers to ./dir/index.ts", () => {
	const result = buildProductGraph(
		config(),
		[repoPath("src/index.ts"), repoPath("src/dir/index.ts")],
		{
			cwd: CWD,
			fs: createReadFileFs({
				"src/index.ts": bytes("import './dir.js';\n"),
				"src/dir/index.ts": bytes("export const dep = 1;\n"),
			}),
		},
	);

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), []);
		assert.deepEqual(result.productGraph.graphFindings, [
			{
				kind: "unresolved_static_edge",
				importer: "src/index.ts",
				specifier: "./dir.js",
			},
		]);
	}
});

test("emits unresolved_static_edge for missing and unsupported explicit-extension targets", () => {
	const result = buildProductGraph(config(), [repoPath("src/index.ts")], {
		cwd: CWD,
		fs: createReadFileFs({
			"src/index.ts": bytes("import './missing';\nexport * from './data.json';\n"),
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), []);
		assert.deepEqual(result.productGraph.graphFindings, [
			{
				kind: "unresolved_static_edge",
				importer: "src/index.ts",
				specifier: "./data.json",
			},
			{
				kind: "unresolved_static_edge",
				importer: "src/index.ts",
				specifier: "./missing",
			},
		]);
	}
});

test("emits out_of_scope_static_edge before unsupported_local_target", () => {
	const result = buildProductGraph(
		config({ ignoreRoots: ["src/generated"] }),
		[repoPath("src/index.ts")],
		{
			cwd: CWD,
			fs: createReadFileFs({
				"src/index.ts": bytes("import './generated/view';\nexport * from '../outside/view';\n"),
				"src/generated/view.tsx": bytes("export const ignored = 1;\n"),
				"outside/view.ts": bytes("export const outside = 1;\n"),
			}),
		},
	);

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), []);
		assert.deepEqual(result.productGraph.graphFindings, [
			{
				kind: "out_of_scope_static_edge",
				importer: "src/index.ts",
				target_path: "outside/view.ts",
			},
			{
				kind: "out_of_scope_static_edge",
				importer: "src/index.ts",
				target_path: "src/generated/view.tsx",
			},
		]);
	}
});

test("emits unsupported_local_target for existing unsupported in-scope targets", () => {
	const result = buildProductGraph(config(), [repoPath("src/index.ts")], {
		cwd: CWD,
		fs: createReadFileFs({
			"src/index.ts": bytes("import './view';\n"),
			"src/view.tsx": bytes("export const view = 1;\n"),
			"src/view.js": bytes("export const compiled = 1;\n"),
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), []);
		assert.deepEqual(result.productGraph.graphFindings, [
			{
				kind: "unsupported_local_target",
				importer: "src/index.ts",
				target_path: "src/view.tsx",
			},
		]);
	}
});

test("treats candidates outside repository root as nonexistent during resolution", () => {
	const result = buildProductGraph(config(), [repoPath("src/index.ts")], {
		cwd: CWD,
		fs: createReadFileFs({
			"src/index.ts": bytes("import '../../outside';\n"),
			"outside.ts": bytes("export const outside = 1;\n"),
		}),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(result.productGraph.edgesByImporter.get(repoPath("src/index.ts")), []);
		assert.deepEqual(result.productGraph.graphFindings, [
			{
				kind: "unresolved_static_edge",
				importer: "src/index.ts",
				specifier: "../../outside",
			},
		]);
	}
});

test("classifies required existence-test failures as UnsupportedRepoError", () => {
	const result = buildProductGraph(config(), [repoPath("src/index.ts")], {
		cwd: CWD,
		fs: {
			readFile: createReadFileFs({
				"src/index.ts": bytes("import './candidate';\n"),
			}).readFile,
			exists(path: string): boolean {
				assert.equal(path, `${CWD}/src/candidate.ts`);
				throw new Error("existence unavailable");
			},
		},
	});

	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.error.kind, "UnsupportedRepoError");
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
