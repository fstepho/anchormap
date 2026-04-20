import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import type { FixtureManifest } from "./fixture-manifest";
import { parseFixtureRunnerArgs, runFixtureRunner, runFixtureRunnerCli } from "./fixture-runner";

interface TempFixtureSpec {
	manifest: FixtureManifest;
	scriptBody: string;
}

function scanFixtureManifest(id: string, family: string, exitCode: number): FixtureManifest {
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

function withTempFixtures(
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
		}

		return Promise.resolve(callback(fixturesRoot)).finally(() => {
			rmSync(fixturesRoot, { recursive: true, force: true });
		});
	} catch (error) {
		rmSync(fixturesRoot, { recursive: true, force: true });
		throw error;
	}
}

function createBufferingWriter(): {
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

const PASSING_FIXTURES: TempFixtureSpec[] = [
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

test("parses fixture runner selectors and rejects mixed selection modes", () => {
	assert.deepEqual(parseFixtureRunnerArgs(["--fixture", "fx68_cli_unknown_command"]), {
		fixtureId: "fx68_cli_unknown_command",
		family: undefined,
	});
	assert.deepEqual(parseFixtureRunnerArgs(["--family", "B-cli"]), {
		fixtureId: undefined,
		family: "B-cli",
	});
	assert.throws(
		() => parseFixtureRunnerArgs(["--fixture", "fx68_cli_unknown_command", "--family", "B-cli"]),
		/mutually exclusive/,
	);
});

test("runs only the requested fixture ID through the CLI wrapper", async () => {
	await withTempFixtures(PASSING_FIXTURES, async (fixturesRoot) => {
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = await runFixtureRunnerCli(["--fixture", "fx50_b_scan_only"], {
			fixturesRoot,
			timeoutMs: 1_000,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 0);
		assert.equal(stderr.read(), "");
		assert.equal(
			stdout.read(),
			["PASS fx50_b_scan_only", "SUMMARY total=1 passed=1 failed=0", ""].join("\n"),
		);
	});
});

test("runs only the requested family through the CLI wrapper in stable order", async () => {
	await withTempFixtures(PASSING_FIXTURES, async (fixturesRoot) => {
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = await runFixtureRunnerCli(["--family", "B-cli"], {
			fixturesRoot,
			timeoutMs: 1_000,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 0);
		assert.equal(stderr.read(), "");
		assert.equal(
			stdout.read(),
			[
				"PASS fx10_b_cli_first",
				"PASS fx90_b_cli_second",
				"SUMMARY total=2 passed=2 failed=0",
				"",
			].join("\n"),
		);
	});
});

test("run-all reporting stays stable across identical runs", async () => {
	await withTempFixtures(PASSING_FIXTURES, async (fixturesRoot) => {
		const first = await runFixtureRunner({
			fixturesRoot,
			timeoutMs: 1_000,
		});
		const second = await runFixtureRunner({
			fixturesRoot,
			timeoutMs: 1_000,
		});

		assert.equal(first.exitCode, 0);
		assert.equal(second.exitCode, 0);
		assert.equal(
			first.report,
			[
				"PASS fx10_b_cli_first",
				"PASS fx90_b_cli_second",
				"PASS fx50_b_scan_only",
				"SUMMARY total=3 passed=3 failed=0",
				"",
			].join("\n"),
		);
		assert.equal(second.report, first.report);
	});
});

test("runner exits non-zero and names the failed oracle when one fixture fails", async () => {
	await withTempFixtures(
		[
			...PASSING_FIXTURES,
			{
				manifest: scanFixtureManifest("fx20_b_cli_exit_mismatch", "B-cli", 0),
				scriptBody: "process.exit(1);\n",
			},
		],
		async (fixturesRoot) => {
			const summary = await runFixtureRunner({
				fixturesRoot,
				timeoutMs: 1_000,
			});

			assert.equal(summary.exitCode, 1);
			assert.equal(summary.failedCount, 1);
			assert.match(
				summary.report,
				/^FAIL fx20_b_cli_exit_mismatch exit_code expected exit code 0, got 1$/m,
			);
			assert.equal(
				summary.report,
				[
					"PASS fx10_b_cli_first",
					"FAIL fx20_b_cli_exit_mismatch exit_code expected exit code 0, got 1",
					"PASS fx90_b_cli_second",
					"PASS fx50_b_scan_only",
					"SUMMARY total=4 passed=3 failed=1",
					"",
				].join("\n"),
			);
		},
	);
});
