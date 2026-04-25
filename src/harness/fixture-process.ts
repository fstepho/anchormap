import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";

import type { LoadedFixtureManifest } from "./fixture-manifest";
import {
	createEmptyFixturePhaseTrace,
	FIXTURE_TRACE_ENV_VAR,
	type FixturePhaseName,
	type FixturePhaseTiming,
	type FixturePhaseTrace,
	type FixturePhaseTraceEvent,
	type FixturePhaseTraceStatus,
	loadFixturePhaseTrace,
} from "./fixture-phase-trace";
import type { MaterializedFixtureSandbox } from "./fixture-sandbox";

export interface FixtureProcessResult {
	command: string[];
	cwd: string;
	exitCode: number;
	stdout: Buffer;
	stderr: Buffer;
	stdoutLength: number;
	stderrLength: number;
	totalDurationMs: number;
	phaseTraceEvents: FixturePhaseTraceEvent[];
	phaseTimings: FixturePhaseTiming[];
	lastFailedPhase: FixturePhaseName | null;
	phaseTraceStatus: FixturePhaseTraceStatus;
	phaseTraceRaw: Buffer | null;
}

export interface FixtureProcessOptions {
	timeoutMs: number;
	traceCaptureFactory?: () => FixturePhaseTraceCapture | null;
	traceLoader?: (tracePath: string) => {
		trace: FixturePhaseTrace;
		traceStatus: FixturePhaseTraceStatus;
	};
}

export class FixtureProcessError extends Error {
	readonly command: string[];
	readonly cwd: string;
	readonly stdout: Buffer | null;
	readonly stderr: Buffer | null;
	readonly stdoutLength: number | null;
	readonly stderrLength: number | null;
	readonly totalDurationMs: number | null;
	readonly phaseTraceEvents: FixturePhaseTraceEvent[];
	readonly phaseTimings: FixturePhaseTiming[];
	readonly lastFailedPhase: FixturePhaseName | null;
	readonly phaseTraceStatus: FixturePhaseTraceStatus | null;
	readonly phaseTraceRaw: Buffer | null;

	constructor(
		message: string,
		options: {
			command: string[];
			cwd: string;
			stdout?: Buffer | null;
			stderr?: Buffer | null;
			stdoutLength?: number | null;
			stderrLength?: number | null;
			totalDurationMs?: number | null;
			phaseTraceEvents?: FixturePhaseTraceEvent[];
			phaseTimings?: FixturePhaseTiming[];
			lastFailedPhase?: FixturePhaseName | null;
			phaseTraceStatus?: FixturePhaseTraceStatus | null;
			phaseTraceRaw?: Buffer | null;
		},
	) {
		super(message);
		this.name = "FixtureProcessError";
		this.command = [...options.command];
		this.cwd = options.cwd;
		this.stdout = options.stdout ?? null;
		this.stderr = options.stderr ?? null;
		this.stdoutLength = options.stdoutLength ?? null;
		this.stderrLength = options.stderrLength ?? null;
		this.totalDurationMs = options.totalDurationMs ?? null;
		this.phaseTraceEvents = [...(options.phaseTraceEvents ?? [])];
		this.phaseTimings = [...(options.phaseTimings ?? [])];
		this.lastFailedPhase = options.lastFailedPhase ?? null;
		this.phaseTraceStatus = options.phaseTraceStatus ?? null;
		this.phaseTraceRaw = options.phaseTraceRaw ?? null;
	}
}

export class FixtureProcessTimeoutError extends FixtureProcessError {
	readonly timeoutMs: number;
	declare readonly stdout: Buffer;
	declare readonly stderr: Buffer;
	declare readonly stdoutLength: number;
	declare readonly stderrLength: number;
	declare readonly totalDurationMs: number;
	declare readonly phaseTraceEvents: FixturePhaseTraceEvent[];
	declare readonly phaseTimings: FixturePhaseTiming[];
	declare readonly lastFailedPhase: FixturePhaseName | null;
	declare readonly phaseTraceStatus: FixturePhaseTraceStatus;
	declare readonly phaseTraceRaw: Buffer | null;

	constructor(options: {
		command: string[];
		cwd: string;
		timeoutMs: number;
		stdout: Buffer;
		stderr: Buffer;
		stdoutLength: number;
		stderrLength: number;
		totalDurationMs: number;
		phaseTraceEvents: FixturePhaseTraceEvent[];
		phaseTimings: FixturePhaseTiming[];
		lastFailedPhase: FixturePhaseName | null;
		phaseTraceStatus: FixturePhaseTraceStatus;
		phaseTraceRaw: Buffer | null;
	}) {
		super(`fixture command timed out after ${options.timeoutMs} ms: ${options.command.join(" ")}`, {
			command: options.command,
			cwd: options.cwd,
			phaseTraceStatus: options.phaseTraceStatus,
		});
		this.name = "FixtureProcessTimeoutError";
		this.timeoutMs = options.timeoutMs;
		this.stdout = options.stdout;
		this.stderr = options.stderr;
		this.stdoutLength = options.stdoutLength;
		this.stderrLength = options.stderrLength;
		this.totalDurationMs = options.totalDurationMs;
		this.phaseTraceEvents = options.phaseTraceEvents;
		this.phaseTimings = options.phaseTimings;
		this.lastFailedPhase = options.lastFailedPhase;
		this.phaseTraceRaw = options.phaseTraceRaw;
	}
}

const PROJECT_ROOT = resolve(__dirname, "..", "..");
const PROJECT_ENTRYPOINTS = new Set(["anchormap.js", "cli-stub.js"]);

interface FixturePhaseTraceCapture {
	traceCaptureDir: string;
	tracePath: string;
	dispose?: () => void;
}

interface PreparedFixturePhaseTraceCapture {
	traceCapture: FixturePhaseTraceCapture | null;
	traceStatus: FixturePhaseTraceStatus;
}

export async function executeFixtureCommand(
	fixture: LoadedFixtureManifest,
	sandbox: MaterializedFixtureSandbox,
	options: FixtureProcessOptions,
): Promise<FixtureProcessResult> {
	if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
		throw new FixtureProcessError("fixture process timeout must be a positive integer", {
			command: fixture.manifest.command,
			cwd: sandbox.cwd,
		});
	}

	const command = [...fixture.manifest.command];
	const spawnCommand = resolveSpawnCommand(command, sandbox.sandboxDir, sandbox.cwd);
	const executable = command[0] === "node" ? process.execPath : command[0];
	const preparedTraceCapture = prepareFixturePhaseTraceCapture(options.traceCaptureFactory);
	const traceCapture = preparedTraceCapture.traceCapture;
	const tracePath = traceCapture?.tracePath ?? null;
	const faultInjectionPreload = prepareFixtureProcessFaultInjection(fixture, sandbox);
	const startedAtNs = process.hrtime.bigint();

	return await new Promise<FixtureProcessResult>((resolve, reject) => {
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		let timedOut = false;
		let settled = false;
		const childEnv = { ...process.env };

		if (tracePath === null) {
			delete childEnv[FIXTURE_TRACE_ENV_VAR];
		} else {
			childEnv[FIXTURE_TRACE_ENV_VAR] = tracePath;
		}
		if (faultInjectionPreload !== null) {
			childEnv.NODE_OPTIONS = appendNodeRequireOption(
				childEnv.NODE_OPTIONS,
				faultInjectionPreload.preloadPath,
			);
		}

		const settle = (callback: () => void): void => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeoutHandle);
			try {
				callback();
			} finally {
				disposeFixturePhaseTraceCapture(traceCapture);
				faultInjectionPreload?.dispose();
			}
		};

		const child = spawn(executable, spawnCommand.slice(1), {
			cwd: sandbox.cwd,
			env: childEnv,
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});

		child.stdout.on("data", (chunk: Buffer | string) => {
			stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		});
		child.stderr.on("data", (chunk: Buffer | string) => {
			stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		});

		child.on("error", (error) => {
			settle(() => {
				const totalDurationMs = elapsedMilliseconds(startedAtNs);
				reject(
					new FixtureProcessError(`fixture command failed to start: ${error.message}`, {
						command,
						cwd: sandbox.cwd,
						totalDurationMs,
						phaseTraceStatus: resolveSpawnFailurePhaseTraceStatus(
							preparedTraceCapture.traceStatus,
							error,
						),
					}),
				);
			});
		});

		child.on("close", (code, signal) => {
			const stdout = Buffer.concat(stdoutChunks);
			const stderr = Buffer.concat(stderrChunks);
			const totalDurationMs = elapsedMilliseconds(startedAtNs);

			settle(() => {
				let phaseTrace: FixturePhaseTrace = createEmptyFixturePhaseTrace();
				let phaseTraceStatus = preparedTraceCapture.traceStatus;
				let phaseTraceRaw: Buffer | null = null;
				let traceLoaderError: Error | null = null;
				if (tracePath !== null) {
					try {
						const loadedTrace = (options.traceLoader ?? resolveFixturePhaseTrace)(tracePath);
						phaseTrace = loadedTrace.trace;
						phaseTraceStatus = loadedTrace.traceStatus;
						phaseTraceRaw = resolveTraceRawArtifact(tracePath, phaseTraceStatus);
					} catch (error) {
						phaseTraceRaw = readOptionalTraceFile(tracePath);
						traceLoaderError = normalizeFixtureProcessError(error);
						phaseTraceStatus = {
							state: "invalid",
							detail: traceLoaderError.message,
						};
					}
				}

				if (timedOut) {
					reject(
						new FixtureProcessTimeoutError({
							command,
							cwd: sandbox.cwd,
							timeoutMs: options.timeoutMs,
							stdout,
							stderr,
							stdoutLength: stdout.length,
							stderrLength: stderr.length,
							totalDurationMs,
							phaseTraceEvents: phaseTrace.events,
							phaseTimings: phaseTrace.timings,
							lastFailedPhase: phaseTrace.last_failed_phase,
							phaseTraceStatus,
							phaseTraceRaw,
						}),
					);
					return;
				}

				if (traceLoaderError !== null) {
					reject(
						new FixtureProcessError(
							`fixture phase trace loading failed: ${traceLoaderError.message}`,
							{
								command,
								cwd: sandbox.cwd,
								stdout,
								stderr,
								stdoutLength: stdout.length,
								stderrLength: stderr.length,
								totalDurationMs,
								phaseTraceEvents: phaseTrace.events,
								phaseTimings: phaseTrace.timings,
								lastFailedPhase: phaseTrace.last_failed_phase,
								phaseTraceStatus,
								phaseTraceRaw,
							},
						),
					);
					return;
				}

				if (signal !== null || code === null) {
					reject(
						new FixtureProcessError(
							`fixture command exited without a numeric exit code: signal=${signal ?? "none"}`,
							{
								command,
								cwd: sandbox.cwd,
								stdout,
								stderr,
								stdoutLength: stdout.length,
								stderrLength: stderr.length,
								totalDurationMs,
								phaseTraceEvents: phaseTrace.events,
								phaseTimings: phaseTrace.timings,
								lastFailedPhase: phaseTrace.last_failed_phase,
								phaseTraceStatus,
								phaseTraceRaw,
							},
						),
					);
					return;
				}

				resolve({
					command,
					cwd: sandbox.cwd,
					exitCode: code,
					stdout,
					stderr,
					stdoutLength: stdout.length,
					stderrLength: stderr.length,
					totalDurationMs,
					phaseTraceEvents: phaseTrace.events,
					phaseTimings: phaseTrace.timings,
					lastFailedPhase: phaseTrace.last_failed_phase,
					phaseTraceStatus,
					phaseTraceRaw,
				});
			});
		});

		const timeoutHandle = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, options.timeoutMs);
	});
}

interface FixtureProcessFaultInjectionPreload {
	preloadPath: string;
	dispose(): void;
}

function prepareFixtureProcessFaultInjection(
	fixture: LoadedFixtureManifest,
	sandbox: MaterializedFixtureSandbox,
): FixtureProcessFaultInjectionPreload | null {
	const marker = fixture.manifest.fault_injection?.marker;
	if (marker === "product_case_collision_in_scope") {
		if (hasNativeProductCaseCollisionEntries(sandbox.cwd)) {
			return null;
		}
		if (!isMacOsArm64()) {
			throw new FixtureProcessError(
				"fx39 synthetic case-collision fallback is only allowed on macOS arm64",
				{
					command: fixture.manifest.command,
					cwd: sandbox.cwd,
				},
			);
		}
	}
	if (marker === "product_spec_root_case_collision") {
		if (hasNativeProductSpecRootCaseCollisionEntries(sandbox.cwd)) {
			return null;
		}
		if (!isMacOsArm64()) {
			throw new FixtureProcessError(
				"cross-root synthetic case-collision fallback is only allowed on macOS arm64",
				{
					command: fixture.manifest.command,
					cwd: sandbox.cwd,
				},
			);
		}
	}
	if (
		marker !== "product_case_collision_in_scope" &&
		marker !== "product_spec_root_case_collision" &&
		marker !== "product_root_enumeration_failure"
	) {
		return null;
	}

	const preloadDir = mkdtempSync(
		resolve(tmpdir(), `anchormap-fixture-preload-${fixture.manifest.id}-`),
	);
	const preloadPath = resolve(preloadDir, "case-collision-preload.cjs");
	writeFileSync(preloadPath, renderFixtureProcessFaultInjectionPreload(marker, sandbox.cwd));

	return {
		preloadPath,
		dispose() {
			rmSync(preloadDir, { recursive: true, force: true });
		},
	};
}

function hasNativeProductCaseCollisionEntries(cwd: string): boolean {
	try {
		const names = new Set(readdirSync(resolve(cwd, "src")));
		return names.has("CASE.ts") && names.has("case.ts");
	} catch {
		return false;
	}
}

function hasNativeProductSpecRootCaseCollisionEntries(cwd: string): boolean {
	try {
		const names = new Set(readdirSync(cwd));
		return names.has("SRC") && names.has("src");
	} catch {
		return false;
	}
}

function isMacOsArm64(): boolean {
	return process.platform === "darwin" && process.arch === "arm64";
}

function renderFixtureProcessFaultInjectionPreload(marker: string, cwd: string): string {
	if (marker === "product_spec_root_case_collision") {
		return `
const fs = require("node:fs");
const path = require("node:path");
const specRoot = ${JSON.stringify(resolve(cwd, "SRC"))};
const realReaddirSync = fs.readdirSync;
const realLstatSync = fs.lstatSync;
fs.readdirSync = function readdirSyncWithCrossRootCaseCollision(targetPath, options) {
	if (path.resolve(String(targetPath)) === specRoot && options === undefined) {
		return [];
	}
	return realReaddirSync.apply(this, arguments);
};
fs.lstatSync = function lstatSyncWithCrossRootCaseCollision(targetPath) {
	if (path.resolve(String(targetPath)) !== specRoot) {
		return realLstatSync.apply(this, arguments);
	}
	return {
		isDirectory: () => true,
		isFile: () => false,
		isSymbolicLink: () => false,
	};
};
`;
	}

	if (marker === "product_root_enumeration_failure") {
		return `
const fs = require("node:fs");
const path = require("node:path");
const productRoot = ${JSON.stringify(resolve(cwd, "src"))};
const realReaddirSync = fs.readdirSync;
fs.readdirSync = function readdirSyncWithProductRootEnumerationFailure(targetPath) {
	if (path.resolve(String(targetPath)) === productRoot) {
		const error = new Error("EACCES: permission denied, scandir " + JSON.stringify(productRoot));
		error.code = "EACCES";
		error.syscall = "scandir";
		error.path = productRoot;
		throw error;
	}
	return realReaddirSync.apply(this, arguments);
};
`;
	}

	return `
const fs = require("node:fs");
const path = require("node:path");
const productRoot = ${JSON.stringify(resolve(cwd, "src"))};
const virtualFiles = new Set([
	path.join(productRoot, "CASE.ts"),
	path.join(productRoot, "case.ts"),
]);
const realReaddirSync = fs.readdirSync;
const realLstatSync = fs.lstatSync;
fs.readdirSync = function readdirSyncWithProductCaseCollision(targetPath, options) {
	const result = realReaddirSync.apply(this, arguments);
	if (path.resolve(String(targetPath)) !== productRoot || options !== undefined) {
		return result;
	}
	return [...result, "CASE.ts", "case.ts"];
};
fs.lstatSync = function lstatSyncWithProductCaseCollision(targetPath) {
	if (!virtualFiles.has(path.resolve(String(targetPath)))) {
		return realLstatSync.apply(this, arguments);
	}
	return {
		isDirectory: () => false,
		isFile: () => true,
		isSymbolicLink: () => false,
	};
};
`;
}

function appendNodeRequireOption(
	existingNodeOptions: string | undefined,
	preloadPath: string,
): string {
	const requireOption = `--require=${preloadPath}`;
	return existingNodeOptions ? `${existingNodeOptions} ${requireOption}` : requireOption;
}

function prepareFixturePhaseTraceCapture(
	traceCaptureFactory: (() => FixturePhaseTraceCapture | null) | undefined,
): PreparedFixturePhaseTraceCapture {
	if (traceCaptureFactory === undefined) {
		return {
			traceCapture: null,
			traceStatus: {
				state: "not_requested",
				detail: null,
			},
		};
	}

	try {
		const traceCapture = traceCaptureFactory();
		if (traceCapture === null) {
			return {
				traceCapture: null,
				traceStatus: {
					state: "not_requested",
					detail: null,
				},
			};
		}

		const normalizedTraceCapture = normalizeFixturePhaseTraceCapture(traceCapture);
		try {
			clearFixturePhaseTracePath(normalizedTraceCapture.tracePath);
		} catch (error) {
			disposeFixturePhaseTraceCapture(normalizedTraceCapture);
			return {
				traceCapture: null,
				traceStatus: {
					state: "setup_failed",
					detail: `failed to clear existing phase trace: ${formatErrorMessage(error)}`,
				},
			};
		}

		return {
			traceCapture: normalizedTraceCapture,
			traceStatus: {
				state: "not_emitted",
				detail: null,
			},
		};
	} catch (error) {
		return {
			traceCapture: null,
			traceStatus: {
				state: "setup_failed",
				detail: formatErrorMessage(error),
			},
		};
	}
}

function normalizeFixturePhaseTraceCapture(
	traceCapture: FixturePhaseTraceCapture,
): FixturePhaseTraceCapture {
	const normalizedTraceCaptureDir = isAbsolute(traceCapture.traceCaptureDir)
		? traceCapture.traceCaptureDir
		: resolve(traceCapture.traceCaptureDir);
	const normalizedTracePath = isAbsolute(traceCapture.tracePath)
		? traceCapture.tracePath
		: resolve(normalizedTraceCaptureDir, traceCapture.tracePath);
	assertTracePathWithinCaptureDir(normalizedTraceCaptureDir, normalizedTracePath);

	if (
		normalizedTraceCaptureDir === traceCapture.traceCaptureDir &&
		normalizedTracePath === traceCapture.tracePath
	) {
		return traceCapture;
	}

	return {
		...traceCapture,
		traceCaptureDir: normalizedTraceCaptureDir,
		tracePath: normalizedTracePath,
	};
}

function assertTracePathWithinCaptureDir(traceCaptureDir: string, tracePath: string): void {
	const relativeTracePath = relative(traceCaptureDir, tracePath);
	if (
		relativeTracePath === ".." ||
		relativeTracePath.startsWith(`..${sep}`) ||
		isAbsolute(relativeTracePath)
	) {
		throw new Error(
			`fixture phase trace path must stay within traceCaptureDir: ${tracePath} is outside ${traceCaptureDir}`,
		);
	}
}

function clearFixturePhaseTracePath(tracePath: string): void {
	rmSync(tracePath, { force: true });
}

function resolveFixturePhaseTrace(tracePath: string): {
	trace: FixturePhaseTrace;
	traceStatus: FixturePhaseTraceStatus;
} {
	if (!existsSync(tracePath)) {
		return {
			trace: createEmptyFixturePhaseTrace(),
			traceStatus: {
				state: "not_emitted",
				detail: null,
			},
		};
	}

	try {
		return {
			trace: loadFixturePhaseTrace(tracePath),
			traceStatus: {
				state: "captured",
				detail: null,
			},
		};
	} catch (error) {
		return {
			trace: createEmptyFixturePhaseTrace(),
			traceStatus: {
				state: "invalid",
				detail: formatErrorMessage(error),
			},
		};
	}
}

function resolveSpawnFailurePhaseTraceStatus(
	traceStatus: FixturePhaseTraceStatus,
	error: unknown,
): FixturePhaseTraceStatus {
	if (traceStatus.state !== "not_emitted") {
		return traceStatus;
	}

	return {
		state: "spawn_failed",
		detail: formatErrorMessage(error),
	};
}

function disposeFixturePhaseTraceCapture(traceCapture: FixturePhaseTraceCapture | null): void {
	if (!traceCapture?.dispose) {
		return;
	}

	try {
		traceCapture.dispose();
	} catch {
		// Trace capture cleanup is best-effort and must not change fixture command semantics.
	}
}

function resolveTraceRawArtifact(
	tracePath: string,
	traceStatus: FixturePhaseTraceStatus,
): Buffer | null {
	if (traceStatus.state !== "invalid") {
		return null;
	}

	return readOptionalTraceFile(tracePath);
}

function readOptionalTraceFile(tracePath: string): Buffer | null {
	if (!existsSync(tracePath)) {
		return null;
	}

	try {
		return readFileSync(tracePath);
	} catch {
		return null;
	}
}

export function defaultTraceCaptureFactory(): FixturePhaseTraceCapture {
	const traceCaptureDir = mkdtempSync(resolve(tmpdir(), "anchormap-fixture-trace-"));
	return {
		traceCaptureDir,
		tracePath: resolve(traceCaptureDir, "phase-trace.json"),
		dispose: () => {
			rmSync(traceCaptureDir, { recursive: true, force: true });
		},
	};
}

function elapsedMilliseconds(startedAtNs: bigint): number {
	return Number(process.hrtime.bigint() - startedAtNs) / 1_000_000;
}

function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function normalizeFixtureProcessError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function resolveSpawnCommand(command: string[], sandboxRoot: string, sandboxCwd: string): string[] {
	if (command.length === 0) {
		return command;
	}

	if (command[0] === "node" && command.length >= 2) {
		return [
			command[0],
			resolveProjectNodeEntrypoint(command[1], sandboxRoot, sandboxCwd),
			...command.slice(2),
		];
	}

	return command;
}

function resolveProjectNodeEntrypoint(
	pathValue: string,
	sandboxRoot: string,
	sandboxCwd: string,
): string {
	if (isAbsolute(pathValue)) {
		return pathValue;
	}

	if (isSupportedProjectEntrypoint(pathValue)) {
		const sandboxRootPath = resolve(sandboxRoot, pathValue);
		if (existsSync(sandboxRootPath)) {
			return sandboxRootPath;
		}

		const projectPath = resolve(PROJECT_ROOT, pathValue);
		if (existsSync(projectPath)) {
			return projectPath;
		}

		return pathValue;
	}

	const sandboxPath = resolve(sandboxCwd, pathValue);
	if (existsSync(sandboxPath)) {
		return sandboxPath;
	}

	return pathValue;
}

function isSupportedProjectEntrypoint(pathValue: string): boolean {
	return pathValue.startsWith("dist/") && PROJECT_ENTRYPOINTS.has(basename(pathValue));
}
