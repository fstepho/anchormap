import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import { runCliStub } from "./cli-stub";

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

function withTempRepo(callback: (repoDir: string) => void): void {
	const repoDir = mkdtempSync(resolve(tmpdir(), "anchormap-cli-stub-"));

	try {
		callback(repoDir);
	} finally {
		rmSync(repoDir, { recursive: true, force: true });
	}
}

test("scan --json succeeds with exact golden bytes when the stub fixture repo is present", () => {
	withTempRepo((repoDir) => {
		mkdirSync(resolve(repoDir, "specs"), { recursive: true });
		writeFileSync(resolve(repoDir, "specs", "example.md"), "# US-001 Example\n");
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runCliStub(["scan", "--json"], {
			cwd: repoDir,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 0);
		assert.equal(stdout.read(), '{"ok":true}\n');
		assert.equal(stderr.read(), "");
	});
});

test("scan --json fails with empty stdout when the stub fixture repo is missing the success marker", () => {
	withTempRepo((repoDir) => {
		const stdout = createBufferingWriter();
		const stderr = createBufferingWriter();

		const exitCode = runCliStub(["scan", "--json"], {
			cwd: repoDir,
			stdout: stdout.writer,
			stderr: stderr.writer,
		});

		assert.equal(exitCode, 2);
		assert.equal(stdout.read(), "");
		assert.match(stderr.read(), /missing specs\/example\.md/);
	});
});
