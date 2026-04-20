import { readFileSync } from "node:fs";

import type { LoadedFixtureManifest, StderrOracle, StdoutOracle } from "./fixture-manifest";
import type { FixtureProcessResult } from "./fixture-process";

export class FixtureOutputOracleError extends Error {
	readonly fixtureId: string;
	readonly stream: "stdout" | "stderr";
	readonly oracleKind: string;

	constructor(options: {
		fixtureId: string;
		stream: "stdout" | "stderr";
		oracleKind: string;
		message: string;
	}) {
		super(options.message);
		this.name = "FixtureOutputOracleError";
		this.fixtureId = options.fixtureId;
		this.stream = options.stream;
		this.oracleKind = options.oracleKind;
	}
}

export function assertFixtureOutputOracles(
	fixture: LoadedFixtureManifest,
	result: FixtureProcessResult,
): void {
	assertStdoutOracle(fixture, result.stdout, fixture.manifest.stdout);
	assertStderrOracle(fixture, result.stderr, fixture.manifest.stderr);
}

function assertStdoutOracle(
	fixture: LoadedFixtureManifest,
	actual: Buffer,
	oracle: StdoutOracle,
): void {
	switch (oracle.kind) {
		case "ignored":
			return;
		case "empty":
			assertBufferEqual(
				fixture,
				"stdout",
				"empty",
				Buffer.alloc(0),
				actual,
				"stdout must be empty",
			);
			return;
		case "exact":
			assertBufferEqual(
				fixture,
				"stdout",
				"exact",
				Buffer.from(oracle.value, "utf8"),
				actual,
				'stdout bytes did not match stdout.kind "exact"',
			);
			return;
		case "golden":
			assertBufferEqual(
				fixture,
				"stdout",
				"golden",
				readFileSync(fixture.layout.stdoutGoldenPath),
				actual,
				`stdout bytes did not match ${fixture.layout.stdoutGoldenPath}`,
			);
			return;
	}
}

function assertStderrOracle(
	fixture: LoadedFixtureManifest,
	actual: Buffer,
	oracle: StderrOracle,
): void {
	switch (oracle.kind) {
		case "ignored":
			return;
		case "empty":
			assertBufferEqual(
				fixture,
				"stderr",
				"empty",
				Buffer.alloc(0),
				actual,
				"stderr must be empty",
			);
			return;
		case "contains": {
			const actualText = actual.toString("utf8");
			if (actualText.includes(oracle.value)) {
				return;
			}

			throw new FixtureOutputOracleError({
				fixtureId: fixture.manifest.id,
				stream: "stderr",
				oracleKind: oracle.kind,
				message: [
					`Fixture output oracle failed [fixture ${fixture.manifest.id}]`,
					`stderr must contain ${JSON.stringify(oracle.value)}`,
					`actual stderr text: ${JSON.stringify(actualText)}`,
				].join("\n"),
			});
		}
		case "pattern": {
			const actualText = actual.toString("utf8");
			let pattern: RegExp;
			try {
				pattern = new RegExp(oracle.value, "u");
			} catch (error) {
				const reason = error instanceof Error ? error.message : "unknown regex compilation failure";
				throw new FixtureOutputOracleError({
					fixtureId: fixture.manifest.id,
					stream: "stderr",
					oracleKind: oracle.kind,
					message: [
						`Fixture output oracle failed [fixture ${fixture.manifest.id}]`,
						`stderr.pattern is not a valid regular expression: ${reason}`,
					].join("\n"),
				});
			}

			if (pattern.test(actualText)) {
				return;
			}

			throw new FixtureOutputOracleError({
				fixtureId: fixture.manifest.id,
				stream: "stderr",
				oracleKind: oracle.kind,
				message: [
					`Fixture output oracle failed [fixture ${fixture.manifest.id}]`,
					`stderr must match /${oracle.value}/u`,
					`actual stderr text: ${JSON.stringify(actualText)}`,
				].join("\n"),
			});
		}
	}
}

function assertBufferEqual(
	fixture: LoadedFixtureManifest,
	stream: "stdout" | "stderr",
	oracleKind: string,
	expected: Buffer,
	actual: Buffer,
	summary: string,
): void {
	if (expected.equals(actual)) {
		return;
	}

	throw new FixtureOutputOracleError({
		fixtureId: fixture.manifest.id,
		stream,
		oracleKind,
		message: buildBufferMismatchMessage(fixture.manifest.id, summary, expected, actual),
	});
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
		`Fixture output oracle failed [fixture ${fixtureId}]`,
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
