import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeCliPathArg } from "../cli/command-preconditions";
import { type AppError, usageError } from "../cli/command-result";
import { type AnchorId, validateAnchorId } from "../domain/anchor-id";
import type { Finding, StaticEdgeSyntaxKind } from "../domain/finding";
import { type RepoPath, repoPathToString, validateRepoPath } from "../domain/repo-path";
import type {
	AnalysisHealth,
	AnchorTraceabilityMetricsView,
	ConfigView,
	FileView,
	LocalAliasView,
	ObservedAnchorView,
	ScanResultView,
	StoredMappingView,
	TraceabilityMetricsView,
	TraceabilitySummaryView,
} from "../domain/scan-result";
import { decodeUtf8StrictNoBom } from "./repo-fs";

export type LoadScanArtifactResult =
	| { kind: "ok"; scan: ScanResultView }
	| { kind: "error"; error: AppError };

type JsonObject = Record<string, unknown>;

const ROOT_KEYS = [
	"schema_version",
	"config",
	"analysis_health",
	"observed_anchors",
	"stored_mappings",
	"files",
	"traceability_metrics",
	"findings",
] as const;
const CONFIG_KEYS = [
	"version",
	"product_root",
	"spec_roots",
	"ignore_roots",
	"tsconfig_path",
	"local_aliases",
] as const;
const LOCAL_ALIAS_KEYS = ["prefix", "target"] as const;
const OBSERVED_ANCHOR_KEYS = ["spec_path", "mapping_state"] as const;
const STORED_MAPPING_KEYS = ["state", "seed_files", "reached_files"] as const;
const FILE_KEYS = ["covering_anchor_ids", "supported_local_targets"] as const;
const METRICS_KEYS = ["summary", "anchors"] as const;
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
const ANCHOR_METRICS_KEYS = [
	"seed_file_count",
	"direct_seed_file_count",
	"reached_file_count",
	"transitive_reached_file_count",
	"unique_reached_file_count",
	"shared_reached_file_count",
] as const;

export function loadScanArtifact(
	pathArg: string,
	options: { cwd?: string; optionName?: string } = {},
): LoadScanArtifactResult {
	const optionName = options.optionName ?? "--scan";
	const normalizedPath = normalizeCliPathArg(pathArg, optionName);
	if (normalizedPath.kind === "usage_error") {
		return { kind: "error", error: usageError(normalizedPath.message) };
	}

	let bytes: Uint8Array;
	try {
		bytes = readFileSync(join(options.cwd ?? process.cwd(), repoPathToString(normalizedPath.path)));
	} catch {
		return { kind: "error", error: usageError(`${optionName} artifact could not be read`) };
	}

	const decoded = decodeUtf8StrictNoBom(bytes);
	if (decoded.kind === "decode_error") {
		return { kind: "error", error: usageError(`${optionName} artifact is not valid UTF-8`) };
	}

	return parseScanArtifactJson(decoded.text, optionName);
}

export function parseScanArtifactJson(
	text: string,
	label = "scan artifact",
): LoadScanArtifactResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { kind: "error", error: usageError(`${label} is not valid JSON`) };
	}

	const scan = validateScanArtifactValue(parsed, label);
	if (scan.kind === "error") {
		return scan;
	}

	return { kind: "ok", scan: scan.scan };
}

function validateScanArtifactValue(
	value: unknown,
	label: string,
): { kind: "ok"; scan: ScanResultView } | { kind: "error"; error: AppError } {
	const root = expectObject(value, label, ROOT_KEYS);
	if (root.kind === "error") {
		return root;
	}
	if (root.object.schema_version !== 4) {
		return { kind: "error", error: usageError(`${label} schema_version is not supported`) };
	}

	const config = validateConfig(root.object.config, `${label}.config`);
	if (config.kind === "error") {
		return config;
	}
	const analysisHealth = expectEnum<AnalysisHealth>(
		root.object.analysis_health,
		`${label}.analysis_health`,
		["clean", "degraded"],
	);
	if (analysisHealth.kind === "error") {
		return analysisHealth;
	}
	const observedAnchors = validateObservedAnchors(
		root.object.observed_anchors,
		`${label}.observed_anchors`,
	);
	if (observedAnchors.kind === "error") {
		return observedAnchors;
	}
	const storedMappings = validateStoredMappings(
		root.object.stored_mappings,
		`${label}.stored_mappings`,
	);
	if (storedMappings.kind === "error") {
		return storedMappings;
	}
	const files = validateFiles(root.object.files, `${label}.files`);
	if (files.kind === "error") {
		return files;
	}
	const traceabilityMetrics = validateTraceabilityMetrics(
		root.object.traceability_metrics,
		`${label}.traceability_metrics`,
	);
	if (traceabilityMetrics.kind === "error") {
		return traceabilityMetrics;
	}
	const findings = validateFindings(root.object.findings, `${label}.findings`);
	if (findings.kind === "error") {
		return findings;
	}

	return {
		kind: "ok",
		scan: {
			schema_version: 4,
			config: config.value,
			analysis_health: analysisHealth.value,
			observed_anchors: observedAnchors.value,
			stored_mappings: storedMappings.value,
			files: files.value,
			traceability_metrics: traceabilityMetrics.value,
			findings: findings.value,
		},
	};
}

function validateConfig(value: unknown, label: string): ValidationResult<ConfigView> {
	const object = expectObject(value, label, CONFIG_KEYS);
	if (object.kind === "error") {
		return object;
	}
	const version = expectInteger(object.object.version, `${label}.version`);
	if (version.kind === "error") {
		return version;
	}
	if (version.value !== 1) {
		return validationError(`${label}.version must be 1`);
	}
	const productRoot = expectRepoPath(object.object.product_root, `${label}.product_root`);
	if (productRoot.kind === "error") {
		return productRoot;
	}
	const specRoots = expectRepoPathArray(object.object.spec_roots, `${label}.spec_roots`);
	if (specRoots.kind === "error") {
		return specRoots;
	}
	const ignoreRoots = expectRepoPathArray(object.object.ignore_roots, `${label}.ignore_roots`);
	if (ignoreRoots.kind === "error") {
		return ignoreRoots;
	}
	const tsconfigPath = expectNullableTsconfigPath(
		object.object.tsconfig_path,
		`${label}.tsconfig_path`,
	);
	if (tsconfigPath.kind === "error") {
		return tsconfigPath;
	}
	const localAliases = validateLocalAliases(object.object.local_aliases, `${label}.local_aliases`);
	if (localAliases.kind === "error") {
		return localAliases;
	}

	return {
		kind: "ok",
		value: {
			version: 1,
			product_root: productRoot.value,
			spec_roots: specRoots.value,
			ignore_roots: ignoreRoots.value,
			tsconfig_path: tsconfigPath.value,
			local_aliases: localAliases.value,
		},
	};
}

function validateLocalAliases(value: unknown, label: string): ValidationResult<LocalAliasView[]> {
	const values = expectArray(value, label);
	if (values.kind === "error") {
		return values;
	}

	const aliases: LocalAliasView[] = [];
	for (let index = 0; index < values.value.length; index += 1) {
		const alias = expectObject(values.value[index], `${label}[${index}]`, LOCAL_ALIAS_KEYS);
		if (alias.kind === "error") {
			return alias;
		}
		const prefix = expectString(alias.object.prefix, `${label}[${index}].prefix`);
		if (prefix.kind === "error") {
			return prefix;
		}
		const target = expectString(alias.object.target, `${label}[${index}].target`);
		if (target.kind === "error") {
			return target;
		}
		aliases.push({ prefix: prefix.value, target: target.value });
	}

	return { kind: "ok", value: aliases };
}

function validateObservedAnchors(
	value: unknown,
	label: string,
): ValidationResult<Record<string, ObservedAnchorView>> {
	return validateRecord(value, label, expectAnchorIdKey, (entry, entryLabel) => {
		const object = expectObject(entry, entryLabel, OBSERVED_ANCHOR_KEYS);
		if (object.kind === "error") {
			return object;
		}
		const specPath = expectRepoPath(object.object.spec_path, `${entryLabel}.spec_path`);
		if (specPath.kind === "error") {
			return specPath;
		}
		const mappingState = expectEnum<ObservedAnchorView["mapping_state"]>(
			object.object.mapping_state,
			`${entryLabel}.mapping_state`,
			["absent", "usable", "invalid", "draft"],
		);
		if (mappingState.kind === "error") {
			return mappingState;
		}
		return { kind: "ok", value: { spec_path: specPath.value, mapping_state: mappingState.value } };
	});
}

function validateStoredMappings(
	value: unknown,
	label: string,
): ValidationResult<Record<string, StoredMappingView>> {
	return validateRecord(value, label, expectAnchorIdKey, (entry, entryLabel) => {
		const object = expectObject(entry, entryLabel, STORED_MAPPING_KEYS);
		if (object.kind === "error") {
			return object;
		}
		const state = expectEnum<StoredMappingView["state"]>(
			object.object.state,
			`${entryLabel}.state`,
			["usable", "invalid", "stale"],
		);
		if (state.kind === "error") {
			return state;
		}
		const seedFiles = expectRepoPathArray(object.object.seed_files, `${entryLabel}.seed_files`);
		if (seedFiles.kind === "error") {
			return seedFiles;
		}
		const reachedFiles = expectRepoPathArray(
			object.object.reached_files,
			`${entryLabel}.reached_files`,
		);
		if (reachedFiles.kind === "error") {
			return reachedFiles;
		}
		return {
			kind: "ok",
			value: { state: state.value, seed_files: seedFiles.value, reached_files: reachedFiles.value },
		};
	});
}

function validateFiles(value: unknown, label: string): ValidationResult<Record<string, FileView>> {
	return validateRecord(value, label, expectRepoPathKey, (entry, entryLabel) => {
		const object = expectObject(entry, entryLabel, FILE_KEYS);
		if (object.kind === "error") {
			return object;
		}
		const coveringAnchorIds = expectAnchorIdArray(
			object.object.covering_anchor_ids,
			`${entryLabel}.covering_anchor_ids`,
		);
		if (coveringAnchorIds.kind === "error") {
			return coveringAnchorIds;
		}
		const supportedLocalTargets = expectRepoPathArray(
			object.object.supported_local_targets,
			`${entryLabel}.supported_local_targets`,
		);
		if (supportedLocalTargets.kind === "error") {
			return supportedLocalTargets;
		}
		return {
			kind: "ok",
			value: {
				covering_anchor_ids: coveringAnchorIds.value,
				supported_local_targets: supportedLocalTargets.value,
			},
		};
	});
}

function validateTraceabilityMetrics(
	value: unknown,
	label: string,
): ValidationResult<TraceabilityMetricsView> {
	const object = expectObject(value, label, METRICS_KEYS);
	if (object.kind === "error") {
		return object;
	}
	const summary = validateTraceabilitySummary(object.object.summary, `${label}.summary`);
	if (summary.kind === "error") {
		return summary;
	}
	const anchors = validateRecord(
		object.object.anchors,
		`${label}.anchors`,
		expectAnchorIdKey,
		validateAnchorMetrics,
	);
	if (anchors.kind === "error") {
		return anchors;
	}

	return { kind: "ok", value: { summary: summary.value, anchors: anchors.value } };
}

function validateTraceabilitySummary(
	value: unknown,
	label: string,
): ValidationResult<TraceabilitySummaryView> {
	const object = expectObject(value, label, SUMMARY_KEYS);
	if (object.kind === "error") {
		return object;
	}

	const summary = {} as Record<(typeof SUMMARY_KEYS)[number], number>;
	for (const key of SUMMARY_KEYS) {
		const field = expectNonNegativeInteger(object.object[key], `${label}.${key}`);
		if (field.kind === "error") {
			return field;
		}
		summary[key] = field.value;
	}

	return { kind: "ok", value: summary };
}

function validateAnchorMetrics(
	value: unknown,
	label: string,
): ValidationResult<AnchorTraceabilityMetricsView> {
	const object = expectObject(value, label, ANCHOR_METRICS_KEYS);
	if (object.kind === "error") {
		return object;
	}

	const metrics = {} as Record<(typeof ANCHOR_METRICS_KEYS)[number], number>;
	for (const key of ANCHOR_METRICS_KEYS) {
		const field = expectNonNegativeInteger(object.object[key], `${label}.${key}`);
		if (field.kind === "error") {
			return field;
		}
		metrics[key] = field.value;
	}

	return { kind: "ok", value: metrics };
}

function validateFindings(value: unknown, label: string): ValidationResult<Finding[]> {
	const values = expectArray(value, label);
	if (values.kind === "error") {
		return values;
	}

	const findings: Finding[] = [];
	for (let index = 0; index < values.value.length; index += 1) {
		const finding = validateFinding(values.value[index], `${label}[${index}]`);
		if (finding.kind === "error") {
			return finding;
		}
		findings.push(finding.value);
	}

	return { kind: "ok", value: findings };
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

type ValidationResult<Value> = { kind: "ok"; value: Value } | { kind: "error"; error: AppError };
type ObjectValidationResult =
	| { kind: "ok"; object: JsonObject }
	| { kind: "error"; error: AppError };

function validateRecord<Value>(
	value: unknown,
	label: string,
	validateKey: (key: string, label: string) => ValidationResult<string>,
	validateValue: (value: unknown, label: string) => ValidationResult<Value>,
): ValidationResult<Record<string, Value>> {
	const object = expectOpenObject(value, label);
	if (object.kind === "error") {
		return object;
	}

	const result: Record<string, Value> = {};
	for (const [key, entry] of Object.entries(object.object)) {
		const validKey = validateKey(key, `${label}.${key}`);
		if (validKey.kind === "error") {
			return validKey;
		}
		const validValue = validateValue(entry, `${label}.${key}`);
		if (validValue.kind === "error") {
			return validValue;
		}
		result[validKey.value] = validValue.value;
	}

	return { kind: "ok", value: result };
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

function expectArray(value: unknown, label: string): ValidationResult<unknown[]> {
	if (!Array.isArray(value)) {
		return validationError(`${label} must be an array`);
	}

	return { kind: "ok", value };
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

function expectNullableTsconfigPath(
	value: unknown,
	label: string,
): ValidationResult<RepoPath | null> {
	if (value === null) {
		return { kind: "ok", value: null };
	}
	if (value !== "tsconfig.json") {
		return validationError(`${label} must be null or tsconfig.json`);
	}

	return expectRepoPath(value, label);
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

function expectRepoPathKey(key: string, label: string): ValidationResult<string> {
	const result = expectRepoPath(key, label);
	if (result.kind === "error") {
		return result;
	}

	return { kind: "ok", value: repoPathToString(result.value) };
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

function expectAnchorIdKey(key: string, label: string): ValidationResult<string> {
	return expectAnchorId(key, label);
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
	const values = expectArray(value, label);
	if (values.kind === "error") {
		return values;
	}

	const result: Value[] = [];
	for (let index = 0; index < values.value.length; index += 1) {
		const item = validateItem(values.value[index], `${label}[${index}]`);
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
