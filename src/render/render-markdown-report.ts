import type { MarkdownReportModel } from "../domain/report-model";
import { renderCanonicalFinding, renderCanonicalPolicyViolation } from "./render-json";

export function renderMarkdownReport(model: MarkdownReportModel): string {
	const sections = [
		renderTitle(),
		renderSummary(model),
		...(model.check !== undefined ? [renderPolicyViolations(model)] : []),
		...(model.diff !== undefined ? [renderChangeImpact(model)] : []),
		renderFindings(model),
		...(model.suggested_actions.length > 0 ? [renderSuggestedActions(model)] : []),
	];

	return `${sections.join("\n\n")}\n`;
}

function renderTitle(): string {
	return "# AnchorMap traceability report";
}

function renderSummary(model: MarkdownReportModel): string {
	const summary = model.scan.traceability_metrics.summary;
	const coveredPercent =
		summary.product_file_count === 0
			? 100
			: Math.floor((summary.covered_product_file_count * 100) / summary.product_file_count);

	return [
		"## Summary",
		`- Analysis health: ${model.scan.analysis_health}`,
		`- Observed anchors: ${summary.observed_anchor_count}`,
		`- Usable mappings: ${summary.usable_mapping_count}`,
		`- Covered product files: ${summary.covered_product_file_count}/${summary.product_file_count} (${coveredPercent}%)`,
		`- Findings: ${model.scan.findings.length}`,
	].join("\n");
}

function renderPolicyViolations(model: MarkdownReportModel): string {
	const check = model.check;
	if (check === undefined) {
		throw new Error("policy section requires check artifact");
	}

	return [
		"## Policy violations",
		`Decision: ${check.decision.toUpperCase()}`,
		...(check.violations.length === 0
			? ["- none"]
			: check.violations.map((violation) => `- ${renderCanonicalPolicyViolation(violation)}`)),
	].join("\n");
}

function renderChangeImpact(model: MarkdownReportModel): string {
	const diff = model.diff;
	if (diff === undefined) {
		throw new Error("change impact section requires diff artifact");
	}

	return [
		"## Change impact",
		`- Comparability: ${diff.comparability}`,
		`- Analysis health: ${diff.analysis_health_change.from} -> ${diff.analysis_health_change.to}`,
		`- Anchors added: ${diff.anchors.added.length}`,
		`- Anchors removed: ${diff.anchors.removed.length}`,
		`- Anchor mapping states changed: ${diff.anchors.mapping_state_changed.length}`,
		`- Mappings added: ${diff.mappings.added.length}`,
		`- Mappings removed: ${diff.mappings.removed.length}`,
		`- Mapping states changed: ${diff.mappings.state_changed.length}`,
		`- Files added: ${diff.files.added.length}`,
		`- Files removed: ${diff.files.removed.length}`,
		`- Files became covered: ${diff.files.became_covered.length}`,
		`- Files lost coverage: ${diff.files.lost_coverage.length}`,
		`- Findings added: ${diff.findings.added.length}`,
		`- Findings removed: ${diff.findings.removed.length}`,
	].join("\n");
}

function renderFindings(model: MarkdownReportModel): string {
	return [
		"## Findings",
		...(model.scan.findings.length === 0
			? ["- none"]
			: model.scan.findings.map((finding) => `- ${renderCanonicalFinding(finding)}`)),
	].join("\n");
}

function renderSuggestedActions(model: MarkdownReportModel): string {
	return ["## Suggested actions", ...model.suggested_actions].join("\n");
}
