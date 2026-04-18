import type { Stats } from "node:fs";
import {
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { posix, relative, resolve, sep } from "node:path";

import type { LoadedFixtureManifest } from "./fixture-manifest";

export type FilesystemSnapshotEntry =
	| {
			path: string;
			kind: "dir";
	  }
	| {
			path: string;
			kind: "file";
			bytes: Buffer;
	  }
	| {
			path: string;
			kind: "symlink";
			target_raw: Buffer;
	  };

export interface MaterializedFixtureSandbox {
	sandboxDir: string;
	cwd: string;
	preRunSnapshot: FilesystemSnapshotEntry[];
	dispose(): void;
}

export class FixtureSandboxError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "FixtureSandboxError";
	}
}

export function materializeFixtureSandbox(
	fixture: LoadedFixtureManifest,
): MaterializedFixtureSandbox {
	const sandboxDir = mkdtempSync(resolve(tmpdir(), `anchormap-fixture-${fixture.manifest.id}-`));

	try {
		copyFixtureRepoTree(fixture.layout.repoDir, sandboxDir);
		const cwd = resolveSandboxCwd(sandboxDir, fixture.manifest.cwd);
		const preRunSnapshot = snapshotFilesystemTree(sandboxDir);

		return {
			sandboxDir,
			cwd,
			preRunSnapshot,
			dispose() {
				rmSync(sandboxDir, { recursive: true, force: true });
			},
		};
	} catch (error) {
		rmSync(sandboxDir, { recursive: true, force: true });
		throw error;
	}
}

function copyFixtureRepoTree(sourceDir: string, destinationDir: string): void {
	const entries = readdirSync(sourceDir, { withFileTypes: true }).sort((left, right) =>
		compareBinaryUtf8(left.name, right.name),
	);

	for (const entry of entries) {
		const sourcePath = resolve(sourceDir, entry.name);
		const destinationPath = resolve(destinationDir, entry.name);

		if (entry.isSymbolicLink()) {
			symlinkSync(readlinkSync(sourcePath, { encoding: "buffer" }), destinationPath);
			continue;
		}

		if (entry.isDirectory()) {
			mkdirSync(destinationPath, { recursive: true });
			copyFixtureRepoTree(sourcePath, destinationPath);
			continue;
		}

		if (entry.isFile()) {
			writeFileSync(destinationPath, readFileSync(sourcePath));
			continue;
		}

		throw new FixtureSandboxError(`fixture repo contains unsupported entry type at ${sourcePath}`);
	}
}

function resolveSandboxCwd(sandboxDir: string, relativeCwd: string): string {
	const lexicalCwd = resolve(sandboxDir, relativeCwd);
	if (!isWithinRoot(sandboxDir, lexicalCwd)) {
		throw new FixtureSandboxError(`fixture cwd must stay inside the sandbox: ${relativeCwd}`);
	}

	const cwdStats = lstatOrThrow(lexicalCwd, relativeCwd);
	if (!cwdStats.isDirectory() && !cwdStats.isSymbolicLink()) {
		throw new FixtureSandboxError(
			`fixture cwd must resolve to a directory inside the sandbox: ${relativeCwd}`,
		);
	}

	const realSandboxDir = realpathOrThrow(sandboxDir, ".");
	const realCwd = realpathOrThrow(lexicalCwd, relativeCwd);
	if (!isWithinRoot(realSandboxDir, realCwd)) {
		throw new FixtureSandboxError(
			`fixture cwd must not resolve outside the sandbox: ${relativeCwd}`,
		);
	}
	if (!lstatSync(realCwd).isDirectory()) {
		throw new FixtureSandboxError(
			`fixture cwd must resolve to a directory inside the sandbox: ${relativeCwd}`,
		);
	}

	return realCwd;
}

function snapshotFilesystemTree(rootDir: string): FilesystemSnapshotEntry[] {
	const snapshot: FilesystemSnapshotEntry[] = [];
	collectSnapshotEntries(rootDir, rootDir, snapshot);
	return snapshot.sort((left, right) => compareBinaryUtf8(left.path, right.path));
}

function collectSnapshotEntries(
	rootDir: string,
	currentDir: string,
	snapshot: FilesystemSnapshotEntry[],
): void {
	const entries = readdirSync(currentDir, { withFileTypes: true }).sort((left, right) =>
		compareBinaryUtf8(left.name, right.name),
	);

	for (const entry of entries) {
		const absolutePath = resolve(currentDir, entry.name);
		const relativePath = toCanonicalRelativePath(rootDir, absolutePath);

		if (entry.isSymbolicLink()) {
			snapshot.push({
				path: relativePath,
				kind: "symlink",
				target_raw: readlinkSync(absolutePath, { encoding: "buffer" }),
			});
			continue;
		}

		if (entry.isDirectory()) {
			snapshot.push({ path: relativePath, kind: "dir" });
			collectSnapshotEntries(rootDir, absolutePath, snapshot);
			continue;
		}

		if (entry.isFile()) {
			snapshot.push({
				path: relativePath,
				kind: "file",
				bytes: readFileSync(absolutePath),
			});
			continue;
		}

		throw new FixtureSandboxError(
			`fixture sandbox contains unsupported entry type at ${absolutePath}`,
		);
	}
}

function toCanonicalRelativePath(rootDir: string, absolutePath: string): string {
	const relativePath = relative(rootDir, absolutePath);
	if (relativePath.length === 0) {
		throw new FixtureSandboxError("snapshot root path must not be emitted");
	}

	return relativePath.split(sep).join(posix.sep);
}

function lstatOrThrow(absolutePath: string, relativePath: string): Stats {
	try {
		return lstatSync(absolutePath);
	} catch (error) {
		const reason = error instanceof Error ? error.message : "unknown cwd resolution failure";
		throw new FixtureSandboxError(
			`fixture cwd must resolve to an existing directory inside the sandbox: ${relativePath} (${reason})`,
		);
	}
}

function realpathOrThrow(absolutePath: string, relativePath: string): string {
	try {
		return realpathSync(absolutePath);
	} catch (error) {
		const reason = error instanceof Error ? error.message : "unknown cwd resolution failure";
		throw new FixtureSandboxError(
			`fixture cwd must resolve to an existing directory inside the sandbox: ${relativePath} (${reason})`,
		);
	}
}

function isWithinRoot(rootDir: string, candidatePath: string): boolean {
	if (rootDir === candidatePath) {
		return true;
	}

	const relativePath = relative(rootDir, candidatePath);
	return relativePath.length > 0 && relativePath !== ".." && !relativePath.startsWith(`..${sep}`);
}

function compareBinaryUtf8(left: string, right: string): number {
	return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
