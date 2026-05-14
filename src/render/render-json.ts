import type {
	CoveringAnchorIdsChange,
	MappingStateChange,
	StoredMappingStateChange,
	SupportedLocalTargetsChange,
	TraceabilityDiff,
} from "../domain/diff-engine";
import type { ExplainReachedFile, ExplainResult } from "../domain/explain-engine";
import type { Finding } from "../domain/finding";
import type { PolicyResult, PolicySummary, PolicyViolation } from "../domain/policy-engine";
import type {
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

export function renderScanResultJson(result: ScanResultView): string {
	return `${renderScanResultObject(result)}\n`;
}

export function renderScanResultHuman(result: ScanResultView): string {
	return `analysis_health: ${result.analysis_health}\n`;
}

export function renderPolicyResultJson(result: PolicyResult): string {
	return `${renderPolicyResultObject(result)}\n`;
}

export function renderPolicyResultHuman(result: PolicyResult): string {
	return `decision: ${result.decision}\n`;
}

export function renderTraceabilityDiffJson(result: TraceabilityDiff): string {
	return `${renderTraceabilityDiffObject(result)}\n`;
}

export function renderTraceabilityDiffHuman(result: TraceabilityDiff): string {
	return `comparability: ${result.comparability}\n`;
}

export function renderExplainResultJson(result: ExplainResult): string {
	return `${renderExplainResultObject(result)}\n`;
}

export function renderExplainResultHuman(result: ExplainResult): string {
	if (result.subject.kind === "anchor") {
		return `anchor: ${result.subject.anchor_id}\nobserved: ${result.observed?.present ?? false}\nmapping: ${result.mapping?.present ?? false}\n`;
	}

	return `file: ${result.subject.path}\npresent: ${result.file?.present ?? false}\ncovered: ${"covered" in result.coverage ? result.coverage.covered : false}\n`;
}

function renderScanResultObject(result: ScanResultView): string {
	return renderObject([
		["schema_version", renderNumber(result.schema_version)],
		["config", renderConfig(result.config)],
		["analysis_health", renderString(result.analysis_health)],
		["observed_anchors", renderRecord(result.observed_anchors, renderObservedAnchor)],
		["stored_mappings", renderRecord(result.stored_mappings, renderStoredMapping)],
		["files", renderRecord(result.files, renderFile)],
		["traceability_metrics", renderTraceabilityMetrics(result.traceability_metrics)],
		["findings", renderArray(result.findings, renderFinding)],
	]);
}

function renderPolicyResultObject(result: PolicyResult): string {
	return renderObject([
		["schema_version", renderNumber(result.schema_version)],
		["decision", renderString(result.decision)],
		["source_scan_schema_version", renderNumber(result.source_scan_schema_version)],
		["analysis_health", renderString(result.analysis_health)],
		["violations", renderArray(result.violations, renderPolicyViolation)],
		["summary", renderPolicySummary(result.summary)],
	]);
}

function renderTraceabilityDiffObject(result: TraceabilityDiff): string {
	return renderObject([
		["schema_version", renderNumber(result.schema_version)],
		["base_scan_schema_version", renderNumber(result.base_scan_schema_version)],
		["head_scan_schema_version", renderNumber(result.head_scan_schema_version)],
		["comparability", renderString(result.comparability)],
		["analysis_health_change", renderAnalysisHealthChange(result.analysis_health_change)],
		["anchors", renderAnchorDiff(result.anchors)],
		["mappings", renderMappingDiff(result.mappings)],
		["files", renderFileDiff(result.files)],
		["findings", renderFindingDiff(result.findings)],
		["metrics_delta", renderTraceabilitySummary(result.metrics_delta)],
	]);
}

function renderExplainResultObject(result: ExplainResult): string {
	return renderObject([
		["schema_version", renderNumber(result.schema_version)],
		["subject", renderExplainSubject(result.subject)],
		["observed", result.observed === null ? "null" : renderExplainAnchorObserved(result.observed)],
		["mapping", result.mapping === null ? "null" : renderExplainAnchorMapping(result.mapping)],
		["file", result.file === null ? "null" : renderExplainFile(result.file)],
		["coverage", renderExplainCoverage(result.coverage)],
		["findings", renderArray(result.findings, renderFinding)],
	]);
}

function renderExplainSubject(subject: ExplainResult["subject"]): string {
	if (subject.kind === "anchor") {
		return renderObject([
			["kind", renderString(subject.kind)],
			["anchor_id", renderString(subject.anchor_id)],
		]);
	}

	return renderObject([
		["kind", renderString(subject.kind)],
		["path", renderString(subject.path)],
	]);
}

function renderExplainAnchorObserved(observed: NonNullable<ExplainResult["observed"]>): string {
	return renderObject([
		["present", renderBoolean(observed.present)],
		["spec_path", renderNullableString(observed.spec_path)],
		["mapping_state", renderString(observed.mapping_state)],
	]);
}

function renderExplainAnchorMapping(mapping: NonNullable<ExplainResult["mapping"]>): string {
	return renderObject([
		["present", renderBoolean(mapping.present)],
		["state", renderString(mapping.state)],
		["seed_files", renderStringArray(mapping.seed_files)],
		["reached_file_count", renderNumber(mapping.reached_file_count)],
	]);
}

function renderExplainFile(file: NonNullable<ExplainResult["file"]>): string {
	return renderObject([
		["present", renderBoolean(file.present)],
		["covering_anchor_ids", renderStringArray(file.covering_anchor_ids)],
		["supported_local_targets", renderStringArray(file.supported_local_targets)],
	]);
}

function renderExplainCoverage(coverage: ExplainResult["coverage"]): string {
	if ("reached_files" in coverage) {
		return renderObject([
			["reached_files", renderArray(coverage.reached_files, renderExplainReachedFile)],
		]);
	}

	return renderObject([
		["covered", renderBoolean(coverage.covered)],
		["single_cover", renderBoolean(coverage.single_cover)],
		["multi_cover", renderBoolean(coverage.multi_cover)],
	]);
}

function renderExplainReachedFile(reachedFile: ExplainReachedFile): string {
	return renderObject([
		["path", renderString(reachedFile.path)],
		["path_from_seed", renderStringArray(reachedFile.path_from_seed)],
	]);
}

function renderAnalysisHealthChange(change: TraceabilityDiff["analysis_health_change"]): string {
	return renderObject([
		["from", renderString(change.from)],
		["to", renderString(change.to)],
	]);
}

function renderAnchorDiff(diff: TraceabilityDiff["anchors"]): string {
	return renderObject([
		["added", renderStringArray(diff.added)],
		["removed", renderStringArray(diff.removed)],
		["mapping_state_changed", renderArray(diff.mapping_state_changed, renderMappingStateChange)],
	]);
}

function renderMappingStateChange(change: MappingStateChange): string {
	return renderObject([
		["anchor_id", renderString(change.anchor_id)],
		["from", renderString(change.from)],
		["to", renderString(change.to)],
	]);
}

function renderMappingDiff(diff: TraceabilityDiff["mappings"]): string {
	return renderObject([
		["added", renderStringArray(diff.added)],
		["removed", renderStringArray(diff.removed)],
		["state_changed", renderArray(diff.state_changed, renderStoredMappingStateChange)],
	]);
}

function renderStoredMappingStateChange(change: StoredMappingStateChange): string {
	return renderObject([
		["anchor_id", renderString(change.anchor_id)],
		["from", renderString(change.from)],
		["to", renderString(change.to)],
	]);
}

function renderFileDiff(diff: TraceabilityDiff["files"]): string {
	return renderObject([
		["added", renderStringArray(diff.added)],
		["removed", renderStringArray(diff.removed)],
		["became_covered", renderStringArray(diff.became_covered)],
		["lost_coverage", renderStringArray(diff.lost_coverage)],
		[
			"covering_anchor_ids_changed",
			renderArray(diff.covering_anchor_ids_changed, renderCoveringAnchorIdsChange),
		],
		[
			"supported_local_targets_changed",
			renderArray(diff.supported_local_targets_changed, renderSupportedLocalTargetsChange),
		],
	]);
}

function renderCoveringAnchorIdsChange(change: CoveringAnchorIdsChange): string {
	return renderObject([
		["path", renderString(change.path)],
		["from", renderStringArray(change.from)],
		["to", renderStringArray(change.to)],
	]);
}

function renderSupportedLocalTargetsChange(change: SupportedLocalTargetsChange): string {
	return renderObject([
		["path", renderString(change.path)],
		["from", renderStringArray(change.from)],
		["to", renderStringArray(change.to)],
	]);
}

function renderFindingDiff(diff: TraceabilityDiff["findings"]): string {
	return renderObject([
		["added", renderArray(diff.added, renderFinding)],
		["removed", renderArray(diff.removed, renderFinding)],
	]);
}

function renderPolicySummary(summary: PolicySummary): string {
	return renderObject([
		["observed_anchor_count", renderNumber(summary.observed_anchor_count)],
		["usable_mapping_count", renderNumber(summary.usable_mapping_count)],
		["product_file_count", renderNumber(summary.product_file_count)],
		["covered_product_file_count", renderNumber(summary.covered_product_file_count)],
		["uncovered_product_file_count", renderNumber(summary.uncovered_product_file_count)],
		["covered_product_file_percent", renderNumber(summary.covered_product_file_percent)],
		["untraced_product_file_count", renderNumber(summary.untraced_product_file_count)],
	]);
}

function renderPolicyViolation(violation: PolicyViolation): string {
	switch (violation.kind) {
		case "analysis_health_degraded":
			return renderObject([["kind", renderString(violation.kind)]]);
		case "finding_kind_present":
			return renderObject([
				["kind", renderString(violation.kind)],
				["finding_kind", renderString(violation.finding_kind)],
				["count", renderNumber(violation.count)],
			]);
		case "covered_product_file_percent_below_threshold":
			return renderObject([
				["kind", renderString(violation.kind)],
				["actual", renderNumber(violation.actual)],
				["threshold", renderNumber(violation.threshold)],
			]);
		case "untraced_product_files_above_threshold":
			return renderObject([
				["kind", renderString(violation.kind)],
				["actual", renderNumber(violation.actual)],
				["threshold", renderNumber(violation.threshold)],
			]);
	}
}

export function renderCanonicalPolicyViolation(violation: PolicyViolation): string {
	return renderPolicyViolation(violation);
}

function renderConfig(config: ConfigView): string {
	return renderObject([
		["version", renderNumber(config.version)],
		["product_root", renderString(config.product_root)],
		["spec_roots", renderStringArray(config.spec_roots)],
		["ignore_roots", renderStringArray(config.ignore_roots)],
		["tsconfig_path", renderNullableString(config.tsconfig_path)],
		["local_aliases", renderArray(config.local_aliases, renderLocalAlias)],
	]);
}

function renderLocalAlias(localAlias: LocalAliasView): string {
	return renderObject([
		["prefix", renderString(localAlias.prefix)],
		["target", renderString(localAlias.target)],
	]);
}

function renderObservedAnchor(observedAnchor: ObservedAnchorView): string {
	return renderObject([
		["spec_path", renderString(observedAnchor.spec_path)],
		["mapping_state", renderString(observedAnchor.mapping_state)],
	]);
}

function renderStoredMapping(storedMapping: StoredMappingView): string {
	return renderObject([
		["state", renderString(storedMapping.state)],
		["seed_files", renderStringArray(storedMapping.seed_files)],
		["reached_files", renderStringArray(storedMapping.reached_files)],
	]);
}

function renderFile(file: FileView): string {
	return renderObject([
		["covering_anchor_ids", renderStringArray(file.covering_anchor_ids)],
		["supported_local_targets", renderStringArray(file.supported_local_targets)],
	]);
}

function renderTraceabilityMetrics(metrics: TraceabilityMetricsView): string {
	return renderObject([
		["summary", renderTraceabilitySummary(metrics.summary)],
		["anchors", renderRecord(metrics.anchors, renderAnchorTraceabilityMetrics)],
	]);
}

function renderTraceabilitySummary(summary: TraceabilitySummaryView): string {
	return renderObject([
		["product_file_count", renderNumber(summary.product_file_count)],
		["stored_mapping_count", renderNumber(summary.stored_mapping_count)],
		["usable_mapping_count", renderNumber(summary.usable_mapping_count)],
		["observed_anchor_count", renderNumber(summary.observed_anchor_count)],
		["active_anchor_count", renderNumber(summary.active_anchor_count)],
		["draft_anchor_count", renderNumber(summary.draft_anchor_count)],
		["covered_product_file_count", renderNumber(summary.covered_product_file_count)],
		["uncovered_product_file_count", renderNumber(summary.uncovered_product_file_count)],
		[
			"directly_seeded_product_file_count",
			renderNumber(summary.directly_seeded_product_file_count),
		],
		["single_cover_product_file_count", renderNumber(summary.single_cover_product_file_count)],
		["multi_cover_product_file_count", renderNumber(summary.multi_cover_product_file_count)],
	]);
}

function renderAnchorTraceabilityMetrics(metrics: AnchorTraceabilityMetricsView): string {
	return renderObject([
		["seed_file_count", renderNumber(metrics.seed_file_count)],
		["direct_seed_file_count", renderNumber(metrics.direct_seed_file_count)],
		["reached_file_count", renderNumber(metrics.reached_file_count)],
		["transitive_reached_file_count", renderNumber(metrics.transitive_reached_file_count)],
		["unique_reached_file_count", renderNumber(metrics.unique_reached_file_count)],
		["shared_reached_file_count", renderNumber(metrics.shared_reached_file_count)],
	]);
}

function renderFinding(finding: Finding): string {
	switch (finding.kind) {
		case "unmapped_anchor":
			return renderObject([
				["kind", renderString(finding.kind)],
				["anchor_id", renderString(finding.anchor_id)],
			]);
		case "stale_mapping_anchor":
			return renderObject([
				["kind", renderString(finding.kind)],
				["anchor_id", renderString(finding.anchor_id)],
			]);
		case "broken_seed_path":
			return renderObject([
				["kind", renderString(finding.kind)],
				["anchor_id", renderString(finding.anchor_id)],
				["seed_path", renderString(finding.seed_path)],
			]);
		case "unresolved_static_edge":
			return renderObject([
				["kind", renderString(finding.kind)],
				["importer", renderString(finding.importer)],
				["specifier", renderString(finding.specifier)],
			]);
		case "unsupported_static_edge":
			return renderObject([
				["kind", renderString(finding.kind)],
				["importer", renderString(finding.importer)],
				["syntax_kind", renderString(finding.syntax_kind)],
				["specifier", renderString(finding.specifier)],
			]);
		case "out_of_scope_static_edge":
			return renderObject([
				["kind", renderString(finding.kind)],
				["importer", renderString(finding.importer)],
				["target_path", renderString(finding.target_path)],
			]);
		case "unsupported_local_target":
			return renderObject([
				["kind", renderString(finding.kind)],
				["importer", renderString(finding.importer)],
				["target_path", renderString(finding.target_path)],
			]);
		case "untraced_product_file":
			return renderObject([
				["kind", renderString(finding.kind)],
				["path", renderString(finding.path)],
			]);
	}
}

export function renderCanonicalFinding(finding: Finding): string {
	return renderFinding(finding);
}

export function renderCanonicalString(value: string): string {
	return renderString(value);
}

function renderRecord<Value>(
	record: Readonly<Record<string, Value>>,
	renderValue: (value: Value) => string,
): string {
	return renderObject(Object.entries(record).map(([key, value]) => [key, renderValue(value)]));
}

function renderObject(fields: readonly (readonly [string, string])[]): string {
	return `{${fields.map(([key, value]) => `${renderString(key)}:${value}`).join(",")}}`;
}

function renderStringArray(values: readonly string[]): string {
	return renderArray(values, renderString);
}

function renderNullableString(value: string | null): string {
	return value === null ? "null" : renderString(value);
}

function renderArray<Value>(
	values: readonly Value[],
	renderValue: (value: Value) => string,
): string {
	return `[${values.map((value) => renderValue(value)).join(",")}]`;
}

function renderNumber(value: number): string {
	return String(value);
}

function renderBoolean(value: boolean): string {
	return value ? "true" : "false";
}

function renderString(value: string): string {
	if (!requiresJsonStringEscaping(value)) {
		return `"${value}"`;
	}

	let rendered = '"';

	for (let index = 0; index < value.length; index += 1) {
		const codeUnit = value.charCodeAt(index);

		if (codeUnit === 0x22) {
			rendered += '\\"';
			continue;
		}

		if (codeUnit === 0x5c) {
			rendered += "\\\\";
			continue;
		}

		if (codeUnit <= 0x1f) {
			rendered += `\\u00${codeUnit.toString(16).padStart(2, "0")}`;
			continue;
		}

		if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
			const nextCodeUnit = value.charCodeAt(index + 1);
			if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
				rendered += value[index] + value[index + 1];
				index += 1;
			} else {
				rendered += `\\u${codeUnit.toString(16).padStart(4, "0")}`;
			}
			continue;
		}

		if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
			rendered += `\\u${codeUnit.toString(16).padStart(4, "0")}`;
			continue;
		}

		rendered += value[index];
	}

	return `${rendered}"`;
}

function requiresJsonStringEscaping(value: string): boolean {
	for (let index = 0; index < value.length; index += 1) {
		const codeUnit = value.charCodeAt(index);
		if (
			codeUnit === 0x22 ||
			codeUnit === 0x5c ||
			codeUnit <= 0x1f ||
			(codeUnit >= 0xd800 && codeUnit <= 0xdfff)
		) {
			return true;
		}
	}

	return false;
}
