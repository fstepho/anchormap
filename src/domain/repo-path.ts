import { Buffer } from "node:buffer";

declare const repoPathBrand: unique symbol;

export type RepoPath = string & { readonly [repoPathBrand]: true };

export type RepoPathValidationFailureReason =
	| "empty"
	| "contains_backslash"
	| "contains_control_character"
	| "absolute"
	| "trailing_slash"
	| "empty_segment"
	| "dot_segment"
	| "dotdot_segment";

export interface RepoPathValidationFailure {
	kind: "InvalidRepoPath";
	value: string;
	reason: RepoPathValidationFailureReason;
}

export type RepoPathValidationResult =
	| { kind: "ok"; repoPath: RepoPath }
	| { kind: "validation_failure"; failure: RepoPathValidationFailure };

export type UserPathArgNormalizationResult = RepoPathValidationResult;

export type ImportCandidateNormalizationResult =
	| { kind: "repo_path"; repoPath: RepoPath }
	| { kind: "outside_repo_root"; existence: "nonexistent" };

export function validateRepoPath(value: string): RepoPathValidationResult {
	const failureReason = getRepoPathFailureReason(value);
	if (failureReason === undefined) {
		return {
			kind: "ok",
			repoPath: value as RepoPath,
		};
	}

	return {
		kind: "validation_failure",
		failure: {
			kind: "InvalidRepoPath",
			value,
			reason: failureReason,
		},
	};
}

export function normalizeUserPathArg(value: string): UserPathArgNormalizationResult {
	const earlyFailureReason = getUserPathArgEarlyFailureReason(value);
	if (earlyFailureReason !== undefined) {
		return invalidRepoPath(value, earlyFailureReason);
	}

	let normalized = value.replace(/\/+/g, "/");
	while (normalized.startsWith("./")) {
		normalized = normalized.slice(2);
	}
	while (normalized.endsWith("/")) {
		normalized = normalized.slice(0, -1);
	}

	return validateRepoPath(normalized);
}

export function normalizeImportCandidate(
	importer: RepoPath,
	relativeSpecifier: string,
	candidateSuffix = "",
): ImportCandidateNormalizationResult {
	const importerSegments = repoPathToString(importer).split("/");
	const importerDirectorySegments = importerSegments.slice(0, -1);
	const candidate = [...importerDirectorySegments, `${relativeSpecifier}${candidateSuffix}`].join(
		"/",
	);
	const segments = candidate.replace(/\/+/g, "/").split("/");
	const resolvedSegments: string[] = [];

	for (const segment of segments) {
		if (segment === "" || segment === ".") {
			continue;
		}

		if (segment === "..") {
			if (resolvedSegments.length === 0) {
				return {
					kind: "outside_repo_root",
					existence: "nonexistent",
				};
			}
			resolvedSegments.pop();
			continue;
		}

		resolvedSegments.push(segment);
	}

	const repoPath = resolvedSegments.join("/");
	const result = validateRepoPath(repoPath);
	if (result.kind === "ok") {
		return {
			kind: "repo_path",
			repoPath: result.repoPath,
		};
	}

	return {
		kind: "outside_repo_root",
		existence: "nonexistent",
	};
}

export function compareRepoPathsByUtf8(left: RepoPath, right: RepoPath): number {
	return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function repoPathToString(repoPath: RepoPath): string {
	return repoPath;
}

function invalidRepoPath(
	value: string,
	reason: RepoPathValidationFailureReason,
): RepoPathValidationResult {
	return {
		kind: "validation_failure",
		failure: {
			kind: "InvalidRepoPath",
			value,
			reason,
		},
	};
}

function getUserPathArgEarlyFailureReason(
	value: string,
): RepoPathValidationFailureReason | undefined {
	if (value === "") {
		return "empty";
	}

	if (value.includes("\\")) {
		return "contains_backslash";
	}

	if (containsControlCharacter(value)) {
		return "contains_control_character";
	}

	return undefined;
}

function getRepoPathFailureReason(value: string): RepoPathValidationFailureReason | undefined {
	if (value === "") {
		return "empty";
	}

	if (value.includes("\\")) {
		return "contains_backslash";
	}

	if (containsControlCharacter(value)) {
		return "contains_control_character";
	}

	if (value.startsWith("/")) {
		return "absolute";
	}

	if (value.endsWith("/")) {
		return "trailing_slash";
	}

	for (const segment of value.split("/")) {
		if (segment === "") {
			return "empty_segment";
		}
		if (segment === ".") {
			return "dot_segment";
		}
		if (segment === "..") {
			return "dotdot_segment";
		}
	}

	return undefined;
}

function containsControlCharacter(value: string): boolean {
	for (const character of value) {
		const codePoint = character.codePointAt(0);
		if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
			return true;
		}
	}

	return false;
}
