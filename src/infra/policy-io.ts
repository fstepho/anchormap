import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isMap, isScalar, isSeq, parseAllDocuments } from "yaml";

import { normalizeCliPathArg } from "../cli/command-preconditions";
import { type AppError, usageError } from "../cli/command-result";
import type { FindingKind } from "../domain/finding";
import type { Policy, PolicyFailOn, PolicyThresholds } from "../domain/policy-engine";
import { repoPathToString } from "../domain/repo-path";
import { decodeUtf8StrictNoBom } from "./repo-fs";

export type LoadPolicyResult = { kind: "ok"; policy: Policy } | { kind: "error"; error: AppError };

const POLICY_KEYS = new Set(["version", "fail_on", "thresholds"]);
const FAIL_ON_KEYS = new Set(["analysis_health", "finding_kinds"]);
const THRESHOLD_KEYS = new Set(["min_covered_product_file_percent", "max_untraced_product_files"]);
const FINDING_KINDS = new Set<FindingKind>([
	"unmapped_anchor",
	"stale_mapping_anchor",
	"broken_seed_path",
	"unresolved_static_edge",
	"unsupported_static_edge",
	"out_of_scope_static_edge",
	"unsupported_local_target",
	"untraced_product_file",
]);

type ParsedYamlDocument = ReturnType<typeof parseAllDocuments>[number];
type PolicyErrorResult = { kind: "error"; error: AppError };

interface MappingReadResult {
	readonly kind: "ok";
	readonly fields: Map<string, unknown>;
}

export function loadPolicy(
	pathArg: string,
	options: { cwd?: string; optionName?: string } = {},
): LoadPolicyResult {
	const optionName = options.optionName ?? "--policy";
	const normalizedPath = normalizeCliPathArg(pathArg, optionName);
	if (normalizedPath.kind === "usage_error") {
		return { kind: "error", error: usageError(normalizedPath.message) };
	}

	let bytes: Uint8Array;
	try {
		bytes = readFileSync(join(options.cwd ?? process.cwd(), repoPathToString(normalizedPath.path)));
	} catch {
		return { kind: "error", error: usageError(`${optionName} could not be read`) };
	}

	const decoded = decodeUtf8StrictNoBom(bytes);
	if (decoded.kind === "decode_error") {
		return { kind: "error", error: usageError(`${optionName} is not valid UTF-8`) };
	}

	return parsePolicyYamlText(decoded.text, optionName);
}

export function parsePolicyYamlText(text: string, label = "policy"): LoadPolicyResult {
	let documents: ReturnType<typeof parseAllDocuments>;

	try {
		documents = parseAllDocuments(text, {
			version: "1.2",
			uniqueKeys: true,
		});
	} catch (error) {
		return policyError(`${label} is invalid YAML`, error);
	}

	if (documents.length !== 1) {
		return policyError(`${label} must contain exactly one YAML document`);
	}

	const [document] = documents;
	if (document.errors.length > 0) {
		return policyError(`${label} is invalid YAML`, document.errors[0]);
	}

	const yamlVersionViolation = getYamlVersionDirectiveViolation(document);
	if (yamlVersionViolation !== undefined) {
		return policyError(`${label} must use YAML 1.2`, yamlVersionViolation);
	}

	const topLevel = readClosedMapping(document.contents, POLICY_KEYS, label);
	if (topLevel.kind === "error") {
		return topLevel;
	}

	const version = readRequiredVersion(topLevel.fields.get("version"), `${label}.version`);
	if (version.kind === "error") {
		return version;
	}

	const failOn = readOptionalFailOn(topLevel.fields.get("fail_on"), `${label}.fail_on`);
	if (failOn.kind === "error") {
		return failOn;
	}

	const thresholds = readOptionalThresholds(
		topLevel.fields.get("thresholds"),
		`${label}.thresholds`,
	);
	if (thresholds.kind === "error") {
		return thresholds;
	}

	return {
		kind: "ok",
		policy: {
			version: 1,
			...(failOn.failOn !== undefined ? { fail_on: failOn.failOn } : {}),
			...(thresholds.thresholds !== undefined ? { thresholds: thresholds.thresholds } : {}),
		},
	};
}

function readOptionalFailOn(
	node: unknown,
	path: string,
): { kind: "ok"; failOn?: PolicyFailOn } | PolicyErrorResult {
	if (node === undefined) {
		return { kind: "ok" };
	}

	const fields = readClosedMapping(node, FAIL_ON_KEYS, path);
	if (fields.kind === "error") {
		return fields;
	}

	const analysisHealth = readOptionalDegraded(
		fields.fields.get("analysis_health"),
		`${path}.analysis_health`,
	);
	if (analysisHealth.kind === "error") {
		return analysisHealth;
	}

	const findingKinds = readOptionalFindingKinds(
		fields.fields.get("finding_kinds"),
		`${path}.finding_kinds`,
	);
	if (findingKinds.kind === "error") {
		return findingKinds;
	}

	return {
		kind: "ok",
		failOn: {
			...(analysisHealth.value !== undefined ? { analysis_health: analysisHealth.value } : {}),
			...(findingKinds.values !== undefined ? { finding_kinds: findingKinds.values } : {}),
		},
	};
}

function readOptionalThresholds(
	node: unknown,
	path: string,
): { kind: "ok"; thresholds?: PolicyThresholds } | PolicyErrorResult {
	if (node === undefined) {
		return { kind: "ok" };
	}

	const fields = readClosedMapping(node, THRESHOLD_KEYS, path);
	if (fields.kind === "error") {
		return fields;
	}

	const minCovered = readOptionalIntegerInRange(
		fields.fields.get("min_covered_product_file_percent"),
		`${path}.min_covered_product_file_percent`,
		{ min: 0, max: 100 },
	);
	if (minCovered.kind === "error") {
		return minCovered;
	}

	const maxUntraced = readOptionalIntegerInRange(
		fields.fields.get("max_untraced_product_files"),
		`${path}.max_untraced_product_files`,
		{ min: 0 },
	);
	if (maxUntraced.kind === "error") {
		return maxUntraced;
	}

	return {
		kind: "ok",
		thresholds: {
			...(minCovered.value !== undefined
				? { min_covered_product_file_percent: minCovered.value }
				: {}),
			...(maxUntraced.value !== undefined ? { max_untraced_product_files: maxUntraced.value } : {}),
		},
	};
}

function readClosedMapping(
	node: unknown,
	allowedKeys: ReadonlySet<string>,
	path: string,
): MappingReadResult | PolicyErrorResult {
	if (!isMap(node)) {
		return policyError(`${path} must be a mapping`);
	}

	const fields = new Map<string, unknown>();
	for (const item of node.items) {
		const pair = item as { key: unknown; value: unknown };
		const key = readStringScalar(pair.key, `${path} key`);
		if (key.kind === "error") {
			return key;
		}
		if (!allowedKeys.has(key.value)) {
			return policyError(`${path} contains unknown field ${key.value}`);
		}
		fields.set(key.value, pair.value);
	}

	return { kind: "ok", fields };
}

function readRequiredVersion(node: unknown, path: string): { kind: "ok" } | PolicyErrorResult {
	if (node === undefined) {
		return policyError(`${path} is required`);
	}
	if (!isScalar(node) || typeof node.value !== "number" || !Number.isInteger(node.value)) {
		return policyError(`${path} must be integer 1`);
	}
	if (node.value !== 1) {
		return policyError(`${path} must be 1`);
	}

	return { kind: "ok" };
}

function readOptionalDegraded(
	node: unknown,
	path: string,
): { kind: "ok"; value?: "degraded" } | PolicyErrorResult {
	if (node === undefined) {
		return { kind: "ok" };
	}
	if (!isScalar(node) || node.value !== "degraded") {
		return policyError(`${path} must be degraded`);
	}

	return { kind: "ok", value: "degraded" };
}

function readOptionalFindingKinds(
	node: unknown,
	path: string,
): { kind: "ok"; values?: FindingKind[] } | PolicyErrorResult {
	if (node === undefined) {
		return { kind: "ok" };
	}
	if (!isSeq(node)) {
		return policyError(`${path} must be a sequence`);
	}

	const values: FindingKind[] = [];
	const seen = new Set<FindingKind>();
	for (const [index, item] of node.items.entries()) {
		const value = readStringScalar(item, `${path}[${index}]`);
		if (value.kind === "error") {
			return value;
		}
		if (!FINDING_KINDS.has(value.value as FindingKind)) {
			return policyError(`${path}[${index}] must be a supported finding kind`);
		}
		const findingKind = value.value as FindingKind;
		if (seen.has(findingKind)) {
			return policyError(`${path} must contain distinct finding kinds`);
		}
		seen.add(findingKind);
		values.push(findingKind);
	}

	return { kind: "ok", values };
}

function readOptionalIntegerInRange(
	node: unknown,
	path: string,
	range: { min: number; max?: number },
): { kind: "ok"; value?: number } | PolicyErrorResult {
	if (node === undefined) {
		return { kind: "ok" };
	}
	if (!isScalar(node) || typeof node.value !== "number" || !Number.isInteger(node.value)) {
		return policyError(`${path} must be an integer`);
	}
	if (node.value < range.min || (range.max !== undefined && node.value > range.max)) {
		return policyError(`${path} is outside supported range`);
	}

	return { kind: "ok", value: node.value };
}

function readStringScalar(
	node: unknown,
	path: string,
): { kind: "ok"; value: string } | PolicyErrorResult {
	if (!isScalar(node) || typeof node.value !== "string") {
		return policyError(`${path} must be a string scalar`);
	}

	return { kind: "ok", value: node.value };
}

function getYamlVersionDirectiveViolation(document: ParsedYamlDocument): unknown {
	if (document.directives?.yaml.explicit === true && document.directives.yaml.version !== "1.2") {
		return document.directives.yaml;
	}

	return document.warnings.find(
		(warning) =>
			warning.code === "BAD_DIRECTIVE" && warning.message.startsWith("Unsupported YAML version "),
	);
}

function policyError(message: string, cause?: unknown): PolicyErrorResult {
	void cause;
	return {
		kind: "error",
		error: usageError(message),
	};
}
