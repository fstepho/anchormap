import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, posix, resolve, sep } from "node:path";
import type { FilesystemMutationDiff } from "./fixture-filesystem-oracle";
import type { LoadedFixtureManifest, StderrOracle, StdoutOracle } from "./fixture-manifest";
import type {
	FixturePhaseName,
	FixturePhaseTiming,
	FixturePhaseTraceEvent,
	FixturePhaseTraceStatus,
} from "./fixture-phase-trace";
import type {
	FixtureProcessError,
	FixtureProcessResult,
	FixtureProcessTimeoutError,
} from "./fixture-process";
import type { FilesystemSnapshotEntry, MaterializedFixtureSandbox } from "./fixture-sandbox";

export type OracleStatus = "pass" | "fail" | "not_run";

export interface FixtureRunnerArtifactsLayout {
	runDir: string;
	runDirRelative: string;
	summaryPath: string;
	summaryPathRelative: string;
	runMetadataPath: string;
	runMetadataPathRelative: string;
	fixturesDir: string;
}

export interface FixtureArtifactPaths {
	artifactDir: string;
	artifactDirRelative: string;
	summaryPath: string;
	summaryPathRelative: string;
	metadataPath: string;
	metadataPathRelative: string;
	totalDurationMs: number | null;
	harnessDurationMs: number | null;
}

export interface FixtureArtifactOracleStatuses {
	exitCode: OracleStatus;
	stdout: OracleStatus;
	stderr: OracleStatus;
	filesystem: OracleStatus;
}

export interface FixtureRunArtifactInput {
	entryFixtureId: string;
	entryFamily: string;
	recordStatus: "pass" | "fail";
	recordTotalDurationMs: number | null;
	recordHarnessDurationMs: number | null;
	failedOracle: string | null;
	summary: string;
	fixture: LoadedFixtureManifest | null;
	sandbox: MaterializedFixtureSandbox | null;
	processResult: FixtureProcessResult | null;
	processTimeoutError: FixtureProcessTimeoutError | null;
	processError: FixtureProcessError | null;
	postRunSnapshot: FilesystemSnapshotEntry[] | null;
	filesystemDiff: FilesystemMutationDiff | null;
	oracleStatuses: FixtureArtifactOracleStatuses;
	error: unknown;
}

interface FixtureRunArtifactTimingOverride {
	recordTotalDurationMs: number | null;
	recordHarnessDurationMs: number | null;
}

export function prepareFixtureRunnerArtifacts(
	fixturesRoot: string,
	selection: { fixtureId?: string; family?: string },
): FixtureRunnerArtifactsLayout {
	const repoRoot = resolveArtifactRepoRoot(fixturesRoot);
	const selectionDirRelative = posix.join(".tmp", "fixture-runs", renderSelectionLabel(selection));
	const selectionDir = resolve(repoRoot, ...selectionDirRelative.split("/"));
	const { runDir, runDirRelative } = reserveNextRunDirectory(
		repoRoot,
		selectionDir,
		selectionDirRelative,
	);
	const summaryPathRelative = posix.join(runDirRelative, "summary.txt");
	const runMetadataPathRelative = posix.join(runDirRelative, "run.json");
	const fixturesDir = resolve(runDir, "fixtures");

	mkdirSync(fixturesDir);

	return {
		runDir,
		runDirRelative,
		summaryPath: resolve(repoRoot, ...summaryPathRelative.split("/")),
		summaryPathRelative,
		runMetadataPath: resolve(repoRoot, ...runMetadataPathRelative.split("/")),
		runMetadataPathRelative,
		fixturesDir,
	};
}

export function writeFixtureRunArtifacts(
	layout: FixtureRunnerArtifactsLayout,
	input: FixtureRunArtifactInput,
	options: {
		resolveTimingOverride?: () => FixtureRunArtifactTimingOverride;
	} = {},
): FixtureArtifactPaths {
	const artifactDirRelative = posix.join(
		layout.runDirRelative,
		"fixtures",
		input.entryFamily,
		input.entryFixtureId,
	);
	const metadataPathRelative = posix.join(artifactDirRelative, "result.json");
	const summaryPathRelative = posix.join(artifactDirRelative, "summary.txt");
	const artifactDir = resolve(layout.fixturesDir, input.entryFamily, input.entryFixtureId);
	const metadataPath = resolve(artifactDir, "result.json");
	const summaryPath = resolve(artifactDir, "summary.txt");

	mkdirSync(artifactDir, { recursive: true });

	const actualStdout =
		input.processResult?.stdout ??
		input.processTimeoutError?.stdout ??
		input.processError?.stdout ??
		null;
	const actualStderr =
		input.processResult?.stderr ??
		input.processTimeoutError?.stderr ??
		input.processError?.stderr ??
		null;
	const expectedStdout = input.fixture ? resolveExpectedStdoutBytes(input.fixture) : null;
	const expectedStderr = input.fixture
		? resolveExpectedStderrBytes(input.fixture.manifest.stderr)
		: null;

	const stdoutActualPath = writeOptionalBuffer(artifactDir, "stdout.actual.bin", actualStdout);
	const stdoutExpectedPath = writeOptionalBuffer(
		artifactDir,
		"stdout.expected.bin",
		expectedStdout,
	);
	const stderrActualPath = writeOptionalBuffer(artifactDir, "stderr.actual.bin", actualStderr);
	const stderrExpectedPath = writeOptionalBuffer(
		artifactDir,
		"stderr.expected.bin",
		expectedStderr,
	);
	const preRunSnapshotPath = writeOptionalJson(
		artifactDir,
		"filesystem.pre.json",
		input.sandbox ? serializeSnapshot(input.sandbox.preRunSnapshot) : null,
	);
	const postRunSnapshotPath = writeOptionalJson(
		artifactDir,
		"filesystem.post.json",
		input.postRunSnapshot ? serializeSnapshot(input.postRunSnapshot) : null,
	);
	const filesystemDiffPath = writeOptionalJson(
		artifactDir,
		"filesystem.diff.json",
		input.filesystemDiff ? serializeFilesystemDiff(input.filesystemDiff) : null,
	);
	const phaseTraceStatus = resolvePhaseTraceStatus(input);
	const phaseTraceEvents = resolvePhaseTraceEvents(input);
	const phaseTraceRaw = resolvePhaseTraceRaw(input);
	const phaseTracePath = writeOptionalJson(
		artifactDir,
		"phase-trace.events.json",
		phaseTraceStatus?.state === "captured" ? phaseTraceEvents : null,
	);
	const phaseTraceRawPath = writeOptionalBuffer(
		artifactDir,
		"phase-trace.raw.bin",
		phaseTraceStatus?.state === "invalid" ? phaseTraceRaw : null,
	);
	const phaseTimings = resolvePhaseTimings(input);
	const phaseTimingsPath = writeOptionalJson(
		artifactDir,
		"phase-timings.json",
		phaseTraceStatus?.state === "captured" ? phaseTimings : null,
	);
	const lastFailedPhase = resolveLastFailedPhase(input);
	const artifacts = {
		stdout_actual: toArtifactRelativePath(stdoutActualPath, artifactDir),
		stdout_expected: toArtifactRelativePath(stdoutExpectedPath, artifactDir),
		stderr_actual: toArtifactRelativePath(stderrActualPath, artifactDir),
		stderr_expected: toArtifactRelativePath(stderrExpectedPath, artifactDir),
		filesystem_pre: toArtifactRelativePath(preRunSnapshotPath, artifactDir),
		filesystem_post: toArtifactRelativePath(postRunSnapshotPath, artifactDir),
		filesystem_diff: toArtifactRelativePath(filesystemDiffPath, artifactDir),
		phase_trace_events: toArtifactRelativePath(phaseTracePath, artifactDir),
		phase_trace_raw: toArtifactRelativePath(phaseTraceRawPath, artifactDir),
		phase_timings: toArtifactRelativePath(phaseTimingsPath, artifactDir),
	};
	let finalInput = input;
	if (options.resolveTimingOverride) {
		finalInput = {
			...finalInput,
			...options.resolveTimingOverride(),
		};
	}
	let totalDurationMs = resolveTotalDurationMs(finalInput);
	let harnessDurationMs = resolveHarnessDurationMs(finalInput);

	writeFixtureRunResultFiles({
		artifactDirRelative,
		metadataPath,
		summaryPath,
		input: finalInput,
		totalDurationMs,
		harnessDurationMs,
		lastFailedPhase,
		phaseTraceStatus,
		artifacts,
	});

	if (options.resolveTimingOverride) {
		const updatedInput = {
			...finalInput,
			...options.resolveTimingOverride(),
		};
		const updatedTotalDurationMs = resolveTotalDurationMs(updatedInput);
		const updatedHarnessDurationMs = resolveHarnessDurationMs(updatedInput);
		if (
			updatedTotalDurationMs !== totalDurationMs ||
			updatedHarnessDurationMs !== harnessDurationMs
		) {
			finalInput = updatedInput;
			totalDurationMs = updatedTotalDurationMs;
			harnessDurationMs = updatedHarnessDurationMs;
			writeFixtureRunResultFiles({
				artifactDirRelative,
				metadataPath,
				summaryPath,
				input: finalInput,
				totalDurationMs,
				harnessDurationMs,
				lastFailedPhase,
				phaseTraceStatus,
				artifacts,
			});
		}
	}

	return {
		artifactDir,
		artifactDirRelative,
		summaryPath,
		summaryPathRelative,
		metadataPath,
		metadataPathRelative,
		totalDurationMs,
		harnessDurationMs,
	};
}

function writeFixtureRunResultFiles(input: {
	artifactDirRelative: string;
	metadataPath: string;
	summaryPath: string;
	input: FixtureRunArtifactInput;
	totalDurationMs: number | null;
	harnessDurationMs: number | null;
	lastFailedPhase: FixturePhaseName | null;
	phaseTraceStatus: FixturePhaseTraceStatus | null;
	artifacts: Record<string, string | null>;
}): void {
	const metadata = {
		fixture_id: input.input.fixture?.manifest.id ?? input.input.entryFixtureId,
		family: input.input.fixture?.manifest.family ?? input.input.entryFamily,
		status: input.input.recordStatus,
		failed_oracle: input.input.failedOracle,
		summary: input.input.summary,
		command: input.input.processResult?.command ?? input.input.fixture?.manifest.command ?? null,
		cwd: input.input.processResult?.cwd ?? input.input.sandbox?.cwd ?? null,
		exit_code: input.input.processResult?.exitCode ?? null,
		declared_exit_code: input.input.fixture?.manifest.exit_code ?? null,
		stdout_length:
			input.input.processResult?.stdoutLength ??
			input.input.processTimeoutError?.stdoutLength ??
			input.input.processError?.stdoutLength ??
			null,
		stderr_length:
			input.input.processResult?.stderrLength ??
			input.input.processTimeoutError?.stderrLength ??
			input.input.processError?.stderrLength ??
			null,
		total_duration_ms: input.totalDurationMs,
		harness_duration_ms: input.harnessDurationMs,
		last_failed_phase: input.lastFailedPhase,
		trace: input.phaseTraceStatus,
		oracles: {
			exit_code: {
				status: input.input.oracleStatuses.exitCode,
				expected: input.input.fixture?.manifest.exit_code ?? null,
				actual: input.input.processResult?.exitCode ?? null,
			},
			stdout: {
				status: input.input.oracleStatuses.stdout,
				kind: input.input.fixture?.manifest.stdout.kind ?? null,
			},
			stderr: {
				status: input.input.oracleStatuses.stderr,
				kind: input.input.fixture?.manifest.stderr.kind ?? null,
			},
			filesystem: {
				status: input.input.oracleStatuses.filesystem,
				kind: input.input.fixture?.manifest.filesystem.kind ?? null,
			},
		},
		artifacts: input.artifacts,
		error: serializeError(input.input.error),
	};

	writeFileSync(input.metadataPath, `${JSON.stringify(metadata, null, "\t")}\n`);
	writeFileSync(
		input.summaryPath,
		`${renderFixtureArtifactSummary(input.input, input.artifactDirRelative, metadata.artifacts, {
			totalDurationMs: input.totalDurationMs,
			harnessDurationMs: input.harnessDurationMs,
			lastFailedPhase: input.lastFailedPhase,
			phaseTraceStatus: input.phaseTraceStatus,
		})}\n`,
	);
}

export function writeFixtureRunnerSummaryArtifacts(
	layout: FixtureRunnerArtifactsLayout,
	summary: {
		totalCount: number;
		passedCount: number;
		failedCount: number;
		exitCode: number;
		report: string;
		totalDurationMs: number;
		records: Array<{
			fixtureId: string;
			family: string;
			status: "pass" | "fail";
			failedOracle: string | null;
			summary: string;
			totalDurationMs: number | null;
			harnessDurationMs: number | null;
			lastFailedPhase: FixturePhaseName | null;
			phaseTraceStatus: FixturePhaseTraceStatus | null;
			artifactDirRelative: string;
			metadataPathRelative: string;
			summaryPathRelative: string;
		}>;
	},
	options: {
		resolveTimingOverride?: () => {
			totalDurationMs: number;
		};
	} = {},
): {
	totalDurationMs: number;
} {
	let totalDurationMs = summary.totalDurationMs;

	writeFixtureRunnerSummaryResultFiles(layout, summary, totalDurationMs);

	if (options.resolveTimingOverride) {
		const updatedTotalDurationMs = options.resolveTimingOverride().totalDurationMs;
		if (updatedTotalDurationMs !== totalDurationMs) {
			totalDurationMs = updatedTotalDurationMs;
			writeFixtureRunnerSummaryResultFiles(layout, summary, totalDurationMs);
		}
	}

	return {
		totalDurationMs,
	};
}

function writeFixtureRunnerSummaryResultFiles(
	layout: FixtureRunnerArtifactsLayout,
	summary: {
		totalCount: number;
		passedCount: number;
		failedCount: number;
		exitCode: number;
		report: string;
		records: Array<{
			fixtureId: string;
			family: string;
			status: "pass" | "fail";
			failedOracle: string | null;
			summary: string;
			totalDurationMs: number | null;
			harnessDurationMs: number | null;
			lastFailedPhase: FixturePhaseName | null;
			phaseTraceStatus: FixturePhaseTraceStatus | null;
			artifactDirRelative: string;
			metadataPathRelative: string;
			summaryPathRelative: string;
		}>;
	},
	totalDurationMs: number,
): void {
	writeFileSync(layout.summaryPath, summary.report);
	writeFileSync(
		layout.runMetadataPath,
		`${JSON.stringify(
			{
				total_count: summary.totalCount,
				passed_count: summary.passedCount,
				failed_count: summary.failedCount,
				exit_code: summary.exitCode,
				total_duration_ms: totalDurationMs,
				summary_path: layout.summaryPathRelative,
				records: summary.records.map((record) => ({
					fixture_id: record.fixtureId,
					family: record.family,
					status: record.status,
					failed_oracle: record.failedOracle,
					summary: record.summary,
					total_duration_ms: record.totalDurationMs,
					harness_duration_ms: record.harnessDurationMs,
					last_failed_phase: record.lastFailedPhase,
					trace: record.phaseTraceStatus,
					artifact_dir: record.artifactDirRelative,
					metadata_path: record.metadataPathRelative,
					summary_path: record.summaryPathRelative,
				})),
			},
			null,
			"\t",
		)}\n`,
	);
}

function resolveArtifactRepoRoot(fixturesRoot: string): string {
	return basename(fixturesRoot) === "fixtures" ? resolve(fixturesRoot, "..") : fixturesRoot;
}

function renderSelectionLabel(selection: { fixtureId?: string; family?: string }): string {
	if (selection.fixtureId) {
		return `fixture-${selection.fixtureId}`;
	}
	if (selection.family) {
		return `family-${selection.family}`;
	}
	return "all";
}

function allocateNextRunDirectoryName(selectionDir: string): string {
	const previousRunNumbers = readdirSync(selectionDir, { withFileTypes: true }).flatMap((entry) => {
		if (!entry.isDirectory()) {
			return [];
		}

		const runNumber = parseRunDirectoryNumber(entry.name);
		return runNumber === null ? [] : [runNumber];
	});
	const nextRunNumber =
		previousRunNumbers.reduce((maxRunNumber, runNumber) => Math.max(maxRunNumber, runNumber), 0) +
		1;

	return `run-${String(nextRunNumber).padStart(4, "0")}`;
}

function reserveNextRunDirectory(
	repoRoot: string,
	selectionDir: string,
	selectionDirRelative: string,
): { runDir: string; runDirRelative: string } {
	mkdirSync(selectionDir, { recursive: true });

	let nextRunNumber = parseRunDirectoryNumber(allocateNextRunDirectoryName(selectionDir)) ?? 1;

	for (;;) {
		const runDirName = `run-${String(nextRunNumber).padStart(4, "0")}`;
		const runDirRelative = posix.join(selectionDirRelative, runDirName);
		const runDir = resolve(repoRoot, ...runDirRelative.split("/"));

		try {
			mkdirSync(runDir);
			return { runDir, runDirRelative };
		} catch (error) {
			if (isAlreadyExistsError(error)) {
				nextRunNumber += 1;
				continue;
			}

			throw error;
		}
	}
}

function parseRunDirectoryNumber(entryName: string): number | null {
	const match = /^run-(\d+)$/u.exec(entryName);
	const runNumber = match?.[1];
	if (runNumber === undefined) {
		return null;
	}

	return Number.parseInt(runNumber, 10);
}

function isAlreadyExistsError(error: unknown): boolean {
	return (
		error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "EEXIST"
	);
}

function resolveExpectedStdoutBytes(fixture: LoadedFixtureManifest): Buffer | null {
	return readExpectedOutput(fixture.manifest.stdout, fixture.layout.stdoutGoldenPath);
}

function resolveExpectedStderrBytes(oracle: StderrOracle): Buffer | null {
	return oracle.kind === "empty" ? Buffer.alloc(0) : null;
}

function readExpectedOutput(oracle: StdoutOracle, goldenPath: string): Buffer | null {
	switch (oracle.kind) {
		case "ignored":
			return null;
		case "empty":
			return Buffer.alloc(0);
		case "exact":
			return Buffer.from(oracle.value, "utf8");
		case "golden":
			return readFileSync(goldenPath);
	}
}

function writeOptionalBuffer(
	artifactDir: string,
	filename: string,
	buffer: Buffer | null,
): string | null {
	if (buffer === null) {
		return null;
	}

	const absolutePath = resolve(artifactDir, filename);
	writeFileSync(absolutePath, buffer);
	return absolutePath;
}

function writeOptionalJson(artifactDir: string, filename: string, value: unknown): string | null {
	if (value === null) {
		return null;
	}

	const absolutePath = resolve(artifactDir, filename);
	writeFileSync(absolutePath, `${JSON.stringify(value, null, "\t")}\n`);
	return absolutePath;
}

function toArtifactRelativePath(pathValue: string | null, artifactDir: string): string | null {
	if (pathValue === null) {
		return null;
	}

	return pathValue
		.slice(artifactDir.length + 1)
		.split(sep)
		.join(posix.sep);
}

function serializeSnapshot(snapshot: FilesystemSnapshotEntry[]): unknown[] {
	return snapshot.map((entry) => {
		switch (entry.kind) {
			case "dir":
				return {
					path: entry.path,
					kind: entry.kind,
				};
			case "file":
				return {
					path: entry.path,
					kind: entry.kind,
					size: entry.bytes.length,
					bytes_base64: entry.bytes.toString("base64"),
				};
			case "symlink":
				return {
					path: entry.path,
					kind: entry.kind,
					target_size: entry.target_raw.length,
					target_raw_base64: entry.target_raw.toString("base64"),
				};
		}

		return entry;
	});
}

function serializeFilesystemDiff(diff: FilesystemMutationDiff): Record<string, unknown> {
	return {
		added: serializeSnapshot(diff.added),
		removed: serializeSnapshot(diff.removed),
		changed: diff.changed.map((entry) => ({
			path: entry.path,
			before: serializeSnapshot([entry.before])[0],
			after: serializeSnapshot([entry.after])[0],
		})),
		type_changed: diff.typeChanged.map((entry) => ({
			path: entry.path,
			before: serializeSnapshot([entry.before])[0],
			after: serializeSnapshot([entry.after])[0],
		})),
	};
}

function serializeError(error: unknown): Record<string, unknown> | null {
	if (error === null || error === undefined) {
		return null;
	}

	if (!(error instanceof Error)) {
		return { value: String(error) };
	}

	return {
		name: error.name,
		message: error.message,
	};
}

function resolvePhaseTraceEvents(input: FixtureRunArtifactInput): FixturePhaseTraceEvent[] {
	return (
		input.processResult?.phaseTraceEvents ??
		input.processTimeoutError?.phaseTraceEvents ??
		input.processError?.phaseTraceEvents ??
		[]
	);
}

function resolvePhaseTimings(input: FixtureRunArtifactInput): FixturePhaseTiming[] {
	return (
		input.processResult?.phaseTimings ??
		input.processTimeoutError?.phaseTimings ??
		input.processError?.phaseTimings ??
		[]
	);
}

function resolvePhaseTraceRaw(input: FixtureRunArtifactInput): Buffer | null {
	return (
		input.processResult?.phaseTraceRaw ??
		input.processTimeoutError?.phaseTraceRaw ??
		input.processError?.phaseTraceRaw ??
		null
	);
}

function resolveTotalDurationMs(input: FixtureRunArtifactInput): number | null {
	return (
		input.recordTotalDurationMs ??
		input.processResult?.totalDurationMs ??
		input.processTimeoutError?.totalDurationMs ??
		input.processError?.totalDurationMs ??
		null
	);
}

function resolveHarnessDurationMs(input: FixtureRunArtifactInput): number | null {
	return input.recordHarnessDurationMs;
}

function resolvePhaseTraceStatus(input: FixtureRunArtifactInput): FixturePhaseTraceStatus | null {
	return (
		input.processResult?.phaseTraceStatus ??
		input.processTimeoutError?.phaseTraceStatus ??
		input.processError?.phaseTraceStatus ??
		null
	);
}

export function resolveFixtureRunLastFailedPhase(input: {
	recordStatus: "pass" | "fail";
	processResult: FixtureProcessResult | null;
	processTimeoutError: FixtureProcessTimeoutError | null;
	processError: FixtureProcessError | null;
}): FixturePhaseName | null {
	if (input.recordStatus === "pass") {
		return null;
	}

	const tracedLastFailedPhase =
		input.processResult?.lastFailedPhase ??
		input.processTimeoutError?.lastFailedPhase ??
		input.processError?.lastFailedPhase ??
		null;
	if (tracedLastFailedPhase !== null) {
		return tracedLastFailedPhase;
	}

	return null;
}

function resolveLastFailedPhase(input: FixtureRunArtifactInput): FixturePhaseName | null {
	return resolveFixtureRunLastFailedPhase(input);
}

function renderFixtureArtifactSummary(
	input: FixtureRunArtifactInput,
	artifactDirRelative: string,
	artifacts: Record<string, string | null>,
	override: {
		totalDurationMs: number | null;
		harnessDurationMs: number | null;
		lastFailedPhase: FixturePhaseName | null;
		phaseTraceStatus: FixturePhaseTraceStatus | null;
	},
): string {
	const lines = [
		`Fixture ${input.fixture?.manifest.id ?? input.entryFixtureId}`,
		`status: ${input.recordStatus}`,
		`failed oracle: ${input.failedOracle ?? "none"}`,
		`summary: ${input.summary}`,
		`total duration ms: ${override.totalDurationMs ?? "none"}`,
		`harness duration ms: ${override.harnessDurationMs ?? "none"}`,
		`last failed phase: ${override.lastFailedPhase ?? "none"}`,
		`trace status: ${override.phaseTraceStatus?.state ?? "none"}`,
		`artifacts: ${artifactDirRelative}`,
	];

	if (override.phaseTraceStatus?.detail) {
		lines.push(`trace detail: ${override.phaseTraceStatus.detail}`);
	}

	for (const [label, relativePath] of Object.entries(artifacts)) {
		if (!relativePath) {
			continue;
		}
		lines.push(`${label}: ${relativePath}`);
	}

	return lines.join("\n");
}
