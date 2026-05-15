import type { PolicyViolation } from "../domain/policy-engine";
import type { JUnitReportModel } from "../domain/report-model";
import { renderCanonicalPolicyViolation } from "./render-json";

const POLICY_CLASSNAME = "anchormap.policy";

export function renderJUnitReport(model: JUnitReportModel): string {
	const violations = model.check.violations;
	const testCount = violations.length === 0 ? 1 : violations.length;
	const lines = [
		`<testsuite name="anchormap.policy" tests="${testCount}" failures="${violations.length}">`,
		...(violations.length === 0
			? [`<testcase name="policy pass" classname="${POLICY_CLASSNAME}"/>`]
			: violations.map(renderViolationTestcase)),
		"</testsuite>",
	];

	return `${lines.join("\n")}\n`;
}

function renderViolationTestcase(violation: PolicyViolation): string {
	const name = escapeXmlAttribute(policyViolationTestName(violation));
	const canonicalViolation = renderCanonicalPolicyViolation(violation);
	const failureText = escapeXmlText(canonicalViolation);

	return `<testcase name="${name}" classname="${POLICY_CLASSNAME}"><failure message="policy violation">${failureText}</failure></testcase>`;
}

function policyViolationTestName(violation: PolicyViolation): string {
	switch (violation.kind) {
		case "analysis_health_degraded":
			return "policy.violation.analysis_health_degraded";
		case "finding_kind_present":
			return `policy.violation.finding_kind_present.${violation.finding_kind}`;
		case "covered_product_file_percent_below_threshold":
			return `policy.violation.covered_product_file_percent_below_threshold.actual-${violation.actual}.threshold-${violation.threshold}`;
		case "untraced_product_files_above_threshold":
			return `policy.violation.untraced_product_files_above_threshold.actual-${violation.actual}.threshold-${violation.threshold}`;
	}
}

function escapeXmlAttribute(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll('"', "&quot;")
		.replaceAll("\t", "&#x9;")
		.replaceAll("\n", "&#xA;")
		.replaceAll("\r", "&#xD;");
}

function escapeXmlText(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
