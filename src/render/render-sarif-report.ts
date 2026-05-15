import { compareCanonicalTextByUtf8 } from "../domain/canonical-order";
import type { Finding } from "../domain/finding";
import type { PolicyViolation } from "../domain/policy-engine";
import type { RepoPath } from "../domain/repo-path";
import type { SarifReportModel } from "../domain/report-model";
import type { ObservedAnchorSourceView, ScanResultView } from "../domain/scan-result";
import {
	renderCanonicalFinding,
	renderCanonicalPolicyViolation,
	renderCanonicalString,
} from "./render-json";

const TOOL_NAME = "AnchorMap";
const TOOL_INFORMATION_URI = "https://github.com/fstepho/anchormap";

type SarifRule = {
	readonly id: string;
	readonly name: string;
	readonly shortDescriptionText: string;
};

type SarifLocation = {
	readonly uri: RepoPath | string;
	readonly region?: {
		readonly startLine: number;
		readonly startColumn: number;
	};
};

type SarifResult = {
	readonly rule: SarifRule;
	readonly messageText: string;
	readonly location?: SarifLocation;
};

export function renderSarifReport(model: SarifReportModel): string {
	const results = [
		...model.scan.findings.map((finding) => scanFindingResult(model.scan, finding)),
		...(model.check?.violations.map(policyViolationResult) ?? []),
		...(model.diff?.files.lost_coverage.map(diffLostCoverageResult) ?? []),
	].sort(compareSarifResults);
	const rules = uniqueRules(results).sort((left, right) =>
		compareCanonicalTextByUtf8(left.id, right.id),
	);

	return `${renderObject([
		["version", renderCanonicalString("2.1.0")],
		[
			"runs",
			renderArray([
				renderObject([
					[
						"tool",
						renderObject([
							[
								"driver",
								renderObject([
									["name", renderCanonicalString(TOOL_NAME)],
									["informationUri", renderCanonicalString(TOOL_INFORMATION_URI)],
									["rules", renderArray(rules.map(renderRule))],
								]),
							],
						]),
					],
					["results", renderArray(results.map(renderResult))],
				]),
			]),
		],
	])}\n`;
}

function scanFindingResult(scan: ScanResultView, finding: Finding): SarifResult {
	const location = scanFindingLocation(scan, finding);
	return {
		rule: scanFindingRule(finding.kind),
		messageText: `scan finding: ${renderCanonicalFinding(finding)}`,
		...(location !== undefined ? { location } : {}),
	};
}

function policyViolationResult(violation: PolicyViolation): SarifResult {
	return {
		rule: policyViolationRule(violation.kind),
		messageText: `policy violation: ${renderCanonicalPolicyViolation(violation)}`,
	};
}

function diffLostCoverageResult(path: string): SarifResult {
	return {
		rule: diffLostCoverageRule(),
		messageText: `diff lost coverage: ${renderCanonicalString(path)}`,
		location: { uri: path },
	};
}

function scanFindingLocation(scan: ScanResultView, finding: Finding): SarifLocation | undefined {
	switch (finding.kind) {
		case "unmapped_anchor": {
			const observedAnchor = scan.observed_anchors[finding.anchor_id];
			if (observedAnchor === undefined) {
				return undefined;
			}
			return {
				uri: observedAnchor.spec_path,
				...(observedAnchor.source !== undefined
					? { region: sourceRegion(observedAnchor.source) }
					: {}),
			};
		}
		case "stale_mapping_anchor":
			return undefined;
		case "broken_seed_path":
			return { uri: finding.seed_path };
		case "unresolved_static_edge":
		case "unsupported_static_edge":
		case "out_of_scope_static_edge":
		case "unsupported_local_target":
			return { uri: finding.importer };
		case "untraced_product_file":
			return { uri: finding.path };
	}
}

function sourceRegion(source: ObservedAnchorSourceView): SarifLocation["region"] {
	return { startLine: source.line, startColumn: source.column };
}

function scanFindingRule(findingKind: Finding["kind"]): SarifRule {
	return {
		id: `anchormap.finding.${findingKind}`,
		name: findingKind,
		shortDescriptionText: `AnchorMap scan finding ${findingKind}`,
	};
}

function policyViolationRule(violationKind: PolicyViolation["kind"]): SarifRule {
	return {
		id: `anchormap.policy.${violationKind}`,
		name: violationKind,
		shortDescriptionText: `AnchorMap policy violation ${violationKind}`,
	};
}

function diffLostCoverageRule(): SarifRule {
	return {
		id: "anchormap.diff.lost_coverage",
		name: "lost_coverage",
		shortDescriptionText: "AnchorMap diff lost coverage",
	};
}

function uniqueRules(results: readonly SarifResult[]): SarifRule[] {
	const rules = new Map<string, SarifRule>();
	for (const result of results) {
		if (!rules.has(result.rule.id)) {
			rules.set(result.rule.id, result.rule);
		}
	}
	return [...rules.values()];
}

function compareSarifResults(left: SarifResult, right: SarifResult): number {
	return (
		compareCanonicalTextByUtf8(left.rule.id, right.rule.id) ||
		compareCanonicalTextByUtf8(locationKey(left), locationKey(right)) ||
		compareCanonicalTextByUtf8(left.messageText, right.messageText) ||
		compareCanonicalTextByUtf8(renderResult(left), renderResult(right))
	);
}

function locationKey(result: SarifResult): string {
	return result.location?.uri ?? "";
}

function renderRule(rule: SarifRule): string {
	return renderObject([
		["id", renderCanonicalString(rule.id)],
		["name", renderCanonicalString(rule.name)],
		[
			"shortDescription",
			renderObject([["text", renderCanonicalString(rule.shortDescriptionText)]]),
		],
	]);
}

function renderResult(result: SarifResult): string {
	const fields: Array<readonly [string, string]> = [
		["ruleId", renderCanonicalString(result.rule.id)],
		["level", renderCanonicalString("warning")],
		["message", renderObject([["text", renderCanonicalString(result.messageText)]])],
	];
	if (result.location !== undefined) {
		fields.push(["locations", renderArray([renderLocation(result.location)])]);
	}
	return renderObject(fields);
}

function renderLocation(location: SarifLocation): string {
	return renderObject([["physicalLocation", renderPhysicalLocation(location)]]);
}

function renderPhysicalLocation(location: SarifLocation): string {
	const fields: Array<readonly [string, string]> = [
		["artifactLocation", renderObject([["uri", renderCanonicalString(location.uri)]])],
	];
	if (location.region !== undefined) {
		fields.push([
			"region",
			renderObject([
				["startLine", renderNumber(location.region.startLine)],
				["startColumn", renderNumber(location.region.startColumn)],
			]),
		]);
	}
	return renderObject(fields);
}

function renderObject(fields: readonly (readonly [string, string])[]): string {
	return `{${fields.map(([key, value]) => `${renderCanonicalString(key)}:${value}`).join(",")}}`;
}

function renderArray(values: readonly string[]): string {
	return `[${values.join(",")}]`;
}

function renderNumber(value: number): string {
	return String(value);
}
