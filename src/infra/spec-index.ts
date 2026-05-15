import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isMap, isScalar, parseAllDocuments, type YAMLMap } from "yaml";

import { ANCHOR_ID_PATTERN_SOURCE, type AnchorId, validateAnchorId } from "../domain/anchor-id";
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
export type SpecAnchorStatus = "active" | "draft";

export type AnchorSourceLocation =
	| {
			readonly kind: "markdown_atx_heading";
			readonly line: number;
			readonly column: number;
			readonly heading_level: number;
	  }
	| {
			readonly kind: "yaml_root_id";
			readonly line: number;
			readonly column: number;
	  };

export interface SpecFile {
	readonly path: RepoPath;
	readonly sourceKind: SpecSourceKind;
	readonly text: string;
}

export interface SpecAnchorOccurrence {
	readonly anchorId: AnchorId;
	readonly specPath: RepoPath;
	readonly sourceKind: SpecSourceKind;
	readonly status: SpecAnchorStatus;
	readonly sourceLocation?: AnchorSourceLocation;
}

export interface SpecIndex {
	readonly specFiles: readonly SpecFile[];
	readonly observedAnchors: ReadonlyMap<AnchorId, SpecAnchorOccurrence>;
	readonly activeAnchors: ReadonlyMap<AnchorId, SpecAnchorOccurrence>;
	readonly draftAnchors: ReadonlyMap<AnchorId, SpecAnchorOccurrence>;
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
	readonly inspectedPathCaseIndex?: Map<string, RepoPath>;
}

const SPEC_EXTENSIONS = new Map<string, SpecSourceKind>([
	[".md", "markdown"],
	[".yml", "yaml"],
	[".yaml", "yaml"],
]);

const DRAFT_MARKER = "<!-- anchormap: draft -->";
const ANCHOR_PREFIX_PATTERN = new RegExp(`^(?:${ANCHOR_ID_PATTERN_SOURCE})(?=$|[ :-])`);

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
	const seenLowercasePaths = options.inspectedPathCaseIndex ?? new Map<string, RepoPath>();

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
			const extracted = extractSpecAnchorOccurrences(read.file);
			if (extracted.kind === "error") {
				return extracted;
			}
			anchorOccurrences.push(...extracted.occurrences);
		}
	}

	const sortedAnchorOccurrences = anchorOccurrences.sort(compareSpecAnchorOccurrences);
	const indexedAnchors = indexAnchorOccurrences(sortedAnchorOccurrences);
	if (indexedAnchors.kind === "error") {
		return indexedAnchors;
	}

	return {
		kind: "ok",
		specIndex: {
			specFiles: files.sort((left, right) => compareRepoPathsByUtf8(left.path, right.path)),
			observedAnchors: indexedAnchors.observedAnchors,
			activeAnchors: indexedAnchors.activeAnchors,
			draftAnchors: indexedAnchors.draftAnchors,
			anchorOccurrences: sortedAnchorOccurrences,
		},
	};
}

function indexAnchorOccurrences(occurrences: readonly SpecAnchorOccurrence[]):
	| {
			kind: "ok";
			observedAnchors: ReadonlyMap<AnchorId, SpecAnchorOccurrence>;
			activeAnchors: ReadonlyMap<AnchorId, SpecAnchorOccurrence>;
			draftAnchors: ReadonlyMap<AnchorId, SpecAnchorOccurrence>;
	  }
	| { kind: "error"; error: SpecIndexError } {
	const activeAnchors = new Map<AnchorId, SpecAnchorOccurrence>();
	const draftAnchors = new Map<AnchorId, SpecAnchorOccurrence>();

	for (const occurrence of occurrences) {
		if (occurrence.status === "draft") {
			if (!draftAnchors.has(occurrence.anchorId)) {
				draftAnchors.set(occurrence.anchorId, occurrence);
			}
			continue;
		}

		const existing = activeAnchors.get(occurrence.anchorId);
		if (existing !== undefined) {
			return specUnsupportedError(
				`duplicate spec anchor ${occurrence.anchorId} in ${existing.specPath} and ${occurrence.specPath}`,
			);
		}

		activeAnchors.set(occurrence.anchorId, occurrence);
	}

	const observedAnchors = new Map(activeAnchors);
	for (const [anchorId, occurrence] of draftAnchors) {
		if (!observedAnchors.has(anchorId)) {
			observedAnchors.set(anchorId, occurrence);
		}
	}

	return { kind: "ok", observedAnchors, activeAnchors, draftAnchors };
}

function extractSpecAnchorOccurrences(
	file: SpecFile,
):
	| { kind: "ok"; occurrences: readonly SpecAnchorOccurrence[] }
	| { kind: "error"; error: SpecIndexError } {
	if (file.sourceKind === "markdown") {
		return { kind: "ok", occurrences: extractMarkdownAnchorOccurrences(file) };
	}

	return extractYamlAnchorOccurrences(file);
}

function extractMarkdownAnchorOccurrences(file: SpecFile): readonly SpecAnchorOccurrence[] {
	const sourceLines = splitMarkdownSourceLines(file.text);
	const status: SpecAnchorStatus = isDraftMarkdownSpecFile(sourceLines) ? "draft" : "active";
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

		const rawHeadingText = extractMarkdownInlineText(event.node);
		const headingText = normalizeMarkdownHeadingText(rawHeadingText);
		const anchorId = readAnchorPrefix(headingText);
		if (anchorId === undefined) {
			event = walker.next();
			continue;
		}
		const sourcepos = event.node.sourcepos;
		const headingLevel = event.node.level;
		if (sourcepos === undefined || headingLevel === null) {
			event = walker.next();
			continue;
		}

		occurrences.push({
			anchorId,
			specPath: file.path,
			sourceKind: "markdown",
			status,
			sourceLocation: {
				kind: "markdown_atx_heading",
				line: sourcepos[0][0],
				column: locateMarkdownAnchorColumn(
					sourceLines[sourcepos[0][0] - 1],
					anchorId,
					event.node,
					rawHeadingText,
				),
				heading_level: headingLevel,
			},
		});
		event = walker.next();
	}

	return occurrences;
}

function isDraftMarkdownSpecFile(sourceLines: readonly string[]): boolean {
	for (const line of sourceLines) {
		if (line.trim() === "") {
			continue;
		}
		return line === DRAFT_MARKER;
	}

	return false;
}

function splitMarkdownSourceLines(text: string): readonly string[] {
	return text.split(/\r\n|\n|\r/);
}

interface MarkdownInlineSourceSegment {
	readonly kind: "visible" | "ignored";
	readonly text: string;
}

function locateMarkdownAnchorColumn(
	sourceLine: string,
	anchorId: AnchorId,
	headingNode: CommonmarkNode,
	rawHeadingText: string,
): number {
	const marker = /^( {0,3}#{1,6})(?:[ \t]+|$)/.exec(sourceLine);
	const contentStart = marker === null ? 0 : marker[0].length;
	const mappedOffset = locateMarkdownVisibleAnchorOffset(
		sourceLine,
		contentStart,
		headingNode,
		rawHeadingText,
		anchorId,
	);
	if (mappedOffset !== undefined) {
		return mappedOffset + 1;
	}

	const anchorIndex = sourceLine.indexOf(anchorId, contentStart);

	return (anchorIndex === -1 ? contentStart : anchorIndex) + 1;
}

function locateMarkdownVisibleAnchorOffset(
	sourceLine: string,
	contentStart: number,
	headingNode: CommonmarkNode,
	rawHeadingText: string,
	anchorId: AnchorId,
): number | undefined {
	const visibleAnchorIndex = rawHeadingText.indexOf(anchorId);
	if (visibleAnchorIndex === -1) {
		return undefined;
	}

	const rawOffsetsByVisibleOffset: number[] = [];
	let rawSearchStart = contentStart;
	for (const segment of markdownInlineSourceSegments(headingNode)) {
		if (segment.text === "") {
			continue;
		}

		if (segment.kind === "ignored") {
			const mappedIgnoredSegment = locateMarkdownIgnoredInlineSourceSegment(
				sourceLine,
				rawSearchStart,
				segment.text,
			);
			if (mappedIgnoredSegment !== undefined) {
				rawSearchStart = mappedIgnoredSegment.rawEndOffset;
			}
			continue;
		}

		const mappedSegment = locateMarkdownInlineSourceSegment(
			sourceLine,
			rawSearchStart,
			segment.text,
		);
		if (mappedSegment === undefined) {
			continue;
		}

		rawOffsetsByVisibleOffset.push(...mappedSegment.rawOffsetsByVisibleOffset);
		rawSearchStart = mappedSegment.rawEndOffset;
	}

	return rawOffsetsByVisibleOffset[visibleAnchorIndex];
}

function locateMarkdownIgnoredInlineSourceSegment(
	sourceLine: string,
	rawSearchStart: number,
	rawText: string,
): { readonly rawEndOffset: number } | undefined {
	const exactRawOffset = sourceLine.indexOf(rawText, rawSearchStart);
	if (exactRawOffset !== -1) {
		return { rawEndOffset: exactRawOffset + rawText.length };
	}

	const htmlStartOffset = sourceLine.indexOf("<", rawSearchStart);
	if (htmlStartOffset === -1) {
		return undefined;
	}

	const rawEndOffset = locateMarkdownHtmlInlineEndOffset(sourceLine, htmlStartOffset, rawText);
	return rawEndOffset === undefined ? undefined : { rawEndOffset };
}

function locateMarkdownHtmlInlineEndOffset(
	sourceLine: string,
	rawStartOffset: number,
	rawText: string,
): number | undefined {
	if (rawText.startsWith("<!--") || sourceLine.startsWith("<!--", rawStartOffset)) {
		const commentEndOffset = sourceLine.indexOf("-->", rawStartOffset + "<!--".length);
		return commentEndOffset === -1 ? undefined : commentEndOffset + "-->".length;
	}

	if (rawText.startsWith("<![CDATA[") || sourceLine.startsWith("<![CDATA[", rawStartOffset)) {
		const cdataEndOffset = sourceLine.indexOf("]]>", rawStartOffset + "<![CDATA[".length);
		return cdataEndOffset === -1 ? undefined : cdataEndOffset + "]]>".length;
	}

	if (rawText.startsWith("<?") || sourceLine.startsWith("<?", rawStartOffset)) {
		const processingInstructionEndOffset = sourceLine.indexOf("?>", rawStartOffset + "<?".length);
		return processingInstructionEndOffset === -1
			? undefined
			: processingInstructionEndOffset + "?>".length;
	}

	const tagEndOffset = sourceLine.indexOf(">", rawStartOffset + 1);
	return tagEndOffset === -1 ? undefined : tagEndOffset + 1;
}

function locateMarkdownInlineSourceSegment(
	sourceLine: string,
	rawSearchStart: number,
	visibleText: string,
):
	| {
			readonly rawOffsetsByVisibleOffset: readonly number[];
			readonly rawEndOffset: number;
	  }
	| undefined {
	for (let rawOffset = rawSearchStart; rawOffset < sourceLine.length; rawOffset += 1) {
		const match = matchMarkdownVisibleTextAtRawOffset(sourceLine, rawOffset, visibleText);
		if (match !== undefined) {
			return match;
		}
	}

	return undefined;
}

function matchMarkdownVisibleTextAtRawOffset(
	sourceLine: string,
	rawStartOffset: number,
	visibleText: string,
):
	| {
			readonly rawOffsetsByVisibleOffset: readonly number[];
			readonly rawEndOffset: number;
	  }
	| undefined {
	const rawOffsetsByVisibleOffset: number[] = [];
	let rawOffset = rawStartOffset;
	let visibleOffset = 0;

	while (visibleOffset < visibleText.length) {
		const characterReference = readCommonmarkCharacterReference(sourceLine, rawOffset);
		if (
			characterReference !== undefined &&
			visibleText.startsWith(characterReference.decodedText, visibleOffset)
		) {
			for (let index = 0; index < characterReference.decodedText.length; index += 1) {
				rawOffsetsByVisibleOffset.push(rawOffset);
			}
			rawOffset = characterReference.rawEndOffset;
			visibleOffset += characterReference.decodedText.length;
			continue;
		}

		if (sourceLine[rawOffset] !== visibleText[visibleOffset]) {
			return undefined;
		}

		rawOffsetsByVisibleOffset.push(rawOffset);
		rawOffset += 1;
		visibleOffset += 1;
	}

	return { rawOffsetsByVisibleOffset, rawEndOffset: rawOffset };
}

const COMMONMARK_CHARACTER_REFERENCE_PATTERN =
	/^&(?:#x[a-f0-9]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,31});/i;

const NAMED_COMMONMARK_CHARACTER_REFERENCES: ReadonlyMap<string, string> = new Map([
	["amp", "&"],
	["apos", "'"],
	["gt", ">"],
	["lt", "<"],
	["period", "."],
	["quot", '"'],
	["UnderBar", "_"],
]);

function readCommonmarkCharacterReference(
	sourceLine: string,
	rawOffset: number,
):
	| {
			readonly decodedText: string;
			readonly rawEndOffset: number;
	  }
	| undefined {
	const match = COMMONMARK_CHARACTER_REFERENCE_PATTERN.exec(sourceLine.slice(rawOffset));
	if (match === null) {
		return undefined;
	}

	const rawReference = match[0];
	const decodedText = decodeCommonmarkCharacterReference(rawReference);
	if (decodedText === undefined || decodedText === "") {
		return undefined;
	}

	return {
		decodedText,
		rawEndOffset: rawOffset + rawReference.length,
	};
}

function decodeCommonmarkCharacterReference(rawReference: string): string | undefined {
	const body = rawReference.slice(1, -1);
	if (body.startsWith("#x") || body.startsWith("#X")) {
		return decodeCommonmarkNumericCharacterReference(body.slice(2), 16);
	}
	if (body.startsWith("#")) {
		return decodeCommonmarkNumericCharacterReference(body.slice(1), 10);
	}

	return NAMED_COMMONMARK_CHARACTER_REFERENCES.get(body);
}

function decodeCommonmarkNumericCharacterReference(digits: string, radix: 10 | 16): string {
	const codePoint = Number.parseInt(digits, radix);
	if (codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
		return "\uFFFD";
	}

	return String.fromCodePoint(codePoint);
}

function markdownInlineSourceSegments(
	node: CommonmarkNode,
): readonly MarkdownInlineSourceSegment[] {
	const segments: MarkdownInlineSourceSegment[] = [];
	appendMarkdownInlineSourceSegments(node, segments);
	return segments;
}

function appendMarkdownInlineSourceSegments(
	node: CommonmarkNode,
	segments: MarkdownInlineSourceSegment[],
): void {
	switch (node.type) {
		case "text":
		case "code":
			segments.push({ kind: "visible", text: node.literal ?? "" });
			return;
		case "softbreak":
		case "linebreak":
			segments.push({ kind: "visible", text: " " });
			return;
		case "html_inline":
			segments.push({ kind: "ignored", text: node.literal ?? "" });
			return;
		default:
			for (let child = node.firstChild; child !== null; child = child.next) {
				appendMarkdownInlineSourceSegments(child, segments);
			}
	}
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

	const anchorText = match[0];
	const result = validateAnchorId(anchorText);
	if (result.kind === "validation_failure") {
		return undefined;
	}

	return result.anchorId;
}

function extractYamlAnchorOccurrences(
	file: SpecFile,
):
	| { kind: "ok"; occurrences: readonly SpecAnchorOccurrence[] }
	| { kind: "error"; error: SpecIndexError } {
	const yaml = parseSpecYamlText(file.text, file.path);
	if (yaml.kind === "error") {
		return yaml;
	}

	const id = readYamlRootId(yaml.root, file.text);
	if (id === undefined) {
		return { kind: "ok", occurrences: [] };
	}
	const sourcePosition = lineAndColumnForOffset(file.text, id.valueOffset);

	return {
		kind: "ok",
		occurrences: [
			{
				anchorId: id.anchorId,
				specPath: file.path,
				sourceKind: "yaml",
				status: "active",
				sourceLocation: {
					kind: "yaml_root_id",
					line: sourcePosition.line,
					column: sourcePosition.column,
				},
			},
		],
	};
}

function parseSpecYamlText(
	text: string,
	path: RepoPath,
): { kind: "ok"; root: unknown } | { kind: "error"; error: SpecIndexError } {
	let documents: ReturnType<typeof parseAllDocuments>;

	try {
		documents = parseAllDocuments(text, {
			version: "1.2",
			uniqueKeys: true,
			keepSourceTokens: true,
		});
	} catch (error) {
		return specUnsupportedError(`spec YAML ${path} is invalid YAML`, error);
	}

	if (documents.length !== 1) {
		return specUnsupportedError(`spec YAML ${path} must contain exactly one YAML document`);
	}

	const [document] = documents;
	if (document.errors.length > 0) {
		return specUnsupportedError(`spec YAML ${path} is invalid YAML`, document.errors[0]);
	}

	const yamlVersionViolation = getYamlVersionDirectiveViolation(document);
	if (yamlVersionViolation !== undefined) {
		return specUnsupportedError(`spec YAML ${path} must use YAML 1.2`, yamlVersionViolation);
	}

	return {
		kind: "ok",
		root: document.contents,
	};
}

function readYamlRootId(
	root: unknown,
	sourceText: string,
): { readonly anchorId: AnchorId; readonly valueOffset: number } | undefined {
	if (!isMap(root)) {
		return undefined;
	}

	const value = readYamlMappingValue(root, "id");
	if (!isScalar(value) || typeof value.value !== "string") {
		return undefined;
	}

	const result = validateAnchorId(value.value);
	if (result.kind === "validation_failure") {
		return undefined;
	}

	return {
		anchorId: result.anchorId,
		valueOffset: yamlScalarValueOffset(value, sourceText),
	};
}

function yamlScalarValueOffset(
	value: {
		readonly value?: unknown;
		readonly range?: readonly number[] | null;
		readonly srcToken?: {
			readonly type?: string;
			readonly offset?: number;
			readonly source?: string;
		};
	},
	sourceText: string,
): number {
	const offset = value.range?.[0] ?? 0;
	const tokenOffset = value.srcToken?.offset ?? offset;
	const tokenSource = value.srcToken?.source;
	if (typeof value.value === "string") {
		const tokenSourceOffset = yamlScalarTokenSourceOffset(value, sourceText, tokenOffset);
		if (tokenSource !== undefined) {
			const relativeValueOffset = tokenSource.indexOf(value.value);
			if (relativeValueOffset !== -1) {
				return tokenSourceOffset + relativeValueOffset;
			}

			return yamlScalarFallbackValueOffset(
				value.srcToken?.type,
				sourceText,
				tokenSourceOffset,
				tokenSource,
			);
		}

		const tokenEnd = value.range?.[1] ?? sourceText.length;
		const relativeValueOffset = sourceText.slice(tokenOffset, tokenEnd).indexOf(value.value);
		if (relativeValueOffset !== -1) {
			return tokenOffset + relativeValueOffset;
		}
	}

	return yamlScalarFallbackValueOffset(value.srcToken?.type, sourceText, tokenOffset, tokenSource);
}

function yamlScalarTokenSourceOffset(
	value: {
		readonly range?: readonly number[] | null;
		readonly srcToken?: {
			readonly source?: string;
		};
	},
	sourceText: string,
	tokenOffset: number,
): number {
	const tokenSource = value.srcToken?.source;
	if (tokenSource === undefined || sourceText.startsWith(tokenSource, tokenOffset)) {
		return tokenOffset;
	}

	const rangeEnd = value.range?.[1] ?? sourceText.length;
	const relativeTokenSourceOffset = sourceText.slice(tokenOffset, rangeEnd).indexOf(tokenSource);
	if (relativeTokenSourceOffset === -1) {
		return tokenOffset;
	}

	return tokenOffset + relativeTokenSourceOffset;
}

function yamlScalarFallbackValueOffset(
	tokenType: string | undefined,
	sourceText: string,
	tokenSourceOffset: number,
	tokenSource: string | undefined,
): number {
	if (tokenType === "block-scalar" && tokenSource !== undefined) {
		for (
			let index = tokenSourceOffset;
			index < tokenSourceOffset + tokenSource.length;
			index += 1
		) {
			const character = sourceText[index];
			if (character !== " " && character !== "\t" && character !== "\r" && character !== "\n") {
				return index;
			}
		}
	}

	const firstCharacter = sourceText[tokenSourceOffset];
	if (firstCharacter === "'" || firstCharacter === '"') {
		return tokenSourceOffset + 1;
	}

	return tokenSourceOffset;
}

function lineAndColumnForOffset(
	sourceText: string,
	offset: number,
): { readonly line: number; readonly column: number } {
	let line = 1;
	let lineStart = 0;

	for (let index = 0; index < offset; index += 1) {
		const char = sourceText[index];
		if (char === "\n") {
			line += 1;
			lineStart = index + 1;
			continue;
		}
		if (char === "\r") {
			line += 1;
			lineStart = index + 1;
			if (sourceText[index + 1] === "\n") {
				index += 1;
				lineStart = index + 1;
			}
		}
	}

	return { line, column: offset - lineStart + 1 };
}

function readYamlMappingValue(root: YAMLMap, keyValue: string): unknown {
	for (const item of root.items) {
		const pair = item as { key: unknown; value: unknown };
		if (isScalar(pair.key) && pair.key.value === keyValue) {
			return pair.value;
		}
	}

	return undefined;
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
