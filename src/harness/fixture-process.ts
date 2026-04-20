import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";

import type { LoadedFixtureManifest } from "./fixture-manifest";
import type { MaterializedFixtureSandbox } from "./fixture-sandbox";

export interface FixtureProcessResult {
	command: string[];
	cwd: string;
	exitCode: number;
	stdout: Buffer;
	stderr: Buffer;
	stdoutLength: number;
	stderrLength: number;
}

export interface FixtureProcessOptions {
	timeoutMs: number;
}

export class FixtureProcessError extends Error {
	readonly command: string[];
	readonly cwd: string;

	constructor(message: string, options: { command: string[]; cwd: string }) {
		super(message);
		this.name = "FixtureProcessError";
		this.command = [...options.command];
		this.cwd = options.cwd;
	}
}

export class FixtureProcessTimeoutError extends FixtureProcessError {
	readonly timeoutMs: number;
	readonly stdoutLength: number;
	readonly stderrLength: number;

	constructor(options: {
		command: string[];
		cwd: string;
		timeoutMs: number;
		stdoutLength: number;
		stderrLength: number;
	}) {
		super(`fixture command timed out after ${options.timeoutMs} ms: ${options.command.join(" ")}`, {
			command: options.command,
			cwd: options.cwd,
		});
		this.name = "FixtureProcessTimeoutError";
		this.timeoutMs = options.timeoutMs;
		this.stdoutLength = options.stdoutLength;
		this.stderrLength = options.stderrLength;
	}
}

const PROJECT_ROOT = resolve(__dirname, "..", "..");
const PROJECT_ENTRYPOINTS = new Set(["anchormap.js", "cli-stub.js"]);

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

	return await new Promise<FixtureProcessResult>((resolve, reject) => {
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		let timedOut = false;
		let settled = false;

		const settle = (callback: () => void): void => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeoutHandle);
			callback();
		};

		const child = spawn(executable, spawnCommand.slice(1), {
			cwd: sandbox.cwd,
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
				reject(
					new FixtureProcessError(`fixture command failed to start: ${error.message}`, {
						command,
						cwd: sandbox.cwd,
					}),
				);
			});
		});

		child.on("close", (code, signal) => {
			const stdout = Buffer.concat(stdoutChunks);
			const stderr = Buffer.concat(stderrChunks);

			settle(() => {
				if (timedOut) {
					reject(
						new FixtureProcessTimeoutError({
							command,
							cwd: sandbox.cwd,
							timeoutMs: options.timeoutMs,
							stdoutLength: stdout.length,
							stderrLength: stderr.length,
						}),
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
				});
			});
		});

		const timeoutHandle = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, options.timeoutMs);
	});
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

	const sandboxPath = resolve(sandboxCwd, pathValue);
	if (existsSync(sandboxPath)) {
		return sandboxPath;
	}

	if (!isSupportedProjectEntrypoint(pathValue)) {
		return pathValue;
	}

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

function isSupportedProjectEntrypoint(pathValue: string): boolean {
	return pathValue.startsWith("dist/") && PROJECT_ENTRYPOINTS.has(basename(pathValue));
}
