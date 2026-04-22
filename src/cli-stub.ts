import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

import {
	type FixturePhaseName,
	type FixturePhaseStatus,
	type FixturePhaseTraceEvent,
	writeFixturePhaseTraceFromEnv,
} from "./harness/fixture-phase-trace";

const STUB_SCAN_JSON_SUCCESS = '{"ok":true}\n';
const STUB_INIT_OUTPUT_FILENAME = ".stub-init-output.yaml";
const STUB_SCAN_UNEXPECTED_MUTATION_FILENAME = ".stub-scan-unexpected-mutation.txt";
const STUB_SCAN_UNEXPECTED_MUTATION_TARGET = "unexpected.txt";
const STUB_SCAN_SPEC_SUCCESS_MARKER = "specs/example.md";
const STUB_SCAN_GRAPH_TARGET = "src/index.ts";

export interface CliStubOptions {
	cwd?: string;
	stdout?: { write(chunk: string): unknown };
	stderr?: { write(chunk: string): unknown };
}

export function runCliStub(argv: readonly string[], options: CliStubOptions = {}): number {
	const cwd = options.cwd ?? process.cwd();
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	const phaseTrace = createPhaseTraceRecorder();
	const [command, ...args] = argv;

	let exitCode = 0;
	try {
		switch (command) {
			case "scan":
				phaseTrace.record("cli.parse", "pass", () => `command=${command}`);
				exitCode = runScanStub(args, cwd, stdout, stderr, phaseTrace);
				break;
			case "init":
				phaseTrace.record("cli.parse", "pass", () => `command=${command}`);
				exitCode = runInitStub(cwd, phaseTrace);
				break;
			case "map":
				phaseTrace.record("cli.parse", "pass", () => `command=${command}`);
				exitCode = 0;
				break;
			default:
				phaseTrace.record("cli.parse", "fail", () => `unsupported command ${command ?? "<none>"}`);
				stderr.write(`stub unsupported command: ${command ?? "<none>"}\n`);
				exitCode = 4;
				break;
		}

		phaseTrace.record("exit", exitCode === 0 ? "pass" : "fail", () => `exit_code=${exitCode}`);
		return exitCode;
	} finally {
		phaseTrace.flush();
	}
}

function runScanStub(
	args: readonly string[],
	cwd: string,
	stdout: { write(chunk: string): unknown },
	stderr: { write(chunk: string): unknown },
	phaseTrace: ReturnType<typeof createPhaseTraceRecorder>,
): number {
	if (args[0] === "--json") {
		if (existsSync(resolve(cwd, STUB_SCAN_SPEC_SUCCESS_MARKER))) {
			phaseTrace.record("spec.index", "pass", () => STUB_SCAN_SPEC_SUCCESS_MARKER);
			if (existsSync(resolve(cwd, STUB_SCAN_GRAPH_TARGET))) {
				phaseTrace.record("ts.graph", "pass", () => STUB_SCAN_GRAPH_TARGET);
			}
			phaseTrace.record("scan.evaluate", "pass");
			writeUnexpectedScanMutationIfRequested(cwd, phaseTrace);
			phaseTrace.recordSpan(
				"render",
				"pass",
				() => {
					stdout.write(STUB_SCAN_JSON_SUCCESS);
				},
				() => "stdout.json",
			);
			return 0;
		}

		phaseTrace.record("spec.index", "fail", () => `missing ${STUB_SCAN_SPEC_SUCCESS_MARKER}`);
		stderr.write(`stub scan fixture missing ${STUB_SCAN_SPEC_SUCCESS_MARKER}\n`);
		return 2;
	}

	stdout.write("stub scan\n");
	return 0;
}

function runInitStub(cwd: string, phaseTrace: ReturnType<typeof createPhaseTraceRecorder>): number {
	const templatePath = resolve(cwd, STUB_INIT_OUTPUT_FILENAME);
	if (!existsSync(templatePath)) {
		return 0;
	}

	phaseTrace.recordSpan(
		"fs.write",
		"pass",
		() => {
			writeFileSync(resolve(cwd, "anchormap.yaml"), readFileSync(templatePath));
		},
		() => "anchormap.yaml",
	);
	return 0;
}

function writeUnexpectedScanMutationIfRequested(
	cwd: string,
	phaseTrace: ReturnType<typeof createPhaseTraceRecorder>,
): boolean {
	const markerPath = resolve(cwd, STUB_SCAN_UNEXPECTED_MUTATION_FILENAME);
	if (!existsSync(markerPath)) {
		return false;
	}

	phaseTrace.recordSpan(
		"fs.write",
		"fail",
		() => {
			writeFileSync(resolve(cwd, STUB_SCAN_UNEXPECTED_MUTATION_TARGET), readFileSync(markerPath));
		},
		() => STUB_SCAN_UNEXPECTED_MUTATION_TARGET,
	);
	return true;
}

function createPhaseTraceRecorder(): {
	record(
		phase: FixturePhaseName,
		status: FixturePhaseStatus,
		detail?: (() => string | null | undefined) | string | null,
	): void;
	recordSpan<T>(
		phase: FixturePhaseName,
		status: FixturePhaseStatus,
		work: () => T,
		detail?: (() => string | null | undefined) | string | null,
	): T;
	flush(): void;
} {
	const startedAtMs = performance.now();
	const events: FixturePhaseTraceEvent[] = [];

	function resolveDetail(
		detail: (() => string | null | undefined) | string | null | undefined,
	): string | null {
		return typeof detail === "function" ? (detail() ?? null) : (detail ?? null);
	}

	function pushEvent(
		phase: FixturePhaseName,
		status: FixturePhaseStatus,
		detail: (() => string | null | undefined) | string | null | undefined,
		phaseStartedAtMs: number,
		phaseFinishedAtMs: number,
	): void {
		events.push({
			phase,
			status,
			started_at_ms: phaseStartedAtMs - startedAtMs,
			finished_at_ms: phaseFinishedAtMs - startedAtMs,
			duration_ms: Math.max(phaseFinishedAtMs - phaseStartedAtMs, 0),
			detail: resolveDetail(detail),
		});
	}

	return {
		record(phase, status, detail) {
			const phaseStartedAtMs = performance.now();
			pushEvent(phase, status, detail, phaseStartedAtMs, phaseStartedAtMs);
		},
		recordSpan(phase, status, work, detail) {
			const phaseStartedAtMs = performance.now();
			try {
				const result = work();
				pushEvent(phase, status, detail, phaseStartedAtMs, performance.now());
				return result;
			} catch (error) {
				pushEvent(phase, "fail", detail, phaseStartedAtMs, performance.now());
				throw error;
			}
		},
		flush() {
			writeFixturePhaseTraceFromEnv(events);
		},
	};
}

if (require.main === module) {
	process.exitCode = runCliStub(process.argv.slice(2));
}
