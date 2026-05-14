#!/usr/bin/env node
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const CLI_PATH = resolve(REPO_ROOT, "dist", "anchormap.js");
const LOCAL_CORPUS = resolve(REPO_ROOT, "demos", "tsx-adoption", "local-minimal");
const REPORT_DIR = resolve(REPO_ROOT, "reports", "tsx-adoption", "current");
const EXTERNAL_REPO = "https://github.com/dan5py/react-vite-ts.git";
const EXTERNAL_COMMIT = "6c09ea115c02e28c3c66588d9617cbc132625478";

const cleanEnv = (() => {
	const { NODE_OPTIONS: _nodeOptions, NODE_PATH: _nodePath, ...env } = process.env;
	return env;
})();

main();

function main() {
	if (!existsSync(CLI_PATH)) {
		throw new Error("dist/anchormap.js is missing; run npm run build before this script");
	}

	rmSync(REPORT_DIR, { recursive: true, force: true });
	mkdirSync(REPORT_DIR, { recursive: true });

	const tempRoot = mkdtempSync(join(tmpdir(), "anchormap-tsx-adoption-"));
	try {
		const local = runLocalLane(tempRoot);
		const external = runExternalLane(tempRoot);
		const summary = {
			schema_version: 1,
			task: "T18.0",
			status: local.status === "pass" && external.status !== "failed" ? "pass" : "fail",
			lanes: {
				local,
				external,
			},
		};

		writeJson("summary.json", summary);
		writeBrief(summary);

		if (summary.status !== "pass") {
			throw new Error("TSX adoption corpus invariants failed");
		}
		console.log("TSX adoption corpus passed");
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
}

function runLocalLane(tempRoot) {
	const sandbox = join(tempRoot, "local-minimal");
	cpSync(LOCAL_CORPUS, sandbox, { recursive: true });

	const before = readTreeSnapshot(sandbox);
	const scan = runCli(sandbox, ["scan", "--json"]);
	const after = readTreeSnapshot(sandbox);

	assertEqual(scan.status, 0, "local scan exits 0");
	assertEqual(scan.stderr, "", "local scan stderr is empty");
	assertDeepEqual(after, before, "local scan does not mutate the corpus");

	const scanJson = parseJson(scan.stdout, "local scan JSON");
	assertScanBasics(scanJson, "local", "clean");
	assertHasTsxFiles(scanJson, "local");
	assertHasAlias(scanJson, "local", "@/", "src/");
	assertExpectedEdge(scanJson, "local", "src/main.tsx", "src/App.tsx");
	assertExpectedEdge(scanJson, "local", "src/App.tsx", "src/components/Button.tsx");
	assertExpectedEdge(scanJson, "local", "src/components/Button.tsx", "src/lib/format.ts");

	writeScanReports("local", scanJson);

	return {
		status: "pass",
		source: "demos/tsx-adoption/local-minimal",
		analysis_health: scanJson.analysis_health,
		product_file_count: Object.keys(scanJson.files ?? {}).length,
		artifacts: {
			compact_json: "local-scan.compact.json",
			pretty_json: "local-scan.pretty.json",
		},
	};
}

function runExternalLane(tempRoot) {
	const repoDir = join(tempRoot, "external-react-vite-ts");
	mkdirSync(repoDir, { recursive: true });

	const gitInit = run("git", ["init"], repoDir);
	if (gitInit.status !== 0) {
		return externalUnavailable("git init", gitInit);
	}
	const gitRemote = run("git", ["remote", "add", "origin", EXTERNAL_REPO], repoDir);
	if (gitRemote.status !== 0) {
		return externalUnavailable("git remote add origin", gitRemote);
	}
	const gitFetch = run("git", ["fetch", "--depth", "1", "origin", EXTERNAL_COMMIT], repoDir);
	if (gitFetch.status !== 0) {
		return externalUnavailable("git fetch", gitFetch);
	}
	const gitCheckout = run("git", ["checkout", "--detach", "FETCH_HEAD"], repoDir);
	if (gitCheckout.status !== 0) {
		return externalUnavailable("git checkout", gitCheckout);
	}

	mkdirSync(join(repoDir, ".specify", "specs"), { recursive: true });
	runRequiredCli(repoDir, ["init", "--root", "src", "--spec-root", ".specify/specs"], "external init");
	runRequiredCli(
		repoDir,
		["scaffold", "--output", ".specify/specs/scaffold.generated.md"],
		"external scaffold",
	);
	writeFileSync(
		join(repoDir, ".specify", "specs", "tsx-adoption-active.md"),
		[
			"# EXT.MAIN",
			"",
			"Main React entrypoint.",
			"",
			"# EXT.APP",
			"",
			"Application shell component.",
			"",
			"# EXT.COUNT_BTN",
			"",
			"Counter button component.",
			"",
		].join("\n"),
		"utf8",
	);
	runRequiredCli(repoDir, ["map", "--anchor", "EXT.MAIN", "--seed", "src/main.tsx"], "external map EXT.MAIN");
	runRequiredCli(repoDir, ["map", "--anchor", "EXT.APP", "--seed", "src/App.tsx"], "external map EXT.APP");
	runRequiredCli(
		repoDir,
		["map", "--anchor", "EXT.COUNT_BTN", "--seed", "src/components/CountBtn.tsx"],
		"external map EXT.COUNT_BTN",
	);

	const scan = runCli(repoDir, ["scan", "--json"]);
	assertEqual(scan.status, 0, "external scan exits 0");
	assertEqual(scan.stderr, "", "external scan stderr is empty");

	const scanJson = parseJson(scan.stdout, "external scan JSON");
	assertEqual(scanJson.schema_version, 4, "external schema_version is 4");
	assertExternalAnalysisHealth(scanJson);
	assertHasTsxFiles(scanJson, "external");
	assertHasAlias(scanJson, "external", "@/", "src/");
	assertExpectedEdge(scanJson, "external", "src/main.tsx", "src/App.tsx");
	assertExpectedEdge(scanJson, "external", "src/App.tsx", "src/components/CountBtn.tsx");
	assertExpectedEdge(scanJson, "external", "src/components/CountBtn.tsx", "src/lib/utils.ts");

	writeScanReports("external", scanJson);

	return {
		status: "pass",
		repository: EXTERNAL_REPO,
		commit: EXTERNAL_COMMIT,
		analysis_health: scanJson.analysis_health,
		product_file_count: Object.keys(scanJson.files ?? {}).length,
		findings: scanJson.findings,
		artifacts: {
			compact_json: "external-scan.compact.json",
			pretty_json: "external-scan.pretty.json",
		},
	};
}

function externalUnavailable(command, result) {
	const unavailable = {
		status: "unavailable",
		repository: EXTERNAL_REPO,
		commit: EXTERNAL_COMMIT,
		command,
		exit_code: result.status,
		reason: firstLine(result.stderr || result.stdout || "external corpus unavailable"),
	};
	writeJson("external-unavailable.json", unavailable);
	return unavailable;
}

function runRequiredCli(cwd, args, label) {
	const result = runCli(cwd, args);
	assertEqual(result.status, 0, `${label} exits 0\nstderr:\n${result.stderr}`);
	return result;
}

function runCli(cwd, args) {
	return run(process.execPath, [CLI_PATH, ...args], cwd);
}

function run(command, args, cwd) {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		env: cleanEnv,
	});
	return {
		status: result.status,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		error: result.error,
	};
}

function assertScanBasics(scanJson, lane, expectedHealth) {
	assertEqual(scanJson.schema_version, 4, `${lane} schema_version is 4`);
	assertEqual(scanJson.analysis_health, expectedHealth, `${lane} analysis_health is ${expectedHealth}`);
}

function assertHasTsxFiles(scanJson, lane) {
	const tsxFiles = Object.keys(scanJson.files ?? {}).filter((path) => path.endsWith(".tsx"));
	if (tsxFiles.length === 0) {
		throw new Error(`${lane} scan did not include any .tsx product files`);
	}
}

function assertHasAlias(scanJson, lane, prefix, target) {
	const aliases = scanJson.config?.local_aliases;
	if (!Array.isArray(aliases) || !aliases.some((alias) => alias.prefix === prefix && alias.target === target)) {
		throw new Error(`${lane} scan did not expose alias ${prefix} -> ${target}`);
	}
}

function assertExpectedEdge(scanJson, lane, importer, target) {
	const targets = scanJson.files?.[importer]?.supported_local_targets;
	if (!Array.isArray(targets) || !targets.includes(target)) {
		throw new Error(`${lane} scan missing supported edge ${importer} -> ${target}`);
	}
}

function assertExternalAnalysisHealth(scanJson) {
	const findings = Array.isArray(scanJson.findings) ? scanJson.findings : [];
	if (scanJson.analysis_health === "clean") {
		if (findings.length !== 0) {
			throw new Error("external clean scan unexpectedly includes findings");
		}
		return;
	}
	if (scanJson.analysis_health === "degraded") {
		assertExternalFindingsAreAssetImports(findings);
		return;
	}
	throw new Error(`external analysis_health is not clean or degraded: ${scanJson.analysis_health}`);
}

function assertExternalFindingsAreAssetImports(findings) {
	if (findings.length === 0) {
		throw new Error("external degraded scan should include CSS/SVG asset import findings");
	}
	for (const finding of findings) {
		const assetPath = finding.specifier ?? finding.target_path ?? "";
		const isAsset = assetPath.endsWith(".css") || assetPath.endsWith(".svg");
		const isExpectedKind =
			finding.kind === "unresolved_static_edge" || finding.kind === "unsupported_local_target";
		if (!isExpectedKind || !isAsset) {
			throw new Error(`external finding is not a CSS/SVG import boundary: ${JSON.stringify(finding)}`);
		}
	}
}

function readTreeSnapshot(root) {
	const snapshot = {};
	for (const entry of listTreeEntries(root)) {
		if (entry.kind === "directory") {
			snapshot[entry.path] = { kind: "directory" };
		} else {
			snapshot[entry.path] = {
				kind: "file",
				content: readFileSync(join(root, entry.path)).toString("base64"),
			};
		}
	}
	return snapshot;
}

function listTreeEntries(root, current = root) {
	const entries = [];
	for (const entry of readdirSync(current, { withFileTypes: true })) {
		const absolute = join(current, entry.name);
		const normalizedPath = relative(root, absolute).split("\\").join("/");
		if (entry.isDirectory()) {
			entries.push({ kind: "directory", path: normalizedPath });
			entries.push(...listTreeEntries(root, absolute));
		} else if (entry.isFile()) {
			entries.push({ kind: "file", path: normalizedPath });
		}
	}
	return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function writeScanReports(lane, scanJson) {
	writeFileSync(join(REPORT_DIR, `${lane}-scan.compact.json`), `${JSON.stringify(scanJson)}\n`, "utf8");
	writeFileSync(
		join(REPORT_DIR, `${lane}-scan.pretty.json`),
		`${JSON.stringify(scanJson, null, "\t")}\n`,
		"utf8",
	);
}

function writeJson(name, value) {
	writeFileSync(join(REPORT_DIR, name), `${JSON.stringify(value, null, "\t")}\n`, "utf8");
}

function writeBrief(summary) {
	const local = summary.lanes.local;
	const external = summary.lanes.external;
	const lines = [
		"TSX adoption corpus",
		"",
		`status: ${summary.status}`,
		`task: ${summary.task}`,
		"",
		"local lane:",
		`- status: ${local.status}`,
		`- source: ${local.source}`,
		`- analysis_health: ${local.analysis_health}`,
		`- product_file_count: ${local.product_file_count}`,
		"",
		"external lane:",
		`- status: ${external.status}`,
		`- repository: ${external.repository}`,
		`- commit: ${external.commit}`,
	];
	if (external.status === "pass") {
		lines.push(
			`- analysis_health: ${external.analysis_health}`,
			`- product_file_count: ${external.product_file_count}`,
			`- finding_count: ${external.findings.length}`,
		);
	} else {
		lines.push(`- unavailable_reason: ${external.reason}`);
	}
	lines.push("", "release gate: no", "contractual fixture: no", "");
	writeFileSync(join(REPORT_DIR, "brief.txt"), lines.join("\n"), "utf8");
}

function parseJson(value, label) {
	try {
		return JSON.parse(value);
	} catch (error) {
		throw new Error(`${label} is not valid JSON: ${error.message}`);
	}
}

function assertEqual(actual, expected, message) {
	if (actual !== expected) {
		throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
	}
}

function assertDeepEqual(actual, expected, message) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(message);
	}
}

function firstLine(value) {
	return value.split(/\r?\n/, 1)[0];
}
