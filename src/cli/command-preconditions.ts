import { lstatSync } from "node:fs";
import { join } from "node:path";

import { type AnchorId, validateAnchorId } from "../domain/anchor-id";
import {
	normalizeUserPathArg,
	type RepoPath,
	repoPathToString,
	validateRepoPath,
} from "../domain/repo-path";
import { ANCHORMAP_CONFIG_FILENAME, type Config } from "../infra/config-io";
import { isProductFilePath } from "../infra/product-files";
import { statRepoPath } from "../infra/repo-fs";
import type { ParsedMapArgs, ParsedScaffoldArgs } from "./command-args";
import { type AppError, internalError, unsupportedRepoError, usageError } from "./command-result";

export function normalizeCliPathArg(
	value: string,
	optionName: string,
): { kind: "ok"; path: RepoPath } | { kind: "usage_error"; message: string } {
	const result = normalizeUserPathArg(value);
	if (result.kind === "validation_failure") {
		return { kind: "usage_error", message: `${optionName} must be a valid repository path` };
	}

	return { kind: "ok", path: result.repoPath };
}

export function validateRawScaffoldArgs(
	args: ParsedScaffoldArgs,
): { kind: "ok"; args: ParsedScaffoldArgs } | { kind: "usage_error"; message: string } {
	const result = normalizeUserPathArg(args.output);
	if (result.kind === "validation_failure") {
		return { kind: "usage_error", message: "--output must be a valid repository path" };
	}

	return {
		kind: "ok",
		args: {
			output: repoPathToString(result.repoPath),
		},
	};
}

export function validateRawMapArgs(
	args: ParsedMapArgs,
): { kind: "ok"; args: ParsedMapArgs } | { kind: "usage_error"; message: string } {
	const anchorResult = validateAnchorId(args.anchor);
	if (anchorResult.kind === "validation_failure") {
		return { kind: "usage_error", message: "--anchor must be a supported anchor ID" };
	}

	const normalizedSeeds: string[] = [];
	for (const seed of args.seeds) {
		const result = normalizeUserPathArg(seed);
		if (result.kind === "validation_failure") {
			return { kind: "usage_error", message: "--seed must be a valid repository path" };
		}
		normalizedSeeds.push(repoPathToString(result.repoPath));
	}

	const duplicateSeed = findDuplicateString(normalizedSeeds);
	if (duplicateSeed !== undefined) {
		return { kind: "usage_error", message: `duplicate --seed ${duplicateSeed}` };
	}

	return {
		kind: "ok",
		args: {
			...args,
			seeds: normalizedSeeds,
		},
	};
}

export function buildConfigWithMappedSeedFiles(
	config: Config,
	anchorId: AnchorId,
	seeds: readonly string[],
): { kind: "ok"; config: Config } | { kind: "error"; error: AppError } {
	const seedFiles: RepoPath[] = [];
	for (const seed of seeds) {
		const seedResult = validateRepoPath(seed);
		if (seedResult.kind === "validation_failure") {
			return { kind: "error", error: internalError("validated map seed became invalid") };
		}
		seedFiles.push(seedResult.repoPath);
	}

	return {
		kind: "ok",
		config: {
			...config,
			mappings: {
				...config.mappings,
				[anchorId]: {
					seedFiles,
				},
			},
		},
	};
}

export function validateMapSeedPreconditions(
	config: Config,
	seeds: readonly string[],
	cwd: string,
): { kind: "ok" } | { kind: "error"; error: AppError } {
	for (const seedValue of seeds) {
		const seedResult = validateRepoPath(seedValue);
		if (seedResult.kind === "validation_failure") {
			return { kind: "error", error: usageError("--seed must be a valid repository path") };
		}

		const seed = seedResult.repoPath;
		if (!isRepoPathDescendantOf(seed, config.productRoot)) {
			return { kind: "error", error: usageError(`--seed ${seed} must be under product_root`) };
		}
		if (isIgnoredRepoPath(seed, config.ignoreRoots)) {
			return { kind: "error", error: usageError(`--seed ${seed} must be outside ignore_roots`) };
		}
		if (!isAdmissibleProductFilePath(seed)) {
			return { kind: "error", error: usageError(`--seed ${seed} must be a product file`) };
		}

		const status = statRepoPath(cwd, seed);
		if (status.kind === "inaccessible") {
			return {
				kind: "error",
				error: unsupportedRepoError(`--seed ${seed} existence could not be validated`),
			};
		}
		if (status.kind !== "file") {
			return { kind: "error", error: usageError(`--seed ${seed} must exist as a file`) };
		}
	}

	return { kind: "ok" };
}

export function validateScaffoldOutputPreconditions(
	config: Config,
	output: RepoPath,
	cwd: string,
): { kind: "ok" } | { kind: "error"; error: AppError } {
	if (!config.specRoots.some((specRoot) => isSameOrDescendantOfRepoPath(output, specRoot))) {
		return { kind: "error", error: usageError("--output must be under a spec_root") };
	}

	const parent = getRepoPathParent(output);
	if (parent === undefined) {
		return { kind: "error", error: usageError("--output parent must be an existing directory") };
	}

	const parentStatus = statRepoPath(cwd, parent);
	if (parentStatus.kind !== "directory") {
		return { kind: "error", error: usageError("--output parent must be an existing directory") };
	}

	const createOnly = validateScaffoldOutputDoesNotExist(cwd, output);
	if (createOnly.kind === "error") {
		return createOnly;
	}

	return { kind: "ok" };
}

export function validateScaffoldOutputCaseCollision(
	output: RepoPath,
	inspectedPathCaseIndex: ReadonlyMap<string, RepoPath>,
): { kind: "ok" } | { kind: "error"; error: AppError } {
	const existingPath = inspectedPathCaseIndex.get(repoPathToString(output).toLowerCase());
	if (existingPath !== undefined && existingPath !== output) {
		return { kind: "error", error: usageError("--output conflicts with an existing spec path") };
	}

	return { kind: "ok" };
}

export function validateMapSeedsInProductFiles(
	seeds: readonly string[],
	productFiles: readonly RepoPath[],
): { kind: "ok" } | { kind: "error"; error: AppError } {
	const discoveredProductFiles = new Set(productFiles);

	for (const seedValue of seeds) {
		const seedResult = validateRepoPath(seedValue);
		if (seedResult.kind === "validation_failure") {
			return { kind: "error", error: usageError("--seed must be a valid repository path") };
		}
		if (!discoveredProductFiles.has(seedResult.repoPath)) {
			return {
				kind: "error",
				error: usageError(`--seed ${seedResult.repoPath} is not a discovered product_file`),
			};
		}
	}

	return { kind: "ok" };
}

export function normalizeInitPath(
	value: string,
	optionName: string,
): { kind: "ok"; path: RepoPath } | { kind: "error"; error: AppError } {
	const result = normalizeUserPathArg(value);
	if (result.kind === "validation_failure") {
		return { kind: "error", error: usageError(`${optionName} must be a valid repository path`) };
	}

	return { kind: "ok", path: result.repoPath };
}

export function normalizeInitPathList(
	values: readonly string[],
	optionName: string,
): { kind: "ok"; paths: RepoPath[] } | { kind: "error"; error: AppError } {
	const paths: RepoPath[] = [];
	for (const value of values) {
		const result = normalizeInitPath(value, optionName);
		if (result.kind === "error") {
			return result;
		}
		paths.push(result.path);
	}

	return { kind: "ok", paths };
}

export function findDuplicateRepoPath(paths: readonly RepoPath[]): RepoPath | undefined {
	const duplicate = findDuplicateString(paths.map(repoPathToString));
	return duplicate as RepoPath | undefined;
}

export function findOverlappingRepoPaths(
	paths: readonly RepoPath[],
): { ancestor: RepoPath; descendant: RepoPath } | undefined {
	for (let leftIndex = 0; leftIndex < paths.length; leftIndex += 1) {
		for (let rightIndex = leftIndex + 1; rightIndex < paths.length; rightIndex += 1) {
			const left = paths[leftIndex];
			const right = paths[rightIndex];
			if (isRepoPathDescendantOf(right, left)) {
				return {
					ancestor: left,
					descendant: right,
				};
			}
			if (isRepoPathDescendantOf(left, right)) {
				return {
					ancestor: right,
					descendant: left,
				};
			}
		}
	}

	return undefined;
}

export function validateConfigDoesNotExist(
	cwd: string,
): { kind: "ok" } | { kind: "error"; error: AppError } {
	try {
		lstatSync(join(cwd, ANCHORMAP_CONFIG_FILENAME));
		return { kind: "error", error: usageError("anchormap.yaml already exists") };
	} catch (error) {
		if (isMissingPathError(error)) {
			return { kind: "ok" };
		}
		return { kind: "error", error: usageError("anchormap.yaml existence could not be validated") };
	}
}

export function isRepoPathDescendantOf(path: RepoPath, possibleAncestor: RepoPath): boolean {
	const pathValue = repoPathToString(path);
	const ancestorValue = repoPathToString(possibleAncestor);
	return pathValue.startsWith(`${ancestorValue}/`);
}

function findDuplicateString(values: readonly string[]): string | undefined {
	const seen = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) {
			return value;
		}
		seen.add(value);
	}

	return undefined;
}

function validateScaffoldOutputDoesNotExist(
	cwd: string,
	output: RepoPath,
): { kind: "ok" } | { kind: "error"; error: AppError } {
	try {
		lstatSync(join(cwd, repoPathToString(output)));
		return { kind: "error", error: usageError("--output already exists") };
	} catch (error) {
		if (isMissingPathError(error)) {
			return { kind: "ok" };
		}
		return { kind: "error", error: usageError("--output existence could not be validated") };
	}
}

function getRepoPathParent(path: RepoPath): RepoPath | undefined {
	const value = repoPathToString(path);
	const separatorIndex = value.lastIndexOf("/");
	if (separatorIndex === -1) {
		return undefined;
	}
	const result = validateRepoPath(value.slice(0, separatorIndex));
	return result.kind === "ok" ? result.repoPath : undefined;
}

function isSameOrDescendantOfRepoPath(path: RepoPath, possibleAncestor: RepoPath): boolean {
	return path === possibleAncestor || isRepoPathDescendantOf(path, possibleAncestor);
}

function isIgnoredRepoPath(path: RepoPath, ignoreRoots: readonly RepoPath[]): boolean {
	return ignoreRoots.some(
		(ignoreRoot) => path === ignoreRoot || isRepoPathDescendantOf(path, ignoreRoot),
	);
}

function isAdmissibleProductFilePath(path: RepoPath): boolean {
	return isProductFilePath(path);
}

function isMissingPathError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		((error as { code?: unknown }).code === "ENOENT" ||
			(error as { code?: unknown }).code === "ENOTDIR")
	);
}
