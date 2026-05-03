import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { AnchorId } from "../domain/anchor-id";
import { type RepoPath, validateRepoPath } from "../domain/repo-path";
import type { Config } from "./config-io";
import {
	buildScaffoldAnchorId,
	buildScaffoldMarkdown,
	extractExportedDeclarations,
	renderScaffoldMarkdown,
	type ScaffoldFs,
	writeScaffoldOutputCreateOnly,
} from "./scaffold";
import type { SpecIndex } from "./spec-index";
import { parseTypeScriptProductText } from "./ts-graph";

const CWD = "/repo";

function repoPath(value: string): RepoPath {
	const result = validateRepoPath(value);
	if (result.kind !== "ok") {
		throw new Error(`invalid test RepoPath ${value}`);
	}
	return result.repoPath;
}

function anchorId(value: string): AnchorId {
	return value as AnchorId;
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

function emptySpecIndex(): SpecIndex {
	return {
		specFiles: [],
		observedAnchors: new Map(),
		anchorOccurrences: [],
	};
}

function specIndexWithAnchors(anchors: readonly AnchorId[]): SpecIndex {
	return {
		specFiles: [],
		observedAnchors: new Map(
			anchors.map((id) => [
				id,
				{
					anchorId: id,
					specPath: repoPath("specs/existing.md"),
					sourceKind: "markdown",
				},
			]),
		),
		anchorOccurrences: [],
	};
}

function parseSource(text: string) {
	const parsed = parseTypeScriptProductText(repoPath("src/index.ts"), text);
	if (parsed.kind !== "ok") {
		throw new Error(parsed.error.message);
	}
	return parsed.sourceFile;
}

function scaffoldFs(files: Readonly<Record<string, string>>): ScaffoldFs {
	return {
		readFile(path: string): Uint8Array {
			const relative = path.slice(CWD.length + 1);
			const text = files[relative];
			if (text === undefined) {
				throw new Error(`missing file ${relative}`);
			}
			return Buffer.from(text, "utf8");
		},
		openExclusive() {
			throw new Error("not used");
		},
		writeAll() {
			throw new Error("not used");
		},
		fsync() {
			throw new Error("not used");
		},
		close() {
			throw new Error("not used");
		},
		unlink() {
			throw new Error("not used");
		},
	};
}

test("extracts only supported top-level exported declarations", () => {
	const declarations = extractExportedDeclarations(
		parseSource(
			[
				"const hidden = 1;",
				"export function verifyToken() {}",
				"export default function () {}",
				"export default function NamedDefaultFunction() {}",
				"export default class NamedDefaultClass {}",
				"export default interface NamedDefaultInterface {}",
				"export class SessionStore {}",
				"export interface TokenClaims {}",
				"export type TokenMode = 'strict';",
				"export enum TokenKind { Access }",
				"export const refreshToken = 1, revokeToken = 2;",
				"export const { accessToken, refresh: renamedRefresh } = tokens;",
				"export let [firstToken, , ...restTokens] = tokenList;",
				"export { hidden as exposed };",
				"export * from './other';",
				"",
			].join("\n"),
		),
	);

	assert.deepEqual(declarations, [
		{ exportName: "verifyToken", exportKind: "function" },
		{ exportName: "default", exportKind: "function" },
		{ exportName: "default", exportKind: "function" },
		{ exportName: "default", exportKind: "class" },
		{ exportName: "default", exportKind: "interface" },
		{ exportName: "SessionStore", exportKind: "class" },
		{ exportName: "TokenClaims", exportKind: "interface" },
		{ exportName: "TokenMode", exportKind: "type" },
		{ exportName: "TokenKind", exportKind: "enum" },
		{ exportName: "refreshToken", exportKind: "variable" },
		{ exportName: "revokeToken", exportKind: "variable" },
		{ exportName: "accessToken", exportKind: "variable" },
		{ exportName: "renamedRefresh", exportKind: "variable" },
		{ exportName: "firstToken", exportKind: "variable" },
		{ exportName: "restTokens", exportKind: "variable" },
	]);
});

test("generates deterministic dotted anchors from path plus export name", () => {
	const result = buildScaffoldAnchorId(
		config(),
		repoPath("src/auth-token/2fa.ts"),
		"verifyHTTPToken",
	);

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.equal(result.anchorId, "AUTH_TOKEN.X2FA.VERIFY_HTTP_TOKEN");
	}
});

test("scaffold output cleanup unlinks partial output even when close fails", () => {
	const calls: string[] = [];
	const result = writeScaffoldOutputCreateOnly(repoPath("specs/generated.md"), "# DRAFT\n", {
		cwd: CWD,
		fs: {
			readFile() {
				throw new Error("not used");
			},
			openExclusive(path) {
				calls.push(`open:${path}`);
				return 7;
			},
			writeAll() {
				calls.push("write");
				throw new Error("write failed");
			},
			fsync() {
				throw new Error("not reached");
			},
			close(fd) {
				calls.push(`close:${fd}`);
				throw new Error("close failed");
			},
			unlink(path) {
				calls.push(`unlink:${path}`);
			},
		},
	});

	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.error.kind, "InternalError");
	}
	assert.deepEqual(calls, [
		"open:/repo/specs/generated.md",
		"write",
		"close:7",
		"unlink:/repo/specs/generated.md",
	]);
});

test("renders scaffold markdown byte-for-byte", () => {
	assert.equal(
		renderScaffoldMarkdown([
			{
				anchorId: anchorId("AUTH.TOKEN.VERIFY_TOKEN"),
				sourcePath: repoPath("src/auth/token.ts"),
				exportName: "verifyToken",
				exportKind: "function",
			},
		]),
		[
			"# AUTH.TOKEN.VERIFY_TOKEN",
			"<!-- anchormap scaffold: source=src/auth/token.ts export=verifyToken kind=function -->",
			"",
			"TODO: describe intent.",
			"",
		].join("\n"),
	);
});

test("builds sorted scaffold markdown, disambiguates collisions, and rejects invalid drafts", () => {
	const success = buildScaffoldMarkdown(
		config(),
		[repoPath("src/z.ts"), repoPath("src/auth/token.ts"), repoPath("src/types.ts")],
		emptySpecIndex(),
		{
			cwd: CWD,
			fs: scaffoldFs({
				"src/auth/token.ts": "export function verifyToken() {}\n",
				"src/types.ts": "export default interface TokenTypes {}\n",
				"src/z.ts": "export const lastValue = 1;\n",
			}),
		},
	);

	assert.equal(success.kind, "ok");
	if (success.kind === "ok") {
		assert.equal(
			success.markdown,
			[
				"# AUTH.TOKEN.VERIFY_TOKEN",
				"<!-- anchormap scaffold: source=src/auth/token.ts export=verifyToken kind=function -->",
				"",
				"TODO: describe intent.",
				"",
				"# TYPES.DEFAULT",
				"<!-- anchormap scaffold: source=src/types.ts export=default kind=interface -->",
				"",
				"TODO: describe intent.",
				"",
				"# Z.LAST_VALUE",
				"<!-- anchormap scaffold: source=src/z.ts export=lastValue kind=variable -->",
				"",
				"TODO: describe intent.",
				"",
			].join("\n"),
		);
	}

	const empty = buildScaffoldMarkdown(config(), [repoPath("src/empty.ts")], emptySpecIndex(), {
		cwd: CWD,
		fs: scaffoldFs({ "src/empty.ts": "const hidden = 1;\n" }),
	});
	assert.equal(empty.kind, "error");
	if (empty.kind === "error") {
		assert.equal(empty.error.kind, "UsageError");
	}

	const duplicate = buildScaffoldMarkdown(
		config(),
		[repoPath("src/collision.ts")],
		emptySpecIndex(),
		{
			cwd: CWD,
			fs: scaffoldFs({
				"src/collision.ts": "export const fooBar = 1;\nexport const foo_bar = 2;\n",
			}),
		},
	);
	assert.equal(duplicate.kind, "ok");
	if (duplicate.kind === "ok") {
		assert.equal(
			duplicate.markdown,
			[
				"# COLLISION.FOO_BAR.VARIABLE",
				"<!-- anchormap scaffold: source=src/collision.ts export=fooBar kind=variable -->",
				"",
				"TODO: describe intent.",
				"",
				"# COLLISION.FOO_BAR.VARIABLE_2",
				"<!-- anchormap scaffold: source=src/collision.ts export=foo_bar kind=variable -->",
				"",
				"TODO: describe intent.",
				"",
			].join("\n"),
		);
	}

	const mixedKindCollision = buildScaffoldMarkdown(
		config(),
		[repoPath("src/domain/scan-result.ts")],
		emptySpecIndex(),
		{
			cwd: CWD,
			fs: scaffoldFs({
				"src/domain/scan-result.ts": [
					'export type AnalysisHealth = "clean" | "degraded";',
					"export function analysisHealth() {}",
					"",
				].join("\n"),
			}),
		},
	);
	assert.equal(mixedKindCollision.kind, "ok");
	if (mixedKindCollision.kind === "ok") {
		assert.equal(
			mixedKindCollision.markdown,
			[
				"# DOMAIN.SCAN_RESULT.ANALYSIS_HEALTH.FUNCTION",
				"<!-- anchormap scaffold: source=src/domain/scan-result.ts export=analysisHealth kind=function -->",
				"",
				"TODO: describe intent.",
				"",
				"# DOMAIN.SCAN_RESULT.ANALYSIS_HEALTH.TYPE",
				"<!-- anchormap scaffold: source=src/domain/scan-result.ts export=AnalysisHealth kind=type -->",
				"",
				"TODO: describe intent.",
				"",
			].join("\n"),
		);
	}

	const existingBase = buildScaffoldMarkdown(
		config(),
		[repoPath("src/collision.ts")],
		specIndexWithAnchors([anchorId("COLLISION.FOO_BAR")]),
		{
			cwd: CWD,
			fs: scaffoldFs({
				"src/collision.ts": "export const fooBar = 1;\nexport const foo_bar = 2;\n",
			}),
		},
	);
	assert.equal(existingBase.kind, "error");
	if (existingBase.kind === "error") {
		assert.equal(existingBase.error.kind, "UsageError");
	}

	const residualFinalCollision = buildScaffoldMarkdown(
		config(),
		[repoPath("src/collision.ts"), repoPath("src/collision/foo_bar.ts")],
		emptySpecIndex(),
		{
			cwd: CWD,
			fs: scaffoldFs({
				"src/collision.ts": "export const fooBar = 1;\nexport const foo_bar = 2;\n",
				"src/collision/foo_bar.ts": "export const variable = 3;\n",
			}),
		},
	);
	assert.equal(residualFinalCollision.kind, "error");
	if (residualFinalCollision.kind === "error") {
		assert.equal(residualFinalCollision.error.kind, "UsageError");
	}

	const existing = buildScaffoldMarkdown(
		config(),
		[repoPath("src/auth/token.ts")],
		specIndexWithAnchors([anchorId("AUTH.TOKEN.VERIFY_TOKEN")]),
		{
			cwd: CWD,
			fs: scaffoldFs({ "src/auth/token.ts": "export function verifyToken() {}\n" }),
		},
	);
	assert.equal(existing.kind, "error");
	if (existing.kind === "error") {
		assert.equal(existing.error.kind, "UsageError");
	}

	const existingDefaultInterface = buildScaffoldMarkdown(
		config(),
		[repoPath("src/index.ts")],
		specIndexWithAnchors([anchorId("INDEX.DEFAULT")]),
		{
			cwd: CWD,
			fs: scaffoldFs({ "src/index.ts": "export default interface PublicApi {}\n" }),
		},
	);
	assert.equal(existingDefaultInterface.kind, "error");
	if (existingDefaultInterface.kind === "error") {
		assert.equal(existingDefaultInterface.error.kind, "UsageError");
	}
});
