import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type ts = require("typescript");

import { compareCanonicalTextByUtf8 } from "../domain/canonical-order";
import { type RepoPath, repoPathToString, validateRepoPath } from "../domain/repo-path";
import type { Config } from "./config-io";
import { decodeUtf8StrictNoBom } from "./repo-fs";

export interface LocalAlias {
	readonly prefix: string;
	readonly targetPrefix: string;
}

export interface ResolutionAlias extends LocalAlias {
	readonly visibility: "public_local" | "internal_resolution";
}

export interface TsconfigAliasState {
	readonly tsconfigPath: RepoPath | null;
	readonly localAliases: readonly LocalAlias[];
	readonly resolutionAliases: readonly ResolutionAlias[];
}

export interface TsconfigAliasError {
	readonly kind: "UnsupportedRepoError";
	readonly message?: string;
	readonly cause?: unknown;
}

export type LoadLocalAliasesResult =
	| { kind: "ok"; state: TsconfigAliasState }
	| { kind: "error"; error: TsconfigAliasError };

export interface TsconfigAliasFs {
	readonly readFile: (path: string) => Uint8Array;
	readonly exists: (path: string) => boolean;
	readonly lstat?: (path: string) => TsconfigAliasFileStats;
}

export interface TsconfigAliasFileStats {
	readonly isSymbolicLink: () => boolean;
}

interface ParsedTsconfigFile {
	readonly path: RepoPath;
	readonly extendsValue?: string;
	readonly baseUrl?: string;
	readonly paths?: Readonly<Record<string, readonly string[]>>;
}

type RootRelativePath = "" | RepoPath;

const ROOT_TSCONFIG_PATH = checkedRepoPath("tsconfig.json");

const nodeTsconfigAliasFs: TsconfigAliasFs = {
	readFile: readFileSync,
	exists: pathExists,
	lstat: lstatSync,
};

let loadedTypeScript: typeof ts | undefined;

export function loadLocalAliases(
	config: Config,
	options: { readonly cwd?: string; readonly fs?: TsconfigAliasFs } = {},
): LoadLocalAliasesResult {
	const cwd = options.cwd ?? process.cwd();
	const fs = options.fs ?? nodeTsconfigAliasFs;
	const rootAbsolutePath = join(cwd, repoPathToString(ROOT_TSCONFIG_PATH));

	try {
		if (!fs.exists(rootAbsolutePath)) {
			return {
				kind: "ok",
				state: {
					tsconfigPath: null,
					localAliases: [],
					resolutionAliases: [],
				},
			};
		}
	} catch (error) {
		return unsupportedTsconfigError("cannot inspect tsconfig.json", error);
	}

	const chain = readTsconfigChain(cwd, fs);
	if (chain.kind === "error") {
		return chain;
	}

	const aliases = normalizeAliases(config, chain.files);
	if (aliases.kind === "error") {
		return aliases;
	}

	return {
		kind: "ok",
		state: {
			tsconfigPath: ROOT_TSCONFIG_PATH,
			localAliases: aliases.publicLocalAliases,
			resolutionAliases: aliases.resolutionAliases,
		},
	};
}

function readTsconfigChain(
	cwd: string,
	fs: TsconfigAliasFs,
):
	| { kind: "ok"; files: readonly ParsedTsconfigFile[] }
	| { kind: "error"; error: TsconfigAliasError } {
	const files: ParsedTsconfigFile[] = [];
	const seen = new Set<RepoPath>();
	let currentPath = ROOT_TSCONFIG_PATH;

	while (true) {
		if (seen.has(currentPath)) {
			return unsupportedTsconfigError(`tsconfig extends cycle at ${currentPath}`);
		}
		seen.add(currentPath);

		const parsed = readTsconfigFile(cwd, fs, currentPath);
		if (parsed.kind === "error") {
			return parsed;
		}
		files.push(parsed.file);

		if (parsed.file.extendsValue === undefined) {
			return { kind: "ok", files };
		}

		const extendsPath = normalizeExtendsPath(parsed.file.path, parsed.file.extendsValue);
		if (extendsPath.kind === "error") {
			return extendsPath;
		}
		currentPath = extendsPath.path;
	}
}

function readTsconfigFile(
	cwd: string,
	fs: TsconfigAliasFs,
	path: RepoPath,
): { kind: "ok"; file: ParsedTsconfigFile } | { kind: "error"; error: TsconfigAliasError } {
	let bytes: Uint8Array;
	const absolutePath = join(cwd, repoPathToString(path));

	const inspectedPath = inspectTsconfigPath(cwd, fs, path);
	if (inspectedPath.kind === "error") {
		return inspectedPath;
	}

	try {
		bytes = fs.readFile(absolutePath);
	} catch (error) {
		return unsupportedTsconfigError(`cannot read ${path}`, error);
	}

	const decoded = decodeUtf8StrictNoBom(bytes);
	if (decoded.kind === "decode_error") {
		return unsupportedTsconfigError(`${path} is not valid UTF-8`, decoded.error);
	}

	return parseTsconfigJsonc(path, decoded.text);
}

function inspectTsconfigPath(
	cwd: string,
	fs: TsconfigAliasFs,
	path: RepoPath,
): { kind: "ok" } | { kind: "error"; error: TsconfigAliasError } {
	if (fs.lstat === undefined) {
		return { kind: "ok" };
	}

	let currentPath = "";
	for (const segment of repoPathToString(path).split("/")) {
		currentPath = currentPath === "" ? segment : `${currentPath}/${segment}`;
		try {
			if (fs.lstat(join(cwd, currentPath)).isSymbolicLink()) {
				return unsupportedTsconfigError(`${currentPath} must not be a symlink`);
			}
		} catch (error) {
			return unsupportedTsconfigError(`cannot inspect ${currentPath}`, error);
		}
	}

	return { kind: "ok" };
}

function parseTsconfigJsonc(
	path: RepoPath,
	text: string,
): { kind: "ok"; file: ParsedTsconfigFile } | { kind: "error"; error: TsconfigAliasError } {
	const parsed = getTypeScript().parseConfigFileTextToJson(repoPathToString(path), text);
	if (parsed.error !== undefined) {
		return unsupportedTsconfigError(`${path} is not valid JSONC`, parsed.error);
	}

	const root = parsed.config;
	if (!isRecord(root)) {
		return unsupportedTsconfigError(`${path} root must be a JSON object`);
	}

	const extendsValue = readOptionalString(readOwnProperty(root, "extends"), `${path}.extends`);
	if (extendsValue.kind === "error") {
		return extendsValue;
	}

	const compilerOptions = readCompilerOptions(readOwnProperty(root, "compilerOptions"), path);
	if (compilerOptions.kind === "error") {
		return compilerOptions;
	}

	return {
		kind: "ok",
		file: {
			path,
			extendsValue: extendsValue.value,
			baseUrl: compilerOptions.baseUrl,
			paths: compilerOptions.paths,
		},
	};
}

function readCompilerOptions(
	value: unknown,
	path: RepoPath,
):
	| {
			kind: "ok";
			baseUrl?: string;
			paths?: Readonly<Record<string, readonly string[]>>;
	  }
	| { kind: "error"; error: TsconfigAliasError } {
	if (value === undefined) {
		return { kind: "ok" };
	}
	if (!isRecord(value)) {
		return unsupportedTsconfigError(`${path}.compilerOptions must be an object`);
	}

	const baseUrl = readOptionalString(
		readOwnProperty(value, "baseUrl"),
		`${path}.compilerOptions.baseUrl`,
	);
	if (baseUrl.kind === "error") {
		return baseUrl;
	}

	const paths = readOptionalPaths(readOwnProperty(value, "paths"), `${path}.compilerOptions.paths`);
	if (paths.kind === "error") {
		return paths;
	}

	return {
		kind: "ok",
		baseUrl: baseUrl.value,
		paths: paths.value,
	};
}

function readOptionalString(
	value: unknown,
	path: string,
): { kind: "ok"; value?: string } | { kind: "error"; error: TsconfigAliasError } {
	if (value === undefined) {
		return { kind: "ok" };
	}
	if (typeof value !== "string") {
		return unsupportedTsconfigError(`${path} must be a string`);
	}
	return { kind: "ok", value };
}

function readOptionalPaths(
	value: unknown,
	path: string,
):
	| { kind: "ok"; value?: Readonly<Record<string, readonly string[]>> }
	| { kind: "error"; error: TsconfigAliasError } {
	if (value === undefined) {
		return { kind: "ok" };
	}
	if (!isRecord(value)) {
		return unsupportedTsconfigError(`${path} must be an object`);
	}

	const entries: Record<string, readonly string[]> = {};
	for (const [alias, targets] of Object.entries(value)) {
		if (!Array.isArray(targets) || !targets.every((target) => typeof target === "string")) {
			return unsupportedTsconfigError(`${path}.${alias} must be an array of strings`);
		}
		entries[alias] = targets;
	}

	return { kind: "ok", value: entries };
}

function normalizeAliases(
	config: Config,
	files: readonly ParsedTsconfigFile[],
):
	| {
			kind: "ok";
			publicLocalAliases: readonly LocalAlias[];
			resolutionAliases: readonly ResolutionAlias[];
	  }
	| { kind: "error"; error: TsconfigAliasError } {
	const baseUrls = computeEffectiveBaseUrls(files);
	if (baseUrls.kind === "error") {
		return baseUrls;
	}

	const normalizedAliasesByPath = new Map<RepoPath, readonly ResolutionAlias[]>();
	for (const file of files) {
		if (file.paths === undefined) {
			continue;
		}

		const baseUrl = baseUrls.values.get(file.path);
		if (baseUrl === undefined) {
			return unsupportedTsconfigError(`cannot resolve baseUrl for ${file.path}`);
		}

		const normalized = normalizePathMappings(config, file.paths, baseUrl);
		if (normalized.kind === "error") {
			return normalized;
		}
		normalizedAliasesByPath.set(file.path, normalized.localAliases);
	}

	const pathsProvider = files.find((file) => file.paths !== undefined);
	if (pathsProvider === undefined) {
		return { kind: "ok", publicLocalAliases: [], resolutionAliases: [] };
	}

	const resolutionAliases = [...(normalizedAliasesByPath.get(pathsProvider.path) ?? [])].sort(
		compareLocalAliases,
	);
	return {
		kind: "ok",
		publicLocalAliases: resolutionAliases
			.filter((alias) => alias.visibility === "public_local")
			.map(({ prefix, targetPrefix }) => ({ prefix, targetPrefix })),
		resolutionAliases,
	};
}

function normalizePathMappings(
	config: Config,
	paths: Readonly<Record<string, readonly string[]>>,
	baseUrl: RootRelativePath,
):
	| { kind: "ok"; localAliases: readonly ResolutionAlias[] }
	| { kind: "error"; error: TsconfigAliasError } {
	const localAliases: ResolutionAlias[] = [];
	for (const [alias, targets] of Object.entries(paths)) {
		const normalized = normalizeAlias(config, alias, targets, baseUrl);
		if (normalized.kind === "error") {
			return normalized;
		}
		localAliases.push(normalized.localAlias);
	}

	return { kind: "ok", localAliases };
}

function computeEffectiveBaseUrls(
	files: readonly ParsedTsconfigFile[],
):
	| { kind: "ok"; values: ReadonlyMap<RepoPath, RootRelativePath> }
	| { kind: "error"; error: TsconfigAliasError } {
	const values = new Map<RepoPath, RootRelativePath>();
	let inheritedDeclaredBaseUrl: RootRelativePath | undefined;

	for (const file of [...files].reverse()) {
		let declaredBaseUrl = inheritedDeclaredBaseUrl;
		if (file.baseUrl !== undefined) {
			const normalized = normalizeRootRelativePath(configDirectory(file.path), file.baseUrl);
			if (normalized.kind === "error") {
				return unsupportedTsconfigError(
					`${file.path}.compilerOptions.baseUrl is not under repo root`,
				);
			}
			declaredBaseUrl = normalized.path;
		}

		values.set(file.path, declaredBaseUrl ?? configDirectory(file.path));
		inheritedDeclaredBaseUrl = declaredBaseUrl;
	}

	return { kind: "ok", values };
}

function normalizeAlias(
	config: Config,
	alias: string,
	targets: readonly string[],
	baseUrl: RootRelativePath,
): { kind: "ok"; localAlias: ResolutionAlias } | { kind: "error"; error: TsconfigAliasError } {
	const prefix = normalizeAliasPrefix(alias);
	if (prefix.kind === "error") {
		return prefix;
	}
	if (targets.length !== 1) {
		return unsupportedTsconfigError(`paths.${alias} must have exactly one target`);
	}

	const targetPrefix = normalizeTargetPrefix(config, baseUrl, targets[0]);
	if (targetPrefix.kind === "error") {
		return targetPrefix;
	}

	return {
		kind: "ok",
		localAlias: {
			prefix: prefix.value,
			targetPrefix: targetPrefix.value.targetPrefix,
			visibility: targetPrefix.value.visibility,
		},
	};
}

function normalizeAliasPrefix(
	alias: string,
): { kind: "ok"; value: string } | { kind: "error"; error: TsconfigAliasError } {
	if (
		containsControlCharacter(alias) ||
		alias.includes("\\") ||
		countOccurrences(alias, "*") !== 1 ||
		!alias.endsWith("/*")
	) {
		return unsupportedTsconfigError(`unsupported paths alias ${alias}`);
	}

	const prefix = alias.slice(0, -1);
	if (prefix === "" || !prefix.endsWith("/") || prefix.startsWith(".") || prefix.startsWith("/")) {
		return unsupportedTsconfigError(`unsupported paths alias ${alias}`);
	}

	return { kind: "ok", value: prefix };
}

function normalizeTargetPrefix(
	config: Config,
	baseUrl: RootRelativePath,
	target: string,
):
	| {
			kind: "ok";
			value: {
				readonly targetPrefix: string;
				readonly visibility: ResolutionAlias["visibility"];
			};
	  }
	| { kind: "error"; error: TsconfigAliasError } {
	if (
		containsControlCharacter(target) ||
		target.includes("\\") ||
		countOccurrences(target, "*") !== 1 ||
		!target.endsWith("/*")
	) {
		return unsupportedTsconfigError(`unsupported paths target ${target}`);
	}

	const targetPrefix = target.slice(0, -2);
	if (targetPrefix === "") {
		return unsupportedTsconfigError(`unsupported paths target ${target}`);
	}

	const normalized = normalizeRootRelativePath(baseUrl, targetPrefix);
	if (normalized.kind === "error" || normalized.path === "") {
		return unsupportedTsconfigError(`paths target ${target} is outside repo root`);
	}

	const repoPath = validateRepoPath(normalized.path);
	if (repoPath.kind !== "ok") {
		return unsupportedTsconfigError(`paths target ${target} is outside repo root`);
	}

	return {
		kind: "ok",
		value: {
			targetPrefix: `${repoPathToString(repoPath.repoPath)}/`,
			visibility: isSameOrDescendantOf(repoPath.repoPath, config.productRoot)
				? "public_local"
				: "internal_resolution",
		},
	};
}

function normalizeExtendsPath(
	fromPath: RepoPath,
	value: string,
): { kind: "ok"; path: RepoPath } | { kind: "error"; error: TsconfigAliasError } {
	if (
		containsControlCharacter(value) ||
		value.includes("\\") ||
		!(value.startsWith("./") || value.startsWith("../"))
	) {
		return unsupportedTsconfigError(`${fromPath}.extends must be local relative`);
	}

	const normalized = normalizeRootRelativePath(configDirectory(fromPath), value);
	if (normalized.kind === "error" || normalized.path === "") {
		return unsupportedTsconfigError(`${fromPath}.extends escapes repo root`);
	}

	const repoPath = validateRepoPath(normalized.path);
	if (repoPath.kind !== "ok") {
		return unsupportedTsconfigError(`${fromPath}.extends is not a canonical RepoPath`);
	}

	return { kind: "ok", path: repoPath.repoPath };
}

function normalizeRootRelativePath(
	basePath: RootRelativePath,
	value: string,
): { kind: "ok"; path: RootRelativePath } | { kind: "error" } {
	if (containsControlCharacter(value) || value.includes("\\") || value.startsWith("/")) {
		return { kind: "error" };
	}

	const baseSegments = basePath === "" ? [] : repoPathToString(basePath).split("/");
	const resolvedSegments: string[] = [];

	for (const segment of [...baseSegments, ...value.split("/")]) {
		if (segment === "" || segment === ".") {
			continue;
		}
		if (segment === "..") {
			if (resolvedSegments.length === 0) {
				return { kind: "error" };
			}
			resolvedSegments.pop();
			continue;
		}
		resolvedSegments.push(segment);
	}

	const normalized = resolvedSegments.join("/");
	if (normalized === "") {
		return { kind: "ok", path: "" };
	}

	const repoPath = validateRepoPath(normalized);
	if (repoPath.kind !== "ok") {
		return { kind: "error" };
	}

	return { kind: "ok", path: repoPath.repoPath };
}

function configDirectory(path: RepoPath): RootRelativePath {
	const value = repoPathToString(path);
	const lastSlash = value.lastIndexOf("/");
	if (lastSlash === -1) {
		return "";
	}

	return checkedRepoPath(value.slice(0, lastSlash));
}

function compareLocalAliases(left: LocalAlias, right: LocalAlias): number {
	const lengthDifference = right.prefix.length - left.prefix.length;
	if (lengthDifference !== 0) {
		return lengthDifference;
	}

	const prefixOrder = compareCanonicalTextByUtf8(left.prefix, right.prefix);
	if (prefixOrder !== 0) {
		return prefixOrder;
	}

	return compareCanonicalTextByUtf8(left.targetPrefix, right.targetPrefix);
}

function isSameOrDescendantOf(path: RepoPath, possibleAncestor: RepoPath): boolean {
	const pathValue = repoPathToString(path);
	const ancestorValue = repoPathToString(possibleAncestor);
	return pathValue === ancestorValue || pathValue.startsWith(`${ancestorValue}/`);
}

function checkedRepoPath(value: string): RepoPath {
	const result = validateRepoPath(value);
	if (result.kind !== "ok") {
		throw new Error(`invalid internal RepoPath ${value}`);
	}
	return result.repoPath;
}

function pathExists(path: string): boolean {
	try {
		lstatSync(path);
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

function readOwnProperty(
	value: Readonly<Record<string, unknown>>,
	key: string,
): unknown | undefined {
	return Object.hasOwn(value, key) ? value[key] : undefined;
}

function countOccurrences(value: string, needle: string): number {
	let count = 0;
	for (const character of value) {
		if (character === needle) {
			count += 1;
		}
	}
	return count;
}

function containsControlCharacter(value: string): boolean {
	for (const character of value) {
		const codePoint = character.codePointAt(0);
		if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
			return true;
		}
	}

	return false;
}

function getTypeScript(): typeof ts {
	if (loadedTypeScript === undefined) {
		loadedTypeScript = require("typescript") as typeof ts;
	}

	return loadedTypeScript;
}

function unsupportedTsconfigError(
	message: string,
	cause?: unknown,
): { kind: "error"; error: TsconfigAliasError } {
	return {
		kind: "error",
		error: {
			kind: "UnsupportedRepoError",
			message,
			cause,
		},
	};
}
