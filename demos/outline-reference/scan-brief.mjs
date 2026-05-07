#!/usr/bin/env node
import { readFileSync } from "node:fs";

const inputPath = process.argv[2];

if (inputPath === undefined) {
	console.error("usage: node demos/outline-reference/scan-brief.mjs <scan.json>");
	process.exit(1);
}

let report;
try {
	report = JSON.parse(readFileSync(inputPath, "utf8"));
} catch (error) {
	console.error(`could not read scan JSON: ${error.message}`);
	process.exit(1);
}

const summary = report.traceability_metrics?.summary ?? {};
const anchors = report.traceability_metrics?.anchors ?? {};
const findings = Array.isArray(report.findings) ? report.findings : [];
const findingsByKind = countBy(findings, (finding) => finding.kind ?? "unknown");
const outOfScopeCount = findingsByKind.out_of_scope_static_edge ?? 0;
const localAliases = Array.isArray(report.config?.local_aliases)
	? report.config.local_aliases
	: [];
const usableAnchors = Object.entries(report.stored_mappings ?? {}).filter(
	([, mapping]) => mapping?.state === "usable",
);

console.log("AnchorMap scan brief");
console.log("");
console.log("Scan status");
line("schema_version", report.schema_version);
line("analysis_health", report.analysis_health);
line("product_root", report.config?.product_root);
line("tsconfig_path", report.config?.tsconfig_path ?? "none");
line("public local aliases", formatAliases(localAliases));
console.log("");
console.log("Coverage");
line("product files", summary.product_file_count);
line("usable mappings", summary.usable_mapping_count);
line(
	"covered product files",
	formatRatio(summary.covered_product_file_count, summary.product_file_count),
);
line("multi-covered product files", summary.multi_cover_product_file_count);
console.log("");
console.log("Anchors");
line("observed", summary.observed_anchor_count);
line("active", summary.active_anchor_count);
line("draft", summary.draft_anchor_count);

if (usableAnchors.length > 0) {
	console.log("");
	console.log("Usable anchor reach");
	for (const [anchorId] of usableAnchors) {
		const metrics = anchors[anchorId] ?? {};
		console.log(
			`- ${anchorId}: reached ${formatValue(metrics.reached_file_count)}, unique ${formatValue(metrics.unique_reached_file_count)}, shared ${formatValue(metrics.shared_reached_file_count)}`,
		);
	}
}

console.log("");
console.log("Findings");
for (const [kind, count] of Object.entries(findingsByKind).sort(([a], [b]) =>
	a.localeCompare(b),
)) {
	console.log(`- ${kind}: ${count}`);
}
if (Object.keys(findingsByKind).length === 0) {
	console.log("- none");
}

if (outOfScopeCount > 0) {
	console.log("");
	console.log(
		`Boundary note: ${outOfScopeCount} references leave selected product_root ${formatValue(report.config?.product_root)}.`,
	);
}

console.log("");
console.log(`Interpretation: ${interpretation(report.analysis_health)}`);

function countBy(items, getKey) {
	const counts = {};
	for (const item of items) {
		const key = getKey(item);
		counts[key] = (counts[key] ?? 0) + 1;
	}
	return counts;
}

function line(label, value) {
	console.log(`- ${label}: ${formatValue(value)}`);
}

function formatAliases(aliases) {
	if (aliases.length === 0) {
		return "none";
	}
	return aliases.map((alias) => `${alias.prefix} -> ${alias.target}`).join(", ");
}

function formatRatio(value, total) {
	if (typeof value !== "number" || typeof total !== "number") {
		return "unknown";
	}
	return `${value} / ${total}`;
}

function formatValue(value) {
	if (value === null || value === undefined) {
		return "unknown";
	}
	return String(value);
}

function interpretation(analysisHealth) {
	const base =
		"This brief is a non-contractual demo view over scan --json. It does not imply dead code, ownership, or architecture quality.";
	if (analysisHealth === "clean") {
		return `this is a successful clean scan. ${base}`;
	}
	if (analysisHealth === "degraded") {
		return `this is a successful scan with known technical findings. ${base}`;
	}
	return base;
}
