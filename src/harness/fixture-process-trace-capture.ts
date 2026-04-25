import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
	createEmptyFixturePhaseTrace,
	type FixturePhaseTrace,
	type FixturePhaseTraceStatus,
	loadFixturePhaseTrace,
} from "./fixture-phase-trace";

export interface FixturePhaseTraceCapture {
	traceCaptureDir: string;
	tracePath: string;
	dispose?: () => void;
}

interface PreparedFixturePhaseTraceCapture {
	traceCapture: FixturePhaseTraceCapture | null;
	traceStatus: FixturePhaseTraceStatus;
}

export function prepareFixturePhaseTraceCapture(
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

export function resolveFixturePhaseTrace(tracePath: string): {
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

export function resolveSpawnFailurePhaseTraceStatus(
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

export function disposeFixturePhaseTraceCapture(
	traceCapture: FixturePhaseTraceCapture | null,
): void {
	if (!traceCapture?.dispose) {
		return;
	}

	try {
		traceCapture.dispose();
	} catch {
		// Trace capture cleanup is best-effort and must not change fixture command semantics.
	}
}

export function readOptionalTraceFile(tracePath: string): Buffer | null {
	if (!existsSync(tracePath)) {
		return null;
	}

	try {
		return readFileSync(tracePath);
	} catch {
		return null;
	}
}

export function resolveTraceRawArtifact(
	tracePath: string,
	traceStatus: FixturePhaseTraceStatus,
): Buffer | null {
	if (traceStatus.state !== "invalid") {
		return null;
	}

	return readOptionalTraceFile(tracePath);
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

function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
