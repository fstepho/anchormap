import { existsSync, lstatSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
	assertFixtureFilesystemOracleFromSnapshots,
	diffFilesystemSnapshots,
	type FilesystemMutationDiff,
	FixtureFilesystemOracleError,
} from "./fixture-filesystem-oracle";
import {
	FIXTURE_MANIFEST_FILENAME,
	FIXTURE_REPO_DIRNAME,
	FixtureManifestValidationError,
	type LoadedFixtureManifest,
	loadFixtureManifest,
} from "./fixture-manifest";
import {
	assertFixtureStderrOracle,
	assertFixtureStdoutOracle,
	FixtureOutputOracleError,
} from "./fixture-output-oracle";
import type { FixturePhaseName } from "./fixture-phase-trace";
import {
	defaultTraceCaptureFactory,
	executeFixtureCommand,
	FixtureProcessError,
	type FixtureProcessResult,
	FixtureProcessTimeoutError,
} from "./fixture-process";
import {
	type FixtureArtifactOracleStatuses,
	type FixtureRunnerArtifactsLayout,
	prepareFixtureRunnerArtifacts,
	resolveFixtureRunLastFailedPhase,
	writeFixtureRunArtifacts,
	writeFixtureRunnerSummaryArtifacts,
} from "./fixture-run-artifacts";
import {
	captureFilesystemSnapshot,
	type FilesystemSnapshotEntry,
	FixtureSandboxError,
	type MaterializedFixtureSandbox,
	materializeFixtureSandbox,
} from "./fixture-sandbox";

const DEFAULT_TIMEOUT_MS = 5_000;
const FAILURE_MESSAGE_HEADER = /^Fixture .+ failed(?: \[fixture .+\])?$/u;

export interface FixtureRunnerSelection {
	fixtureId?: string;
	family?: string;
	stdoutGoldenOnly?: boolean;
}

export interface FixtureRunnerOptions extends FixtureRunnerSelection {
	fixturesRoot: string;
	timeoutMs?: number;
	sandboxFactory?: (fixture: LoadedFixtureManifest) => MaterializedFixtureSandbox;
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
	totalDurationMs: number | null;
	harnessDurationMs: number;
	lastFailedPhase: FixturePhaseName | null;
	phaseTraceStatus:
		| FixtureProcessResult["phaseTraceStatus"]
		| FixtureProcessError["phaseTraceStatus"];
	artifactDir: string;
	artifactDirRelative: string;
	metadataPath: string;
	metadataPathRelative: string;
	summaryPath: string;
	summaryPathRelative: string;
}

export interface FixtureRunSummary {
	records: FixtureRunRecord[];
	totalCount: number;
	passedCount: number;
	failedCount: number;
	exitCode: number;
	report: string;
	totalDurationMs: number;
	artifactsDir: string;
	artifactsDirRelative: string;
	summaryPath: string;
	summaryPathRelative: string;
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
	let stdoutGoldenOnly = false;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		switch (argument) {
			case "--goldens-only": {
				if (stdoutGoldenOnly) {
					throw new FixtureRunnerUsageError("--goldens-only may be provided at most once");
				}
				stdoutGoldenOnly = true;
				break;
			}
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

	return { fixtureId, family, stdoutGoldenOnly };
}

export async function runFixtureRunner(options: FixtureRunnerOptions): Promise<FixtureRunSummary> {
	const startedAtNs = process.hrtime.bigint();
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const selection = {
		fixtureId: options.fixtureId,
		family: options.family,
		stdoutGoldenOnly: options.stdoutGoldenOnly,
	};
	const selectedEntries = selectFixtureEntries(discoverFixtureEntries(options.fixturesRoot, selection), {
		fixtureId: options.fixtureId,
		family: options.family,
	});
	const runnableEntries = options.stdoutGoldenOnly
		? requireStdoutGoldenEntries(selectedEntries)
		: selectedEntries;
	const artifactsLayout = prepareFixtureRunnerArtifacts(options.fixturesRoot, {
		fixtureId: options.fixtureId,
		family: options.family,
		stdoutGoldenOnly: options.stdoutGoldenOnly,
	});

	const records: FixtureRunRecord[] = [];

	for (const entry of runnableEntries) {
		records.push(
			await runFixtureEntry(
				entry,
				timeoutMs,
				artifactsLayout,
				options.sandboxFactory ?? materializeFixtureSandbox,
			),
		);
	}

	const passedCount = records.filter((record) => record.status === "pass").length;
	const failedCount = records.length - passedCount;
	const report = renderFixtureRunnerReport(records, passedCount, failedCount, artifactsLayout);
	const summary = {
		records,
		totalCount: records.length,
		passedCount,
		failedCount,
		exitCode: failedCount === 0 ? 0 : 1,
		report,
		totalDurationMs: elapsedMilliseconds(startedAtNs),
		artifactsDir: artifactsLayout.runDir,
		artifactsDirRelative: artifactsLayout.runDirRelative,
		summaryPath: artifactsLayout.summaryPath,
		summaryPathRelative: artifactsLayout.summaryPathRelative,
	};

	const timing = writeFixtureRunnerSummaryArtifacts(artifactsLayout, summary, {
		resolveTimingOverride: () => ({
			totalDurationMs: elapsedMilliseconds(startedAtNs),
		}),
	});
	summary.totalDurationMs = timing.totalDurationMs;

	return summary;
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

interface FixtureDirectoryShape extends FixtureDirectoryEntry {
	hasRepoDir: boolean;
	hasManifestFile: boolean;
}

function discoverFixtureEntries(
	fixturesRoot: string,
	selection: FixtureRunnerSelection,
): FixtureDirectoryEntry[] {
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
		if (selection.family && familyEntry.name !== selection.family) {
			continue;
		}

		const familyDir = resolve(fixturesRoot, familyEntry.name);
		const fixtureEntries = readdirSync(familyDir, { withFileTypes: true }).sort((left, right) =>
			compareBinaryUtf8(left.name, right.name),
		);
		const fixtureShapes: FixtureDirectoryShape[] = fixtureEntries.flatMap((fixtureEntry) => {
			if (!fixtureEntry.isDirectory()) {
				return [];
			}

			const fixtureDir = resolve(familyDir, fixtureEntry.name);
			return [
				{
					fixtureDir,
					fixtureId: fixtureEntry.name,
					family: familyEntry.name,
					hasRepoDir: isRealDirectory(resolve(fixtureDir, FIXTURE_REPO_DIRNAME)),
					hasManifestFile: isRegularFile(resolve(fixtureDir, FIXTURE_MANIFEST_FILENAME)),
				},
			];
		});
		const familyHasRunnableFixtures = fixtureShapes.some((fixtureShape) => fixtureShape.hasRepoDir);

		for (const fixtureShape of fixtureShapes) {
			if (selection.fixtureId && fixtureShape.fixtureId !== selection.fixtureId) {
				continue;
			}
			if (
				!isFixtureDirectoryEntry(
					fixtureShape,
					selection,
					familyHasRunnableFixtures,
				)
			) {
				continue;
			}

			entries.push({
				fixtureDir: fixtureShape.fixtureDir,
				fixtureId: fixtureShape.fixtureId,
				family: fixtureShape.family,
			});
		}
	}

	return entries;
}

function isFixtureDirectoryEntry(
	fixtureShape: FixtureDirectoryShape,
	selection: FixtureRunnerSelection,
	familyHasRunnableFixtures: boolean,
): boolean {
	if (fixtureShape.hasRepoDir && fixtureShape.hasManifestFile) {
		return true;
	}

	if (!fixtureShape.hasRepoDir && !fixtureShape.hasManifestFile) {
		return false;
	}

	const isExplicitlySelected =
		selection.family === fixtureShape.family || selection.fixtureId === fixtureShape.fixtureId;
	if (!fixtureShape.hasRepoDir && !isExplicitlySelected && !familyHasRunnableFixtures) {
		return false;
	}

	const missingArtifacts = [];
	if (!fixtureShape.hasManifestFile) {
		missingArtifacts.push(`file "${FIXTURE_MANIFEST_FILENAME}"`);
	}
	if (!fixtureShape.hasRepoDir) {
		missingArtifacts.push(`directory "${FIXTURE_REPO_DIRNAME}"`);
	}

	throw new FixtureRunnerSelectionError(
		`fixture directory ${JSON.stringify(`${fixtureShape.family}/${fixtureShape.fixtureId}`)} is incomplete: missing required ${missingArtifacts.join(" and ")}`,
	);
}

function requireStdoutGoldenEntries(entries: FixtureDirectoryEntry[]): FixtureDirectoryEntry[] {
	const goldenEntries = entries.filter((entry) => {
		return loadFixtureManifest(entry.fixtureDir).manifest.stdout.kind === "golden";
	});

	if (goldenEntries.length === 0) {
		throw new FixtureRunnerSelectionError(
			'golden check selection did not match any fixture with stdout.kind "golden"',
		);
	}

	return goldenEntries;
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
	artifactsLayout: FixtureRunnerArtifactsLayout,
	sandboxFactory: (fixture: LoadedFixtureManifest) => MaterializedFixtureSandbox,
): Promise<FixtureRunRecord> {
	const startedAtNs = process.hrtime.bigint();
	let fixture: LoadedFixtureManifest | null = null;
	let sandbox: MaterializedFixtureSandbox | null = null;
	let processResult: FixtureProcessResult | null = null;
	let processTimeoutError: FixtureProcessTimeoutError | null = null;
	let processError: FixtureProcessError | null = null;
	let postRunSnapshot: FilesystemSnapshotEntry[] | null = null;
	let filesystemDiff: FilesystemMutationDiff | null = null;
	const oracleStatuses: FixtureArtifactOracleStatuses = {
		exitCode: "not_run",
		stdout: "not_run",
		stderr: "not_run",
		filesystem: "not_run",
	};
	let recordStatus: "pass" | "fail" = "fail";
	let failedOracle: string | null = "harness";
	let summary = "unknown fixture failure";
	let recordError: unknown = null;

	const finalizeRecord = (
		recordStatus: "pass" | "fail",
		failedOracle: string | null,
		summary: string,
		error: unknown,
	): FixtureRunRecord => {
		const lastFailedPhase = resolveFixtureRunLastFailedPhase({
			recordStatus,
			processResult,
			processTimeoutError,
			processError,
		});
		const artifactPaths = writeFixtureRunArtifacts(
			artifactsLayout,
			{
				entryFixtureId: entry.fixtureId,
				entryFamily: entry.family,
				recordStatus,
				recordTotalDurationMs: null,
				recordHarnessDurationMs: null,
				failedOracle,
				summary,
				fixture,
				sandbox,
				processResult,
				processTimeoutError,
				processError,
				postRunSnapshot,
				filesystemDiff,
				oracleStatuses,
				error,
			},
			{
				resolveTimingOverride: () => {
					return {
						recordTotalDurationMs: null,
						recordHarnessDurationMs: elapsedMilliseconds(startedAtNs),
					};
				},
			},
		);

		return {
			fixtureId: fixture?.manifest.id ?? entry.fixtureId,
			family: fixture?.manifest.family ?? entry.family,
			status: recordStatus,
			failedOracle,
			summary,
			totalDurationMs: artifactPaths.totalDurationMs,
			harnessDurationMs: artifactPaths.harnessDurationMs ?? 0,
			lastFailedPhase,
			phaseTraceStatus:
				processResult?.phaseTraceStatus ??
				processTimeoutError?.phaseTraceStatus ??
				processError?.phaseTraceStatus ??
				null,
			artifactDir: artifactPaths.artifactDir,
			artifactDirRelative: artifactPaths.artifactDirRelative,
			metadataPath: artifactPaths.metadataPath,
			metadataPathRelative: artifactPaths.metadataPathRelative,
			summaryPath: artifactPaths.summaryPath,
			summaryPathRelative: artifactPaths.summaryPathRelative,
		};
	};

	try {
		fixture = loadFixtureManifest(entry.fixtureDir);
		sandbox = sandboxFactory(fixture);
		processResult = await executeFixtureCommand(fixture, sandbox, {
			timeoutMs,
			traceCaptureFactory: defaultTraceCaptureFactory,
		});
		postRunSnapshot = captureFilesystemSnapshot(sandbox.sandboxDir);
		filesystemDiff = diffFilesystemSnapshots(sandbox.preRunSnapshot, postRunSnapshot);
		assertExpectedExitCode(fixture, processResult.exitCode);
		oracleStatuses.exitCode = "pass";
		assertFixtureStdoutOracle(fixture, processResult.stdout, fixture.manifest.stdout);
		oracleStatuses.stdout = "pass";
		assertFixtureStderrOracle(fixture, processResult.stderr, fixture.manifest.stderr);
		oracleStatuses.stderr = "pass";
		assertFixtureFilesystemOracleFromSnapshots(fixture, postRunSnapshot, filesystemDiff);
		oracleStatuses.filesystem = "pass";
		recordStatus = "pass";
		failedOracle = null;
		summary = "ok";
		recordError = null;
	} catch (error) {
		if (error instanceof FixtureProcessTimeoutError) {
			processTimeoutError = error;
		}
		if (error instanceof FixtureProcessError) {
			processError = error;
		}

		if (sandbox && postRunSnapshot === null) {
			try {
				postRunSnapshot = captureFilesystemSnapshot(sandbox.sandboxDir);
				filesystemDiff = diffFilesystemSnapshots(sandbox.preRunSnapshot, postRunSnapshot);
			} catch {
				postRunSnapshot = null;
				filesystemDiff = null;
			}
		}

		if (error instanceof FixtureExitCodeOracleError) {
			oracleStatuses.exitCode = "fail";
		} else if (error instanceof FixtureOutputOracleError) {
			if (error.stream === "stdout") {
				oracleStatuses.stdout = "fail";
			} else {
				oracleStatuses.stderr = "fail";
			}
		} else if (error instanceof FixtureFilesystemOracleError) {
			oracleStatuses.filesystem = "fail";
		}

		recordStatus = "fail";
		failedOracle = classifyFailureOracle(error);
		summary = summarizeFailureMessage(error);
		recordError = error;
	}

	const cleanupError = disposeSandbox(sandbox);
	if (cleanupError !== null) {
		if (recordError === null) {
			recordStatus = "fail";
			failedOracle = classifyFailureOracle(cleanupError);
			summary = summarizeFailureMessage(cleanupError);
			recordError = cleanupError;
		} else {
			summary = `${summary}; cleanup failed: ${cleanupError.message}`;
		}
	}

	return finalizeRecord(recordStatus, failedOracle, summary, recordError);
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
	artifactsLayout: FixtureRunnerArtifactsLayout,
): string {
	const duplicateFixtureIds = resolveDuplicateFixtureIds(records);
	const lines = records.map((record) => {
		if (record.status === "pass") {
			return `PASS ${renderPassedFixtureLabel(record, duplicateFixtureIds)}`;
		}

		return `FAIL ${record.fixtureId} ${record.failedOracle} ${record.summary} [artifacts ${record.artifactDirRelative}]`;
	});

	lines.push(
		`SUMMARY total=${records.length} passed=${passedCount} failed=${failedCount} artifacts=${artifactsLayout.runDirRelative} summary=${artifactsLayout.summaryPathRelative}`,
	);

	return `${lines.join("\n")}\n`;
}

function resolveDuplicateFixtureIds(records: readonly FixtureRunRecord[]): Set<string> {
	const seenFixtureIds = new Set<string>();
	const duplicateFixtureIds = new Set<string>();

	for (const record of records) {
		if (seenFixtureIds.has(record.fixtureId)) {
			duplicateFixtureIds.add(record.fixtureId);
			continue;
		}

		seenFixtureIds.add(record.fixtureId);
	}

	return duplicateFixtureIds;
}

function renderPassedFixtureLabel(
	record: FixtureRunRecord,
	duplicateFixtureIds: ReadonlySet<string>,
): string {
	if (!duplicateFixtureIds.has(record.fixtureId)) {
		return record.fixtureId;
	}

	return `${record.family}/${record.fixtureId}`;
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

function elapsedMilliseconds(startedAtNs: bigint): number {
	return Number(process.hrtime.bigint() - startedAtNs) / 1_000_000;
}

function formatUnknownErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "unknown fixture runner failure";
}

function disposeSandbox(sandbox: MaterializedFixtureSandbox | null): FixtureSandboxError | null {
	if (sandbox === null) {
		return null;
	}

	try {
		sandbox.dispose();
		return null;
	} catch (error) {
		if (error instanceof FixtureSandboxError) {
			return error;
		}

		return new FixtureSandboxError(
			`fixture sandbox cleanup failed: ${formatUnknownErrorMessage(error)}`,
		);
	}
}

if (require.main === module) {
	void runFixtureRunnerCli(process.argv.slice(2)).then((exitCode) => {
		process.exitCode = exitCode;
	});
}
