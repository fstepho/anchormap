import { strict as assert } from "node:assert";
import { test } from "node:test";

import { prepareFixtureRunnerArtifacts } from "./fixture-run-artifacts";
import { parseFixtureRunnerArgs, runFixtureRunner, runFixtureRunnerCli } from "./fixture-runner";
import {
	allocateRunDirInChildProcess,
	createBufferingWriter,
	PASSING_FIXTURES,
	runnerSummaryLine,
	scanFixtureManifest,
	scanJsonFixtureManifest,
	selectionRunDir,
	withTempFixtures,
} from "./fixture-runner-test-support";

test("parses fixture runner selectors and rejects mixed selection modes", () => {
	assert.deepEqual(parseFixtureRunnerArgs(["--fixture", "fx68_cli_unknown_command"]), {
		fixtureId: "fx68_cli_unknown_command",
		family: undefined,
		stdoutGoldenOnly: false,
	});
	assert.deepEqual(parseFixtureRunnerArgs(["--family", "B-cli"]), {
		fixtureId: undefined,
		family: "B-cli",
		stdoutGoldenOnly: false,
	});
	assert.deepEqual(parseFixtureRunnerArgs(["--goldens-only", "--family", "B-cli"]), {
		fixtureId: undefined,
		family: "B-cli",
		stdoutGoldenOnly: true,
	});
	assert.throws(
		() => parseFixtureRunnerArgs(["--fixture", "fx68_cli_unknown_command", "--family", "B-cli"]),
		/mutually exclusive/,
	);
	assert.throws(() => parseFixtureRunnerArgs(["--goldens-only", "--goldens-only"]), /at most once/);
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
			[
				"PASS fx50_b_scan_only",
				runnerSummaryLine(selectionRunDir("fixture-fx50_b_scan_only", 1), 1, 1, 0),
				"",
			].join("\n"),
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
				runnerSummaryLine(selectionRunDir("family-B-cli", 1), 2, 2, 0),
				"",
			].join("\n"),
		);
	});
});

test("golden-only mode runs only fixtures with stdout goldens in the selected family", async () => {
	await withTempFixtures(
		[
			{
				manifest: scanFixtureManifest("fx10_non_golden", "B-cli", 0),
				scriptBody: "process.exit(0);\n",
			},
			{
				manifest: scanJsonFixtureManifest("fx20_golden", "B-cli", 0),
				scriptBody: 'process.stdout.write("{\\"ok\\":true}\\n");\nprocess.exit(0);\n',
				stdoutGolden: '{"ok":true}\n',
			},
		],
		async (fixturesRoot) => {
			const stdout = createBufferingWriter();
			const stderr = createBufferingWriter();

			const exitCode = await runFixtureRunnerCli(["--goldens-only", "--family", "B-cli"], {
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
					"PASS fx20_golden",
					runnerSummaryLine(
						selectionRunDir("family-B-cli", 1, { stdoutGoldenOnly: true }),
						1,
						1,
						0,
					),
					"",
				].join("\n"),
			);
		},
	);
});

test("golden-only mode fails closed when the selected fixture has no stdout golden", async () => {
	await withTempFixtures(PASSING_FIXTURES, async (fixturesRoot) => {
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = await runFixtureRunnerCli(
			["--goldens-only", "--fixture", "fx50_b_scan_only"],
			{
				fixturesRoot,
				timeoutMs: 1_000,
				stdout: stdout.writer,
				stderr: stderr.writer,
			},
		);

		assert.equal(exitCode, 1);
		assert.equal(stdout.read(), "");
		assert.match(stderr.read(), /did not match any fixture with stdout\.kind "golden"/);
	});
});

test("run-all reporting preserves fixture ordering across reruns while using distinct artifact roots", async () => {
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
				runnerSummaryLine(first.artifactsDirRelative, 3, 3, 0),
				"",
			].join("\n"),
		);
		assert.equal(
			second.report,
			[
				"PASS fx10_b_cli_first",
				"PASS fx90_b_cli_second",
				"PASS fx50_b_scan_only",
				runnerSummaryLine(second.artifactsDirRelative, 3, 3, 0),
				"",
			].join("\n"),
		);
		assert.notEqual(second.artifactsDirRelative, first.artifactsDirRelative);
	});
});

test("allocator reserves distinct run roots for concurrent same-selection runs", async () => {
	await withTempFixtures(PASSING_FIXTURES, async (fixturesRoot) => {
		const baseline = prepareFixtureRunnerArtifacts(fixturesRoot, {
			fixtureId: "fx50_b_scan_only",
		});
		assert.equal(baseline.runDirRelative, selectionRunDir("fixture-fx50_b_scan_only", 1));

		const concurrentAllocations = await Promise.all(
			Array.from({ length: 12 }, () =>
				allocateRunDirInChildProcess(fixturesRoot, "fx50_b_scan_only"),
			),
		);

		assert.equal(new Set(concurrentAllocations).size, concurrentAllocations.length);
		assert.equal(concurrentAllocations.includes(baseline.runDirRelative), false);
	});
});
