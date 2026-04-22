import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const FIXTURE_TRACE_ENV_VAR = "ANCHORMAP_FIXTURE_TRACE_PATH";

export const FIXTURE_PHASE_VOCABULARY = [
	"cli.parse",
	"config.load",
	"spec.index",
	"ts.graph",
	"scan.evaluate",
	"render",
	"fs.write",
	"exit",
] as const;

export type FixtureStablePhaseName = (typeof FIXTURE_PHASE_VOCABULARY)[number];
export type FixturePhaseName = string;
export type FixturePhaseStatus = "pass" | "fail";

export interface FixturePhaseTraceEvent {
	phase: FixturePhaseName;
	status: FixturePhaseStatus;
	started_at_ms: number;
	finished_at_ms: number;
	duration_ms: number;
	detail: string | null;
}

export interface FixturePhaseTiming {
	phase: FixturePhaseName;
	total_duration_ms: number;
	status: FixturePhaseStatus;
	occurrences: number;
}

export type FixturePhaseTraceStatusState =
	| "captured"
	| "not_emitted"
	| "not_requested"
	| "spawn_failed"
	| "setup_failed"
	| "invalid";

export interface FixturePhaseTraceStatus {
	state: FixturePhaseTraceStatusState;
	detail: string | null;
}

export interface FixturePhaseTrace {
	phase_vocabulary: readonly FixtureStablePhaseName[];
	events: FixturePhaseTraceEvent[];
	timings: FixturePhaseTiming[];
	last_failed_phase: FixturePhaseName | null;
}

interface RawFixturePhaseTraceDocument {
	events?: unknown;
}

export function loadFixturePhaseTrace(tracePath: string): FixturePhaseTrace {
	if (!existsSync(tracePath)) {
		return emptyFixturePhaseTrace();
	}

	let rawDocument: unknown;
	try {
		rawDocument = JSON.parse(readFileSync(tracePath, "utf8"));
	} catch (error) {
		const reason = error instanceof Error ? error.message : "unknown JSON parse failure";
		throw new Error(`phase trace file is not valid JSON: ${reason}`);
	}

	const document = requireObject(
		rawDocument,
		"phase trace document",
	) as RawFixturePhaseTraceDocument;
	const rawEvents = requireArray(document.events, "events");
	const events = rawEvents.map((entry, index) => parseFixturePhaseTraceEvent(entry, index));
	const timings = buildFixturePhaseTimings(events);

	return {
		phase_vocabulary: FIXTURE_PHASE_VOCABULARY,
		events,
		timings,
		last_failed_phase: resolveLastFailedPhase(events),
	};
}

export function createEmptyFixturePhaseTrace(): FixturePhaseTrace {
	return emptyFixturePhaseTrace();
}

export function writeFixturePhaseTraceFile(
	tracePath: string,
	events: readonly FixturePhaseTraceEvent[],
): void {
	writeFileSync(
		tracePath,
		`${JSON.stringify(
			{
				events,
			},
			null,
			"\t",
		)}\n`,
	);
}

export function writeFixturePhaseTraceFromEnv(
	events: readonly FixturePhaseTraceEvent[],
	env: NodeJS.ProcessEnv = process.env,
): void {
	const tracePath = env[FIXTURE_TRACE_ENV_VAR];
	if (!tracePath) {
		return;
	}

	try {
		writeFixturePhaseTraceFile(tracePath, events);
	} catch {
		// Phase traces are optional harness artifacts and must not change command semantics.
	}
}

function emptyFixturePhaseTrace(): FixturePhaseTrace {
	return {
		phase_vocabulary: FIXTURE_PHASE_VOCABULARY,
		events: [],
		timings: [],
		last_failed_phase: null,
	};
}

function buildFixturePhaseTimings(events: readonly FixturePhaseTraceEvent[]): FixturePhaseTiming[] {
	const timingsByPhase = new Map<FixturePhaseName, FixturePhaseTiming>();

	for (const phase of FIXTURE_PHASE_VOCABULARY) {
		timingsByPhase.set(phase, {
			phase,
			total_duration_ms: 0,
			status: "pass",
			occurrences: 0,
		});
	}

	for (const event of events) {
		let timing = timingsByPhase.get(event.phase);
		if (!timing) {
			timing = {
				phase: event.phase,
				total_duration_ms: 0,
				status: "pass",
				occurrences: 0,
			};
			timingsByPhase.set(event.phase, timing);
		}

		timing.total_duration_ms += event.finished_at_ms - event.started_at_ms;
		timing.status = timing.status === "fail" || event.status === "fail" ? "fail" : "pass";
		timing.occurrences += 1;
	}

	const additionalPhases = [...timingsByPhase.keys()]
		.filter((phase) => !FIXTURE_PHASE_VOCABULARY.includes(phase as FixtureStablePhaseName))
		.sort(comparePhaseNames);
	const orderedPhases = [...FIXTURE_PHASE_VOCABULARY, ...additionalPhases];

	return orderedPhases.flatMap((phase) => {
		const timing = timingsByPhase.get(phase);
		return timing && timing.occurrences > 0 ? [timing] : [];
	});
}

function resolveLastFailedPhase(
	events: readonly FixturePhaseTraceEvent[],
): FixturePhaseName | null {
	let lastExitStatus: FixturePhaseStatus | null = null;

	for (const event of events) {
		if (event.phase === "exit") {
			lastExitStatus = event.status;
		}
	}

	if (lastExitStatus === "pass") {
		const phasesRecoveredByLaterPass = new Set<FixturePhaseName>();

		for (const event of [...events].reverse()) {
			if (event.status === "pass") {
				phasesRecoveredByLaterPass.add(event.phase);
				continue;
			}

			if (event.phase === "exit") {
				continue;
			}

			if (phasesRecoveredByLaterPass.has(event.phase)) {
				continue;
			}

			return event.phase;
		}

		return null;
	}

	for (const event of [...events].reverse()) {
		if (event.status === "fail" && event.phase !== "exit") {
			return event.phase;
		}
	}

	if (lastExitStatus === "fail") {
		return "exit";
	}

	return null;
}

function parseFixturePhaseTraceEvent(value: unknown, index: number): FixturePhaseTraceEvent {
	const event = requireObject(value, `events[${index}]`);
	const phase = requireFixturePhaseName(event.phase, `events[${index}].phase`);
	const status = requireFixturePhaseStatus(event.status, `events[${index}].status`);
	const startedAtMs = requireNonNegativeNumber(
		event.started_at_ms,
		`events[${index}].started_at_ms`,
	);
	const finishedAtMs = requireNonNegativeNumber(
		event.finished_at_ms,
		`events[${index}].finished_at_ms`,
	);
	const durationMs = requireNonNegativeNumber(event.duration_ms, `events[${index}].duration_ms`);
	const detail = requireNullableString(event.detail, `events[${index}].detail`);

	if (finishedAtMs < startedAtMs) {
		throw new Error(`events[${index}] finished_at_ms must be >= started_at_ms`);
	}

	return {
		phase,
		status,
		started_at_ms: startedAtMs,
		finished_at_ms: finishedAtMs,
		duration_ms: durationMs,
		detail,
	};
}

function comparePhaseNames(left: string, right: string): number {
	if (left < right) {
		return -1;
	}

	if (left > right) {
		return 1;
	}

	return 0;
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object`);
	}

	return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string): unknown[] {
	if (!Array.isArray(value)) {
		throw new Error(`${label} must be an array`);
	}

	return value;
}

function requireFixturePhaseName(value: unknown, label: string): FixturePhaseName {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`${label} must be a non-empty string`);
	}

	return value;
}

function requireFixturePhaseStatus(value: unknown, label: string): FixturePhaseStatus {
	if (value !== "pass" && value !== "fail") {
		throw new Error(`${label} must be "pass" or "fail"`);
	}

	return value;
}

function requireNonNegativeNumber(value: unknown, label: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new Error(`${label} must be a finite number >= 0`);
	}

	return value;
}

function requireNullableString(value: unknown, label: string): string | null {
	if (value === null || value === undefined) {
		return null;
	}

	if (typeof value !== "string") {
		throw new Error(`${label} must be a string or null`);
	}

	return value;
}
