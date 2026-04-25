import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
	compareRepoPathsByUtf8,
	type RepoPath,
	repoPathToString,
	validateRepoPath,
} from "../domain/repo-path";
import type { Config } from "./config-io";

export interface ProductFileDiscoveryError {
	readonly kind: "UnsupportedRepoError";
	readonly message?: string;
	readonly cause?: unknown;
}

export type DiscoverProductFilesResult =
	| { kind: "ok"; productFiles: readonly RepoPath[] }
	| { kind: "error"; error: ProductFileDiscoveryError };

export interface ProductFileDiscoveryFs {
	readonly lstat: (path: string) => ProductFileDiscoveryStats;
	readonly readdir: (path: string) => readonly string[];
}

export interface ProductFileDiscoveryStats {
	readonly isDirectory: () => boolean;
	readonly isFile: () => boolean;
	readonly isSymbolicLink: () => boolean;
}

export interface DiscoverProductFilesOptions {
	readonly cwd?: string;
	readonly fs?: ProductFileDiscoveryFs;
	readonly inspectedPathCaseIndex?: Map<string, RepoPath>;
}

const nodeProductFileDiscoveryFs: ProductFileDiscoveryFs = {
	lstat: lstatSync,
	readdir: (path) => readdirSync(path),
};

export function discoverProductFiles(
	config: Config,
	options: DiscoverProductFilesOptions = {},
): DiscoverProductFilesResult {
	const cwd = options.cwd ?? process.cwd();
	const fs = options.fs ?? nodeProductFileDiscoveryFs;
	const productFiles: RepoPath[] = [];
	const pending: RepoPath[] = [config.productRoot];
	const seenLowercasePaths = options.inspectedPathCaseIndex ?? new Map<string, RepoPath>();

	for (let index = 0; index < pending.length; index += 1) {
		const current = pending[index];
		if (isIgnoredPath(current, config.ignoreRoots)) {
			continue;
		}

		const currentPath = join(cwd, repoPathToString(current));
		const stats = lstatProductPath(currentPath);
		if (stats.kind === "error") {
			return stats;
		}
		if (stats.stats.isSymbolicLink()) {
			return productDiscoveryUnsupportedError(`product subtree contains symlink ${current}`);
		}

		const collision = recordCaseCollision(current, seenLowercasePaths);
		if (collision.kind === "error") {
			return collision;
		}

		if (stats.stats.isDirectory()) {
			const children = readdirProductDirectory(currentPath);
			if (children.kind === "error") {
				return children;
			}

			const childPaths: RepoPath[] = [];
			for (const childName of children.names) {
				const childPath = appendChildRepoPath(current, childName);
				if (childPath.kind === "error") {
					return childPath;
				}
				if (!isIgnoredPath(childPath.repoPath, config.ignoreRoots)) {
					childPaths.push(childPath.repoPath);
				}
			}

			childPaths.sort(compareRepoPathsByUtf8);
			pending.push(...childPaths);
			continue;
		}

		if (stats.stats.isFile() && isProductFilePath(current)) {
			productFiles.push(current);
		}
	}

	return {
		kind: "ok",
		productFiles: productFiles.sort(compareRepoPathsByUtf8),
	};

	function lstatProductPath(
		path: string,
	):
		| { kind: "ok"; stats: ProductFileDiscoveryStats }
		| { kind: "error"; error: ProductFileDiscoveryError } {
		try {
			return { kind: "ok", stats: fs.lstat(path) };
		} catch (error) {
			return productDiscoveryUnsupportedError("cannot inspect product subtree", error);
		}
	}

	function readdirProductDirectory(
		path: string,
	):
		| { kind: "ok"; names: readonly string[] }
		| { kind: "error"; error: ProductFileDiscoveryError } {
		try {
			return { kind: "ok", names: fs.readdir(path) };
		} catch (error) {
			return productDiscoveryUnsupportedError("cannot enumerate product subtree", error);
		}
	}
}

function appendChildRepoPath(
	parent: RepoPath,
	childName: string,
): { kind: "ok"; repoPath: RepoPath } | { kind: "error"; error: ProductFileDiscoveryError } {
	const result = validateRepoPath(`${repoPathToString(parent)}/${childName}`);
	if (result.kind === "validation_failure") {
		return productDiscoveryUnsupportedError(
			`product subtree contains non-canonical path ${childName}`,
		);
	}

	return {
		kind: "ok",
		repoPath: result.repoPath,
	};
}

function recordCaseCollision(
	path: RepoPath,
	seenLowercasePaths: Map<string, RepoPath>,
): { kind: "ok" } | { kind: "error"; error: ProductFileDiscoveryError } {
	const lowercasePath = repoPathToString(path).toLowerCase();
	const existing = seenLowercasePaths.get(lowercasePath);
	if (existing !== undefined && existing !== path) {
		return productDiscoveryUnsupportedError(
			`product subtree contains case collision ${existing} and ${path}`,
		);
	}
	seenLowercasePaths.set(lowercasePath, path);

	return { kind: "ok" };
}

function isIgnoredPath(path: RepoPath, ignoreRoots: readonly RepoPath[]): boolean {
	return ignoreRoots.some((ignoreRoot) => path === ignoreRoot || isDescendantOf(path, ignoreRoot));
}

function isDescendantOf(path: RepoPath, possibleAncestor: RepoPath): boolean {
	const pathValue = repoPathToString(path);
	const ancestorValue = repoPathToString(possibleAncestor);
	return pathValue.startsWith(`${ancestorValue}/`);
}

function isProductFilePath(path: RepoPath): boolean {
	const value = repoPathToString(path);
	return value.endsWith(".ts") && !value.endsWith(".d.ts");
}

function productDiscoveryUnsupportedError(
	message: string,
	cause?: unknown,
): { kind: "error"; error: ProductFileDiscoveryError } {
	return {
		kind: "error",
		error: {
			kind: "UnsupportedRepoError",
			message,
			cause,
		},
	};
}
