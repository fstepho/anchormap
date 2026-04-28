import { accessSync, constants, readFileSync } from "node:fs";
import { join } from "node:path";

import type ts = require("typescript");

import {
	createOutOfScopeStaticEdgeFinding,
	createUnresolvedStaticEdgeFinding,
	createUnsupportedLocalTargetFinding,
	createUnsupportedStaticEdgeFinding,
	type Finding,
	normalizeFindings,
	type StaticEdgeSyntaxKind,
} from "../domain/finding";
import {
	compareRepoPathsByUtf8,
	normalizeImportCandidate,
	type RepoPath,
	repoPathToString,
} from "../domain/repo-path";
import type { Config } from "./config-io";
import { decodeUtf8StrictNoBom } from "./repo-fs";

export interface ProductGraph {
	readonly productFiles: readonly RepoPath[];
	readonly parsedFiles: readonly ParsedProductFile[];
	readonly edgesByImporter: ReadonlyMap<RepoPath, readonly RepoPath[]>;
	readonly graphFindings: readonly Finding[];
}

export interface ParsedProductFile {
	readonly path: RepoPath;
	readonly supportedStaticEdgeInputs: readonly SupportedStaticEdgeInput[];
	readonly unsupportedStaticEdgeInputs: readonly UnsupportedStaticEdgeInput[];
}

export type SupportedStaticEdgeSyntaxKind = "import_declaration" | "export_declaration";

export interface SupportedStaticEdgeInput {
	readonly syntaxKind: SupportedStaticEdgeSyntaxKind;
	readonly specifier: string;
}

export interface UnsupportedStaticEdgeInput {
	readonly syntaxKind: StaticEdgeSyntaxKind;
	readonly specifier: string;
}

export type BuildProductGraphResult =
	| { kind: "ok"; productGraph: ProductGraph }
	| { kind: "error"; error: ProductGraphError };

export interface ProductGraphError {
	readonly kind: "UnsupportedRepoError";
	readonly message?: string;
	readonly cause?: unknown;
}

export interface ProductGraphFs {
	readonly readFile: (path: string) => Uint8Array;
	readonly exists: (path: string) => boolean;
}

export interface BuildProductGraphOptions {
	readonly cwd?: string;
	readonly fs?: ProductGraphFs;
}

export type ParseTypeScriptProductTextResult =
	| { kind: "ok"; sourceFile: ts.SourceFile }
	| { kind: "error"; error: ProductGraphError };

type ParsedSourceFile = ts.SourceFile & {
	readonly parseDiagnostics: readonly ts.Diagnostic[];
};

export interface StaticEdgeResolutionCandidate {
	readonly path: RepoPath;
	readonly support: "supported" | "diagnostic_only";
}

type CandidateDefinition = {
	readonly suffix: string;
	readonly support: StaticEdgeResolutionCandidate["support"];
};

type StaticEdgeInputs = {
	readonly supportedStaticEdgeInputs: readonly SupportedStaticEdgeInput[];
	readonly unsupportedStaticEdgeInputs: readonly UnsupportedStaticEdgeInput[];
};

const nodeProductGraphFs: ProductGraphFs = {
	readFile: readFileSync,
	exists: pathExists,
};
let loadedTypeScript: typeof ts | undefined;

export function buildProductGraph(
	config: Config,
	productFiles: readonly RepoPath[],
	options: BuildProductGraphOptions = {},
): BuildProductGraphResult {
	const cwd = options.cwd ?? process.cwd();
	const fs = options.fs ?? nodeProductGraphFs;
	const parsedFiles: ParsedProductFile[] = [];
	const sortedProductFiles = normalizeProductFiles(productFiles);

	for (const productFile of sortedProductFiles) {
		const read = readProductFile(cwd, productFile, fs);
		if (read.kind === "error") {
			return read;
		}

		const parsed = collectProductFileStaticEdgeInputs(productFile, read.text);
		if (parsed.kind === "error") {
			return parsed;
		}

		parsedFiles.push({
			path: productFile,
			supportedStaticEdgeInputs: parsed.staticEdgeInputs.supportedStaticEdgeInputs,
			unsupportedStaticEdgeInputs: parsed.staticEdgeInputs.unsupportedStaticEdgeInputs,
		});
	}

	const resolution = resolveSupportedStaticEdges(config, cwd, fs, parsedFiles);
	if (resolution.kind === "error") {
		return resolution;
	}

	return {
		kind: "ok",
		productGraph: {
			productFiles: parsedFiles.map((file) => file.path),
			parsedFiles,
			edgesByImporter: resolution.edgesByImporter,
			graphFindings: normalizeFindings(resolution.findings),
		},
	};
}

function normalizeProductFiles(productFiles: readonly RepoPath[]): readonly RepoPath[] {
	return [...new Set(productFiles)].sort(compareRepoPathsByUtf8);
}

export function parseTypeScriptProductText(
	path: RepoPath,
	text: string,
): ParseTypeScriptProductTextResult {
	const tsCompiler = getTypeScript();
	const sourceFile = tsCompiler.createSourceFile(
		repoPathToString(path),
		text,
		tsCompiler.ScriptTarget.Latest,
		false,
		tsCompiler.ScriptKind.TS,
	) as ParsedSourceFile;

	if (sourceFile.parseDiagnostics.length > 0) {
		return productGraphUnsupportedError(`product file ${path} is not valid TypeScript`);
	}

	return { kind: "ok", sourceFile };
}

function getTypeScript(): typeof ts {
	if (loadedTypeScript === undefined) {
		loadedTypeScript = require("typescript") as typeof ts;
	}

	return loadedTypeScript;
}

function collectProductFileStaticEdgeInputs(
	path: RepoPath,
	text: string,
):
	| { kind: "ok"; staticEdgeInputs: StaticEdgeInputs }
	| { kind: "error"; error: ProductGraphError } {
	const simpleStaticEdgeInputs = collectSimpleProductFileStaticEdgeInputs(text);
	if (simpleStaticEdgeInputs !== undefined) {
		return {
			kind: "ok",
			staticEdgeInputs: simpleStaticEdgeInputs,
		};
	}

	const parsed = parseTypeScriptProductText(path, text);
	if (parsed.kind === "error") {
		return parsed;
	}

	return {
		kind: "ok",
		staticEdgeInputs: collectStaticEdgeInputs(parsed.sourceFile),
	};
}

function collectSimpleProductFileStaticEdgeInputs(text: string): StaticEdgeInputs | undefined {
	const supportedStaticEdgeInputs: SupportedStaticEdgeInput[] = [];
	const lines = text.split(/\r\n|\n|\r/);

	for (const line of lines) {
		if (line === "") {
			continue;
		}

		const importSpecifier = readSimpleImportDeclarationSpecifier(line);
		if (importSpecifier !== undefined) {
			if (isLocalDependencySpecifier(importSpecifier)) {
				supportedStaticEdgeInputs.push({
					syntaxKind: "import_declaration",
					specifier: importSpecifier,
				});
			}
			continue;
		}

		if (isSimpleExportConstDeclaration(line)) {
			continue;
		}

		return undefined;
	}

	return {
		supportedStaticEdgeInputs,
		unsupportedStaticEdgeInputs: [],
	};
}

function readSimpleImportDeclarationSpecifier(line: string): string | undefined {
	const match = /^import \{ value[0-9]+ as dep[0-9]+ \} from "([^"\\\r\n]*)";$/.exec(line);
	return match?.[1];
}

function isSimpleExportConstDeclaration(line: string): boolean {
	return (
		/^export const value[0-9]+ = (?:0|[1-9][0-9]*);$/.test(line) ||
		/^export const linked[0-9]+ = \[(?:dep[0-9]+(?:, dep[0-9]+)*)?\];$/.test(line)
	);
}

export function productGraphHasLocalDependencySyntax(productGraph: ProductGraph): boolean {
	return productGraph.parsedFiles.some(
		(file) =>
			file.supportedStaticEdgeInputs.length > 0 || file.unsupportedStaticEdgeInputs.length > 0,
	);
}

export function productGraphHasSupportedLocalDependencySyntax(productGraph: ProductGraph): boolean {
	return productGraph.parsedFiles.some((file) => file.supportedStaticEdgeInputs.length > 0);
}

export function extractSupportedStaticEdgeInputs(
	sourceFile: ts.SourceFile,
): SupportedStaticEdgeInput[] {
	return [...collectStaticEdgeInputs(sourceFile).supportedStaticEdgeInputs];
}

export function extractUnsupportedStaticEdgeInputs(
	sourceFile: ts.SourceFile,
): UnsupportedStaticEdgeInput[] {
	return [...collectStaticEdgeInputs(sourceFile).unsupportedStaticEdgeInputs];
}

function collectStaticEdgeInputs(sourceFile: ts.SourceFile): StaticEdgeInputs {
	const tsCompiler = getTypeScript();
	const supportedStaticEdgeInputs: SupportedStaticEdgeInput[] = [];
	const unsupportedStaticEdgeInputs: UnsupportedStaticEdgeInput[] = [];

	function visitUnsupported(node: ts.Node): void {
		const unsupportedEdgeInput = unsupportedStaticEdgeInputFromNode(node);
		if (unsupportedEdgeInput !== undefined) {
			unsupportedStaticEdgeInputs.push(unsupportedEdgeInput);
		}

		tsCompiler.forEachChild(node, visitUnsupported);
	}

	for (const statement of sourceFile.statements) {
		const supportedEdgeInput = supportedStaticEdgeInputFromNode(statement);
		if (supportedEdgeInput !== undefined) {
			supportedStaticEdgeInputs.push(supportedEdgeInput);
			continue;
		}

		visitUnsupported(statement);
	}

	return { supportedStaticEdgeInputs, unsupportedStaticEdgeInputs };
}

export function buildStaticEdgeResolutionCandidates(
	importer: RepoPath,
	specifier: string,
): StaticEdgeResolutionCandidate[] {
	return candidateDefinitionsForSpecifier(specifier).flatMap((definition) => {
		const normalized = normalizeImportCandidate(importer, specifier, definition.suffix);
		if (normalized.kind === "outside_repo_root") {
			return [];
		}

		return [
			{
				path: normalized.repoPath,
				support: definition.support,
			},
		];
	});
}

export function sourceFileHasLocalDependencySyntax(sourceFile: ts.SourceFile): boolean {
	const tsCompiler = getTypeScript();
	let hasLocalDependencySyntax = false;

	function visit(node: ts.Node): void {
		if (hasLocalDependencySyntax) {
			return;
		}

		if (supportedStaticEdgeInputFromNode(node) !== undefined) {
			hasLocalDependencySyntax = true;
			return;
		}

		if (tsCompiler.isCallExpression(node) && callExpressionHasLocalDependencySyntax(node)) {
			hasLocalDependencySyntax = true;
			return;
		}

		tsCompiler.forEachChild(node, visit);
	}

	visit(sourceFile);
	return hasLocalDependencySyntax;
}

function supportedStaticEdgeInputFromNode(node: ts.Node): SupportedStaticEdgeInput | undefined {
	const tsCompiler = getTypeScript();
	if (
		tsCompiler.isImportDeclaration(node) &&
		tsCompiler.isStringLiteral(node.moduleSpecifier) &&
		isLocalDependencySpecifier(node.moduleSpecifier.text)
	) {
		return {
			syntaxKind: "import_declaration",
			specifier: node.moduleSpecifier.text,
		};
	}

	if (
		tsCompiler.isExportDeclaration(node) &&
		node.moduleSpecifier !== undefined &&
		tsCompiler.isStringLiteral(node.moduleSpecifier) &&
		isLocalDependencySpecifier(node.moduleSpecifier.text)
	) {
		return {
			syntaxKind: "export_declaration",
			specifier: node.moduleSpecifier.text,
		};
	}

	return undefined;
}

function unsupportedStaticEdgeInputFromNode(node: ts.Node): UnsupportedStaticEdgeInput | undefined {
	const tsCompiler = getTypeScript();
	if (!tsCompiler.isCallExpression(node)) {
		return undefined;
	}

	const [specifier] = node.arguments;
	if (specifier === undefined || !tsCompiler.isStringLiteral(specifier)) {
		return undefined;
	}

	if (!isLocalDependencySpecifier(specifier.text)) {
		return undefined;
	}

	if (tsCompiler.isIdentifier(node.expression) && node.expression.escapedText === "require") {
		return { syntaxKind: "require_call", specifier: specifier.text };
	}

	if (node.expression.kind === tsCompiler.SyntaxKind.ImportKeyword) {
		return { syntaxKind: "dynamic_import", specifier: specifier.text };
	}

	return undefined;
}

function callExpressionHasLocalDependencySyntax(node: ts.CallExpression): boolean {
	return unsupportedStaticEdgeInputFromNode(node) !== undefined;
}

function isLocalDependencySpecifier(specifier: string): boolean {
	return (specifier.startsWith("./") || specifier.startsWith("../")) && !specifier.includes("\\");
}

const SUPPORTED_EXACT_CANDIDATE_DEFINITIONS: readonly CandidateDefinition[] = [
	{ suffix: "", support: "supported" },
];
const DIAGNOSTIC_EXACT_CANDIDATE_DEFINITIONS: readonly CandidateDefinition[] = [
	{ suffix: "", support: "diagnostic_only" },
];
const EXTENSIONLESS_CANDIDATE_DEFINITIONS: readonly CandidateDefinition[] = [
	{ suffix: ".ts", support: "supported" },
	{ suffix: "/index.ts", support: "supported" },
	{ suffix: ".tsx", support: "diagnostic_only" },
	{ suffix: ".js", support: "diagnostic_only" },
	{ suffix: ".d.ts", support: "diagnostic_only" },
	{ suffix: "/index.tsx", support: "diagnostic_only" },
	{ suffix: "/index.js", support: "diagnostic_only" },
	{ suffix: "/index.d.ts", support: "diagnostic_only" },
];
const NO_CANDIDATE_DEFINITIONS: readonly CandidateDefinition[] = [];

function candidateDefinitionsForSpecifier(specifier: string): readonly CandidateDefinition[] {
	if (specifier.endsWith("/")) {
		return NO_CANDIDATE_DEFINITIONS;
	}

	if (specifier.endsWith(".ts") && !specifier.endsWith(".d.ts")) {
		return SUPPORTED_EXACT_CANDIDATE_DEFINITIONS;
	}

	if (specifier.endsWith(".tsx") || specifier.endsWith(".js") || specifier.endsWith(".d.ts")) {
		return DIAGNOSTIC_EXACT_CANDIDATE_DEFINITIONS;
	}

	if (lastPathSegmentHasDot(specifier)) {
		return NO_CANDIDATE_DEFINITIONS;
	}

	return EXTENSIONLESS_CANDIDATE_DEFINITIONS;
}

function lastPathSegmentHasDot(path: string): boolean {
	return path.indexOf(".", path.lastIndexOf("/") + 1) !== -1;
}

function resolveSupportedStaticEdges(
	config: Config,
	cwd: string,
	fs: ProductGraphFs,
	parsedFiles: readonly ParsedProductFile[],
):
	| {
			kind: "ok";
			edgesByImporter: ReadonlyMap<RepoPath, readonly RepoPath[]>;
			findings: readonly Finding[];
	  }
	| { kind: "error"; error: ProductGraphError } {
	const edgesByImporter = new Map<RepoPath, readonly RepoPath[]>();
	const findings: Finding[] = [];
	const candidateExistenceCache = new Map<RepoPath, boolean>(
		parsedFiles.map((file) => [file.path, true]),
	);

	for (const file of parsedFiles) {
		const supportedTargets = new Set<RepoPath>();

		for (const edgeInput of file.supportedStaticEdgeInputs) {
			const resolution = resolveSupportedStaticEdge(
				config,
				cwd,
				fs,
				candidateExistenceCache,
				file.path,
				edgeInput,
			);
			if (resolution.kind === "error") {
				return resolution;
			}

			if (resolution.kind === "supported_target") {
				supportedTargets.add(resolution.target);
				continue;
			}

			findings.push(resolution.finding);
		}

		for (const edgeInput of file.unsupportedStaticEdgeInputs) {
			findings.push(
				createUnsupportedStaticEdgeFinding({
					importer: file.path,
					syntax_kind: edgeInput.syntaxKind,
					specifier: edgeInput.specifier,
				}),
			);
		}

		edgesByImporter.set(file.path, [...supportedTargets].sort(compareRepoPathsByUtf8));
	}

	return { kind: "ok", edgesByImporter, findings };
}

function resolveSupportedStaticEdge(
	config: Config,
	cwd: string,
	fs: ProductGraphFs,
	candidateExistenceCache: Map<RepoPath, boolean>,
	importer: RepoPath,
	edgeInput: SupportedStaticEdgeInput,
):
	| { kind: "supported_target"; target: RepoPath }
	| { kind: "finding"; finding: Finding }
	| { kind: "error"; error: ProductGraphError } {
	let firstOutOfScopeTarget: RepoPath | undefined;
	let firstUnsupportedTarget: RepoPath | undefined;

	for (const definition of candidateDefinitionsForSpecifier(edgeInput.specifier)) {
		const normalized = normalizeImportCandidate(importer, edgeInput.specifier, definition.suffix);
		if (normalized.kind === "outside_repo_root") {
			continue;
		}

		const candidatePath = normalized.repoPath;
		const exists = candidateExists(cwd, fs, candidateExistenceCache, candidatePath);
		if (exists.kind === "error") {
			return exists;
		}
		if (exists.exists) {
			if (definition.support === "supported" && isInSupportedProductScope(config, candidatePath)) {
				return { kind: "supported_target", target: candidatePath };
			}
			if (firstOutOfScopeTarget === undefined && isOutOfProductScope(config, candidatePath)) {
				firstOutOfScopeTarget = candidatePath;
			}
			if (
				firstUnsupportedTarget === undefined &&
				definition.support === "diagnostic_only" &&
				isInSupportedProductScope(config, candidatePath)
			) {
				firstUnsupportedTarget = candidatePath;
			}
		}
	}

	if (firstOutOfScopeTarget !== undefined) {
		return {
			kind: "finding",
			finding: createOutOfScopeStaticEdgeFinding({
				importer,
				target_path: firstOutOfScopeTarget,
			}),
		};
	}

	if (firstUnsupportedTarget !== undefined) {
		return {
			kind: "finding",
			finding: createUnsupportedLocalTargetFinding({
				importer,
				target_path: firstUnsupportedTarget,
			}),
		};
	}

	return {
		kind: "finding",
		finding: createUnresolvedStaticEdgeFinding({
			importer,
			specifier: edgeInput.specifier,
		}),
	};
}

function candidateExists(
	cwd: string,
	fs: ProductGraphFs,
	candidateExistenceCache: Map<RepoPath, boolean>,
	path: RepoPath,
): { kind: "ok"; exists: boolean } | { kind: "error"; error: ProductGraphError } {
	const cached = candidateExistenceCache.get(path);
	if (cached !== undefined) {
		return { kind: "ok", exists: cached };
	}

	try {
		const exists = fs.exists(join(cwd, repoPathToString(path)));
		candidateExistenceCache.set(path, exists);
		return { kind: "ok", exists };
	} catch (error) {
		return productGraphUnsupportedError(`cannot test existence for candidate ${path}`, error);
	}
}

function isInSupportedProductScope(config: Config, path: RepoPath): boolean {
	return isSameOrDescendantOf(path, config.productRoot) && !isIgnoredPath(path, config.ignoreRoots);
}

function isOutOfProductScope(config: Config, path: RepoPath): boolean {
	return !isSameOrDescendantOf(path, config.productRoot) || isIgnoredPath(path, config.ignoreRoots);
}

function isIgnoredPath(path: RepoPath, ignoreRoots: readonly RepoPath[]): boolean {
	return ignoreRoots.some((ignoreRoot) => isSameOrDescendantOf(path, ignoreRoot));
}

function isSameOrDescendantOf(path: RepoPath, possibleAncestor: RepoPath): boolean {
	const pathValue = repoPathToString(path);
	const ancestorValue = repoPathToString(possibleAncestor);
	return pathValue === ancestorValue || pathValue.startsWith(`${ancestorValue}/`);
}

function readProductFile(
	cwd: string,
	path: RepoPath,
	fs: ProductGraphFs,
): { kind: "ok"; text: string } | { kind: "error"; error: ProductGraphError } {
	let bytes: Uint8Array;

	try {
		bytes = fs.readFile(join(cwd, repoPathToString(path)));
	} catch (error) {
		return productGraphUnsupportedError(`cannot read product file ${path}`, error);
	}

	const decoded = decodeUtf8StrictNoBom(bytes);
	if (decoded.kind === "decode_error") {
		return productGraphUnsupportedError(`product file ${path} is not valid UTF-8`, decoded.error);
	}

	return { kind: "ok", text: decoded.text };
}

function pathExists(path: string): boolean {
	try {
		accessSync(path, constants.F_OK);
		return true;
	} catch (error) {
		if (isMissingPathError(error)) {
			return false;
		}
		throw error;
	}
}

function isMissingPathError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error.code === "ENOENT" || error.code === "ENOTDIR")
	);
}

function productGraphUnsupportedError(
	message: string,
	cause?: unknown,
): { kind: "error"; error: ProductGraphError } {
	return {
		kind: "error",
		error: {
			kind: "UnsupportedRepoError",
			message,
			cause,
		},
	};
}
