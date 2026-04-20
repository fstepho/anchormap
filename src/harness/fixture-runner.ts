import { existsSync, lstatSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
	assertFixtureFilesystemOracle,
	FixtureFilesystemOracleError,
} from "./fixture-filesystem-oracle";
import {
	FIXTURE_MANIFEST_FILENAME,
	FIXTURE_REPO_DIRNAME,
	FixtureManifestValidationError,
	type LoadedFixtureManifest,
	loadFixtureManifest,
} from "./fixture-manifest";
import { assertFixtureOutputOracles, FixtureOutputOracleError } from "./fixture-output-oracle";
import {
	executeFixtureCommand,
	FixtureProcessError,
	FixtureProcessTimeoutError,
} from "./fixture-process";
import { FixtureSandboxError, materializeFixtureSandbox } from "./fixture-sandbox";

const DEFAULT_TIMEOUT_MS = 5_000;
const FAILURE_MESSAGE_HEADER = /^Fixture .+ failed(?: \[fixture .+\])?$/u;

export interface FixtureRunnerSelection {
	fixtureId?: string;
	family?: string;
}

export interface FixtureRunnerOptions extends FixtureRunnerSelection {
	fixturesRoot: string;
	timeoutMs?: number;
}

export interface FixtureRunnerCliOptions {
	fixturesRoot?: string;
	timeoutMs?: number;
	stdout?: { write(chunk: string): unknown };
	stderr?: { write(chunk: string): unknown };
}

export interface FixtureRunRecord {
	fixtureId: string;
	family: string;
	status: "pass" | "fail";
	failedOracle: string | null;
	summary: string;
}

export interface FixtureRunSummary {
	records: FixtureRunRecord[];
	totalCount: number;
	passedCount: number;
	failedCount: number;
	exitCode: number;
	report: string;
}

interface FixtureDirectoryEntry {
	fixtureDir: string;
	fixtureId: string;
	family: string;
}

class FixtureExitCodeOracleError extends Error {
	readonly fixtureId: string;
	readonly expectedExitCode: number;
	readonly actualExitCode: number;

	constructor(options: {
		fixtureId: string;
		expectedExitCode: number;
		actualExitCode: number;
	}) {
		super(
			[
				`Fixture exit-code oracle failed [fixture ${options.fixtureId}]`,
				`expected exit code ${options.expectedExitCode}, got ${options.actualExitCode}`,
			].join("\n"),
		);
		this.name = "FixtureExitCodeOracleError";
		this.fixtureId = options.fixtureId;
		this.expectedExitCode = options.expectedExitCode;
		this.actualExitCode = options.actualExitCode;
	}
}

export class FixtureRunnerUsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "FixtureRunnerUsageError";
	}
}

export class FixtureRunnerSelectionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "FixtureRunnerSelectionError";
	}
}

export function parseFixtureRunnerArgs(argv: readonly string[]): FixtureRunnerSelection {
	let fixtureId: string | undefined;
	let family: string | undefined;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		switch (argument) {
			case "--fixture": {
				const value = argv[index + 1];
				if (!value) {
					throw new FixtureRunnerUsageError("--fixture requires a fixture ID");
				}
				if (fixtureId) {
					throw new FixtureRunnerUsageError("--fixture may be provided at most once");
				}
				fixtureId = value;
				index += 1;
				break;
			}
			case "--family": {
				const value = argv[index + 1];
				if (!value) {
					throw new FixtureRunnerUsageError("--family requires a family name");
				}
				if (family) {
					throw new FixtureRunnerUsageError("--family may be provided at most once");
				}
				family = value;
				index += 1;
				break;
			}
			default:
				throw new FixtureRunnerUsageError(`unsupported fixture-runner argument: ${argument}`);
		}
	}

	if (fixtureId && family) {
		throw new FixtureRunnerUsageError("--fixture and --family are mutually exclusive");
	}

	return { fixtureId, family };
}

export async function runFixtureRunner(options: FixtureRunnerOptions): Promise<FixtureRunSummary> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const selectedEntries = selectFixtureEntries(discoverFixtureEntries(options.fixturesRoot), {
		fixtureId: options.fixtureId,
		family: options.family,
	});

	const records: FixtureRunRecord[] = [];

	for (const entry of selectedEntries) {
		records.push(await runFixtureEntry(entry, timeoutMs));
	}

	const passedCount = records.filter((record) => record.status === "pass").length;
	const failedCount = records.length - passedCount;

	return {
		records,
		totalCount: records.length,
		passedCount,
		failedCount,
		exitCode: failedCount === 0 ? 0 : 1,
		report: renderFixtureRunnerReport(records, passedCount, failedCount),
	};
}

export async function runFixtureRunnerCli(
	argv: readonly string[],
	options: FixtureRunnerCliOptions = {},
): Promise<number> {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;

	try {
		const selection = parseFixtureRunnerArgs(argv);
		const summary = await runFixtureRunner({
			fixturesRoot: options.fixturesRoot ?? resolve(process.cwd(), "fixtures"),
			timeoutMs: options.timeoutMs,
			...selection,
		});
		stdout.write(summary.report);
		return summary.exitCode;
	} catch (error) {
		stderr.write(`${formatUnknownErrorMessage(error)}\n`);
		return 1;
	}
}

function discoverFixtureEntries(fixturesRoot: string): FixtureDirectoryEntry[] {
	if (!existsSync(fixturesRoot)) {
		throw new FixtureRunnerSelectionError(`fixtures root does not exist: ${fixturesRoot}`);
	}
	if (!lstatSync(fixturesRoot).isDirectory()) {
		throw new FixtureRunnerSelectionError(`fixtures root must be a directory: ${fixturesRoot}`);
	}

	const entries: FixtureDirectoryEntry[] = [];
	const familyEntries = readdirSync(fixturesRoot, { withFileTypes: true }).sort((left, right) =>
		compareBinaryUtf8(left.name, right.name),
	);

	for (const familyEntry of familyEntries) {
		if (!familyEntry.isDirectory()) {
			continue;
		}

		const familyDir = resolve(fixturesRoot, familyEntry.name);
		const fixtureEntries = readdirSync(familyDir, { withFileTypes: true }).sort((left, right) =>
			compareBinaryUtf8(left.name, right.name),
		);

		for (const fixtureEntry of fixtureEntries) {
			if (!fixtureEntry.isDirectory()) {
				continue;
			}

			const fixtureDir = resolve(familyDir, fixtureEntry.name);
			if (!looksLikeHarnessFixtureDirectory(fixtureDir)) {
				continue;
			}

			entries.push({
				fixtureDir,
				fixtureId: fixtureEntry.name,
				family: familyEntry.name,
			});
		}
	}

	return entries;
}

function selectFixtureEntries(
	entries: FixtureDirectoryEntry[],
	selection: FixtureRunnerSelection,
): FixtureDirectoryEntry[] {
	if (selection.fixtureId) {
		const matchingEntries = entries.filter((entry) => entry.fixtureId === selection.fixtureId);
		if (matchingEntries.length === 0) {
			throw new FixtureRunnerSelectionError(
				`no fixture found with ID ${JSON.stringify(selection.fixtureId)}`,
			);
		}
		if (matchingEntries.length > 1) {
			throw new FixtureRunnerSelectionError(
				`fixture ID ${JSON.stringify(selection.fixtureId)} is ambiguous across families`,
			);
		}
		return matchingEntries;
	}

	if (selection.family) {
		const matchingEntries = entries.filter((entry) => entry.family === selection.family);
		if (matchingEntries.length === 0) {
			throw new FixtureRunnerSelectionError(
				`no fixture family found with name ${JSON.stringify(selection.family)}`,
			);
		}
		return matchingEntries;
	}

	if (entries.length === 0) {
		throw new FixtureRunnerSelectionError(
			`no harness fixtures found under ${selectionRoot(entries)}`,
		);
	}

	return entries;
}

async function runFixtureEntry(
	entry: FixtureDirectoryEntry,
	timeoutMs: number,
): Promise<FixtureRunRecord> {
	let fixture: LoadedFixtureManifest;
	try {
		fixture = loadFixtureManifest(entry.fixtureDir);
	} catch (error) {
		return buildFailureRecord(entry.fixtureId, entry.family, error);
	}

	let sandbox = null;
	try {
		sandbox = materializeFixtureSandbox(fixture);
		const result = await executeFixtureCommand(fixture, sandbox, { timeoutMs });
		assertExpectedExitCode(fixture, result.exitCode);
		assertFixtureOutputOracles(fixture, result);
		assertFixtureFilesystemOracle(fixture, sandbox);

		return {
			fixtureId: fixture.manifest.id,
			family: fixture.manifest.family,
			status: "pass",
			failedOracle: null,
			summary: "ok",
		};
	} catch (error) {
		return buildFailureRecord(fixture.manifest.id, fixture.manifest.family, error);
	} finally {
		sandbox?.dispose();
	}
}

function assertExpectedExitCode(fixture: LoadedFixtureManifest, actualExitCode: number): void {
	if (actualExitCode === fixture.manifest.exit_code) {
		return;
	}

	throw new FixtureExitCodeOracleError({
		fixtureId: fixture.manifest.id,
		expectedExitCode: fixture.manifest.exit_code,
		actualExitCode,
	});
}

function buildFailureRecord(fixtureId: string, family: string, error: unknown): FixtureRunRecord {
	return {
		fixtureId,
		family,
		status: "fail",
		failedOracle: classifyFailureOracle(error),
		summary: summarizeFailureMessage(error),
	};
}

function classifyFailureOracle(error: unknown): string {
	if (error instanceof FixtureManifestValidationError) {
		return "manifest";
	}
	if (error instanceof FixtureExitCodeOracleError) {
		return "exit_code";
	}
	if (error instanceof FixtureOutputOracleError) {
		return `${error.stream}.${error.oracleKind}`;
	}
	if (error instanceof FixtureFilesystemOracleError) {
		return `filesystem.${error.oracleKind}`;
	}
	if (error instanceof FixtureProcessTimeoutError) {
		return "process.timeout";
	}
	if (error instanceof FixtureProcessError) {
		return "process";
	}
	if (error instanceof FixtureSandboxError) {
		return "sandbox";
	}
	return "harness";
}

function summarizeFailureMessage(error: unknown): string {
	if (!(error instanceof Error)) {
		return "unknown fixture failure";
	}

	const lines = error.message
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	for (const line of lines) {
		if (!FAILURE_MESSAGE_HEADER.test(line)) {
			return line;
		}
	}

	return error.message.trim() || "unknown fixture failure";
}

function renderFixtureRunnerReport(
	records: FixtureRunRecord[],
	passedCount: number,
	failedCount: number,
): string {
	const lines = records.map((record) => {
		if (record.status === "pass") {
			return `PASS ${record.fixtureId}`;
		}

		return `FAIL ${record.fixtureId} ${record.failedOracle} ${record.summary}`;
	});

	lines.push(`SUMMARY total=${records.length} passed=${passedCount} failed=${failedCount}`);

	return `${lines.join("\n")}\n`;
}

function looksLikeHarnessFixtureDirectory(fixtureDir: string): boolean {
	return (
		isRealDirectory(resolve(fixtureDir, FIXTURE_REPO_DIRNAME)) &&
		isRegularFile(resolve(fixtureDir, FIXTURE_MANIFEST_FILENAME))
	);
}

function isRealDirectory(path: string): boolean {
	return existsSync(path) && lstatSync(path).isDirectory();
}

function isRegularFile(path: string): boolean {
	return existsSync(path) && lstatSync(path).isFile();
}

function selectionRoot(entries: FixtureDirectoryEntry[]): string {
	if (entries.length === 0) {
		return "<empty>";
	}

	return resolve(entries[0].fixtureDir, "..", "..");
}

function compareBinaryUtf8(left: string, right: string): number {
	return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function formatUnknownErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "unknown fixture runner failure";
}

if (require.main === module) {
	void runFixtureRunnerCli(process.argv.slice(2)).then((exitCode) => {
		process.exitCode = exitCode;
	});
}
