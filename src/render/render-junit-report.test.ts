import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { FindingKind } from "../domain/finding";
import type { PolicyResult } from "../domain/policy-engine";
import { buildJUnitReportModel } from "../domain/report-model";
import { renderJUnitReport } from "./render-junit-report";

test("renders passing policy result as stable junit testsuite", () => {
	assert.equal(
		renderJUnitReport(buildJUnitReportModel({ check: policyResultFixture([]) })),
		[
			'<testsuite name="anchormap.policy" tests="1" failures="0">',
			'<testcase name="policy pass" classname="anchormap.policy"/>',
			"</testsuite>",
			"",
		].join("\n"),
	);
});

test("renders policy violations as deterministic failed testcases", () => {
	assert.equal(
		renderJUnitReport(
			buildJUnitReportModel({
				check: policyResultFixture([
					{ kind: "analysis_health_degraded" },
					{ kind: "finding_kind_present", finding_kind: "untraced_product_file", count: 2 },
					{
						kind: "covered_product_file_percent_below_threshold",
						actual: 50,
						threshold: 75,
					},
					{ kind: "untraced_product_files_above_threshold", actual: 3, threshold: 1 },
				]),
			}),
		),
		[
			'<testsuite name="anchormap.policy" tests="4" failures="4">',
			'<testcase name="policy.violation.analysis_health_degraded" classname="anchormap.policy"><failure message="policy violation">{"kind":"analysis_health_degraded"}</failure></testcase>',
			'<testcase name="policy.violation.finding_kind_present.untraced_product_file" classname="anchormap.policy"><failure message="policy violation">{"kind":"finding_kind_present","finding_kind":"untraced_product_file","count":2}</failure></testcase>',
			'<testcase name="policy.violation.covered_product_file_percent_below_threshold.actual-50.threshold-75" classname="anchormap.policy"><failure message="policy violation">{"kind":"covered_product_file_percent_below_threshold","actual":50,"threshold":75}</failure></testcase>',
			'<testcase name="policy.violation.untraced_product_files_above_threshold.actual-3.threshold-1" classname="anchormap.policy"><failure message="policy violation">{"kind":"untraced_product_files_above_threshold","actual":3,"threshold":1}</failure></testcase>',
			"</testsuite>",
			"",
		].join("\n"),
	);
});

test("escapes xml attribute and failure text characters", () => {
	const check = policyResultFixture([
		{
			kind: "finding_kind_present",
			finding_kind: 'bad&<"\t\n\rkind' as FindingKind,
			count: 1,
		},
	]);

	assert.equal(
		renderJUnitReport(buildJUnitReportModel({ check })),
		[
			'<testsuite name="anchormap.policy" tests="1" failures="1">',
			'<testcase name="policy.violation.finding_kind_present.bad&amp;&lt;&quot;&#x9;&#xA;&#xD;kind" classname="anchormap.policy"><failure message="policy violation">{"kind":"finding_kind_present","finding_kind":"bad&amp;&lt;\\"\\u0009\\u000a\\u000dkind","count":1}</failure></testcase>',
			"</testsuite>",
			"",
		].join("\n"),
	);
});

function policyResultFixture(violations: PolicyResult["violations"]): PolicyResult {
	return {
		schema_version: 1,
		decision: violations.length === 0 ? "pass" : "fail",
		source_scan_schema_version: 4,
		analysis_health: violations.length === 0 ? "clean" : "degraded",
		violations,
		summary: {
			observed_anchor_count: 0,
			usable_mapping_count: 0,
			product_file_count: 0,
			covered_product_file_count: 0,
			uncovered_product_file_count: 0,
			covered_product_file_percent: 100,
			untraced_product_file_count: 0,
		},
	};
}
