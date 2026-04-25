import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts = require("typescript");

import type { Finding } from "../domain/finding";
import { compareRepoPathsByUtf8, type RepoPath, repoPathToString } from "../domain/repo-path";
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
	readonly text: string;
	readonly sourceFile: ts.SourceFile;
	readonly supportedStaticEdgeInputs: readonly SupportedStaticEdgeInput[];
}

export type SupportedStaticEdgeSyntaxKind = "import_declaration" | "export_declaration";

export interface SupportedStaticEdgeInput {
	readonly syntaxKind: SupportedStaticEdgeSyntaxKind;
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

const nodeProductGraphFs: ProductGraphFs = {
	readFile: readFileSync,
};

export function buildProductGraph(
	_config: Config,
	productFiles: readonly RepoPath[],
	options: BuildProductGraphOptions = {},
): BuildProductGraphResult {
	const cwd = options.cwd ?? process.cwd();
	const fs = options.fs ?? nodeProductGraphFs;
	const parsedFiles: ParsedProductFile[] = [];
	const edgesByImporter = new Map<RepoPath, readonly RepoPath[]>();

	for (const productFile of [...productFiles].sort(compareRepoPathsByUtf8)) {
		const read = readProductFile(cwd, productFile, fs);
		if (read.kind === "error") {
			return read;
		}

		const parsed = parseTypeScriptProductText(productFile, read.text);
		if (parsed.kind === "error") {
			return parsed;
		}

		parsedFiles.push({
			path: productFile,
			text: read.text,
			sourceFile: parsed.sourceFile,
			supportedStaticEdgeInputs: extractSupportedStaticEdgeInputs(parsed.sourceFile),
		});
		edgesByImporter.set(productFile, []);
	}

	return {
		kind: "ok",
		productGraph: {
			productFiles: parsedFiles.map((file) => file.path),
			parsedFiles,
			edgesByImporter,
			graphFindings: [],
		},
	};
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
	return productGraph.parsedFiles.some((file) =>
		sourceFileHasLocalDependencySyntax(file.sourceFile),
	);
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

function callExpressionHasLocalDependencySyntax(node: ts.CallExpression): boolean {
	const [specifier] = node.arguments;
	if (specifier === undefined || !ts.isStringLiteral(specifier)) {
		return false;
	}

	const isRequireCall =
		ts.isIdentifier(node.expression) && node.expression.escapedText === "require";
	const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;

	return (isRequireCall || isDynamicImport) && isLocalDependencySpecifier(specifier.text);
}

function isLocalDependencySpecifier(specifier: string): boolean {
	return (specifier.startsWith("./") || specifier.startsWith("../")) && !specifier.includes("\\");
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
