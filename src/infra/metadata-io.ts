import { type AppError, usageError } from "../cli/command-result";
import type { BundleMetadata, BundleMetadataProvider } from "../domain/bundle-model";
import { loadJsonArtifactText } from "./artifact-file-io";

export type LoadBundleMetadataResult =
	| { kind: "ok"; metadata: BundleMetadata }
	| { kind: "error"; error: AppError };

type JsonObject = Record<string, unknown>;
type ValidationResult<Value> = { kind: "ok"; value: Value } | { kind: "error"; error: AppError };
type ObjectValidationResult =
	| { kind: "ok"; object: JsonObject }
	| { kind: "error"; error: AppError };

const METADATA_KEYS = [
	"provider",
	"repository",
	"commit",
	"branch",
	"pull_request",
	"run_url",
] as const;

export function loadBundleMetadata(
	pathArg: string,
	options: { cwd?: string; optionName?: string } = {},
): LoadBundleMetadataResult {
	const loaded = loadJsonArtifactText(pathArg, options.optionName ?? "--metadata", options.cwd);
	if (loaded.kind === "error") {
		return loaded;
	}

	return parseBundleMetadataJson(loaded.text, loaded.label);
}

export function parseBundleMetadataJson(
	text: string,
	label = "metadata artifact",
): LoadBundleMetadataResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { kind: "error", error: usageError(`${label} is not valid JSON`) };
	}

	const metadata = validateBundleMetadataValue(parsed, label);
	if (metadata.kind === "error") {
		return metadata;
	}

	return { kind: "ok", metadata: metadata.value };
}

function validateBundleMetadataValue(
	value: unknown,
	label: string,
): ValidationResult<BundleMetadata> {
	const object = expectObject(value, label, METADATA_KEYS);
	if (object.kind === "error") {
		return object;
	}

	const provider = expectEnum<BundleMetadataProvider>(object.object.provider, `${label}.provider`, [
		"github",
		"gitlab",
		"generic",
		"other",
	]);
	if (provider.kind === "error") {
		return provider;
	}
	const repository = expectNonEmptyStringOrNull(object.object.repository, `${label}.repository`);
	if (repository.kind === "error") {
		return repository;
	}
	const commit = expectNonEmptyStringOrNull(object.object.commit, `${label}.commit`);
	if (commit.kind === "error") {
		return commit;
	}
	const branch = expectNonEmptyStringOrNull(object.object.branch, `${label}.branch`);
	if (branch.kind === "error") {
		return branch;
	}
	const pullRequest = expectPositiveIntegerOrNull(
		object.object.pull_request,
		`${label}.pull_request`,
	);
	if (pullRequest.kind === "error") {
		return pullRequest;
	}
	const runUrl = expectNonEmptyStringOrNull(object.object.run_url, `${label}.run_url`);
	if (runUrl.kind === "error") {
		return runUrl;
	}

	return {
		kind: "ok",
		value: {
			provider: provider.value,
			repository: repository.value,
			commit: commit.value,
			branch: branch.value,
			pull_request: pullRequest.value,
			run_url: runUrl.value,
		},
	};
}

function expectObject(
	value: unknown,
	label: string,
	keys: readonly string[],
): ObjectValidationResult {
	const object = expectOpenObject(value, label);
	if (object.kind === "error") {
		return object;
	}
	const actualKeys = Object.keys(object.object);
	if (actualKeys.length !== keys.length || keys.some((key) => !(key in object.object))) {
		return validationError(`${label} has unsupported schema fields`);
	}

	return object;
}

function expectOpenObject(value: unknown, label: string): ObjectValidationResult {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return validationError(`${label} must be an object`);
	}

	return { kind: "ok", object: value as JsonObject };
}

function expectEnum<Value extends string>(
	value: unknown,
	label: string,
	allowed: readonly Value[],
): ValidationResult<Value> {
	if (typeof value !== "string" || !allowed.includes(value as Value)) {
		return validationError(`${label} is not supported`);
	}

	return { kind: "ok", value: value as Value };
}

function expectNonEmptyStringOrNull(
	value: unknown,
	label: string,
): ValidationResult<string | null> {
	if (value === null) {
		return { kind: "ok", value: null };
	}
	if (typeof value !== "string") {
		return validationError(`${label} must be a string or null`);
	}
	if (value.length === 0) {
		return validationError(`${label} must be non-empty when present`);
	}

	return { kind: "ok", value };
}

function expectPositiveIntegerOrNull(
	value: unknown,
	label: string,
): ValidationResult<number | null> {
	if (value === null) {
		return { kind: "ok", value: null };
	}
	if (!Number.isInteger(value) || (value as number) < 1) {
		return validationError(`${label} must be an integer >= 1 or null`);
	}

	return { kind: "ok", value: value as number };
}

function validationError(message: string): { kind: "error"; error: AppError } {
	return { kind: "error", error: usageError(message) };
}
