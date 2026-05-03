import {
	closeSync,
	constants,
	fsyncSync,
	openSync,
	readFileSync,
	unlinkSync,
	writeSync,
} from "node:fs";
import { join } from "node:path";

import type ts = require("typescript");

import type { AppError } from "../cli/commands";
import type { AnchorId } from "../domain/anchor-id";
import { validateAnchorId } from "../domain/anchor-id";
import { compareCanonicalTextByUtf8 } from "../domain/canonical-order";
import { type RepoPath, repoPathToString } from "../domain/repo-path";
import type { Config } from "./config-io";
import { decodeUtf8StrictNoBom } from "./repo-fs";
import type { SpecIndex } from "./spec-index";
import { parseTypeScriptProductText } from "./ts-graph";

export type ScaffoldExportKind = "class" | "enum" | "function" | "interface" | "type" | "variable";

export interface ScaffoldExportCandidate {
	readonly anchorId: AnchorId;
	readonly sourcePath: RepoPath;
	readonly exportName: string;
	readonly exportKind: ScaffoldExportKind;
}

interface RawScaffoldExportCandidate {
	readonly baseAnchorId: AnchorId;
	readonly sourcePath: RepoPath;
	readonly exportName: string;
	readonly exportKind: ScaffoldExportKind;
	readonly declarationOrder: number;
}

export interface ScaffoldFs {
	readonly readFile: (path: string) => Uint8Array;
	readonly openExclusive: (path: string) => number;
	readonly writeAll: (fd: number, bytes: Uint8Array) => void;
	readonly fsync: (fd: number) => void;
	readonly close: (fd: number) => void;
	readonly unlink: (path: string) => void;
}

export interface BuildScaffoldOptions {
	readonly cwd?: string;
	readonly fs?: ScaffoldFs;
}

export type BuildScaffoldResult =
	| { kind: "ok"; markdown: string; candidates: readonly ScaffoldExportCandidate[] }
	| { kind: "error"; error: AppError };

export type WriteScaffoldOutputResult = { kind: "ok" } | { kind: "error"; error: AppError };

const nodeScaffoldFs: ScaffoldFs = {
	readFile: readFileSync,
	openExclusive(path: string): number {
		return openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o666);
	},
	writeAll(fd: number, bytes: Uint8Array): void {
		let offset = 0;
		while (offset < bytes.length) {
			offset += writeSync(fd, bytes, offset, bytes.length - offset);
		}
	},
	fsync: fsyncSync,
	close: closeSync,
	unlink: unlinkSync,
};

let loadedTypeScript: typeof ts | undefined;

const SCAFFOLD_KIND_SUFFIX: Record<ScaffoldExportKind, string> = {
	class: "CLASS",
	enum: "ENUM",
	function: "FUNCTION",
	interface: "INTERFACE",
	type: "TYPE",
	variable: "VARIABLE",
};

export function buildScaffoldMarkdown(
	config: Config,
	productFiles: readonly RepoPath[],
	specIndex: SpecIndex,
	options: BuildScaffoldOptions = {},
): BuildScaffoldResult {
	const cwd = options.cwd ?? process.cwd();
	const fs = options.fs ?? nodeScaffoldFs;
	const candidates: RawScaffoldExportCandidate[] = [];
	let declarationOrder = 0;

	for (const productFile of productFiles) {
		const read = readProductFile(cwd, fs, productFile);
		if (read.kind === "error") {
			return read;
		}

		const parsed = parseTypeScriptProductText(productFile, read.text);
		if (parsed.kind === "error") {
			return { kind: "error", error: parsed.error };
		}

		for (const exportedDeclaration of extractExportedDeclarations(parsed.sourceFile)) {
			const anchor = buildScaffoldAnchorId(config, productFile, exportedDeclaration.exportName);
			if (anchor.kind === "error") {
				return anchor;
			}
			candidates.push({
				baseAnchorId: anchor.anchorId,
				sourcePath: productFile,
				exportName: exportedDeclaration.exportName,
				exportKind: exportedDeclaration.exportKind,
				declarationOrder,
			});
			declarationOrder += 1;
		}
	}

	const disambiguatedCandidates = disambiguateScaffoldAnchorCollisions(candidates);
	if (disambiguatedCandidates.kind === "error") {
		return disambiguatedCandidates;
	}

	const sortedCandidates = sortScaffoldCandidates(disambiguatedCandidates.candidates);
	const validation = validateScaffoldCandidates(candidates, sortedCandidates, specIndex);
	if (validation.kind === "error") {
		return validation;
	}

	return {
		kind: "ok",
		markdown: renderScaffoldMarkdown(sortedCandidates),
		candidates: sortedCandidates,
	};
}

export function writeScaffoldOutputCreateOnly(
	outputPath: RepoPath,
	markdown: string,
	options: BuildScaffoldOptions = {},
): WriteScaffoldOutputResult {
	const cwd = options.cwd ?? process.cwd();
	const fs = options.fs ?? nodeScaffoldFs;
	const targetPath = join(cwd, repoPathToString(outputPath));
	const bytes = Buffer.from(markdown, "utf8");
	let fd: number | undefined;
	let created = false;

	try {
		fd = fs.openExclusive(targetPath);
		created = true;
		fs.writeAll(fd, bytes);
		fs.fsync(fd);
		fs.close(fd);
		fd = undefined;
		return { kind: "ok" };
	} catch (error) {
		const cleanup = cleanupFailedScaffoldWrite(fs, targetPath, fd, created);
		if (cleanup.kind === "error") {
			return {
				kind: "error",
				error: {
					kind: "InternalError",
					message: "cannot confirm scaffold output cleanup",
					cause: cleanup.cause,
				},
			};
		}
		return {
			kind: "error",
			error: {
				kind: "WriteError",
				message: "cannot write scaffold output",
				cause: error,
			},
		};
	}
}

export function extractExportedDeclarations(
	sourceFile: ts.SourceFile,
): readonly { readonly exportName: string; readonly exportKind: ScaffoldExportKind }[] {
	const tsCompiler = getTypeScript();
	const declarations: Array<{ exportName: string; exportKind: ScaffoldExportKind }> = [];

	for (const statement of sourceFile.statements) {
		if (!hasModifier(statement, tsCompiler.SyntaxKind.ExportKeyword)) {
			continue;
		}

		if (tsCompiler.isFunctionDeclaration(statement)) {
			const exportName = nameForExportedDeclaration(statement, "default");
			if (exportName !== undefined) {
				declarations.push({ exportName, exportKind: "function" });
			}
			continue;
		}

		if (tsCompiler.isClassDeclaration(statement)) {
			const exportName = nameForExportedDeclaration(statement, "default");
			if (exportName !== undefined) {
				declarations.push({ exportName, exportKind: "class" });
			}
			continue;
		}

		if (tsCompiler.isInterfaceDeclaration(statement)) {
			const exportName = nameForExportedDeclaration(statement, "default");
			if (exportName !== undefined) {
				declarations.push({ exportName, exportKind: "interface" });
			}
			continue;
		}

		if (tsCompiler.isTypeAliasDeclaration(statement)) {
			declarations.push({ exportName: statement.name.text, exportKind: "type" });
			continue;
		}

		if (tsCompiler.isEnumDeclaration(statement)) {
			declarations.push({ exportName: statement.name.text, exportKind: "enum" });
			continue;
		}

		if (tsCompiler.isVariableStatement(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				for (const exportName of collectBindingExportNames(declaration.name)) {
					declarations.push({
						exportName,
						exportKind: "variable",
					});
				}
			}
		}
	}

	return declarations;
}

export function buildScaffoldAnchorId(
	config: Config,
	sourcePath: RepoPath,
	exportName: string,
): { kind: "ok"; anchorId: AnchorId } | { kind: "error"; error: AppError } {
	const sourceValue = repoPathToString(sourcePath);
	const productRoot = repoPathToString(config.productRoot);
	const relativeModulePath = sourceValue.slice(productRoot.length + 1, -".ts".length);
	const segments = [...relativeModulePath.split("/"), exportName].map(toAnchorSegment);
	const anchorText = segments.join(".");
	const validated = validateAnchorId(anchorText);
	if (validated.kind === "ok") {
		return { kind: "ok", anchorId: validated.anchorId };
	}

	return {
		kind: "error",
		error: {
			kind: "InternalError",
			message: `generated invalid scaffold anchor ${anchorText}`,
		},
	};
}

export function renderScaffoldMarkdown(candidates: readonly ScaffoldExportCandidate[]): string {
	return candidates
		.map((candidate) =>
			[
				`# ${candidate.anchorId}`,
				`<!-- anchormap scaffold: source=${candidate.sourcePath} export=${candidate.exportName} kind=${candidate.exportKind} -->`,
				"",
				"TODO: describe intent.",
				"",
			].join("\n"),
		)
		.join("\n");
}

function readProductFile(
	cwd: string,
	fs: ScaffoldFs,
	path: RepoPath,
): { kind: "ok"; text: string } | { kind: "error"; error: AppError } {
	let bytes: Uint8Array;

	try {
		bytes = fs.readFile(join(cwd, repoPathToString(path)));
	} catch (error) {
		return {
			kind: "error",
			error: {
				kind: "UnsupportedRepoError",
				message: `cannot read product file ${path}`,
				cause: error,
			},
		};
	}

	const decoded = decodeUtf8StrictNoBom(bytes);
	if (decoded.kind === "decode_error") {
		return {
			kind: "error",
			error: {
				kind: "UnsupportedRepoError",
				message: `product file ${path} is not valid UTF-8`,
				cause: decoded.error,
			},
		};
	}

	return { kind: "ok", text: decoded.text };
}

function validateScaffoldCandidates(
	rawCandidates: readonly RawScaffoldExportCandidate[],
	candidates: readonly ScaffoldExportCandidate[],
	specIndex: SpecIndex,
): { kind: "ok" } | { kind: "error"; error: AppError } {
	if (candidates.length === 0) {
		return {
			kind: "error",
			error: {
				kind: "UsageError",
				message: "scaffold found no supported TypeScript exports",
			},
		};
	}

	for (const candidate of rawCandidates) {
		if (specIndex.observedAnchors.has(candidate.baseAnchorId)) {
			return {
				kind: "error",
				error: {
					kind: "UsageError",
					message: `scaffold anchor ${candidate.baseAnchorId} already exists in current specs`,
				},
			};
		}
	}

	for (let index = 1; index < candidates.length; index += 1) {
		const previous = candidates[index - 1];
		const current = candidates[index];
		if (previous.anchorId === current.anchorId) {
			return {
				kind: "error",
				error: {
					kind: "UsageError",
					message: `scaffold generated final anchor collision ${current.anchorId}`,
				},
			};
		}
	}

	for (const candidate of candidates) {
		if (specIndex.observedAnchors.has(candidate.anchorId)) {
			return {
				kind: "error",
				error: {
					kind: "UsageError",
					message: `scaffold anchor ${candidate.anchorId} already exists in current specs`,
				},
			};
		}
	}

	return { kind: "ok" };
}

function disambiguateScaffoldAnchorCollisions(
	candidates: readonly RawScaffoldExportCandidate[],
):
	| { kind: "ok"; candidates: readonly ScaffoldExportCandidate[] }
	| { kind: "error"; error: AppError } {
	const groups = new Map<AnchorId, RawScaffoldExportCandidate[]>();
	for (const candidate of candidates) {
		const group = groups.get(candidate.baseAnchorId);
		if (group === undefined) {
			groups.set(candidate.baseAnchorId, [candidate]);
			continue;
		}
		group.push(candidate);
	}

	const disambiguated: ScaffoldExportCandidate[] = [];
	for (const group of groups.values()) {
		const sortedGroup = sortScaffoldBaseCollisionGroup(group);
		if (sortedGroup.length === 1) {
			const candidate = sortedGroup[0];
			disambiguated.push({
				anchorId: candidate.baseAnchorId,
				sourcePath: candidate.sourcePath,
				exportName: candidate.exportName,
				exportKind: candidate.exportKind,
			});
			continue;
		}

		const countsByKind = new Map<ScaffoldExportKind, number>();
		for (const candidate of sortedGroup) {
			const nextCount = (countsByKind.get(candidate.exportKind) ?? 0) + 1;
			countsByKind.set(candidate.exportKind, nextCount);
			const kindSuffix = SCAFFOLD_KIND_SUFFIX[candidate.exportKind];
			const suffix = nextCount === 1 ? kindSuffix : `${kindSuffix}_${nextCount}`;
			const anchor = appendScaffoldAnchorSuffix(candidate.baseAnchorId, suffix);
			if (anchor.kind === "error") {
				return anchor;
			}
			disambiguated.push({
				anchorId: anchor.anchorId,
				sourcePath: candidate.sourcePath,
				exportName: candidate.exportName,
				exportKind: candidate.exportKind,
			});
		}
	}

	return { kind: "ok", candidates: disambiguated };
}

function sortScaffoldCandidates(
	candidates: readonly ScaffoldExportCandidate[],
): readonly ScaffoldExportCandidate[] {
	return [...candidates].sort((left, right) => {
		const anchorOrder = compareCanonicalTextByUtf8(left.anchorId, right.anchorId);
		if (anchorOrder !== 0) {
			return anchorOrder;
		}
		const pathOrder = compareCanonicalTextByUtf8(left.sourcePath, right.sourcePath);
		if (pathOrder !== 0) {
			return pathOrder;
		}
		const exportOrder = compareCanonicalTextByUtf8(left.exportName, right.exportName);
		if (exportOrder !== 0) {
			return exportOrder;
		}
		return compareCanonicalTextByUtf8(left.exportKind, right.exportKind);
	});
}

function sortScaffoldBaseCollisionGroup(
	candidates: readonly RawScaffoldExportCandidate[],
): readonly RawScaffoldExportCandidate[] {
	return [...candidates].sort((left, right) => {
		const pathOrder = compareCanonicalTextByUtf8(left.sourcePath, right.sourcePath);
		if (pathOrder !== 0) {
			return pathOrder;
		}
		const exportOrder = compareCanonicalTextByUtf8(left.exportName, right.exportName);
		if (exportOrder !== 0) {
			return exportOrder;
		}
		const kindOrder = compareCanonicalTextByUtf8(left.exportKind, right.exportKind);
		if (kindOrder !== 0) {
			return kindOrder;
		}
		return left.declarationOrder - right.declarationOrder;
	});
}

function appendScaffoldAnchorSuffix(
	baseAnchorId: AnchorId,
	suffix: string,
): { kind: "ok"; anchorId: AnchorId } | { kind: "error"; error: AppError } {
	const anchorText = `${baseAnchorId}.${suffix}`;
	const validated = validateAnchorId(anchorText);
	if (validated.kind === "ok") {
		return { kind: "ok", anchorId: validated.anchorId };
	}

	return {
		kind: "error",
		error: {
			kind: "InternalError",
			message: `generated invalid scaffold anchor ${anchorText}`,
		},
	};
}

function cleanupFailedScaffoldWrite(
	fs: ScaffoldFs,
	targetPath: string,
	fd: number | undefined,
	created: boolean,
): { kind: "ok" } | { kind: "error"; cause: unknown } {
	let cleanupFailure: unknown;

	if (fd !== undefined) {
		try {
			fs.close(fd);
		} catch (error) {
			cleanupFailure = error;
		}
	}

	if (created) {
		try {
			fs.unlink(targetPath);
		} catch (error) {
			cleanupFailure ??= error;
		}
	}

	if (cleanupFailure !== undefined) {
		return { kind: "error", cause: cleanupFailure };
	}

	return { kind: "ok" };
}

function collectBindingExportNames(name: ts.BindingName): readonly string[] {
	const tsCompiler = getTypeScript();
	if (tsCompiler.isIdentifier(name)) {
		return [name.text];
	}

	const exportNames: string[] = [];
	for (const element of name.elements) {
		if (tsCompiler.isBindingElement(element)) {
			exportNames.push(...collectBindingExportNames(element.name));
		}
	}

	return exportNames;
}

function nameForExportedDeclaration(
	node: ts.FunctionDeclaration | ts.ClassDeclaration | ts.InterfaceDeclaration,
	defaultName: string,
): string | undefined {
	if (hasModifier(node, getTypeScript().SyntaxKind.DefaultKeyword)) {
		return defaultName;
	}
	if (node.name !== undefined) {
		return node.name.text;
	}
	return undefined;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
	const tsCompiler = getTypeScript();
	if (!tsCompiler.canHaveModifiers(node)) {
		return false;
	}
	return tsCompiler.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false;
}

function getTypeScript(): typeof ts {
	if (loadedTypeScript === undefined) {
		loadedTypeScript = require("typescript") as typeof ts;
	}

	return loadedTypeScript;
}

function toAnchorSegment(value: string): string {
	const normalized = value
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.replace(/[^A-Za-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.toUpperCase();
	if (normalized === "") {
		return "X";
	}
	if (!/^[A-Z]/.test(normalized)) {
		return `X${normalized}`;
	}
	return normalized;
}
