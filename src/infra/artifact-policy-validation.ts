import { type AppError, usageError } from "../cli/command-result";
import type { FindingKind } from "../domain/finding";
import type { PolicyDecision, PolicyResult, PolicyViolation } from "../domain/policy-engine";
import type { AnalysisHealth } from "../domain/scan-result";

export type ParsePolicyResultArtifactResult =
	| { kind: "ok"; policyResult: PolicyResult }
	| { kind: "error"; error: AppError };

type JsonObject = Record<string, unknown>;
type ValidationResult<Value> = { kind: "ok"; value: Value } | { kind: "error"; error: AppError };
type ObjectValidationResult =
	| { kind: "ok"; object: JsonObject }
	| { kind: "error"; error: AppError };

const POLICY_RESULT_KEYS = [
	"schema_version",
	"decision",
	"source_scan_schema_version",
	"analysis_health",
	"violations",
	"summary",
] as const;
const POLICY_SUMMARY_KEYS = [
	"observed_anchor_count",
	"usable_mapping_count",
	"product_file_count",
	"covered_product_file_count",
	"uncovered_product_file_count",
	"covered_product_file_percent",
	"untraced_product_file_count",
] as const;

export function parsePolicyResultArtifactJson(
	text: string,
	label = "check artifact",
): ParsePolicyResultArtifactResult {
	const parsed = parseJsonText(text, label);
	if (parsed.kind === "error") {
		return parsed;
	}

	const policyResult = validatePolicyResultArtifactValue(parsed.value, label);
	if (policyResult.kind === "error") {
		return policyResult;
	}

	return { kind: "ok", policyResult: policyResult.value };
}

function parseJsonText(
	text: string,
	label: string,
): { kind: "ok"; value: unknown } | { kind: "error"; error: AppError } {
	try {
		return { kind: "ok", value: JSON.parse(text) };
	} catch {
		return { kind: "error", error: usageError(`${label} is not valid JSON`) };
	}
}

function validatePolicyResultArtifactValue(
	value: unknown,
	label: string,
): ValidationResult<PolicyResult> {
	const root = expectObject(value, label, POLICY_RESULT_KEYS);
	if (root.kind === "error") {
		return root;
	}
	if (root.object.schema_version !== 1) {
		return validationError(`${label} schema_version is not supported`);
	}

	const decision = expectEnum<PolicyDecision>(root.object.decision, `${label}.decision`, [
		"pass",
		"fail",
	]);
	if (decision.kind === "error") {
		return decision;
	}
	const sourceScanSchemaVersion = expectNonNegativeInteger(
		root.object.source_scan_schema_version,
		`${label}.source_scan_schema_version`,
	);
	if (sourceScanSchemaVersion.kind === "error") {
		return sourceScanSchemaVersion;
	}
	const analysisHealth = expectEnum<AnalysisHealth>(
		root.object.analysis_health,
		`${label}.analysis_health`,
		["clean", "degraded"],
	);
	if (analysisHealth.kind === "error") {
		return analysisHealth;
	}
	const violations = validatePolicyViolations(root.object.violations, `${label}.violations`);
	if (violations.kind === "error") {
		return violations;
	}
	const summary = validatePolicySummary(root.object.summary, `${label}.summary`);
	if (summary.kind === "error") {
		return summary;
	}

	return {
		kind: "ok",
		value: {
			schema_version: 1,
			decision: decision.value,
			source_scan_schema_version: sourceScanSchemaVersion.value,
			analysis_health: analysisHealth.value,
			violations: violations.value,
			summary: summary.value,
		},
	};
}

function validatePolicySummary(
	value: unknown,
	label: string,
): ValidationResult<PolicyResult["summary"]> {
	const object = expectObject(value, label, POLICY_SUMMARY_KEYS);
	if (object.kind === "error") {
		return object;
	}

	const summary = {} as Record<(typeof POLICY_SUMMARY_KEYS)[number], number>;
	for (const key of POLICY_SUMMARY_KEYS) {
		const field = expectNonNegativeInteger(object.object[key], `${label}.${key}`);
		if (field.kind === "error") {
			return field;
		}
		summary[key] = field.value;
	}

	return { kind: "ok", value: summary };
}

function validatePolicyViolations(
	value: unknown,
	label: string,
): ValidationResult<PolicyViolation[]> {
	return validateArrayItems(value, label, validatePolicyViolation);
}

function validatePolicyViolation(value: unknown, label: string): ValidationResult<PolicyViolation> {
	const object = expectOpenObject(value, label);
	if (object.kind === "error") {
		return object;
	}
	const kind = expectString(object.object.kind, `${label}.kind`);
	if (kind.kind === "error") {
		return kind;
	}

	switch (kind.value) {
		case "analysis_health_degraded": {
			const exact = expectObject(value, label, ["kind"]);
			if (exact.kind === "error") {
				return exact;
			}
			return { kind: "ok", value: { kind: "analysis_health_degraded" } };
		}
		case "finding_kind_present": {
			const exact = expectObject(value, label, ["kind", "finding_kind", "count"]);
			if (exact.kind === "error") {
				return exact;
			}
			const findingKind = expectFindingKind(exact.object.finding_kind, `${label}.finding_kind`);
			if (findingKind.kind === "error") {
				return findingKind;
			}
			const count = expectNonNegativeInteger(exact.object.count, `${label}.count`);
			if (count.kind === "error") {
				return count;
			}
			return {
				kind: "ok",
				value: {
					kind: "finding_kind_present",
					finding_kind: findingKind.value,
					count: count.value,
				},
			};
		}
		case "covered_product_file_percent_below_threshold":
		case "untraced_product_files_above_threshold": {
			const exact = expectObject(value, label, ["kind", "actual", "threshold"]);
			if (exact.kind === "error") {
				return exact;
			}
			const actual = expectNonNegativeInteger(exact.object.actual, `${label}.actual`);
			if (actual.kind === "error") {
				return actual;
			}
			const threshold = expectNonNegativeInteger(exact.object.threshold, `${label}.threshold`);
			if (threshold.kind === "error") {
				return threshold;
			}
			return {
				kind: "ok",
				value: { kind: kind.value, actual: actual.value, threshold: threshold.value },
			};
		}
		default:
			return validationError(`${label}.kind is not supported`);
	}
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

function expectString(value: unknown, label: string): ValidationResult<string> {
	if (typeof value !== "string") {
		return validationError(`${label} must be a string`);
	}

	return { kind: "ok", value };
}

function expectInteger(value: unknown, label: string): ValidationResult<number> {
	if (!Number.isInteger(value)) {
		return validationError(`${label} must be an integer`);
	}

	return { kind: "ok", value: value as number };
}

function expectNonNegativeInteger(value: unknown, label: string): ValidationResult<number> {
	const integer = expectInteger(value, label);
	if (integer.kind === "error") {
		return integer;
	}
	if (integer.value < 0) {
		return validationError(`${label} must be non-negative`);
	}

	return integer;
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

function expectFindingKind(value: unknown, label: string): ValidationResult<FindingKind> {
	return expectEnum<FindingKind>(value, label, [
		"unmapped_anchor",
		"stale_mapping_anchor",
		"broken_seed_path",
		"unresolved_static_edge",
		"unsupported_static_edge",
		"out_of_scope_static_edge",
		"unsupported_local_target",
		"untraced_product_file",
	]);
}

function validateArrayItems<Value>(
	value: unknown,
	label: string,
	validateItem: (value: unknown, label: string) => ValidationResult<Value>,
): ValidationResult<Value[]> {
	if (!Array.isArray(value)) {
		return validationError(`${label} must be an array`);
	}

	const result: Value[] = [];
	for (let index = 0; index < value.length; index += 1) {
		const item = validateItem(value[index], `${label}[${index}]`);
		if (item.kind === "error") {
			return item;
		}
		result.push(item.value);
	}

	return { kind: "ok", value: result };
}

function validationError(message: string): { kind: "error"; error: AppError } {
	return { kind: "error", error: usageError(message) };
}
