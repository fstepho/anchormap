import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { type AnchorId, validateAnchorId } from "../domain/anchor-id";
import { compareCanonicalTextByUtf8 } from "../domain/canonical-order";
import {
	compareRepoPathsByUtf8,
	type RepoPath,
	repoPathToString,
	validateRepoPath,
} from "../domain/repo-path";
import type { Config } from "./config-io";
import { decodeUtf8StrictNoBom } from "./repo-fs";

interface CommonmarkModule {
	readonly Parser: new (options: { readonly smart: false }) => CommonmarkParser;
}

interface CommonmarkParser {
	readonly parse: (text: string) => CommonmarkNode;
}

interface CommonmarkNode {
	readonly type: string;
	readonly literal: string | null;
	readonly level: number | null;
	readonly sourcepos?: readonly [readonly [number, number], readonly [number, number]];
	readonly firstChild: CommonmarkNode | null;
	readonly next: CommonmarkNode | null;
	readonly walker: () => CommonmarkWalker;
}

interface CommonmarkWalker {
	readonly next: () => CommonmarkWalkerEvent | null;
}

interface CommonmarkWalkerEvent {
	readonly entering: boolean;
	readonly node: CommonmarkNode;
}

const commonmark = require("commonmark") as CommonmarkModule;

export type SpecSourceKind = "markdown" | "yaml";

export interface SpecFile {
	readonly path: RepoPath;
	readonly sourceKind: SpecSourceKind;
	readonly text: string;
}

export interface SpecAnchorOccurrence {
	readonly anchorId: AnchorId;
	readonly specPath: RepoPath;
	readonly sourceKind: SpecSourceKind;
}

export interface SpecIndex {
	readonly specFiles: readonly SpecFile[];
	readonly anchorOccurrences: readonly SpecAnchorOccurrence[];
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

const ANCHOR_PREFIX_PATTERN = /^(?:[A-Z]+-[0-9]{3}|[A-Z][A-Z0-9]*(?:\.[A-Z][A-Z0-9]*)+)(?=$|[ :-])/;

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
	const anchorOccurrences: SpecAnchorOccurrence[] = [];
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
			anchorOccurrences.push(...extractSpecAnchorOccurrences(read.file));
		}
	}

	return {
		kind: "ok",
		specIndex: {
			specFiles: files.sort((left, right) => compareRepoPathsByUtf8(left.path, right.path)),
			anchorOccurrences: anchorOccurrences.sort(compareSpecAnchorOccurrences),
		},
	};
}

function extractSpecAnchorOccurrences(file: SpecFile): readonly SpecAnchorOccurrence[] {
	if (file.sourceKind !== "markdown") {
		return [];
	}

	return extractMarkdownAnchorOccurrences(file);
}

function extractMarkdownAnchorOccurrences(file: SpecFile): readonly SpecAnchorOccurrence[] {
	const sourceLines = splitMarkdownSourceLines(file.text);
	const document = new commonmark.Parser({ smart: false }).parse(file.text);
	const walker = document.walker();
	const occurrences: SpecAnchorOccurrence[] = [];

	let event = walker.next();
	while (event !== null) {
		if (
			!event.entering ||
			event.node.type !== "heading" ||
			!isAtxHeading(event.node, sourceLines)
		) {
			event = walker.next();
			continue;
		}

		const headingText = normalizeMarkdownHeadingText(extractMarkdownInlineText(event.node));
		const anchorId = readAnchorPrefix(headingText);
		if (anchorId === undefined) {
			event = walker.next();
			continue;
		}

		occurrences.push({
			anchorId,
			specPath: file.path,
			sourceKind: "markdown",
		});
		event = walker.next();
	}

	return occurrences;
}

function splitMarkdownSourceLines(text: string): readonly string[] {
	return text.split(/\r\n|\n|\r/);
}

function isAtxHeading(node: CommonmarkNode, sourceLines: readonly string[]): boolean {
	if (node.level === null || node.level < 1 || node.level > 6 || node.sourcepos === undefined) {
		return false;
	}

	const startLine = node.sourcepos[0][0];
	const sourceLine = sourceLines[startLine - 1];
	return sourceLine !== undefined && /^ {0,3}#/.test(sourceLine);
}

function extractMarkdownInlineText(node: CommonmarkNode): string {
	switch (node.type) {
		case "text":
		case "code":
			return node.literal ?? "";
		case "softbreak":
		case "linebreak":
			return " ";
		case "html_inline":
			return "";
		default:
			return extractMarkdownInlineChildText(node);
	}
}

function extractMarkdownInlineChildText(node: CommonmarkNode): string {
	let text = "";
	for (let child = node.firstChild; child !== null; child = child.next) {
		text += extractMarkdownInlineText(child);
	}
	return text;
}

function normalizeMarkdownHeadingText(text: string): string {
	return text.trim().replace(/[\t\n\r ]+/g, " ");
}

function readAnchorPrefix(text: string): AnchorId | undefined {
	const match = ANCHOR_PREFIX_PATTERN.exec(text);
	if (match === null) {
		return undefined;
	}

	const result = validateAnchorId(match[0]);
	if (result.kind === "validation_failure") {
		return undefined;
	}

	return result.anchorId;
}

function compareSpecAnchorOccurrences(
	left: SpecAnchorOccurrence,
	right: SpecAnchorOccurrence,
): number {
	const anchorComparison = compareCanonicalTextByUtf8(left.anchorId, right.anchorId);
	if (anchorComparison !== 0) {
		return anchorComparison;
	}

	return compareRepoPathsByUtf8(left.specPath, right.specPath);
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
