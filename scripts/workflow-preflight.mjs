import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDir, "..");
const rootDir = resolve(process.env.WORKFLOW_PREFLIGHT_ROOT ?? defaultRoot);
const tasksFile = resolve(process.env.TASKS_FILE ?? join(rootDir, "docs", "tasks.md"));

const taskIdPattern = /^(T[0-9]+\.[0-9]+[a-z]*|S[0-9]+)$/;
const validStages = new Set(["implement", "review"]);

function printErr(code, detail) {
	process.stderr.write(`preflight: ${code}: ${detail}\n`);
}

function exitInvalid(code, detail) {
	printErr(code, detail);
	process.exit(2);
}

function parseArgs(argv) {
	const options = {
		stage: "implement",
		taskId: null,
		processSurface: null,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--task") {
			index += 1;
			if (index >= argv.length) exitInvalid("invalid_invocation", "--task requires a value");
			options.taskId = argv[index];
			continue;
		}
		if (arg === "--process") {
			index += 1;
			if (index >= argv.length) exitInvalid("invalid_invocation", "--process requires a value");
			options.processSurface = argv[index];
			continue;
		}
		if (arg === "--stage") {
			index += 1;
			if (index >= argv.length) exitInvalid("invalid_invocation", "--stage requires a value");
			options.stage = argv[index];
			continue;
		}
		exitInvalid("invalid_invocation", `unknown argument ${arg}`);
	}

	if (!validStages.has(options.stage)) {
		exitInvalid("invalid_invocation", `invalid stage ${options.stage}`);
	}
	if ((options.taskId === null) === (options.processSurface === null)) {
		exitInvalid("invalid_invocation", "provide exactly one of --task or --process");
	}
	if (options.taskId !== null && !taskIdPattern.test(options.taskId)) {
		exitInvalid("invalid_task_id", options.taskId);
	}
	if (options.processSurface !== null && options.processSurface.trim() === "") {
		exitInvalid("invalid_process_surface", "--process must not be empty");
	}

	return options;
}

function readTasks() {
	if (!existsSync(tasksFile)) {
		printErr("tasks_file_missing", relative(rootDir, tasksFile));
		return null;
	}
	return readFileSync(tasksFile, "utf8");
}

function extractExecutionState(content) {
	const lines = content.split(/\r?\n/);
	const start = lines.indexOf("## Execution State");
	if (start === -1) return null;

	const body = [];
	for (let index = start + 1; index < lines.length; index += 1) {
		if (lines[index].startsWith("## ")) break;
		body.push(lines[index]);
	}
	return body.join("\n");
}

function extractCurrentActiveTask(executionState) {
	const match = /^- Current active task:\s+`?(?<value>[^`\n]+)`?/m.exec(executionState);
	if (!match?.groups?.value) return null;
	const id = /(T[0-9]+\.[0-9]+[a-z]*|S[0-9]+)/.exec(match.groups.value);
	return id?.[1] ?? null;
}

function extractTaskBlock(content, taskId) {
	const lines = content.split(/\r?\n/);
	const heading = `### ${taskId} `;
	let start = -1;

	for (let index = 0; index < lines.length; index += 1) {
		if (lines[index].startsWith(heading)) {
			start = index + 1;
			break;
		}
	}
	if (start === -1) return null;

	const block = [];
	for (let index = start; index < lines.length; index += 1) {
		if (lines[index].startsWith("### ") || lines[index].startsWith("## ")) break;
		block.push(lines[index]);
	}
	return block.join("\n");
}

function runGit(args) {
	try {
		return execFileSync("git", ["-C", rootDir, ...args], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch {
		return null;
	}
}

function collectGitFiles() {
	const status = runGit(["status", "--porcelain", "--untracked-files=all"]);
	const unstaged = runGit(["diff", "--name-only"]);
	const staged = runGit(["diff", "--cached", "--name-only"]);

	if (status === null || unstaged === null || staged === null) {
		return { available: false, files: [] };
	}

	const files = new Set();
	for (const line of status.split(/\r?\n/)) {
		if (line.trim() === "") continue;
		const rawPath = line.slice(3);
		const renameSeparator = " -> ";
		if (rawPath.includes(renameSeparator)) {
			const [sourcePath, targetPath] = rawPath.split(renameSeparator);
			files.add(sourcePath.trim());
			files.add(targetPath.trim());
			continue;
		}
		files.add(rawPath.trim());
	}
	for (const text of [unstaged, staged]) {
		for (const line of text.split(/\r?\n/)) {
			if (line.trim() !== "") files.add(line.trim());
		}
	}

	return { available: true, files: [...files].sort() };
}

function isCriticalPath(path) {
	return (
		path === "AGENTS.md" ||
		path === "docs/contract.md" ||
		path === "docs/evals.md" ||
		path === "docs/operating-model.md" ||
		path === "docs/agent-loop.md" ||
		path === "docs/code-review.md" ||
		path === "package.json" ||
		path === "package-lock.json" ||
		path.startsWith(".agents/skills/") ||
		path.startsWith("scripts/") ||
		path.startsWith("fixtures/") ||
		path.startsWith("testdata/workflow-preflight/") ||
		path.startsWith("src/harness/") ||
		path.startsWith("src/cli") ||
		path.includes("/parser") ||
		path.includes("/render") ||
		path.includes("/config") ||
		path.includes("/filesystem") ||
		path.includes("/fixture")
	);
}

function isProductAuthorityDoc(path) {
	return (
		path === "docs/brief.md" ||
		path === "docs/contract.md" ||
		path === "docs/design.md" ||
		path === "docs/evals.md"
	);
}

const processSurfaceAllowlist = new Map([
	[
		"workflow-preflight",
		new Set([
			"docs/agent-loop.md",
			"package.json",
			"package-lock.json",
			"scripts/workflow-preflight.mjs",
			"scripts/workflow-preflight.sh",
			"src/harness/workflow-preflight-fixture.test.ts",
		]),
	],
]);

function isProcessSurfacePath(path, processSurface) {
	if (processSurface === null) return true;
	const allowlist = processSurfaceAllowlist.get(processSurface);
	if (allowlist !== undefined) return allowlist.has(path);
	return path.includes(processSurface);
}

function classifyPath(path, processSurface = null) {
	if (isProductAuthorityDoc(path)) return "product-authority";
	if (path.startsWith("fixtures/")) {
		if (processSurface !== null && path.startsWith(`fixtures/${processSurface}/`)) {
			return "process";
		}
		return "fixture-artifact";
	}
	if (path.startsWith("testdata/")) {
		if (processSurface !== null && path.startsWith(`testdata/${processSurface}/`)) {
			return "process";
		}
		return "other";
	}
	if (
		path === "AGENTS.md" ||
		path.startsWith("docs/") ||
		path.startsWith(".agents/") ||
		path.startsWith("scripts/") ||
		path.startsWith("src/harness/") ||
		path === "src/package-scripts.test.ts" ||
		path === "package.json" ||
		path === "package-lock.json" ||
		path === "biome.json" ||
		path === "tsconfig.json"
	) {
		return isProcessSurfacePath(path, processSurface) ? "process" : "other";
	}
	if (path.startsWith("src/")) return "runtime";
	return "other";
}

function hasReferenceEntry(block, filename) {
	const escapedFilename = filename.replace(".", "\\.");
	const pattern = new RegExp(
		`^\\s*-\\s+\`?(?:docs\\/)?${escapedFilename}\`?\\s+(?:[-–—:]|§|#)\\s*\\S`,
		"m",
	);
	return pattern.test(block);
}

function hasRequiredTaskReferences(block) {
	return (
		hasReferenceEntry(block, "contract.md") &&
		hasReferenceEntry(block, "design.md") &&
		hasReferenceEntry(block, "evals.md")
	);
}

function getDiffMode(git) {
	if (!git.available) return "unknown";
	if (git.files.length === 0) return "none";
	return git.files.some(isCriticalPath) ? "critical" : "standard";
}

function main() {
	const options = parseArgs(process.argv.slice(2));
	const diagnostics = [];
	const tasksContent = readTasks();
	if (tasksContent === null) process.exit(1);

	const git = collectGitFiles();
	if (!git.available) {
		diagnostics.push(["git_unavailable", `cannot inspect ${rootDir}`]);
	}

	let surface = "";
	let requiredReads = "";
	const diffMode = getDiffMode(git);

	if (options.taskId !== null) {
		surface = options.taskId;
		const executionState = extractExecutionState(tasksContent);
		if (executionState === null) {
			diagnostics.push(["execution_state_missing", "docs/tasks.md has no Execution State section"]);
		} else {
			const activeTask = extractCurrentActiveTask(executionState);
			if (activeTask === null) {
				diagnostics.push(["active_task_missing", "Current active task has no task ID"]);
			} else if (activeTask !== options.taskId) {
				diagnostics.push([
					"active_task_mismatch",
					`requested ${options.taskId}, current active task is ${activeTask}`,
				]);
			}
		}

		const taskBlock = extractTaskBlock(tasksContent, options.taskId);
		if (taskBlock === null) {
			diagnostics.push(["task_missing", options.taskId]);
		} else if (!hasRequiredTaskReferences(taskBlock)) {
			diagnostics.push(["task_refs_missing", `${options.taskId} lacks required traceability refs`]);
		}
		requiredReads = "docs/operating-model.md, docs/tasks.md, referenced contract/design/evals";
	} else {
		surface = options.processSurface;
		requiredReads =
			"docs/operating-model.md, docs/agent-loop.md, docs/code-review.md, relevant ADRs";
	}

	if (options.taskId !== null && diffMode === "critical") {
		requiredReads =
			"docs/operating-model.md, docs/tasks.md, full contract/design/evals, relevant ADRs";
	}

	if (options.stage === "review" && git.available && git.files.length === 0) {
		diagnostics.push(["review_diff_missing", "--stage review requires a bounded diff"]);
	}

	if (options.stage === "review" && git.available && options.processSurface !== null) {
		const categories = new Set(git.files.map((file) => classifyPath(file, options.processSurface)));
		if (categories.has("runtime")) {
			diagnostics.push([
				"process_surface_runtime_files",
				"process review diff contains runtime files",
			]);
		}
		if (categories.has("fixture-artifact")) {
			diagnostics.push([
				"process_surface_unrelated_fixtures",
				"process review diff contains fixture files outside the named process surface",
			]);
		}
		if (categories.has("other")) {
			diagnostics.push([
				"process_surface_other_files",
				"process review diff contains files outside the named process surface",
			]);
		}
		if (categories.has("product-authority")) {
			diagnostics.push([
				"process_surface_product_docs",
				"process review diff contains product authority docs",
			]);
		}
	}

	process.stdout.write(`preflight: ${diagnostics.length === 0 ? "ok" : "failed"}\n`);
	process.stdout.write(`surface: ${surface}\n`);
	process.stdout.write(`stage: ${options.stage}\n`);
	process.stdout.write(`diff_mode: ${diffMode}\n`);
	process.stdout.write(`changed_files: ${git.available ? git.files.length : "unknown"}\n`);
	if (git.available && git.files.length > 0) {
		for (const file of git.files) {
			process.stdout.write(`- ${file}\n`);
		}
	}
	process.stdout.write(`required_reads: ${requiredReads}\n`);

	for (const [code, detail] of diagnostics) {
		printErr(code, detail);
	}

	process.exit(diagnostics.length === 0 ? 0 : 1);
}

main();
