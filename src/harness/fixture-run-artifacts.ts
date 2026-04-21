import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, posix, resolve, sep } from "node:path";

import type { FilesystemMutationDiff } from "./fixture-filesystem-oracle";
import type { LoadedFixtureManifest, StderrOracle, StdoutOracle } from "./fixture-manifest";
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

export function prepareFixtureRunnerArtifacts(
	fixturesRoot: string,
	selection: { fixtureId?: string; family?: string },
): FixtureRunnerArtifactsLayout {
	const repoRoot = resolveArtifactRepoRoot(fixturesRoot);
	const selectionDirRelative = posix.join(".tmp", "fixture-runs", renderSelectionLabel(selection));
	const selectionDir = resolve(repoRoot, ...selectionDirRelative.split("/"));
	const { runDir, runDirRelative } = reserveNextRunDirectory(repoRoot, selectionDir, selectionDirRelative);
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

	const actualStdout = input.processResult?.stdout ?? input.processTimeoutError?.stdout ?? null;
	const actualStderr = input.processResult?.stderr ?? input.processTimeoutError?.stderr ?? null;
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

	const metadata = {
		fixture_id: input.fixture?.manifest.id ?? input.entryFixtureId,
		family: input.fixture?.manifest.family ?? input.entryFamily,
		status: input.recordStatus,
		failed_oracle: input.failedOracle,
		summary: input.summary,
		command: input.processResult?.command ?? input.fixture?.manifest.command ?? null,
		cwd: input.processResult?.cwd ?? input.sandbox?.cwd ?? null,
		exit_code: input.processResult?.exitCode ?? null,
		declared_exit_code: input.fixture?.manifest.exit_code ?? null,
		stdout_length:
			input.processResult?.stdoutLength ?? input.processTimeoutError?.stdoutLength ?? null,
		stderr_length:
			input.processResult?.stderrLength ?? input.processTimeoutError?.stderrLength ?? null,
		oracles: {
			exit_code: {
				status: input.oracleStatuses.exitCode,
				expected: input.fixture?.manifest.exit_code ?? null,
				actual: input.processResult?.exitCode ?? null,
			},
			stdout: {
				status: input.oracleStatuses.stdout,
				kind: input.fixture?.manifest.stdout.kind ?? null,
			},
			stderr: {
				status: input.oracleStatuses.stderr,
				kind: input.fixture?.manifest.stderr.kind ?? null,
			},
			filesystem: {
				status: input.oracleStatuses.filesystem,
				kind: input.fixture?.manifest.filesystem.kind ?? null,
			},
		},
		artifacts: {
			stdout_actual: toArtifactRelativePath(stdoutActualPath, artifactDir),
			stdout_expected: toArtifactRelativePath(stdoutExpectedPath, artifactDir),
			stderr_actual: toArtifactRelativePath(stderrActualPath, artifactDir),
			stderr_expected: toArtifactRelativePath(stderrExpectedPath, artifactDir),
			filesystem_pre: toArtifactRelativePath(preRunSnapshotPath, artifactDir),
			filesystem_post: toArtifactRelativePath(postRunSnapshotPath, artifactDir),
			filesystem_diff: toArtifactRelativePath(filesystemDiffPath, artifactDir),
		},
		error: serializeError(input.error),
	};

	writeFileSync(metadataPath, `${JSON.stringify(metadata, null, "\t")}\n`);
	writeFileSync(
		summaryPath,
		`${renderFixtureArtifactSummary(input, artifactDirRelative, metadata.artifacts)}\n`,
	);

	return {
		artifactDir,
		artifactDirRelative,
		summaryPath,
		summaryPathRelative,
		metadataPath,
		metadataPathRelative,
	};
}

export function writeFixtureRunnerSummaryArtifacts(
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
			artifactDirRelative: string;
			metadataPathRelative: string;
			summaryPathRelative: string;
		}>;
	},
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
				summary_path: layout.summaryPathRelative,
				records: summary.records.map((record) => ({
					fixture_id: record.fixtureId,
					family: record.family,
					status: record.status,
					failed_oracle: record.failedOracle,
					summary: record.summary,
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
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "EEXIST"
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

function renderFixtureArtifactSummary(
	input: FixtureRunArtifactInput,
	artifactDirRelative: string,
	artifacts: Record<string, string | null>,
): string {
	const lines = [
		`Fixture ${input.fixture?.manifest.id ?? input.entryFixtureId}`,
		`status: ${input.recordStatus}`,
		`failed oracle: ${input.failedOracle ?? "none"}`,
		`summary: ${input.summary}`,
		`artifacts: ${artifactDirRelative}`,
	];

	for (const [label, relativePath] of Object.entries(artifacts)) {
		if (!relativePath) {
			continue;
		}
		lines.push(`${label}: ${relativePath}`);
	}

	return lines.join("\n");
}
