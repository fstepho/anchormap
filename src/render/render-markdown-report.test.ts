import { strict as assert } from "node:assert";
import { test } from "node:test";
import { minimalScanArtifactJson, repoPath } from "../cli/commands-test-support";
import { validateAnchorId } from "../domain/anchor-id";
import { diffScanResults } from "../domain/diff-engine";
import { evaluatePolicy } from "../domain/policy-engine";
import { buildMarkdownReportModel } from "../domain/report-model";
import type { ScanResultView } from "../domain/scan-result";
import { renderCanonicalString } from "./render-json";
import { renderMarkdownReport } from "./render-markdown-report";

test("renders stable markdown report sections from scan, check, and diff artifacts", () => {
	const base = JSON.parse(minimalScanArtifactJson()) as ScanResultView;
	const head = scanWithReportFindings();
	const check = evaluatePolicy(head, {
		version: 1,
		fail_on: { finding_kinds: ["unmapped_anchor"] },
		thresholds: { min_covered_product_file_percent: 100 },
	});
	const diff = diffScanResults(base, head);

	const markdown = renderMarkdownReport(
		buildMarkdownReportModel({
			scan: head,
			check,
			diff,
			renderString: renderCanonicalString,
		}),
	);

	assert.equal(
		markdown,
		[
			"# AnchorMap traceability report",
			"",
			"## Summary",
			"- Analysis health: degraded",
			"- Observed anchors: 1",
			"- Usable mappings: 0",
			"- Covered product files: 0/1 (0%)",
			"- Findings: 2",
			"",
			"## Policy violations",
			"Decision: FAIL",
			'- {"kind":"covered_product_file_percent_below_threshold","actual":0,"threshold":100}',
			'- {"kind":"finding_kind_present","finding_kind":"unmapped_anchor","count":1}',
			"",
			"## Change impact",
			"- Comparability: same_scope",
			"- Analysis health: clean -> degraded",
			"- Anchors added: 1",
			"- Anchors removed: 0",
			"- Anchor mapping states changed: 0",
			"- Mappings added: 0",
			"- Mappings removed: 0",
			"- Mapping states changed: 0",
			"- Files added: 1",
			"- Files removed: 0",
			"- Files became covered: 0",
			"- Files lost coverage: 0",
			"- Findings added: 2",
			"- Findings removed: 0",
			"",
			"## Findings",
			'- {"kind":"unmapped_anchor","anchor_id":"QA-001"}',
			'- {"kind":"untraced_product_file","path":"src/a.ts"}',
			"",
			"## Suggested actions",
			'- Add a mapping for "QA-001".',
			"",
		].join("\n"),
	);
});

test("omits optional markdown report sections when artifacts or actions are absent", () => {
	const scan = JSON.parse(minimalScanArtifactJson()) as ScanResultView;

	const markdown = renderMarkdownReport(
		buildMarkdownReportModel({ scan, renderString: renderCanonicalString }),
	);

	assert.equal(
		markdown,
		[
			"# AnchorMap traceability report",
			"",
			"## Summary",
			"- Analysis health: clean",
			"- Observed anchors: 0",
			"- Usable mappings: 0",
			"- Covered product files: 0/0 (100%)",
			"- Findings: 0",
			"",
			"## Findings",
			"- none",
			"",
		].join("\n"),
	);
});

function scanWithReportFindings(): ScanResultView {
	const scan = JSON.parse(minimalScanArtifactJson()) as ScanResultView;
	const anchorId = anchorIdFixture("QA-001");
	const productFile = repoPath("src/a.ts");
	const specPath = repoPath("specs/a.md");

	return {
		...scan,
		analysis_health: "degraded",
		observed_anchors: {
			[anchorId]: {
				spec_path: specPath,
				mapping_state: "absent",
			},
		} as ScanResultView["observed_anchors"],
		files: {
			[productFile]: {
				covering_anchor_ids: [],
				supported_local_targets: [],
			},
		} as ScanResultView["files"],
		traceability_metrics: {
			summary: {
				...scan.traceability_metrics.summary,
				product_file_count: 1,
				observed_anchor_count: 1,
				active_anchor_count: 1,
				uncovered_product_file_count: 1,
			},
			anchors: {},
		},
		findings: [
			{ kind: "unmapped_anchor", anchor_id: anchorId },
			{ kind: "untraced_product_file", path: productFile },
		],
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
