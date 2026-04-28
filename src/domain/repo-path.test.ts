import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
	compareRepoPathsByUtf8,
	normalizeImportCandidate,
	normalizeUserPathArg,
	type RepoPath,
	repoPathToString,
	validateRepoPath,
} from "./repo-path";

test("validates canonical RepoPath values", () => {
	for (const value of ["src/core", "specs/readme.md", "é/a", ".../file.ts"]) {
		const result = validateRepoPath(value);

		assert.equal(result.kind, "ok");
		assert.equal(repoPathToString(result.repoPath), value);
	}
});

test("rejects non-canonical RepoPath values", () => {
	const cases = [
		["", "empty"],
		["/src", "absolute"],
		["src\\core", "contains_backslash"],
		["src/core/", "trailing_slash"],
		["src//core", "empty_segment"],
		[".", "dot_segment"],
		["src/.", "dot_segment"],
		["..", "dotdot_segment"],
		["src/../core", "dotdot_segment"],
		["src/\u0000/core", "contains_control_character"],
		["src/\u007f/core", "contains_control_character"],
	] as const;

	for (const [value, reason] of cases) {
		const result = validateRepoPath(value);

		assert.deepEqual(result, {
			kind: "validation_failure",
			failure: {
				kind: "InvalidRepoPath",
				value,
				reason,
			},
		});
	}
});

test("normalizes CLI UserPathArg values exactly before RepoPath validation", () => {
	const cases = [
		["./src//core/", "src/core"],
		["././src/core", "src/core"],
		["src///core//file.ts", "src/core/file.ts"],
		["src", "src"],
	] as const;

	for (const [value, expected] of cases) {
		const result = normalizeUserPathArg(value);

		assert.equal(result.kind, "ok");
		assert.equal(repoPathToString(result.repoPath), expected);
	}
});

test("rejects invalid CLI UserPathArg values after exact normalization steps", () => {
	const cases = [
		["", "empty"],
		["./", "empty"],
		["/src", "absolute"],
		["src\\core", "contains_backslash"],
		["src/./core", "dot_segment"],
		["src/../core", "dotdot_segment"],
		["src/\u001f/core", "contains_control_character"],
	] as const;

	for (const [value, reason] of cases) {
		const result = normalizeUserPathArg(value);

		assert.deepEqual(result, {
			kind: "validation_failure",
			failure: {
				kind: "InvalidRepoPath",
				value: reason === "empty" && value === "./" ? "" : value,
				reason,
			},
		});
	}
});

test("lets callers detect duplicates after UserPathArg normalization", () => {
	const values = ["src/core", "./src//core/", "specs", "./specs/"];
	const normalizedValues = values.map((value) => {
		const result = normalizeUserPathArg(value);
		assert.equal(result.kind, "ok");
		return repoPathToString(result.repoPath);
	});

	assert.deepEqual(normalizedValues, ["src/core", "src/core", "specs", "specs"]);
	assert.deepEqual([...new Set(normalizedValues)], ["src/core", "specs"]);
});

test("normalizes relative import candidates lexically from the importer directory", () => {
	const importer = repoPath("src/features/use-case.ts");
	const result = normalizeImportCandidate(importer, "../shared/model", ".ts");

	assert.equal(result.kind, "repo_path");
	assert.equal(repoPathToString(result.repoPath), "src/shared/model.ts");

	const extraSlashResult = normalizeImportCandidate(importer, ".//shared/model", ".ts");
	assert.equal(extraSlashResult.kind, "repo_path");
	assert.equal(repoPathToString(extraSlashResult.repoPath), "src/features/shared/model.ts");

	const trailingSlashResult = normalizeImportCandidate(importer, "./shared/model/");
	assert.equal(trailingSlashResult.kind, "repo_path");
	assert.equal(repoPathToString(trailingSlashResult.repoPath), "src/features/shared/model");
});

test("represents import candidates above repo root as nonexistent outside-root candidates", () => {
	const importer = repoPath("src/index.ts");
	const result = normalizeImportCandidate(importer, "../../outside", ".ts");

	assert.deepEqual(result, {
		kind: "outside_repo_root",
		existence: "nonexistent",
	});
});

test("sorts RepoPath values by binary UTF-8 byte order, independent of locale", () => {
	const paths = [repoPath("ä/file.ts"), repoPath("z/file.ts"), repoPath("a/file.ts")];

	paths.sort(compareRepoPathsByUtf8);

	assert.deepEqual(paths.map(repoPathToString), ["a/file.ts", "z/file.ts", "ä/file.ts"]);
});

function repoPath(value: string): RepoPath {
	const result = validateRepoPath(value);
	assert.equal(result.kind, "ok");
	return result.repoPath;
}
