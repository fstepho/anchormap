import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
	compareRepoPathsByUtf8,
	type RepoPath,
	repoPathToString,
	validateRepoPath,
} from "../domain/repo-path";
import type { Config } from "./config-io";
import { decodeUtf8StrictNoBom } from "./repo-fs";

export type SpecSourceKind = "markdown" | "yaml";

export interface SpecFile {
	readonly path: RepoPath;
	readonly sourceKind: SpecSourceKind;
	readonly text: string;
}

export interface SpecIndex {
	readonly specFiles: readonly SpecFile[];
}

export type BuildSpecIndexResult =
	| { kind: "ok"; specIndex: SpecIndex }
	| { kind: "error"; error: SpecIndexError };

export interface SpecIndexError {
	readonly kind: "UnsupportedRepoError";
	readonly message?: string;
	readonly cause?: unknown;
}

export interface SpecIndexFs {
	readonly lstat: (path: string) => SpecIndexStats;
	readonly readdir: (path: string) => readonly string[];
	readonly readFile: (path: string) => Uint8Array;
}

export interface SpecIndexStats {
	readonly isDirectory: () => boolean;
	readonly isFile: () => boolean;
	readonly isSymbolicLink: () => boolean;
}

export interface BuildSpecIndexOptions {
	readonly cwd?: string;
	readonly fs?: SpecIndexFs;
}

const SPEC_EXTENSIONS = new Map<string, SpecSourceKind>([
	[".md", "markdown"],
	[".yml", "yaml"],
	[".yaml", "yaml"],
]);

const nodeSpecIndexFs: SpecIndexFs = {
	lstat: lstatSync,
	readdir: (path) => readdirSync(path),
	readFile: readFileSync,
};

export function buildSpecIndex(
	config: Config,
	options: BuildSpecIndexOptions = {},
): BuildSpecIndexResult {
	const cwd = options.cwd ?? process.cwd();
	const fs = options.fs ?? nodeSpecIndexFs;
	const files: SpecFile[] = [];
	const seenLowercasePaths = new Map<string, RepoPath>();

	for (const specRoot of config.specRoots) {
		const discovered = discoverSpecFiles(cwd, specRoot, fs, seenLowercasePaths);
		if (discovered.kind === "error") {
			return discovered;
		}

		for (const entry of discovered.files) {
			const read = readSpecFile(cwd, entry, fs);
			if (read.kind === "error") {
				return read;
			}
			files.push(read.file);
		}
	}

	return {
		kind: "ok",
		specIndex: {
			specFiles: files.sort((left, right) => compareRepoPathsByUtf8(left.path, right.path)),
		},
	};
}

function discoverSpecFiles(
	cwd: string,
	specRoot: RepoPath,
	fs: SpecIndexFs,
	seenLowercasePaths: Map<string, RepoPath>,
): { kind: "ok"; files: RepoPath[] } | { kind: "error"; error: SpecIndexError } {
	const files: RepoPath[] = [];
	const pending: RepoPath[] = [specRoot];

	for (let index = 0; index < pending.length; index += 1) {
		const current = pending[index];
		const currentPath = join(cwd, repoPathToString(current));
		const stats = lstatSpecPath(currentPath);
		if (stats.kind === "error") {
			return stats;
		}
		if (stats.stats.isSymbolicLink()) {
			return specUnsupportedError(`spec subtree contains symlink ${current}`);
		}

		const collision = recordCaseCollision(current, seenLowercasePaths);
		if (collision.kind === "error") {
			return collision;
		}

		if (stats.stats.isDirectory()) {
			const children = readdirSpecDirectory(currentPath);
			if (children.kind === "error") {
				return children;
			}

			const childPaths: RepoPath[] = [];
			for (const childName of children.names) {
				const childPath = appendChildRepoPath(current, childName);
				if (childPath.kind === "error") {
					return childPath;
				}
				childPaths.push(childPath.repoPath);
			}

			childPaths.sort(compareRepoPathsByUtf8);
			pending.push(...childPaths);
			continue;
		}

		if (stats.stats.isFile() && specSourceKindForPath(current) !== undefined) {
			files.push(current);
		}
	}

	return {
		kind: "ok",
		files: files.sort(compareRepoPathsByUtf8),
	};

	function lstatSpecPath(
		path: string,
	): { kind: "ok"; stats: SpecIndexStats } | { kind: "error"; error: SpecIndexError } {
		try {
			return { kind: "ok", stats: fs.lstat(path) };
		} catch (error) {
			return specUnsupportedError("cannot inspect spec subtree", error);
		}
	}

	function readdirSpecDirectory(
		path: string,
	): { kind: "ok"; names: readonly string[] } | { kind: "error"; error: SpecIndexError } {
		try {
			return { kind: "ok", names: fs.readdir(path) };
		} catch (error) {
			return specUnsupportedError("cannot enumerate spec subtree", error);
		}
	}
}

function readSpecFile(
	cwd: string,
	path: RepoPath,
	fs: SpecIndexFs,
): { kind: "ok"; file: SpecFile } | { kind: "error"; error: SpecIndexError } {
	let bytes: Uint8Array;
	try {
		bytes = fs.readFile(join(cwd, repoPathToString(path)));
	} catch (error) {
		return specUnsupportedError(`cannot read spec file ${path}`, error);
	}

	const decoded = decodeUtf8StrictNoBom(bytes);
	if (decoded.kind === "decode_error") {
		return specUnsupportedError(`spec file ${path} is not valid UTF-8`, decoded.error);
	}

	const sourceKind = specSourceKindForPath(path);
	if (sourceKind === undefined) {
		return specUnsupportedError(`unsupported spec file extension ${path}`);
	}

	return {
		kind: "ok",
		file: {
			path,
			sourceKind,
			text: decoded.text,
		},
	};
}

function appendChildRepoPath(
	parent: RepoPath,
	childName: string,
): { kind: "ok"; repoPath: RepoPath } | { kind: "error"; error: SpecIndexError } {
	const result = validateRepoPath(`${repoPathToString(parent)}/${childName}`);
	if (result.kind === "validation_failure") {
		return specUnsupportedError(`spec subtree contains non-canonical path ${childName}`);
	}

	return {
		kind: "ok",
		repoPath: result.repoPath,
	};
}

function recordCaseCollision(
	path: RepoPath,
	seenLowercasePaths: Map<string, RepoPath>,
): { kind: "ok" } | { kind: "error"; error: SpecIndexError } {
	const lowercasePath = repoPathToString(path).toLowerCase();
	const existing = seenLowercasePaths.get(lowercasePath);
	if (existing !== undefined && existing !== path) {
		return specUnsupportedError(`spec subtree contains case collision ${existing} and ${path}`);
	}
	seenLowercasePaths.set(lowercasePath, path);

	return { kind: "ok" };
}

function specSourceKindForPath(path: RepoPath): SpecSourceKind | undefined {
	const value = repoPathToString(path);
	for (const [extension, sourceKind] of SPEC_EXTENSIONS) {
		if (value.endsWith(extension)) {
			return sourceKind;
		}
	}

	return undefined;
}

function specUnsupportedError(
	message: string,
	cause?: unknown,
): { kind: "error"; error: SpecIndexError } {
	return {
		kind: "error",
		error: {
			kind: "UnsupportedRepoError",
			message,
			cause,
		},
	};
}
