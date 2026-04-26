import { accessSync, constants, readFileSync } from "node:fs";
import { join } from "node:path";

import ts = require("typescript");

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
	readonly specifier: string;
	readonly suffix: string;
	readonly support: StaticEdgeResolutionCandidate["support"];
};

const nodeProductGraphFs: ProductGraphFs = {
	readFile: readFileSync,
	exists: pathExists,
};

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

		const parsed = parseTypeScriptProductText(productFile, read.text);
		if (parsed.kind === "error") {
			return parsed;
		}

		const supportedStaticEdgeInputs = extractSupportedStaticEdgeInputs(parsed.sourceFile);
		const unsupportedStaticEdgeInputs = extractUnsupportedStaticEdgeInputs(parsed.sourceFile);

		parsedFiles.push({
			path: productFile,
			supportedStaticEdgeInputs,
			unsupportedStaticEdgeInputs,
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
	const sourceFile = ts.createSourceFile(
		repoPathToString(path),
		text,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	) as ParsedSourceFile;

	if (sourceFile.parseDiagnostics.length > 0) {
		return productGraphUnsupportedError(`product file ${path} is not valid TypeScript`);
	}

	return { kind: "ok", sourceFile };
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
	const edgeInputs: SupportedStaticEdgeInput[] = [];

	function visit(node: ts.Node): void {
		const edgeInput = supportedStaticEdgeInputFromNode(node);
		if (edgeInput !== undefined) {
			edgeInputs.push(edgeInput);
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return edgeInputs;
}

export function extractUnsupportedStaticEdgeInputs(
	sourceFile: ts.SourceFile,
): UnsupportedStaticEdgeInput[] {
	const edgeInputs: UnsupportedStaticEdgeInput[] = [];

	function visit(node: ts.Node): void {
		const edgeInput = unsupportedStaticEdgeInputFromNode(node);
		if (edgeInput !== undefined) {
			edgeInputs.push(edgeInput);
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return edgeInputs;
}

export function buildStaticEdgeResolutionCandidates(
	importer: RepoPath,
	specifier: string,
): StaticEdgeResolutionCandidate[] {
	return buildCandidateDefinitions(specifier).flatMap((definition) => {
		const normalized = normalizeImportCandidate(importer, definition.specifier, definition.suffix);
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
	let hasLocalDependencySyntax = false;

	function visit(node: ts.Node): void {
		if (hasLocalDependencySyntax) {
			return;
		}

		if (supportedStaticEdgeInputFromNode(node) !== undefined) {
			hasLocalDependencySyntax = true;
			return;
		}

		if (ts.isCallExpression(node) && callExpressionHasLocalDependencySyntax(node)) {
			hasLocalDependencySyntax = true;
			return;
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return hasLocalDependencySyntax;
}

function supportedStaticEdgeInputFromNode(node: ts.Node): SupportedStaticEdgeInput | undefined {
	if (
		ts.isImportDeclaration(node) &&
		ts.isStringLiteral(node.moduleSpecifier) &&
		isLocalDependencySpecifier(node.moduleSpecifier.text)
	) {
		return {
			syntaxKind: "import_declaration",
			specifier: node.moduleSpecifier.text,
		};
	}

	if (
		ts.isExportDeclaration(node) &&
		node.moduleSpecifier !== undefined &&
		ts.isStringLiteral(node.moduleSpecifier) &&
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
	if (!ts.isCallExpression(node)) {
		return undefined;
	}

	const [specifier] = node.arguments;
	if (specifier === undefined || !ts.isStringLiteral(specifier)) {
		return undefined;
	}

	if (!isLocalDependencySpecifier(specifier.text)) {
		return undefined;
	}

	if (ts.isIdentifier(node.expression) && node.expression.escapedText === "require") {
		return { syntaxKind: "require_call", specifier: specifier.text };
	}

	if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
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

function buildCandidateDefinitions(specifier: string): readonly CandidateDefinition[] {
	if (specifier.endsWith("/")) {
		return [];
	}

	if (specifier.endsWith(".ts") && !specifier.endsWith(".d.ts")) {
		return [{ specifier, suffix: "", support: "supported" }];
	}

	if (specifier.endsWith(".tsx") || specifier.endsWith(".js") || specifier.endsWith(".d.ts")) {
		return [{ specifier, suffix: "", support: "diagnostic_only" }];
	}

	if (lastPathSegment(specifier).includes(".")) {
		return [];
	}

	return [
		{ specifier, suffix: ".ts", support: "supported" },
		{ specifier, suffix: "/index.ts", support: "supported" },
		{ specifier, suffix: ".tsx", support: "diagnostic_only" },
		{ specifier, suffix: ".js", support: "diagnostic_only" },
		{ specifier, suffix: ".d.ts", support: "diagnostic_only" },
		{ specifier, suffix: "/index.tsx", support: "diagnostic_only" },
		{ specifier, suffix: "/index.js", support: "diagnostic_only" },
		{ specifier, suffix: "/index.d.ts", support: "diagnostic_only" },
	];
}

function lastPathSegment(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
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

	for (const file of parsedFiles) {
		const supportedTargets = new Set<RepoPath>();

		for (const edgeInput of file.supportedStaticEdgeInputs) {
			const resolution = resolveSupportedStaticEdge(config, cwd, fs, file.path, edgeInput);
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
	importer: RepoPath,
	edgeInput: SupportedStaticEdgeInput,
):
	| { kind: "supported_target"; target: RepoPath }
	| { kind: "finding"; finding: Finding }
	| { kind: "error"; error: ProductGraphError } {
	const candidates = buildStaticEdgeResolutionCandidates(importer, edgeInput.specifier);
	const existingCandidates: StaticEdgeResolutionCandidate[] = [];

	for (const candidate of candidates) {
		const exists = candidateExists(cwd, fs, candidate.path);
		if (exists.kind === "error") {
			return exists;
		}
		if (exists.exists) {
			existingCandidates.push(candidate);
		}
	}

	const supportedTarget = existingCandidates.find(
		(candidate) =>
			candidate.support === "supported" && isInSupportedProductScope(config, candidate.path),
	);
	if (supportedTarget !== undefined) {
		return { kind: "supported_target", target: supportedTarget.path };
	}

	const outOfScopeTarget = existingCandidates.find((candidate) =>
		isOutOfProductScope(config, candidate.path),
	);
	if (outOfScopeTarget !== undefined) {
		return {
			kind: "finding",
			finding: createOutOfScopeStaticEdgeFinding({
				importer,
				target_path: outOfScopeTarget.path,
			}),
		};
	}

	const unsupportedTarget = existingCandidates.find(
		(candidate) =>
			candidate.support === "diagnostic_only" && isInSupportedProductScope(config, candidate.path),
	);
	if (unsupportedTarget !== undefined) {
		return {
			kind: "finding",
			finding: createUnsupportedLocalTargetFinding({
				importer,
				target_path: unsupportedTarget.path,
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
	path: RepoPath,
): { kind: "ok"; exists: boolean } | { kind: "error"; error: ProductGraphError } {
	try {
		return { kind: "ok", exists: fs.exists(join(cwd, repoPathToString(path))) };
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
