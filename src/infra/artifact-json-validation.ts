import { type AppError, usageError } from "../cli/command-result";
import { type AnchorId, validateAnchorId } from "../domain/anchor-id";
import type {
	CoveringAnchorIdsChange,
	MappingStateChange,
	StoredMappingStateChange,
	SupportedLocalTargetsChange,
	TraceabilityDiff,
	TraceabilityDiffComparability,
} from "../domain/diff-engine";
import type { Finding, StaticEdgeSyntaxKind } from "../domain/finding";
import { type RepoPath, validateRepoPath } from "../domain/repo-path";
import type { AnalysisHealth, TraceabilitySummaryView } from "../domain/scan-result";

export type ParseTraceabilityDiffArtifactResult =
	| { kind: "ok"; diff: TraceabilityDiff }
	| { kind: "error"; error: AppError };

type JsonObject = Record<string, unknown>;
type ValidationResult<Value> = { kind: "ok"; value: Value } | { kind: "error"; error: AppError };
type ObjectValidationResult =
	| { kind: "ok"; object: JsonObject }
	| { kind: "error"; error: AppError };

const SUMMARY_KEYS = [
	"product_file_count",
	"stored_mapping_count",
	"usable_mapping_count",
	"observed_anchor_count",
	"active_anchor_count",
	"draft_anchor_count",
	"covered_product_file_count",
	"uncovered_product_file_count",
	"directly_seeded_product_file_count",
	"single_cover_product_file_count",
	"multi_cover_product_file_count",
] as const;
const DIFF_ROOT_KEYS = [
	"schema_version",
	"base_scan_schema_version",
	"head_scan_schema_version",
	"comparability",
	"analysis_health_change",
	"anchors",
	"mappings",
	"files",
	"findings",
	"metrics_delta",
] as const;
const DIFF_HEALTH_CHANGE_KEYS = ["from", "to"] as const;
const DIFF_ANCHOR_KEYS = ["added", "removed", "mapping_state_changed"] as const;
const DIFF_MAPPING_KEYS = ["added", "removed", "state_changed"] as const;
const DIFF_FILE_KEYS = [
	"added",
	"removed",
	"became_covered",
	"lost_coverage",
	"covering_anchor_ids_changed",
	"supported_local_targets_changed",
] as const;
const DIFF_FINDING_KEYS = ["added", "removed"] as const;
const ANCHOR_STATE_CHANGE_KEYS = ["anchor_id", "from", "to"] as const;
const FILE_PATH_CHANGE_KEYS = ["path", "from", "to"] as const;

export function parseTraceabilityDiffArtifactJson(
	text: string,
	label = "diff artifact",
): ParseTraceabilityDiffArtifactResult {
	const parsed = parseJsonText(text, label);
	if (parsed.kind === "error") {
		return parsed;
	}

	const diff = validateTraceabilityDiffArtifactValue(parsed.value, label);
	if (diff.kind === "error") {
		return diff;
	}

	return { kind: "ok", diff: diff.value };
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

function validateTraceabilityDiffArtifactValue(
	value: unknown,
	label: string,
): ValidationResult<TraceabilityDiff> {
	const root = expectObject(value, label, DIFF_ROOT_KEYS);
	if (root.kind === "error") {
		return root;
	}
	if (root.object.schema_version !== 1) {
		return validationError(`${label} schema_version is not supported`);
	}

	const baseScanSchemaVersion = expectNonNegativeInteger(
		root.object.base_scan_schema_version,
		`${label}.base_scan_schema_version`,
	);
	if (baseScanSchemaVersion.kind === "error") {
		return baseScanSchemaVersion;
	}
	const headScanSchemaVersion = expectNonNegativeInteger(
		root.object.head_scan_schema_version,
		`${label}.head_scan_schema_version`,
	);
	if (headScanSchemaVersion.kind === "error") {
		return headScanSchemaVersion;
	}
	const comparability = expectEnum<TraceabilityDiffComparability>(
		root.object.comparability,
		`${label}.comparability`,
		["same_scope", "scope_changed"],
	);
	if (comparability.kind === "error") {
		return comparability;
	}
	const analysisHealthChange = validateDiffAnalysisHealthChange(
		root.object.analysis_health_change,
		`${label}.analysis_health_change`,
	);
	if (analysisHealthChange.kind === "error") {
		return analysisHealthChange;
	}
	const anchors = validateDiffAnchors(root.object.anchors, `${label}.anchors`);
	if (anchors.kind === "error") {
		return anchors;
	}
	const mappings = validateDiffMappings(root.object.mappings, `${label}.mappings`);
	if (mappings.kind === "error") {
		return mappings;
	}
	const files = validateDiffFiles(root.object.files, `${label}.files`);
	if (files.kind === "error") {
		return files;
	}
	const findings = validateDiffFindings(root.object.findings, `${label}.findings`);
	if (findings.kind === "error") {
		return findings;
	}
	const metricsDelta = validateTraceabilitySummaryDelta(
		root.object.metrics_delta,
		`${label}.metrics_delta`,
	);
	if (metricsDelta.kind === "error") {
		return metricsDelta;
	}

	return {
		kind: "ok",
		value: {
			schema_version: 1,
			base_scan_schema_version: baseScanSchemaVersion.value,
			head_scan_schema_version: headScanSchemaVersion.value,
			comparability: comparability.value,
			analysis_health_change: analysisHealthChange.value,
			anchors: anchors.value,
			mappings: mappings.value,
			files: files.value,
			findings: findings.value,
			metrics_delta: metricsDelta.value,
		},
	};
}

function validateDiffAnalysisHealthChange(
	value: unknown,
	label: string,
): ValidationResult<TraceabilityDiff["analysis_health_change"]> {
	const object = expectObject(value, label, DIFF_HEALTH_CHANGE_KEYS);
	if (object.kind === "error") {
		return object;
	}
	const from = expectAnalysisHealth(object.object.from, `${label}.from`);
	if (from.kind === "error") {
		return from;
	}
	const to = expectAnalysisHealth(object.object.to, `${label}.to`);
	if (to.kind === "error") {
		return to;
	}

	return { kind: "ok", value: { from: from.value, to: to.value } };
}

function validateDiffAnchors(
	value: unknown,
	label: string,
): ValidationResult<TraceabilityDiff["anchors"]> {
	const object = expectObject(value, label, DIFF_ANCHOR_KEYS);
	if (object.kind === "error") {
		return object;
	}
	const added = expectAnchorIdArray(object.object.added, `${label}.added`);
	if (added.kind === "error") {
		return added;
	}
	const removed = expectAnchorIdArray(object.object.removed, `${label}.removed`);
	if (removed.kind === "error") {
		return removed;
	}
	const mappingStateChanged = validateArrayItems(
		object.object.mapping_state_changed,
		`${label}.mapping_state_changed`,
		validateAnchorMappingStateChange,
	);
	if (mappingStateChanged.kind === "error") {
		return mappingStateChanged;
	}

	return {
		kind: "ok",
		value: {
			added: added.value,
			removed: removed.value,
			mapping_state_changed: mappingStateChanged.value,
		},
	};
}

function validateDiffMappings(
	value: unknown,
	label: string,
): ValidationResult<TraceabilityDiff["mappings"]> {
	const object = expectObject(value, label, DIFF_MAPPING_KEYS);
	if (object.kind === "error") {
		return object;
	}
	const added = expectAnchorIdArray(object.object.added, `${label}.added`);
	if (added.kind === "error") {
		return added;
	}
	const removed = expectAnchorIdArray(object.object.removed, `${label}.removed`);
	if (removed.kind === "error") {
		return removed;
	}
	const stateChanged = validateArrayItems(
		object.object.state_changed,
		`${label}.state_changed`,
		validateStoredMappingStateChange,
	);
	if (stateChanged.kind === "error") {
		return stateChanged;
	}

	return {
		kind: "ok",
		value: { added: added.value, removed: removed.value, state_changed: stateChanged.value },
	};
}

function validateDiffFiles(
	value: unknown,
	label: string,
): ValidationResult<TraceabilityDiff["files"]> {
	const object = expectObject(value, label, DIFF_FILE_KEYS);
	if (object.kind === "error") {
		return object;
	}
	const added = expectRepoPathArray(object.object.added, `${label}.added`);
	if (added.kind === "error") {
		return added;
	}
	const removed = expectRepoPathArray(object.object.removed, `${label}.removed`);
	if (removed.kind === "error") {
		return removed;
	}
	const becameCovered = expectRepoPathArray(
		object.object.became_covered,
		`${label}.became_covered`,
	);
	if (becameCovered.kind === "error") {
		return becameCovered;
	}
	const lostCoverage = expectRepoPathArray(object.object.lost_coverage, `${label}.lost_coverage`);
	if (lostCoverage.kind === "error") {
		return lostCoverage;
	}
	const coveringAnchorIdsChanged = validateArrayItems(
		object.object.covering_anchor_ids_changed,
		`${label}.covering_anchor_ids_changed`,
		validateCoveringAnchorIdsChange,
	);
	if (coveringAnchorIdsChanged.kind === "error") {
		return coveringAnchorIdsChanged;
	}
	const supportedLocalTargetsChanged = validateArrayItems(
		object.object.supported_local_targets_changed,
		`${label}.supported_local_targets_changed`,
		validateSupportedLocalTargetsChange,
	);
	if (supportedLocalTargetsChanged.kind === "error") {
		return supportedLocalTargetsChanged;
	}

	return {
		kind: "ok",
		value: {
			added: added.value,
			removed: removed.value,
			became_covered: becameCovered.value,
			lost_coverage: lostCoverage.value,
			covering_anchor_ids_changed: coveringAnchorIdsChanged.value,
			supported_local_targets_changed: supportedLocalTargetsChanged.value,
		},
	};
}

function validateDiffFindings(
	value: unknown,
	label: string,
): ValidationResult<TraceabilityDiff["findings"]> {
	const object = expectObject(value, label, DIFF_FINDING_KEYS);
	if (object.kind === "error") {
		return object;
	}
	const added = validateFindings(object.object.added, `${label}.added`);
	if (added.kind === "error") {
		return added;
	}
	const removed = validateFindings(object.object.removed, `${label}.removed`);
	if (removed.kind === "error") {
		return removed;
	}

	return { kind: "ok", value: { added: added.value, removed: removed.value } };
}

function validateAnchorMappingStateChange(
	value: unknown,
	label: string,
): ValidationResult<MappingStateChange> {
	const object = expectObject(value, label, ANCHOR_STATE_CHANGE_KEYS);
	if (object.kind === "error") {
		return object;
	}
	const anchorId = expectAnchorId(object.object.anchor_id, `${label}.anchor_id`);
	if (anchorId.kind === "error") {
		return anchorId;
	}
	const from = expectEnum<MappingStateChange["from"]>(object.object.from, `${label}.from`, [
		"absent",
		"usable",
		"invalid",
		"draft",
	]);
	if (from.kind === "error") {
		return from;
	}
	const to = expectEnum<MappingStateChange["to"]>(object.object.to, `${label}.to`, [
		"absent",
		"usable",
		"invalid",
		"draft",
	]);
	if (to.kind === "error") {
		return to;
	}

	return { kind: "ok", value: { anchor_id: anchorId.value, from: from.value, to: to.value } };
}

function validateStoredMappingStateChange(
	value: unknown,
	label: string,
): ValidationResult<StoredMappingStateChange> {
	const object = expectObject(value, label, ANCHOR_STATE_CHANGE_KEYS);
	if (object.kind === "error") {
		return object;
	}
	const anchorId = expectAnchorId(object.object.anchor_id, `${label}.anchor_id`);
	if (anchorId.kind === "error") {
		return anchorId;
	}
	const from = expectEnum<StoredMappingStateChange["from"]>(object.object.from, `${label}.from`, [
		"usable",
		"invalid",
		"stale",
	]);
	if (from.kind === "error") {
		return from;
	}
	const to = expectEnum<StoredMappingStateChange["to"]>(object.object.to, `${label}.to`, [
		"usable",
		"invalid",
		"stale",
	]);
	if (to.kind === "error") {
		return to;
	}

	return { kind: "ok", value: { anchor_id: anchorId.value, from: from.value, to: to.value } };
}

function validateCoveringAnchorIdsChange(
	value: unknown,
	label: string,
): ValidationResult<CoveringAnchorIdsChange> {
	const object = expectObject(value, label, FILE_PATH_CHANGE_KEYS);
	if (object.kind === "error") {
		return object;
	}
	const path = expectRepoPath(object.object.path, `${label}.path`);
	if (path.kind === "error") {
		return path;
	}
	const from = expectAnchorIdArray(object.object.from, `${label}.from`);
	if (from.kind === "error") {
		return from;
	}
	const to = expectAnchorIdArray(object.object.to, `${label}.to`);
	if (to.kind === "error") {
		return to;
	}

	return { kind: "ok", value: { path: path.value, from: from.value, to: to.value } };
}

function validateSupportedLocalTargetsChange(
	value: unknown,
	label: string,
): ValidationResult<SupportedLocalTargetsChange> {
	const object = expectObject(value, label, FILE_PATH_CHANGE_KEYS);
	if (object.kind === "error") {
		return object;
	}
	const path = expectRepoPath(object.object.path, `${label}.path`);
	if (path.kind === "error") {
		return path;
	}
	const from = expectRepoPathArray(object.object.from, `${label}.from`);
	if (from.kind === "error") {
		return from;
	}
	const to = expectRepoPathArray(object.object.to, `${label}.to`);
	if (to.kind === "error") {
		return to;
	}

	return { kind: "ok", value: { path: path.value, from: from.value, to: to.value } };
}

function validateTraceabilitySummaryDelta(
	value: unknown,
	label: string,
): ValidationResult<TraceabilitySummaryView> {
	const object = expectObject(value, label, SUMMARY_KEYS);
	if (object.kind === "error") {
		return object;
	}

	const summary = {} as Record<(typeof SUMMARY_KEYS)[number], number>;
	for (const key of SUMMARY_KEYS) {
		const field = expectInteger(object.object[key], `${label}.${key}`);
		if (field.kind === "error") {
			return field;
		}
		summary[key] = field.value;
	}

	return { kind: "ok", value: summary };
}

function validateFindings(value: unknown, label: string): ValidationResult<Finding[]> {
	return validateArrayItems(value, label, validateFinding);
}

function validateFinding(value: unknown, label: string): ValidationResult<Finding> {
	const object = expectOpenObject(value, label);
	if (object.kind === "error") {
		return object;
	}
	const kind = expectString(object.object.kind, `${label}.kind`);
	if (kind.kind === "error") {
		return kind;
	}

	switch (kind.value) {
		case "unmapped_anchor":
		case "stale_mapping_anchor": {
			const exact = expectObject(value, label, ["kind", "anchor_id"]);
			if (exact.kind === "error") {
				return exact;
			}
			const anchorId = expectAnchorId(exact.object.anchor_id, `${label}.anchor_id`);
			if (anchorId.kind === "error") {
				return anchorId;
			}
			return { kind: "ok", value: { kind: kind.value, anchor_id: anchorId.value } };
		}
		case "broken_seed_path": {
			const exact = expectObject(value, label, ["kind", "anchor_id", "seed_path"]);
			if (exact.kind === "error") {
				return exact;
			}
			const anchorId = expectAnchorId(exact.object.anchor_id, `${label}.anchor_id`);
			if (anchorId.kind === "error") {
				return anchorId;
			}
			const seedPath = expectRepoPath(exact.object.seed_path, `${label}.seed_path`);
			if (seedPath.kind === "error") {
				return seedPath;
			}
			return {
				kind: "ok",
				value: { kind: "broken_seed_path", anchor_id: anchorId.value, seed_path: seedPath.value },
			};
		}
		case "unresolved_static_edge": {
			const exact = expectObject(value, label, ["kind", "importer", "specifier"]);
			if (exact.kind === "error") {
				return exact;
			}
			const importer = expectRepoPath(exact.object.importer, `${label}.importer`);
			if (importer.kind === "error") {
				return importer;
			}
			const specifier = expectString(exact.object.specifier, `${label}.specifier`);
			if (specifier.kind === "error") {
				return specifier;
			}
			return {
				kind: "ok",
				value: {
					kind: "unresolved_static_edge",
					importer: importer.value,
					specifier: specifier.value,
				},
			};
		}
		case "unsupported_static_edge": {
			const exact = expectObject(value, label, ["kind", "importer", "syntax_kind", "specifier"]);
			if (exact.kind === "error") {
				return exact;
			}
			const importer = expectRepoPath(exact.object.importer, `${label}.importer`);
			if (importer.kind === "error") {
				return importer;
			}
			const syntaxKind = expectEnum<StaticEdgeSyntaxKind>(
				exact.object.syntax_kind,
				`${label}.syntax_kind`,
				["require_call", "dynamic_import"],
			);
			if (syntaxKind.kind === "error") {
				return syntaxKind;
			}
			const specifier = expectString(exact.object.specifier, `${label}.specifier`);
			if (specifier.kind === "error") {
				return specifier;
			}
			return {
				kind: "ok",
				value: {
					kind: "unsupported_static_edge",
					importer: importer.value,
					syntax_kind: syntaxKind.value,
					specifier: specifier.value,
				},
			};
		}
		case "out_of_scope_static_edge":
		case "unsupported_local_target": {
			const exact = expectObject(value, label, ["kind", "importer", "target_path"]);
			if (exact.kind === "error") {
				return exact;
			}
			const importer = expectRepoPath(exact.object.importer, `${label}.importer`);
			if (importer.kind === "error") {
				return importer;
			}
			const targetPath = expectRepoPath(exact.object.target_path, `${label}.target_path`);
			if (targetPath.kind === "error") {
				return targetPath;
			}
			return {
				kind: "ok",
				value: { kind: kind.value, importer: importer.value, target_path: targetPath.value },
			};
		}
		case "untraced_product_file": {
			const exact = expectObject(value, label, ["kind", "path"]);
			if (exact.kind === "error") {
				return exact;
			}
			const path = expectRepoPath(exact.object.path, `${label}.path`);
			if (path.kind === "error") {
				return path;
			}
			return { kind: "ok", value: { kind: "untraced_product_file", path: path.value } };
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

function expectAnalysisHealth(value: unknown, label: string): ValidationResult<AnalysisHealth> {
	return expectEnum<AnalysisHealth>(value, label, ["clean", "degraded"]);
}

function expectRepoPath(value: unknown, label: string): ValidationResult<RepoPath> {
	const stringValue = expectString(value, label);
	if (stringValue.kind === "error") {
		return stringValue;
	}
	const result = validateRepoPath(stringValue.value);
	if (result.kind === "validation_failure") {
		return validationError(`${label} must be a RepoPath`);
	}

	return { kind: "ok", value: result.repoPath };
}

function expectAnchorId(value: unknown, label: string): ValidationResult<AnchorId> {
	const stringValue = expectString(value, label);
	if (stringValue.kind === "error") {
		return stringValue;
	}
	const result = validateAnchorId(stringValue.value);
	if (result.kind === "validation_failure") {
		return validationError(`${label} must be an AnchorId`);
	}

	return { kind: "ok", value: result.anchorId };
}

function expectRepoPathArray(value: unknown, label: string): ValidationResult<RepoPath[]> {
	return validateArrayItems(value, label, expectRepoPath);
}

function expectAnchorIdArray(value: unknown, label: string): ValidationResult<AnchorId[]> {
	return validateArrayItems(value, label, expectAnchorId);
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
