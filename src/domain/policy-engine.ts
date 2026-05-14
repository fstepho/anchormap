import { compareCanonicalTextByUtf8 } from "./canonical-order";
import type { FindingKind } from "./finding";
import type { AnalysisHealth, ScanResultView } from "./scan-result";

export interface Policy {
	readonly version: 1;
	readonly fail_on?: PolicyFailOn;
	readonly thresholds?: PolicyThresholds;
}

export interface PolicyFailOn {
	readonly analysis_health?: "degraded";
	readonly finding_kinds?: readonly FindingKind[];
}

export interface PolicyThresholds {
	readonly min_covered_product_file_percent?: number;
	readonly max_untraced_product_files?: number;
}

export type PolicyDecision = "pass" | "fail";

export type PolicyViolation =
	| { readonly kind: "analysis_health_degraded" }
	| {
			readonly kind: "finding_kind_present";
			readonly finding_kind: FindingKind;
			readonly count: number;
	  }
	| {
			readonly kind: "covered_product_file_percent_below_threshold";
			readonly actual: number;
			readonly threshold: number;
	  }
	| {
			readonly kind: "untraced_product_files_above_threshold";
			readonly actual: number;
			readonly threshold: number;
	  };

export interface PolicySummary {
	readonly observed_anchor_count: number;
	readonly usable_mapping_count: number;
	readonly product_file_count: number;
	readonly covered_product_file_count: number;
	readonly uncovered_product_file_count: number;
	readonly covered_product_file_percent: number;
	readonly untraced_product_file_count: number;
}

export interface PolicyResult {
	readonly schema_version: 1;
	readonly decision: PolicyDecision;
	readonly source_scan_schema_version: number;
	readonly analysis_health: AnalysisHealth;
	readonly violations: readonly PolicyViolation[];
	readonly summary: PolicySummary;
}

export function evaluatePolicy(scan: ScanResultView, policy: Policy): PolicyResult {
	const summary = buildPolicySummary(scan);
	const violations: PolicyViolation[] = [];

	if (policy.fail_on?.analysis_health === "degraded" && scan.analysis_health === "degraded") {
		violations.push({ kind: "analysis_health_degraded" });
	}

	for (const findingKind of policy.fail_on?.finding_kinds ?? []) {
		const count = scan.findings.filter((finding) => finding.kind === findingKind).length;
		if (count > 0) {
			violations.push({ kind: "finding_kind_present", finding_kind: findingKind, count });
		}
	}

	const minimumCoveredPercent = policy.thresholds?.min_covered_product_file_percent;
	if (
		minimumCoveredPercent !== undefined &&
		summary.covered_product_file_percent < minimumCoveredPercent
	) {
		violations.push({
			kind: "covered_product_file_percent_below_threshold",
			actual: summary.covered_product_file_percent,
			threshold: minimumCoveredPercent,
		});
	}

	const maximumUntracedProductFiles = policy.thresholds?.max_untraced_product_files;
	if (
		maximumUntracedProductFiles !== undefined &&
		summary.untraced_product_file_count > maximumUntracedProductFiles
	) {
		violations.push({
			kind: "untraced_product_files_above_threshold",
			actual: summary.untraced_product_file_count,
			threshold: maximumUntracedProductFiles,
		});
	}

	const sortedViolations = violations.sort(comparePolicyViolations);

	return {
		schema_version: 1,
		decision: sortedViolations.length === 0 ? "pass" : "fail",
		source_scan_schema_version: scan.schema_version,
		analysis_health: scan.analysis_health,
		violations: sortedViolations,
		summary,
	};
}

function buildPolicySummary(scan: ScanResultView): PolicySummary {
	const traceabilitySummary = scan.traceability_metrics.summary;
	const productFileCount = traceabilitySummary.product_file_count;
	const coveredProductFileCount = traceabilitySummary.covered_product_file_count;

	return {
		observed_anchor_count: traceabilitySummary.observed_anchor_count,
		usable_mapping_count: traceabilitySummary.usable_mapping_count,
		product_file_count: productFileCount,
		covered_product_file_count: coveredProductFileCount,
		uncovered_product_file_count: traceabilitySummary.uncovered_product_file_count,
		covered_product_file_percent:
			productFileCount === 0 ? 100 : Math.floor((coveredProductFileCount * 100) / productFileCount),
		untraced_product_file_count: scan.findings.filter(
			(finding) => finding.kind === "untraced_product_file",
		).length,
	};
}

function comparePolicyViolations(left: PolicyViolation, right: PolicyViolation): number {
	const leftTuple = policyViolationTuple(left);
	const rightTuple = policyViolationTuple(right);
	const length = Math.min(leftTuple.length, rightTuple.length);

	for (let index = 0; index < length; index += 1) {
		const comparison = compareCanonicalTextByUtf8(leftTuple[index], rightTuple[index]);
		if (comparison !== 0) {
			return comparison;
		}
	}

	return leftTuple.length - rightTuple.length;
}

function policyViolationTuple(violation: PolicyViolation): readonly string[] {
	switch (violation.kind) {
		case "analysis_health_degraded":
			return [violation.kind];
		case "finding_kind_present":
			return [violation.kind, violation.finding_kind, String(violation.count)];
		case "covered_product_file_percent_below_threshold":
			return [violation.kind, String(violation.actual), String(violation.threshold)];
		case "untraced_product_files_above_threshold":
			return [violation.kind, String(violation.actual), String(violation.threshold)];
	}
}
