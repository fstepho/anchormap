import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isMap, isScalar, isSeq, parseAllDocuments, type YAMLMap } from "yaml";

import type { AppError } from "../cli/commands";
import { type AnchorId, validateAnchorId } from "../domain/anchor-id";
import { sortAnchorIdsByUtf8, sortRepoPathsByUtf8 } from "../domain/canonical-order";
import { type RepoPath, repoPathToString, validateRepoPath } from "../domain/repo-path";
import { decodeUtf8StrictNoBom, type RepoPathEntryStatus, statRepoPath } from "./repo-fs";

export const ANCHORMAP_CONFIG_FILENAME = "anchormap.yaml";

const TOP_LEVEL_CONFIG_KEYS = new Set([
	"version",
	"product_root",
	"spec_roots",
	"ignore_roots",
	"mappings",
]);
const MAPPING_KEYS = new Set(["seed_files"]);

export type ConfigYamlReadFile = (path: string) => Uint8Array;
export type ConfigRepoPathStat = (path: RepoPath) => RepoPathEntryStatus;

export interface LoadAnchormapYamlOptions {
	cwd?: string;
	readFile?: ConfigYamlReadFile;
	statPath?: ConfigRepoPathStat;
}

export interface LoadedAnchormapYaml {
	path: string;
	root: YAMLMap;
}

export interface ConfigMapping {
	readonly seedFiles: readonly RepoPath[];
}

export type ConfigMappings = Readonly<Record<AnchorId, ConfigMapping>>;

export interface Config {
	readonly version: 1;
	readonly productRoot: RepoPath;
	readonly specRoots: readonly RepoPath[];
	readonly ignoreRoots: readonly RepoPath[];
	readonly mappings: ConfigMappings;
}

export type LoadAnchormapYamlResult =
	| { kind: "ok"; yaml: LoadedAnchormapYaml }
	| { kind: "error"; error: AppError };

export type LoadConfigResult = { kind: "ok"; config: Config } | { kind: "error"; error: AppError };

export function loadAnchormapYaml(options: LoadAnchormapYamlOptions = {}): LoadAnchormapYamlResult {
	const cwd = options.cwd ?? process.cwd();
	const readFile = options.readFile ?? readFileSync;
	const configPath = join(cwd, ANCHORMAP_CONFIG_FILENAME);
	let bytes: Uint8Array;

	try {
		bytes = readFile(configPath);
	} catch (error) {
		return configLoadError("cannot read anchormap.yaml", error);
	}

	const decoded = decodeUtf8StrictNoBom(bytes);
	if (decoded.kind === "decode_error") {
		return configLoadError("anchormap.yaml is not valid UTF-8", decoded.error);
	}

	return parseAnchormapYamlText(decoded.text, configPath);
}

export function loadConfig(options: LoadAnchormapYamlOptions = {}): LoadConfigResult {
	const yamlResult = loadAnchormapYaml(options);
	if (yamlResult.kind === "error") {
		return yamlResult;
	}

	return validateConfigYamlRoot(yamlResult.yaml.root, {
		statPath: options.statPath ?? ((path) => statRepoPath(options.cwd ?? process.cwd(), path)),
	});
}

export function parseAnchormapYamlText(
	text: string,
	configPath = ANCHORMAP_CONFIG_FILENAME,
): LoadAnchormapYamlResult {
	let documents: ReturnType<typeof parseAllDocuments>;

	try {
		documents = parseAllDocuments(text, {
			version: "1.2",
			uniqueKeys: true,
		});
	} catch (error) {
		return configLoadError("anchormap.yaml is invalid YAML", error);
	}

	if (documents.length !== 1) {
		return configLoadError("anchormap.yaml must contain exactly one YAML document");
	}

	const [document] = documents;
	if (document.errors.length > 0) {
		return configLoadError("anchormap.yaml is invalid YAML", document.errors[0]);
	}

	const yamlVersionViolation = getYamlVersionDirectiveViolation(document);
	if (yamlVersionViolation !== undefined) {
		return configLoadError("anchormap.yaml must use YAML 1.2", yamlVersionViolation);
	}

	if (!isMap(document.contents)) {
		return configLoadError("anchormap.yaml root must be a mapping");
	}

	return {
		kind: "ok",
		yaml: {
			path: configPath,
			root: document.contents,
		},
	};
}

export function parseAnchormapConfigText(
	text: string,
	configPath = ANCHORMAP_CONFIG_FILENAME,
	options: ValidateConfigOptions = {},
): LoadConfigResult {
	const yamlResult = parseAnchormapYamlText(text, configPath);
	if (yamlResult.kind === "error") {
		return yamlResult;
	}

	return validateConfigYamlRoot(yamlResult.yaml.root, options);
}

export interface ValidateConfigOptions {
	readonly statPath?: ConfigRepoPathStat;
}

export function validateConfigYamlRoot(
	root: YAMLMap,
	options: ValidateConfigOptions = {},
): LoadConfigResult {
	const topLevel = readClosedMapping(root, TOP_LEVEL_CONFIG_KEYS, "anchormap.yaml");
	if (topLevel.kind === "error") {
		return topLevel;
	}

	const versionResult = readRequiredVersion(topLevel.fields.get("version"));
	if (versionResult.kind === "error") {
		return versionResult;
	}

	const productRoot = readRequiredRepoPath(topLevel.fields.get("product_root"), "product_root");
	if (productRoot.kind === "error") {
		return productRoot;
	}

	const specRoots = readRequiredRepoPathSequence(topLevel.fields.get("spec_roots"), "spec_roots", {
		allowEmpty: false,
	});
	if (specRoots.kind === "error") {
		return specRoots;
	}

	const ignoreRoots = readOptionalRepoPathSequence(
		topLevel.fields.get("ignore_roots"),
		"ignore_roots",
	);
	if (ignoreRoots.kind === "error") {
		return ignoreRoots;
	}

	const mappings = readOptionalMappings(topLevel.fields.get("mappings"));
	if (mappings.kind === "error") {
		return mappings;
	}

	const invariantResult = validateConfigPathInvariants(
		productRoot.repoPath,
		specRoots.repoPaths,
		ignoreRoots.repoPaths,
		options,
	);
	if (invariantResult.kind === "error") {
		return invariantResult;
	}

	return {
		kind: "ok",
		config: {
			version: 1,
			productRoot: productRoot.repoPath,
			specRoots: sortRepoPathsByUtf8(specRoots.repoPaths),
			ignoreRoots: sortRepoPathsByUtf8(ignoreRoots.repoPaths),
			mappings: mappings.mappings,
		},
	};
}

function validateConfigPathInvariants(
	productRoot: RepoPath,
	specRoots: readonly RepoPath[],
	ignoreRoots: readonly RepoPath[],
	options: ValidateConfigOptions,
): { kind: "ok" } | ConfigErrorResult {
	const duplicateSpecRoot = findDuplicateRepoPath(specRoots);
	if (duplicateSpecRoot !== undefined) {
		return configLoadError(`spec_roots contains duplicate path ${duplicateSpecRoot}`);
	}

	const overlappingSpecRoots = findOverlappingRepoPaths(specRoots);
	if (overlappingSpecRoots !== undefined) {
		return configLoadError(
			`spec_roots contains overlapping paths ${overlappingSpecRoots.ancestor} and ${overlappingSpecRoots.descendant}`,
		);
	}

	const duplicateIgnoreRoot = findDuplicateRepoPath(ignoreRoots);
	if (duplicateIgnoreRoot !== undefined) {
		return configLoadError(`ignore_roots contains duplicate path ${duplicateIgnoreRoot}`);
	}

	const overlappingIgnoreRoots = findOverlappingRepoPaths(ignoreRoots);
	if (overlappingIgnoreRoots !== undefined) {
		return configLoadError(
			`ignore_roots contains overlapping paths ${overlappingIgnoreRoots.ancestor} and ${overlappingIgnoreRoots.descendant}`,
		);
	}

	if (options.statPath === undefined) {
		return { kind: "ok" };
	}

	const productRootStatus = options.statPath(productRoot);
	if (productRootStatus.kind !== "directory") {
		return configLoadError("product_root must be an existing directory", productRootStatus);
	}

	for (const specRoot of specRoots) {
		const specRootStatus = options.statPath(specRoot);
		if (specRootStatus.kind !== "directory") {
			return configLoadError(`spec_root ${specRoot} must be an existing directory`, specRootStatus);
		}
	}

	for (const ignoreRoot of ignoreRoots) {
		const ignoreRootStatus = options.statPath(ignoreRoot);
		if (ignoreRootStatus.kind === "missing") {
			continue;
		}
		if (ignoreRootStatus.kind === "inaccessible") {
			return configLoadError(`ignore_root ${ignoreRoot} could not be validated`, ignoreRootStatus);
		}
		if (!isDescendantOf(ignoreRoot, productRoot)) {
			return configLoadError(`ignore_root ${ignoreRoot} must be under product_root`);
		}
	}

	return { kind: "ok" };
}

function findDuplicateRepoPath(paths: readonly RepoPath[]): RepoPath | undefined {
	const seen = new Set<string>();
	for (const path of paths) {
		const value = repoPathToString(path);
		if (seen.has(value)) {
			return path;
		}
		seen.add(value);
	}

	return undefined;
}

function findOverlappingRepoPaths(
	paths: readonly RepoPath[],
): { ancestor: RepoPath; descendant: RepoPath } | undefined {
	const sortedPaths = sortRepoPathsByUtf8(paths);
	for (let leftIndex = 0; leftIndex < sortedPaths.length; leftIndex += 1) {
		for (let rightIndex = leftIndex + 1; rightIndex < sortedPaths.length; rightIndex += 1) {
			const left = sortedPaths[leftIndex];
			const right = sortedPaths[rightIndex];
			if (isDescendantOf(right, left)) {
				return {
					ancestor: left,
					descendant: right,
				};
			}
			if (isDescendantOf(left, right)) {
				return {
					ancestor: right,
					descendant: left,
				};
			}
		}
	}

	return undefined;
}

function isDescendantOf(path: RepoPath, possibleAncestor: RepoPath): boolean {
	const pathValue = repoPathToString(path);
	const ancestorValue = repoPathToString(possibleAncestor);
	return pathValue.startsWith(`${ancestorValue}/`);
}

type ParsedYamlDocument = ReturnType<typeof parseAllDocuments>[number];

function getYamlVersionDirectiveViolation(document: ParsedYamlDocument): unknown {
	if (document.directives?.yaml.explicit === true && document.directives.yaml.version !== "1.2") {
		return document.directives.yaml;
	}

	return document.warnings.find(
		(warning) =>
			warning.code === "BAD_DIRECTIVE" && warning.message.startsWith("Unsupported YAML version "),
	);
}

interface MappingReadResult {
	readonly kind: "ok";
	readonly fields: Map<string, unknown>;
}

type ConfigErrorResult = { kind: "error"; error: AppError };

function readClosedMapping(
	node: unknown,
	allowedKeys: ReadonlySet<string>,
	path: string,
): MappingReadResult | ConfigErrorResult {
	if (!isMap(node)) {
		return configLoadError(`${path} must be a mapping`);
	}

	const fields = new Map<string, unknown>();
	for (const item of node.items) {
		const pair = item as { key: unknown; value: unknown };
		const key = readStringScalar(pair.key, `${path} key`);
		if (key.kind === "error") {
			return key;
		}
		if (!allowedKeys.has(key.value)) {
			return configLoadError(`${path} contains unknown field ${key.value}`);
		}
		fields.set(key.value, pair.value);
	}

	return {
		kind: "ok",
		fields,
	};
}

function readRequiredVersion(node: unknown): { kind: "ok" } | ConfigErrorResult {
	if (node === undefined) {
		return configLoadError("version is required");
	}
	if (!isScalar(node) || typeof node.value !== "number" || !Number.isInteger(node.value)) {
		return configLoadError("version must be integer 1");
	}
	if (node.value !== 1) {
		return configLoadError("version must be 1");
	}

	return { kind: "ok" };
}

function readRequiredRepoPath(
	node: unknown,
	path: string,
): { kind: "ok"; repoPath: RepoPath } | ConfigErrorResult {
	if (node === undefined) {
		return configLoadError(`${path} is required`);
	}

	return readRepoPathScalar(node, path);
}

function readRequiredRepoPathSequence(
	node: unknown,
	path: string,
	options: { allowEmpty: boolean },
): { kind: "ok"; repoPaths: RepoPath[] } | ConfigErrorResult {
	if (node === undefined) {
		return configLoadError(`${path} is required`);
	}

	return readRepoPathSequence(node, path, options);
}

function readOptionalRepoPathSequence(
	node: unknown,
	path: string,
): { kind: "ok"; repoPaths: RepoPath[] } | ConfigErrorResult {
	if (node === undefined) {
		return {
			kind: "ok",
			repoPaths: [],
		};
	}

	return readRepoPathSequence(node, path, { allowEmpty: true });
}

function readOptionalMappings(
	node: unknown,
): { kind: "ok"; mappings: ConfigMappings } | ConfigErrorResult {
	if (node === undefined) {
		return {
			kind: "ok",
			mappings: {} as ConfigMappings,
		};
	}
	if (!isMap(node)) {
		return configLoadError("mappings must be a mapping");
	}

	const mappings = new Map<AnchorId, ConfigMapping>();
	for (const item of node.items) {
		const pair = item as { key: unknown; value: unknown };
		const key = readStringScalar(pair.key, "mappings key");
		if (key.kind === "error") {
			return key;
		}
		const anchorResult = validateAnchorId(key.value);
		if (anchorResult.kind === "validation_failure") {
			return configLoadError(`mappings key ${key.value} must be a supported anchor ID`);
		}

		const mapping = readMapping(pair.value, `mappings.${key.value}`);
		if (mapping.kind === "error") {
			return mapping;
		}
		mappings.set(anchorResult.anchorId, mapping.mapping);
	}

	return {
		kind: "ok",
		mappings: recordFromSortedAnchorMap(mappings),
	};
}

function readMapping(
	node: unknown,
	path: string,
): { kind: "ok"; mapping: ConfigMapping } | ConfigErrorResult {
	const fields = readClosedMapping(node, MAPPING_KEYS, path);
	if (fields.kind === "error") {
		return fields;
	}
	if (!fields.fields.has("seed_files")) {
		return configLoadError(`${path}.seed_files is required`);
	}

	const seedFiles = readRepoPathSequence(fields.fields.get("seed_files"), `${path}.seed_files`, {
		allowEmpty: false,
	});
	if (seedFiles.kind === "error") {
		return seedFiles;
	}

	const seen = new Set<string>();
	for (const seedFile of seedFiles.repoPaths) {
		if (seen.has(seedFile)) {
			return configLoadError(`${path}.seed_files must contain unique paths`);
		}
		seen.add(seedFile);
	}

	return {
		kind: "ok",
		mapping: {
			seedFiles: sortRepoPathsByUtf8(seedFiles.repoPaths),
		},
	};
}

function readRepoPathSequence(
	node: unknown,
	path: string,
	options: { allowEmpty: boolean },
): { kind: "ok"; repoPaths: RepoPath[] } | ConfigErrorResult {
	if (!isSeq(node)) {
		return configLoadError(`${path} must be a sequence`);
	}
	if (!options.allowEmpty && node.items.length === 0) {
		return configLoadError(`${path} must not be empty`);
	}

	const repoPaths: RepoPath[] = [];
	for (const [index, item] of node.items.entries()) {
		const repoPath = readRepoPathScalar(item, `${path}[${index}]`);
		if (repoPath.kind === "error") {
			return repoPath;
		}
		repoPaths.push(repoPath.repoPath);
	}

	return {
		kind: "ok",
		repoPaths,
	};
}

function readRepoPathScalar(
	node: unknown,
	path: string,
): { kind: "ok"; repoPath: RepoPath } | ConfigErrorResult {
	const scalar = readStringScalar(node, path);
	if (scalar.kind === "error") {
		return scalar;
	}

	const repoPath = validateRepoPath(scalar.value);
	if (repoPath.kind === "validation_failure") {
		return configLoadError(`${path} must be a canonical RepoPath`);
	}

	return {
		kind: "ok",
		repoPath: repoPath.repoPath,
	};
}

function readStringScalar(
	node: unknown,
	path: string,
): { kind: "ok"; value: string } | ConfigErrorResult {
	if (!isScalar(node) || typeof node.value !== "string") {
		return configLoadError(`${path} must be a string scalar`);
	}

	return {
		kind: "ok",
		value: node.value,
	};
}

function recordFromSortedAnchorMap(mappings: ReadonlyMap<AnchorId, ConfigMapping>): ConfigMappings {
	const sortedAnchorIds = sortAnchorIdsByUtf8([...mappings.keys()]);
	const entries = sortedAnchorIds.map((anchorId) => [anchorId, mappings.get(anchorId)] as const);
	return Object.fromEntries(entries) as ConfigMappings;
}

function configLoadError(message: string, cause?: unknown): ConfigErrorResult {
	return {
		kind: "error",
		error: {
			kind: "ConfigError",
			message,
			cause,
		},
	};
}
