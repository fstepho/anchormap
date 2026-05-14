import { validateAnchorId } from "../domain/anchor-id";
import { type RepoPath, validateRepoPath } from "../domain/repo-path";
import { runScanEngine } from "../domain/scan-engine";
import { type Config, loadConfig, writeConfigAtomic } from "../infra/config-io";
import { discoverProductFiles } from "../infra/product-files";
import { statRepoPath } from "../infra/repo-fs";
import { buildScaffoldMarkdown, writeScaffoldOutputCreateOnly } from "../infra/scaffold";
import { buildSpecIndex } from "../infra/spec-index";
import { buildProductGraph } from "../infra/ts-graph";
import { loadLocalAliases } from "../infra/tsconfig-io";
import { renderScanResultHuman, renderScanResultJson } from "../render/render-json";
import {
	type ParsedInitArgs,
	type ParsedMapArgs,
	type ParsedScaffoldArgs,
	parseInitArgs,
	parseMapArgs,
	parseScaffoldArgs,
	parseScanArgs,
	type ScanOutputMode,
} from "./command-args";
import {
	buildConfigWithMappedSeedFiles,
	findDuplicateRepoPath,
	findOverlappingRepoPaths,
	isRepoPathDescendantOf,
	normalizeInitPath,
	normalizeInitPathList,
	validateConfigDoesNotExist,
	validateMapSeedPreconditions,
	validateMapSeedsInProductFiles,
	validateRawMapArgs,
	validateRawScaffoldArgs,
	validateScaffoldOutputCaseCollision,
	validateScaffoldOutputPreconditions,
} from "./command-preconditions";
import {
	type AnchormapCommandResult,
	type AnchormapCommandSuccess,
	type AppError,
	commandSuccess,
	exitCodeForAppError,
	internalError,
	type TextWriter,
	usageError,
} from "./command-result";

export type AnchormapCommandName = "init" | "map" | "scan" | "scaffold";
export type {
	ParsedInitArgs,
	ParsedMapArgs,
	ParsedScaffoldArgs,
	ScanOutputMode,
} from "./command-args";
export { validateMapSeedsInProductFiles } from "./command-preconditions";
export {
	type AppError,
	type AppErrorKind,
	commandSuccess,
	configError,
	exitCodeForAppError,
	internalError,
	unsupportedRepoError,
	usageError,
	writeAppError,
} from "./command-result";

export interface AnchormapCommandContext {
	args: readonly string[];
	cwd: string;
	stdout: TextWriter;
	stderr: TextWriter;
	initArgs?: ParsedInitArgs;
	mapArgs?: ParsedMapArgs;
	scaffoldArgs?: ParsedScaffoldArgs;
	scanMode?: ScanOutputMode;
}

export type AnchormapCommandHandlers = {
	[command in AnchormapCommandName]: (context: AnchormapCommandContext) => AnchormapCommandResult;
};

export interface AnchormapRunOptions {
	cwd?: string;
	stdout?: TextWriter;
	stderr?: TextWriter;
	handlers?: Partial<AnchormapCommandHandlers>;
}

const SUPPORTED_COMMANDS = new Set<AnchormapCommandName>(["init", "map", "scan", "scaffold"]);

const DEFAULT_HANDLERS: AnchormapCommandHandlers = {
	init: runInitCommand,
	map: runMapCommandStub,
	scan: runScanCommandStub,
	scaffold: runScaffoldCommand,
};

export function runAnchormap(argv: readonly string[], options: AnchormapRunOptions = {}): number {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	const handlers: AnchormapCommandHandlers = {
		...DEFAULT_HANDLERS,
		...options.handlers,
	};
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
		const validatedMap = validateRawMapArgs(parsedMap.args);
		if (validatedMap.kind === "usage_error") {
			return writeErrorDiagnostic({ kind: "UsageError", message: validatedMap.message }, stderr);
		}

		return dispatchCommand(
			{
				args,
				cwd,
				stdout,
				stderr,
				mapArgs: validatedMap.args,
			},
			handlers.map,
		);
	}

	if (command === "scaffold") {
		const parsedScaffold = parseScaffoldArgs(args);
		if (parsedScaffold.kind === "usage_error") {
			return writeErrorDiagnostic({ kind: "UsageError", message: parsedScaffold.message }, stderr);
		}
		const validatedScaffold = validateRawScaffoldArgs(parsedScaffold.args);
		if (validatedScaffold.kind === "usage_error") {
			return writeErrorDiagnostic(
				{ kind: "UsageError", message: validatedScaffold.message },
				stderr,
			);
		}

		return dispatchCommand(
			{
				args,
				cwd,
				stdout,
				stderr,
				scaffoldArgs: validatedScaffold.args,
			},
			handlers.scaffold,
		);
	}

	throw new Error(`unhandled command ${command}`);
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
	if (stdoutText.indexOf("\n") !== stdoutText.length - 1) {
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

	const localAliasesResult = loadLocalAliases(configResult.config, {
		cwd: context.cwd,
	});
	if (localAliasesResult.kind === "error") {
		return localAliasesResult.error;
	}

	const productGraphResult = buildProductGraph(
		configResult.config,
		productFilesResult.productFiles,
		{
			cwd: context.cwd,
			resolutionAliases: localAliasesResult.state.resolutionAliases,
		},
	);
	if (productGraphResult.kind === "error") {
		return productGraphResult.error;
	}

	const scanResult = runScanEngine({
		config: configResult.config,
		specIndex: specIndexResult.specIndex,
		productGraph: productGraphResult.productGraph,
		tsconfigAliasState: localAliasesResult.state,
	});

	if (context.scanMode === "json") {
		return commandSuccess({
			stdout: renderScanResultJson(scanResult),
		});
	}

	return commandSuccess({
		stdout: renderScanResultHuman(scanResult),
	});
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

	const seedPreconditions = validateMapSeedPreconditions(
		configResult.config,
		args.seeds,
		context.cwd,
	);
	if (seedPreconditions.kind === "error") {
		return seedPreconditions.error;
	}

	const inspectedPathCaseIndex = new Map<string, RepoPath>();
	const specIndexResult = buildSpecIndex(configResult.config, {
		cwd: context.cwd,
		inspectedPathCaseIndex,
	});
	if (specIndexResult.kind === "error") {
		return specIndexResult.error;
	}

	if (!specIndexResult.specIndex.activeAnchors.has(anchorId)) {
		if (specIndexResult.specIndex.draftAnchors.has(anchorId)) {
			return usageError(`anchor ${anchorId} is draft; remove the draft marker before mapping it`);
		}
		return usageError(`anchor ${anchorId} is not present in current specs`);
	}

	const productFilesResult = discoverProductFiles(configResult.config, {
		cwd: context.cwd,
		inspectedPathCaseIndex,
	});
	if (productFilesResult.kind === "error") {
		return productFilesResult.error;
	}

	const seedMembership = validateMapSeedsInProductFiles(
		args.seeds,
		productFilesResult.productFiles,
	);
	if (seedMembership.kind === "error") {
		return seedMembership.error;
	}

	const localAliasesResult = loadLocalAliases(configResult.config, {
		cwd: context.cwd,
	});
	if (localAliasesResult.kind === "error") {
		return localAliasesResult.error;
	}

	const productGraphResult = buildProductGraph(
		configResult.config,
		productFilesResult.productFiles,
		{
			cwd: context.cwd,
			resolutionAliases: localAliasesResult.state.resolutionAliases,
		},
	);
	if (productGraphResult.kind === "error") {
		return productGraphResult.error;
	}

	const mappedConfig = buildConfigWithMappedSeedFiles(configResult.config, anchorId, args.seeds);
	if (mappedConfig.kind === "error") {
		return mappedConfig.error;
	}

	const writeResult = writeConfigAtomic(mappedConfig.config, { cwd: context.cwd });
	if (writeResult.kind === "error") {
		return writeResult.error;
	}

	return commandSuccess();
}

function runScaffoldCommand(context: AnchormapCommandContext): AnchormapCommandResult {
	const args = context.scaffoldArgs;
	if (args === undefined) {
		return internalError("scaffold arguments were not parsed");
	}

	const outputResult = validateRepoPath(args.output);
	if (outputResult.kind === "validation_failure") {
		return internalError("validated scaffold output became invalid");
	}
	const output = outputResult.repoPath;

	const configResult = loadConfig({ cwd: context.cwd });
	if (configResult.kind === "error") {
		return configResult.error;
	}

	const outputPreconditions = validateScaffoldOutputPreconditions(
		configResult.config,
		output,
		context.cwd,
	);
	if (outputPreconditions.kind === "error") {
		return outputPreconditions.error;
	}

	const inspectedPathCaseIndex = new Map<string, RepoPath>();
	const specIndexResult = buildSpecIndex(configResult.config, {
		cwd: context.cwd,
		inspectedPathCaseIndex,
	});
	if (specIndexResult.kind === "error") {
		return specIndexResult.error;
	}
	const outputCaseCollision = validateScaffoldOutputCaseCollision(output, inspectedPathCaseIndex);
	if (outputCaseCollision.kind === "error") {
		return outputCaseCollision.error;
	}

	const productFilesResult = discoverProductFiles(configResult.config, {
		cwd: context.cwd,
		inspectedPathCaseIndex,
	});
	if (productFilesResult.kind === "error") {
		return productFilesResult.error;
	}

	const scaffoldResult = buildScaffoldMarkdown(
		configResult.config,
		productFilesResult.productFiles,
		specIndexResult.specIndex,
		{ cwd: context.cwd },
	);
	if (scaffoldResult.kind === "error") {
		return scaffoldResult.error;
	}

	const writeResult = writeScaffoldOutputCreateOnly(output, scaffoldResult.markdown, {
		cwd: context.cwd,
	});
	if (writeResult.kind === "error") {
		return writeResult.error;
	}

	return commandSuccess();
}
