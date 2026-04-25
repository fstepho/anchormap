import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { posix, resolve } from "node:path";

import type { FixtureManifest } from "./fixture-manifest";

export interface TempFixtureSpec {
	manifest: FixtureManifest;
	scriptBody: string;
	stdoutGolden?: string;
}

export function scanFixtureManifest(id: string, family: string, exitCode: number): FixtureManifest {
	return {
		id,
		family,
		purpose: "Fixture runner unit test fixture.",
		command: ["node", "./cli-stub.cjs", "scan"],
		cwd: ".",
		exit_code: exitCode,
		stdout: { kind: "ignored" },
		stderr: { kind: "ignored" },
		filesystem: { kind: "no_mutation" },
	};
}

export function scanJsonFixtureManifest(
	id: string,
	family: string,
	exitCode: number,
): FixtureManifest {
	return {
		...scanFixtureManifest(id, family, exitCode),
		command: ["node", "./cli-stub.cjs", "scan", "--json"],
		stdout: { kind: "golden" },
		stderr: { kind: "empty" },
	};
}

export function withTempFixtures(
	fixtures: TempFixtureSpec[],
	callback: (fixturesRoot: string) => Promise<void> | void,
): Promise<void> {
	const fixturesRoot = mkdtempSync(resolve(tmpdir(), "anchormap-fixture-runner-"));

	try {
		for (const fixture of fixtures) {
			const fixtureDir = resolve(fixturesRoot, fixture.manifest.family, fixture.manifest.id);
			mkdirSync(resolve(fixtureDir, "repo"), { recursive: true });
			writeFileSync(
				resolve(fixtureDir, "manifest.json"),
				`${JSON.stringify(fixture.manifest, null, "\t")}\n`,
			);
			writeFileSync(resolve(fixtureDir, "repo", "cli-stub.cjs"), fixture.scriptBody);
			if (fixture.stdoutGolden !== undefined) {
				writeFileSync(resolve(fixtureDir, "stdout.golden"), fixture.stdoutGolden);
			}
		}

		return Promise.resolve(callback(fixturesRoot)).finally(() => {
			rmSync(fixturesRoot, { recursive: true, force: true });
		});
	} catch (error) {
		rmSync(fixturesRoot, { recursive: true, force: true });
		throw error;
	}
}

export function createBufferingWriter(): {
	writer: { write(chunk: string): boolean };
	read(): string;
} {
	const chunks: string[] = [];

	return {
		writer: {
			write(chunk: string): boolean {
				chunks.push(chunk);
				return true;
			},
		},
		read(): string {
			return chunks.join("");
		},
	};
}

export const PASSING_FIXTURES: TempFixtureSpec[] = [
	{
		manifest: scanFixtureManifest("fx90_b_cli_second", "B-cli", 0),
		scriptBody: "process.exit(0);\n",
	},
	{
		manifest: scanFixtureManifest("fx10_b_cli_first", "B-cli", 0),
		scriptBody: "process.exit(0);\n",
	},
	{
		manifest: scanFixtureManifest("fx50_b_scan_only", "B-scan", 0),
		scriptBody: "process.exit(0);\n",
	},
];

export function selectionRunDir(
	selection: string,
	runNumber: number,
	options: { stdoutGoldenOnly?: boolean } = {},
): string {
	const selectionLabel = options.stdoutGoldenOnly ? `goldens-${selection}` : selection;
	return posix.join(
		".tmp",
		"fixture-runs",
		selectionLabel,
		`run-${String(runNumber).padStart(4, "0")}`,
	);
}

export function fixtureArtifactsRelativePath(
	runDirRelative: string,
	family: string,
	fixtureId: string,
): string {
	return posix.join(runDirRelative, "fixtures", family, fixtureId);
}

export function runnerSummaryLine(
	runDirRelative: string,
	total: number,
	passed: number,
	failed: number,
): string {
	return `SUMMARY total=${total} passed=${passed} failed=${failed} artifacts=${runDirRelative} summary=${posix.join(runDirRelative, "summary.txt")}`;
}

export function readJsonFile(pathValue: string): unknown {
	return JSON.parse(readFileSync(pathValue, "utf8"));
}

export function requireRecord<T>(value: T | undefined): T {
	assert.ok(value);
	return value;
}

export async function allocateRunDirInChildProcess(
	fixturesRoot: string,
	fixtureId: string,
): Promise<string> {
	const modulePath = resolve(__dirname, "fixture-run-artifacts.js");
	const script = [
		"const { prepareFixtureRunnerArtifacts } = require(process.argv[1]);",
		"const layout = prepareFixtureRunnerArtifacts(process.argv[2], { fixtureId: process.argv[3] });",
		"process.stdout.write(layout.runDirRelative + '\\n');",
	].join(" ");

	return await new Promise<string>((resolvePromise, rejectPromise) => {
		const child = spawn(process.execPath, ["-e", script, modulePath, fixturesRoot, fixtureId], {
			stdio: ["ignore", "pipe", "inherit"],
		});
		let stdout = "";

		child.stdout.on("data", (chunk: Buffer | string) => {
			stdout += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
		});
		child.on("error", rejectPromise);
		child.on("close", (code) => {
			if (code !== 0) {
				rejectPromise(new Error(`allocator child exited with code ${code}`));
				return;
			}

			resolvePromise(stdout.trim());
		});
	});
}
