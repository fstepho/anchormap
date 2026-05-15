import { strict as assert } from "node:assert";
import { test } from "node:test";

import { minimalScanArtifactJson, repoPath } from "../cli/commands-test-support";
import { validateAnchorId } from "../domain/anchor-id";
import type { TraceabilityDiff } from "../domain/diff-engine";
import type { PolicyResult } from "../domain/policy-engine";
import { buildSarifReportModel } from "../domain/report-model";
import type { ScanResultView } from "../domain/scan-result";
import { renderSarifReport } from "./render-sarif-report";

test("renders SARIF scan v4 findings with file-level locations", () => {
	const sarif = renderSarifReport(buildSarifReportModel({ scan: scanV4WithFindings() }));

	assert.equal(
		sarif,
		'{"version":"2.1.0","runs":[{"tool":{"driver":{"name":"AnchorMap","informationUri":"https://github.com/fstepho/anchormap","rules":[{"id":"anchormap.finding.stale_mapping_anchor","name":"stale_mapping_anchor","shortDescription":{"text":"AnchorMap scan finding stale_mapping_anchor"}},{"id":"anchormap.finding.unmapped_anchor","name":"unmapped_anchor","shortDescription":{"text":"AnchorMap scan finding unmapped_anchor"}},{"id":"anchormap.finding.unresolved_static_edge","name":"unresolved_static_edge","shortDescription":{"text":"AnchorMap scan finding unresolved_static_edge"}}]}},"results":[{"ruleId":"anchormap.finding.stale_mapping_anchor","level":"warning","message":{"text":"scan finding: {\\"kind\\":\\"stale_mapping_anchor\\",\\"anchor_id\\":\\"OLD-001\\"}"}},{"ruleId":"anchormap.finding.unmapped_anchor","level":"warning","message":{"text":"scan finding: {\\"kind\\":\\"unmapped_anchor\\",\\"anchor_id\\":\\"QA-001\\"}"},"locations":[{"physicalLocation":{"artifactLocation":{"uri":"specs/requirements.md"}}}]},{"ruleId":"anchormap.finding.unresolved_static_edge","level":"warning","message":{"text":"scan finding: {\\"kind\\":\\"unresolved_static_edge\\",\\"importer\\":\\"src/index.ts\\",\\"specifier\\":\\"./missing\\"}"},"locations":[{"physicalLocation":{"artifactLocation":{"uri":"src/index.ts"}}}]}]}]}\n',
	);
});

test("renders SARIF scan v5 unmapped anchors with source regions", () => {
	const sarif = renderSarifReport(buildSarifReportModel({ scan: scanV5WithRegion() }));

	assert.equal(
		sarif,
		'{"version":"2.1.0","runs":[{"tool":{"driver":{"name":"AnchorMap","informationUri":"https://github.com/fstepho/anchormap","rules":[{"id":"anchormap.finding.unmapped_anchor","name":"unmapped_anchor","shortDescription":{"text":"AnchorMap scan finding unmapped_anchor"}}]}},"results":[{"ruleId":"anchormap.finding.unmapped_anchor","level":"warning","message":{"text":"scan finding: {\\"kind\\":\\"unmapped_anchor\\",\\"anchor_id\\":\\"QA-001\\"}"},"locations":[{"physicalLocation":{"artifactLocation":{"uri":"specs/requirements.md"},"region":{"startLine":3,"startColumn":5}}}]}]}]}\n',
	);
});

test("renders SARIF policy violations without locations and diff lost coverage with file locations", () => {
	const sarif = renderSarifReport(
		buildSarifReportModel({
			scan: scanV5WithRegion(),
			check: policyResultFixture(),
			diff: diffFixture(),
		}),
	);

	assert.equal(
		sarif,
		'{"version":"2.1.0","runs":[{"tool":{"driver":{"name":"AnchorMap","informationUri":"https://github.com/fstepho/anchormap","rules":[{"id":"anchormap.diff.lost_coverage","name":"lost_coverage","shortDescription":{"text":"AnchorMap diff lost coverage"}},{"id":"anchormap.finding.unmapped_anchor","name":"unmapped_anchor","shortDescription":{"text":"AnchorMap scan finding unmapped_anchor"}},{"id":"anchormap.policy.analysis_health_degraded","name":"analysis_health_degraded","shortDescription":{"text":"AnchorMap policy violation analysis_health_degraded"}},{"id":"anchormap.policy.finding_kind_present","name":"finding_kind_present","shortDescription":{"text":"AnchorMap policy violation finding_kind_present"}}]}},"results":[{"ruleId":"anchormap.diff.lost_coverage","level":"warning","message":{"text":"diff lost coverage: \\"src/lost.ts\\""},"locations":[{"physicalLocation":{"artifactLocation":{"uri":"src/lost.ts"}}}]},{"ruleId":"anchormap.finding.unmapped_anchor","level":"warning","message":{"text":"scan finding: {\\"kind\\":\\"unmapped_anchor\\",\\"anchor_id\\":\\"QA-001\\"}"},"locations":[{"physicalLocation":{"artifactLocation":{"uri":"specs/requirements.md"},"region":{"startLine":3,"startColumn":5}}}]},{"ruleId":"anchormap.policy.analysis_health_degraded","level":"warning","message":{"text":"policy violation: {\\"kind\\":\\"analysis_health_degraded\\"}"}},{"ruleId":"anchormap.policy.finding_kind_present","level":"warning","message":{"text":"policy violation: {\\"kind\\":\\"finding_kind_present\\",\\"finding_kind\\":\\"unmapped_anchor\\",\\"count\\":1}"}}]}]}\n',
	);
	assert.equal(sarif.includes("snippet"), false);
	assert.equal(sarif.includes("contents"), false);
	assert.equal(sarif.includes("upload"), false);
	assert.equal(sarif.includes("partialFingerprints"), false);
	assert.equal(sarif.includes("fixes"), false);
});

function scanV4WithFindings(): ScanResultView {
	const scan = JSON.parse(minimalScanArtifactJson(4)) as ScanResultView;
	const anchorId = anchorIdFixture("QA-001");
	const staleAnchorId = anchorIdFixture("OLD-001");
	return {
		...scan,
		observed_anchors: {
			[anchorId]: { spec_path: repoPath("specs/requirements.md"), mapping_state: "absent" },
		},
		findings: [
			{ kind: "unmapped_anchor", anchor_id: anchorId },
			{
				kind: "unresolved_static_edge",
				importer: repoPath("src/index.ts"),
				specifier: "./missing",
			},
			{ kind: "stale_mapping_anchor", anchor_id: staleAnchorId },
		],
	};
}

function scanV5WithRegion(): ScanResultView {
	const scan = JSON.parse(minimalScanArtifactJson(5)) as ScanResultView;
	const anchorId = anchorIdFixture("QA-001");
	return {
		...scan,
		observed_anchors: {
			[anchorId]: {
				spec_path: repoPath("specs/requirements.md"),
				mapping_state: "absent",
				source: {
					kind: "markdown_atx_heading",
					line: 3,
					column: 5,
					heading_level: 2,
				},
			},
		},
		findings: [{ kind: "unmapped_anchor", anchor_id: anchorId }],
	};
}

function policyResultFixture(): PolicyResult {
	return {
		schema_version: 1,
		decision: "fail",
		source_scan_schema_version: 5,
		analysis_health: "degraded",
		violations: [
			{ kind: "analysis_health_degraded" },
			{ kind: "finding_kind_present", finding_kind: "unmapped_anchor", count: 1 },
		],
		summary: {
			observed_anchor_count: 1,
			usable_mapping_count: 0,
			product_file_count: 1,
			covered_product_file_count: 0,
			uncovered_product_file_count: 1,
			covered_product_file_percent: 0,
			untraced_product_file_count: 0,
		},
	};
}

function diffFixture(): TraceabilityDiff {
	return {
		schema_version: 1,
		base_scan_schema_version: 5,
		head_scan_schema_version: 5,
		comparability: "same_scope",
		analysis_health_change: { from: "clean", to: "clean" },
		anchors: { added: [], removed: [], mapping_state_changed: [] },
		mappings: { added: [], removed: [], state_changed: [] },
		files: {
			added: [],
			removed: [],
			became_covered: [],
			lost_coverage: ["src/lost.ts"],
			covering_anchor_ids_changed: [],
			supported_local_targets_changed: [],
		},
		findings: { added: [], removed: [] },
		metrics_delta: {
			product_file_count: 0,
			stored_mapping_count: 0,
			usable_mapping_count: 0,
			observed_anchor_count: 0,
			active_anchor_count: 0,
			draft_anchor_count: 0,
			covered_product_file_count: 0,
			uncovered_product_file_count: 0,
			directly_seeded_product_file_count: 0,
			single_cover_product_file_count: 0,
			multi_cover_product_file_count: 0,
		},
	};
}

function anchorIdFixture(value: string) {
	const result = validateAnchorId(value);
	assert.equal(result.kind, "ok");
	if (result.kind !== "ok") {
		throw new Error(`invalid AnchorId fixture value ${value}`);
	}
	return result.anchorId;
}
