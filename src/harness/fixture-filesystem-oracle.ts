import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { FilesystemOracle, LoadedFixtureManifest } from "./fixture-manifest";
import {
	captureFilesystemSnapshot,
	type FilesystemSnapshotEntry,
	type MaterializedFixtureSandbox,
} from "./fixture-sandbox";

interface SnapshotEntryChange {
	path: string;
	before: FilesystemSnapshotEntry;
	after: FilesystemSnapshotEntry;
}

export interface FilesystemMutationDiff {
	added: FilesystemSnapshotEntry[];
	removed: FilesystemSnapshotEntry[];
	changed: SnapshotEntryChange[];
	typeChanged: SnapshotEntryChange[];
}

export class FixtureFilesystemOracleError extends Error {
	readonly fixtureId: string;
	readonly oracleKind: FilesystemOracle["kind"];

	constructor(options: {
		fixtureId: string;
		oracleKind: FilesystemOracle["kind"];
		message: string;
	}) {
		super(options.message);
		this.name = "FixtureFilesystemOracleError";
		this.fixtureId = options.fixtureId;
		this.oracleKind = options.oracleKind;
	}
}

export function assertFixtureFilesystemOracle(
	fixture: LoadedFixtureManifest,
	sandbox: MaterializedFixtureSandbox,
): void {
	const postRunSnapshot = captureFilesystemSnapshot(sandbox.sandboxDir);
	const diff = diffFilesystemSnapshots(sandbox.preRunSnapshot, postRunSnapshot);

	switch (fixture.manifest.filesystem.kind) {
		case "no_mutation":
			assertNoMutationFilesystemOracle(fixture, diff);
			return;
		case "expected_files":
			assertExpectedFilesFilesystemOracle(fixture, postRunSnapshot, diff);
			return;
	}
}

function assertNoMutationFilesystemOracle(
	fixture: LoadedFixtureManifest,
	diff: FilesystemMutationDiff,
): void {
	if (!hasFilesystemDiff(diff)) {
		return;
	}

	throw new FixtureFilesystemOracleError({
		fixtureId: fixture.manifest.id,
		oracleKind: "no_mutation",
		message: buildFilesystemDiffMessage(
			fixture.manifest.id,
			'filesystem.kind "no_mutation" forbids repository mutations',
			diff,
		),
	});
}

function assertExpectedFilesFilesystemOracle(
	fixture: LoadedFixtureManifest,
	postRunSnapshot: FilesystemSnapshotEntry[],
	diff: FilesystemMutationDiff,
): void {
	const filesystemOracle = fixture.manifest.filesystem as Extract<
		FilesystemOracle,
		{ kind: "expected_files" }
	>;
	const snapshotByPath = new Map(postRunSnapshot.map((entry) => [entry.path, entry]));
	const allowedPaths = buildAllowedMutationPathSet(filesystemOracle.files);
	const unexpectedDiff = filterFilesystemDiff(diff, (path) => !allowedPaths.has(path));

	if (hasFilesystemDiff(unexpectedDiff)) {
		throw new FixtureFilesystemOracleError({
			fixtureId: fixture.manifest.id,
			oracleKind: "expected_files",
			message: buildFilesystemDiffMessage(
				fixture.manifest.id,
				'filesystem.kind "expected_files" found undeclared repository mutations',
				unexpectedDiff,
			),
		});
	}

	for (const relativePath of filesystemOracle.files) {
		const actualEntry = snapshotByPath.get(relativePath);
		if (!actualEntry) {
			throw new FixtureFilesystemOracleError({
				fixtureId: fixture.manifest.id,
				oracleKind: "expected_files",
				message: [
					`Fixture filesystem oracle failed [fixture ${fixture.manifest.id}]`,
					`declared expected file is missing after command: ${relativePath}`,
				].join("\n"),
			});
		}

		if (actualEntry.kind !== "file") {
			throw new FixtureFilesystemOracleError({
				fixtureId: fixture.manifest.id,
				oracleKind: "expected_files",
				message: [
					`Fixture filesystem oracle failed [fixture ${fixture.manifest.id}]`,
					`declared expected file must remain a regular file: ${relativePath}`,
					`actual entry kind: ${actualEntry.kind}`,
				].join("\n"),
			});
		}

		const expectedBytes = readFileSync(resolve(fixture.layout.expectedRepoDir, relativePath));
		if (expectedBytes.equals(actualEntry.bytes)) {
			continue;
		}

		throw new FixtureFilesystemOracleError({
			fixtureId: fixture.manifest.id,
			oracleKind: "expected_files",
			message: buildBufferMismatchMessage(
				fixture.manifest.id,
				`declared expected file did not match fixture golden: ${relativePath}`,
				expectedBytes,
				actualEntry.bytes,
			),
		});
	}
}

export function diffFilesystemSnapshots(
	beforeSnapshot: FilesystemSnapshotEntry[],
	afterSnapshot: FilesystemSnapshotEntry[],
): FilesystemMutationDiff {
	const beforeByPath = new Map(beforeSnapshot.map((entry) => [entry.path, entry]));
	const afterByPath = new Map(afterSnapshot.map((entry) => [entry.path, entry]));
	const allPaths = new Set([...beforeByPath.keys(), ...afterByPath.keys()]);
	const orderedPaths = [...allPaths].sort(compareBinaryUtf8);

	const diff: FilesystemMutationDiff = {
		added: [],
		removed: [],
		changed: [],
		typeChanged: [],
	};

	for (const path of orderedPaths) {
		const before = beforeByPath.get(path);
		const after = afterByPath.get(path);

		if (!before && after) {
			diff.added.push(after);
			continue;
		}

		if (before && !after) {
			diff.removed.push(before);
			continue;
		}

		if (!before || !after) {
			continue;
		}

		if (before.kind !== after.kind) {
			diff.typeChanged.push({ path, before, after });
			continue;
		}

		if (snapshotEntriesEqual(before, after)) {
			continue;
		}

		diff.changed.push({ path, before, after });
	}

	return diff;
}

function snapshotEntriesEqual(
	left: FilesystemSnapshotEntry,
	right: FilesystemSnapshotEntry,
): boolean {
	if (left.kind !== right.kind || left.path !== right.path) {
		return false;
	}

	switch (left.kind) {
		case "dir":
			return true;
		case "file":
			return left.bytes.equals((right as Extract<FilesystemSnapshotEntry, { kind: "file" }>).bytes);
		case "symlink":
			return left.target_raw.equals(
				(right as Extract<FilesystemSnapshotEntry, { kind: "symlink" }>).target_raw,
			);
	}
}

function filterFilesystemDiff(
	diff: FilesystemMutationDiff,
	predicate: (path: string) => boolean,
): FilesystemMutationDiff {
	return {
		added: diff.added.filter((entry) => predicate(entry.path)),
		removed: diff.removed.filter((entry) => predicate(entry.path)),
		changed: diff.changed.filter((entry) => predicate(entry.path)),
		typeChanged: diff.typeChanged.filter((entry) => predicate(entry.path)),
	};
}

function hasFilesystemDiff(diff: FilesystemMutationDiff): boolean {
	return (
		diff.added.length > 0 ||
		diff.removed.length > 0 ||
		diff.changed.length > 0 ||
		diff.typeChanged.length > 0
	);
}

function buildAllowedMutationPathSet(paths: string[]): Set<string> {
	const allowed = new Set<string>();

	for (const path of paths) {
		allowed.add(path);

		let ancestorEnd = path.lastIndexOf("/");
		while (ancestorEnd !== -1) {
			allowed.add(path.slice(0, ancestorEnd));
			ancestorEnd = path.lastIndexOf("/", ancestorEnd - 1);
		}
	}

	return allowed;
}

function buildFilesystemDiffMessage(
	fixtureId: string,
	summary: string,
	diff: FilesystemMutationDiff,
): string {
	const lines = [`Fixture filesystem oracle failed [fixture ${fixtureId}]`, summary];
	appendPathSection(
		lines,
		"added",
		diff.added.map((entry) => formatSnapshotEntry(entry)),
	);
	appendPathSection(
		lines,
		"removed",
		diff.removed.map((entry) => formatSnapshotEntry(entry)),
	);
	appendPathSection(
		lines,
		"changed",
		diff.changed.map((entry) => formatChangedEntry(entry)),
	);
	appendPathSection(
		lines,
		"type-changed",
		diff.typeChanged.map((entry) => `${entry.path} (${entry.before.kind} -> ${entry.after.kind})`),
	);
	return lines.join("\n");
}

function appendPathSection(lines: string[], label: string, entries: string[]): void {
	if (entries.length === 0) {
		return;
	}

	lines.push(`${label}:`);
	for (const entry of entries) {
		lines.push(`- ${entry}`);
	}
}

function formatSnapshotEntry(entry: FilesystemSnapshotEntry): string {
	switch (entry.kind) {
		case "dir":
			return `${entry.path} [dir]`;
		case "file":
			return `${entry.path} [file ${entry.bytes.length} bytes]`;
		case "symlink":
			return `${entry.path} [symlink ${formatBufferPreview(entry.target_raw, 0)}]`;
	}
}

function formatChangedEntry(entry: SnapshotEntryChange): string {
	if (entry.before.kind === "file" && entry.after.kind === "file") {
		return `${entry.path} (file bytes changed)`;
	}

	if (entry.before.kind === "symlink" && entry.after.kind === "symlink") {
		return `${entry.path} (symlink target changed)`;
	}

	return `${entry.path} (${entry.before.kind} changed)`;
}

function buildBufferMismatchMessage(
	fixtureId: string,
	summary: string,
	expected: Buffer,
	actual: Buffer,
): string {
	const firstDifference = findFirstDifferenceOffset(expected, actual);
	const expectedHasFinalNewline = endsWithLf(expected);
	const actualHasFinalNewline = endsWithLf(actual);
	const lines = [
		`Fixture filesystem oracle failed [fixture ${fixtureId}]`,
		summary,
		`expected bytes: ${expected.length}`,
		`actual bytes: ${actual.length}`,
	];

	if (expectedHasFinalNewline !== actualHasFinalNewline) {
		lines.push(
			`final newline mismatch: expected ${formatFinalNewlineState(expectedHasFinalNewline)}, actual ${formatFinalNewlineState(actualHasFinalNewline)}`,
		);
	}

	lines.push(`first difference: ${formatDifferenceLocation(expected, actual, firstDifference)}`);
	lines.push(`expected preview: ${formatBufferPreview(expected, firstDifference)}`);
	lines.push(`actual preview:   ${formatBufferPreview(actual, firstDifference)}`);

	return lines.join("\n");
}

function findFirstDifferenceOffset(expected: Buffer, actual: Buffer): number {
	const sharedLength = Math.min(expected.length, actual.length);

	for (let index = 0; index < sharedLength; index += 1) {
		if (expected[index] !== actual[index]) {
			return index;
		}
	}

	return sharedLength;
}

function formatDifferenceLocation(expected: Buffer, actual: Buffer, offset: number): string {
	if (offset < expected.length && offset < actual.length) {
		return `offset ${offset} (expected 0x${expected[offset].toString(16).padStart(2, "0")}, actual 0x${actual[offset].toString(16).padStart(2, "0")})`;
	}

	if (offset === expected.length && offset === actual.length) {
		return `offset ${offset} (buffers differ only by comparison metadata)`;
	}

	if (offset === expected.length) {
		return `offset ${offset} (expected end of buffer, actual has extra trailing bytes)`;
	}

	return `offset ${offset} (actual end of buffer, expected has extra trailing bytes)`;
}

function formatBufferPreview(buffer: Buffer, offset: number): string {
	if (buffer.length === 0) {
		return "<empty>";
	}

	const start = Math.max(0, offset - 8);
	const end = Math.min(buffer.length, offset + 8);
	const slice = buffer.subarray(start, end);
	const hex = [...slice].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
	const ascii = [...slice].map((byte) => formatAsciiByte(byte)).join("");
	const prefix = start > 0 ? "..." : "";
	const suffix = end < buffer.length ? "..." : "";

	return `${prefix}[${start}..${end}) ${hex}${suffix} |${prefix}${ascii}${suffix}|`;
}

function formatAsciiByte(byte: number): string {
	return byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ".";
}

function endsWithLf(buffer: Buffer): boolean {
	return buffer.length > 0 && buffer[buffer.length - 1] === 0x0a;
}

function formatFinalNewlineState(hasFinalNewline: boolean): string {
	return hasFinalNewline ? "present" : "missing";
}

function compareBinaryUtf8(left: string, right: string): number {
	return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
