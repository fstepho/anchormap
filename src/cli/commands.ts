import { lstatSync } from "node:fs";
import { join } from "node:path";

import { validateAnchorId } from "../domain/anchor-id";
import { normalizeUserPathArg, type RepoPath, repoPathToString } from "../domain/repo-path";
import { createConfigView, createFileView, createScanResultView } from "../domain/scan-result";
import {
	ANCHORMAP_CONFIG_FILENAME,
	type Config,
	loadConfig,
	writeConfigAtomic,
} from "../infra/config-io";
import { discoverProductFiles } from "../infra/product-files";
import { statRepoPath } from "../infra/repo-fs";
import { buildSpecIndex } from "../infra/spec-index";
import {
	buildProductGraph,
	productGraphHasSupportedLocalDependencySyntax,
} from "../infra/ts-graph";
import { renderScanResultJson } from "../render/render-json";
import {
	type ParsedInitArgs,
	type ParsedMapArgs,
	parseInitArgs,
	parseMapArgs,
	parseScanArgs,
	type ScanOutputMode,
} from "./command-args";

export type AnchormapCommandName = "init" | "map" | "scan";
export type { ParsedInitArgs, ParsedMapArgs, ScanOutputMode } from "./command-args";

export interface TextWriter {
	write(chunk: string): unknown;
}

export type AppErrorKind =
	| "UsageError"
	| "ConfigError"
	| "UnsupportedRepoError"
	| "WriteError"
	| "InternalError";

export interface AppError {
	kind: AppErrorKind;
	message?: string;
	cause?: unknown;
}

export interface AnchormapCommandSuccess {
	kind: "success";
	stdout?: string;
	stderr?: string;
}

export type AnchormapCommandResult = AnchormapCommandSuccess | AppError;

export interface AnchormapCommandContext {
	args: readonly string[];
	cwd: string;
	stdout: TextWriter;
	stderr: TextWriter;
	initArgs?: ParsedInitArgs;
	mapArgs?: ParsedMapArgs;
	scanMode?: ScanOutputMode;
}

export type AnchormapCommandHandlers = {
	[command in AnchormapCommandName]: (context: AnchormapCommandContext) => AnchormapCommandResult;
};

export interface AnchormapRunOptions {
	cwd?: string;
	stdout?: TextWriter;
	stderr?: TextWriter;
	handlers?: AnchormapCommandHandlers;
}

const SUPPORTED_COMMANDS = new Set<AnchormapCommandName>(["init", "map", "scan"]);

const DEFAULT_HANDLERS: AnchormapCommandHandlers = {
	init: runInitCommand,
	map: runMapCommandStub,
	scan: runScanCommandStub,
};

export function runAnchormap(argv: readonly string[], options: AnchormapRunOptions = {}): number {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	const handlers = options.handlers ?? DEFAULT_HANDLERS;
	const cwd = options.cwd ?? process.cwd();
	const [command, ...args] = argv;

	if (command === undefined) {
		return writeErrorDiagnostic({ kind: "UsageError", message: "missing command" }, stderr);
	}

	if (!isSupportedCommand(command)) {
		return writeErrorDiagnostic(
			{ kind: "UsageError", message: `unknown command "${command}"` },
			stderr,
		);
	}

	if (command === "scan") {
		const parsedScan = parseScanArgs(args);
		if (parsedScan.kind === "usage_error") {
			return writeErrorDiagnostic({ kind: "UsageError", message: parsedScan.message }, stderr);
		}

		return dispatchCommand(
			{
				args,
				cwd,
				stdout,
				stderr,
				scanMode: parsedScan.mode,
			},
			handlers.scan,
		);
	}

	if (command === "init") {
		const parsedInit = parseInitArgs(args);
		if (parsedInit.kind === "usage_error") {
			return writeErrorDiagnostic({ kind: "UsageError", message: parsedInit.message }, stderr);
		}

		return dispatchCommand(
			{
				args,
				cwd,
				stdout,
				stderr,
				initArgs: parsedInit.args,
			},
			handlers.init,
		);
	}

	if (command === "map") {
		const parsedMap = parseMapArgs(args);
		if (parsedMap.kind === "usage_error") {
			return writeErrorDiagnostic({ kind: "UsageError", message: parsedMap.message }, stderr);
		}

		return dispatchCommand(
			{
				args,
				cwd,
				stdout,
				stderr,
				mapArgs: parsedMap.args,
			},
			handlers.map,
		);
	}

	throw new Error(`unhandled command ${command}`);
}

export function exitCodeForAppError(error: AppError): number {
	switch (error.kind) {
		case "UsageError":
			return 4;
		case "ConfigError":
			return 2;
		case "UnsupportedRepoError":
			return 3;
		case "WriteError":
		case "InternalError":
			return 1;
	}
}

export function commandSuccess(
	output: Omit<AnchormapCommandSuccess, "kind"> = {},
): AnchormapCommandSuccess {
	return {
		kind: "success",
		...output,
	};
}

export function usageError(message?: string): AppError {
	return appError("UsageError", message);
}

export function configError(message?: string): AppError {
	return appError("ConfigError", message);
}

export function unsupportedRepoError(message?: string): AppError {
	return appError("UnsupportedRepoError", message);
}

export function writeAppError(message?: string): AppError {
	return appError("WriteError", message);
}

export function internalError(message?: string, cause?: unknown): AppError {
	return {
		kind: "InternalError",
		message,
		cause,
	};
}

function appError(kind: Exclude<AppErrorKind, "InternalError">, message?: string): AppError {
	return {
		kind,
		message,
	};
}

function dispatchCommand(
	context: AnchormapCommandContext,
	handler: (context: AnchormapCommandContext) => AnchormapCommandResult,
): number {
	const capturedStdout = createBufferedWriter();
	const capturedStderr = createBufferedWriter();
	let result: AnchormapCommandResult;

	try {
		result = handler({
			...context,
			stdout: capturedStdout.writer,
			stderr: capturedStderr.writer,
		});
	} catch (error) {
		result = internalError("internal error", error);
	}

	const stdoutText =
		capturedStdout.read() + (isCommandSuccess(result) ? (result.stdout ?? "") : "");
	const stderrText =
		capturedStderr.read() + (isCommandSuccess(result) ? (result.stderr ?? "") : "");

	if (isCommandSuccess(result)) {
		if (context.scanMode === "json") {
			const scanJsonError = validateScanJsonSuccessOutput(stdoutText, stderrText);
			if (scanJsonError) {
				return writeErrorDiagnostic(scanJsonError, context.stderr);
			}
		}

		context.stdout.write(stdoutText);
		if (context.scanMode !== "json") {
			context.stderr.write(stderrText);
		}
		return 0;
	}

	return writeFailure(result, context, stderrText);
}

function validateScanJsonSuccessOutput(
	stdoutText: string,
	stderrText: string,
): AppError | undefined {
	if (stderrText.length > 0) {
		return internalError("scan --json success wrote stderr");
	}
	if (stdoutText.length === 0) {
		return internalError("scan --json success wrote no stdout");
	}
	if (!stdoutText.endsWith("\n")) {
		return internalError("scan --json success stdout missing final newline");
	}
	if (stdoutText.slice(0, -1).includes("\n")) {
		return internalError("scan --json success stdout is not a single physical line");
	}
	return undefined;
}

function writeFailure(
	error: AppError,
	context: AnchormapCommandContext,
	capturedStderr: string,
): number {
	if (context.scanMode === "json") {
		if (capturedStderr.length > 0) {
			context.stderr.write(ensureFinalNewline(capturedStderr));
		} else {
			writeDiagnostic(error, context.stderr);
		}
		return exitCodeForAppError(error);
	}

	writeDiagnostic(error, context.stderr);
	return exitCodeForAppError(error);
}

function writeErrorDiagnostic(error: AppError, stderr: TextWriter): number {
	writeDiagnostic(error, stderr);
	return exitCodeForAppError(error);
}

function writeDiagnostic(error: AppError, stderr: TextWriter): void {
	stderr.write(`${error.message ?? error.kind}\n`);
}

function ensureFinalNewline(text: string): string {
	return text.endsWith("\n") ? text : `${text}\n`;
}

function isCommandSuccess(result: AnchormapCommandResult): result is AnchormapCommandSuccess {
	return result.kind === "success";
}

function createBufferedWriter(): { writer: TextWriter; read(): string } {
	const chunks: string[] = [];

	return {
		writer: {
			write(chunk: string): unknown {
				chunks.push(chunk);
				return true;
			},
		},
		read() {
			return chunks.join("");
		},
	};
}

function isSupportedCommand(command: string): command is AnchormapCommandName {
	return SUPPORTED_COMMANDS.has(command as AnchormapCommandName);
}

function runInitCommand(context: AnchormapCommandContext): AnchormapCommandResult {
	const args = context.initArgs;
	if (args === undefined) {
		return internalError("init arguments were not parsed");
	}

	const productRoot = normalizeInitPath(args.root, "--root");
	if (productRoot.kind === "error") {
		return productRoot.error;
	}

	const specRoots = normalizeInitPathList(args.specRoots, "--spec-root");
	if (specRoots.kind === "error") {
		return specRoots.error;
	}

	const ignoreRoots = normalizeInitPathList(args.ignoreRoots, "--ignore-root");
	if (ignoreRoots.kind === "error") {
		return ignoreRoots.error;
	}

	const duplicateSpecRoot = findDuplicateRepoPath(specRoots.paths);
	if (duplicateSpecRoot !== undefined) {
		return usageError(`duplicate --spec-root ${duplicateSpecRoot}`);
	}

	const overlappingSpecRoots = findOverlappingRepoPaths(specRoots.paths);
	if (overlappingSpecRoots !== undefined) {
		return usageError(
			`overlapping --spec-root ${overlappingSpecRoots.ancestor} and ${overlappingSpecRoots.descendant}`,
		);
	}

	const duplicateIgnoreRoot = findDuplicateRepoPath(ignoreRoots.paths);
	if (duplicateIgnoreRoot !== undefined) {
		return usageError(`duplicate --ignore-root ${duplicateIgnoreRoot}`);
	}

	const overlappingIgnoreRoots = findOverlappingRepoPaths(ignoreRoots.paths);
	if (overlappingIgnoreRoots !== undefined) {
		return usageError(
			`overlapping --ignore-root ${overlappingIgnoreRoots.ancestor} and ${overlappingIgnoreRoots.descendant}`,
		);
	}

	const createOnly = validateConfigDoesNotExist(context.cwd);
	if (createOnly.kind === "error") {
		return createOnly.error;
	}

	const productRootStatus = statRepoPath(context.cwd, productRoot.path);
	if (productRootStatus.kind !== "directory") {
		return usageError("--root must be an existing directory");
	}

	for (const specRoot of specRoots.paths) {
		const specRootStatus = statRepoPath(context.cwd, specRoot);
		if (specRootStatus.kind !== "directory") {
			return usageError(`--spec-root ${specRoot} must be an existing directory`);
		}
	}

	for (const ignoreRoot of ignoreRoots.paths) {
		const ignoreRootStatus = statRepoPath(context.cwd, ignoreRoot);
		if (ignoreRootStatus.kind === "missing") {
			continue;
		}
		if (ignoreRootStatus.kind === "inaccessible") {
			return usageError(`--ignore-root ${ignoreRoot} could not be validated`);
		}
		if (!isRepoPathDescendantOf(ignoreRoot, productRoot.path)) {
			return usageError(`--ignore-root ${ignoreRoot} must be under --root`);
		}
	}

	const config: Config = {
		version: 1,
		productRoot: productRoot.path,
		specRoots: specRoots.paths,
		ignoreRoots: ignoreRoots.paths,
		mappings: {},
	};

	const writeResult = writeConfigAtomic(config, { cwd: context.cwd });
	if (writeResult.kind === "error") {
		return writeResult.error;
	}

	return commandSuccess();
}

function runScanCommandStub(context: AnchormapCommandContext): AnchormapCommandResult {
	const configResult = loadConfig({ cwd: context.cwd });
	if (configResult.kind === "error") {
		return configResult.error;
	}

	const inspectedPathCaseIndex = new Map<string, RepoPath>();
	const specIndexResult = buildSpecIndex(configResult.config, {
		cwd: context.cwd,
		inspectedPathCaseIndex,
	});
	if (specIndexResult.kind === "error") {
		return specIndexResult.error;
	}

	const productFilesResult = discoverProductFiles(configResult.config, {
		cwd: context.cwd,
		inspectedPathCaseIndex,
	});
	if (productFilesResult.kind === "error") {
		return productFilesResult.error;
	}

	const productGraphResult = buildProductGraph(
		configResult.config,
		productFilesResult.productFiles,
		{
			cwd: context.cwd,
		},
	);
	if (productGraphResult.kind === "error") {
		return productGraphResult.error;
	}

	if (
		context.scanMode === "json" &&
		!productGraphHasSupportedLocalDependencySyntax(productGraphResult.productGraph) &&
		specIndexResult.specIndex.observedAnchors.size === 0 &&
		Object.keys(configResult.config.mappings).length === 0
	) {
		return commandSuccess({
			stdout: renderScanResultJson(
				createScanResultView({
					config: createConfigView({
						product_root: configResult.config.productRoot,
						spec_roots: configResult.config.specRoots,
						ignore_roots: configResult.config.ignoreRoots,
					}),
					observed_anchors: {},
					stored_mappings: {},
					files: createEmptyProductFilesView(productGraphResult.productGraph.productFiles),
					findings: productGraphResult.productGraph.graphFindings,
				}),
			),
		});
	}

	return internalError("anchormap scan is not implemented yet");
}

function runMapCommandStub(context: AnchormapCommandContext): AnchormapCommandResult {
	const args = context.mapArgs;
	if (args === undefined) {
		return internalError("map arguments were not parsed");
	}

	const anchorResult = validateAnchorId(args.anchor);
	if (anchorResult.kind === "validation_failure") {
		return usageError("--anchor must be a supported anchor ID");
	}

	const configResult = loadConfig({ cwd: context.cwd });
	if (configResult.kind === "error") {
		return configResult.error;
	}

	const anchorId = anchorResult.anchorId;
	if (configResult.config.mappings[anchorId] !== undefined && !args.replace) {
		return usageError(`mapping for ${anchorId} already exists`);
	}

	const inspectedPathCaseIndex = new Map<string, RepoPath>();
	const specIndexResult = buildSpecIndex(configResult.config, {
		cwd: context.cwd,
		inspectedPathCaseIndex,
	});
	if (specIndexResult.kind === "error") {
		return specIndexResult.error;
	}

	if (!specIndexResult.specIndex.observedAnchors.has(anchorId)) {
		return usageError(`anchor ${anchorId} is not present in current specs`);
	}

	const productFilesResult = discoverProductFiles(configResult.config, {
		cwd: context.cwd,
		inspectedPathCaseIndex,
	});
	if (productFilesResult.kind === "error") {
		return productFilesResult.error;
	}

	const productGraphResult = buildProductGraph(
		configResult.config,
		productFilesResult.productFiles,
		{
			cwd: context.cwd,
		},
	);
	if (productGraphResult.kind === "error") {
		return productGraphResult.error;
	}

	return internalError("anchormap map is not implemented yet");
}

function createEmptyProductFilesView(productFiles: readonly RepoPath[]) {
	return Object.fromEntries(
		productFiles.map((productFile) => [
			productFile,
			createFileView({
				covering_anchor_ids: [],
				supported_local_targets: [],
			}),
		]),
	);
}

function normalizeInitPath(
	value: string,
	optionName: string,
): { kind: "ok"; path: RepoPath } | { kind: "error"; error: AppError } {
	const result = normalizeUserPathArg(value);
	if (result.kind === "validation_failure") {
		return { kind: "error", error: usageError(`${optionName} must be a valid repository path`) };
	}

	return { kind: "ok", path: result.repoPath };
}

function normalizeInitPathList(
	values: readonly string[],
	optionName: string,
): { kind: "ok"; paths: RepoPath[] } | { kind: "error"; error: AppError } {
	const paths: RepoPath[] = [];
	for (const value of values) {
		const result = normalizeInitPath(value, optionName);
		if (result.kind === "error") {
			return result;
		}
		paths.push(result.path);
	}

	return { kind: "ok", paths };
}

function findDuplicateRepoPath(paths: readonly RepoPath[]): RepoPath | undefined {
	const seen = new Set<string>();
	for (const path of paths) {
		const value = repoPathToString(path);
		if (seen.has(value)) {
			return path;
		}
		seen.add(value);
	}

	return undefined;
}

function findOverlappingRepoPaths(
	paths: readonly RepoPath[],
): { ancestor: RepoPath; descendant: RepoPath } | undefined {
	for (let leftIndex = 0; leftIndex < paths.length; leftIndex += 1) {
		for (let rightIndex = leftIndex + 1; rightIndex < paths.length; rightIndex += 1) {
			const left = paths[leftIndex];
			const right = paths[rightIndex];
			if (isRepoPathDescendantOf(right, left)) {
				return {
					ancestor: left,
					descendant: right,
				};
			}
			if (isRepoPathDescendantOf(left, right)) {
				return {
					ancestor: right,
					descendant: left,
				};
			}
		}
	}

	return undefined;
}

function validateConfigDoesNotExist(
	cwd: string,
): { kind: "ok" } | { kind: "error"; error: AppError } {
	try {
		lstatSync(join(cwd, ANCHORMAP_CONFIG_FILENAME));
		return { kind: "error", error: usageError("anchormap.yaml already exists") };
	} catch (error) {
		if (isMissingPathError(error)) {
			return { kind: "ok" };
		}
		return { kind: "error", error: usageError("anchormap.yaml existence could not be validated") };
	}
}

function isRepoPathDescendantOf(path: RepoPath, possibleAncestor: RepoPath): boolean {
	const pathValue = repoPathToString(path);
	const ancestorValue = repoPathToString(possibleAncestor);
	return pathValue.startsWith(`${ancestorValue}/`);
}

function isMissingPathError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		((error as { code?: unknown }).code === "ENOENT" ||
			(error as { code?: unknown }).code === "ENOTDIR")
	);
}
