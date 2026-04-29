import type { Finding } from "../domain/finding";
import type {
	ConfigView,
	FileView,
	ObservedAnchorView,
	ScanResultView,
	StoredMappingView,
} from "../domain/scan-result";

export function renderScanResultJson(result: ScanResultView): string {
	return `${renderScanResultObject(result)}\n`;
}

export function renderScanResultHuman(result: ScanResultView): string {
	return `analysis_health: ${result.analysis_health}\n`;
}

function renderScanResultObject(result: ScanResultView): string {
	return renderObject([
		["schema_version", renderNumber(result.schema_version)],
		["config", renderConfig(result.config)],
		["analysis_health", renderString(result.analysis_health)],
		["observed_anchors", renderRecord(result.observed_anchors, renderObservedAnchor)],
		["stored_mappings", renderRecord(result.stored_mappings, renderStoredMapping)],
		["files", renderRecord(result.files, renderFile)],
		["findings", renderArray(result.findings, renderFinding)],
	]);
}

function renderConfig(config: ConfigView): string {
	return renderObject([
		["version", renderNumber(config.version)],
		["product_root", renderString(config.product_root)],
		["spec_roots", renderStringArray(config.spec_roots)],
		["ignore_roots", renderStringArray(config.ignore_roots)],
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

function renderArray<Value>(
	values: readonly Value[],
	renderValue: (value: Value) => string,
): string {
	return `[${values.map((value) => renderValue(value)).join(",")}]`;
}

function renderNumber(value: 1): string {
	return String(value);
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
