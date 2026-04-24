import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { AnchorId } from "../domain/anchor-id";
import { validateAnchorId } from "../domain/anchor-id";
import {
	createBrokenSeedPathFinding,
	createOutOfScopeStaticEdgeFinding,
	createStaleMappingAnchorFinding,
	createUnmappedAnchorFinding,
	createUnresolvedStaticEdgeFinding,
	createUnsupportedLocalTargetFinding,
	createUnsupportedStaticEdgeFinding,
	createUntracedProductFileFinding,
	normalizeFindings,
} from "../domain/finding";
import type { RepoPath } from "../domain/repo-path";
import { validateRepoPath } from "../domain/repo-path";
import {
	createConfigView,
	createFileView,
	createObservedAnchorView,
	createScanResultView,
	createStoredMappingView,
} from "../domain/scan-result";
import { renderScanResultJson } from "./render-json";

test("renders minimal scan result as one-line canonical JSON with final newline", () => {
	const rendered = renderScanResultJson(
		createScanResultView({
			config: createConfigView({
				product_root: repoPath("src"),
				spec_roots: [repoPath("specs")],
				ignore_roots: [],
			}),
			observed_anchors: {},
			stored_mappings: {},
			files: {},
			findings: [],
		}),
	);

	assert.equal(
		rendered,
		'{"schema_version":1,"config":{"version":1,"product_root":"src","spec_roots":["specs"],"ignore_roots":[]},"analysis_health":"clean","observed_anchors":{},"stored_mappings":{},"files":{},"findings":[]}\n',
	);
	assert.equal(rendered.endsWith("\n"), true);
	assert.equal(rendered.endsWith("\n\n"), false);
});

test("renders representative scan result with contract root, nested, map, and finding key order", () => {
	const rendered = renderScanResultJson(
		createScanResultView({
			config: createConfigView({
				product_root: repoPath("src"),
				spec_roots: [repoPath("specs/z"), repoPath("specs/a")],
				ignore_roots: [repoPath("src/vendor")],
			}),
			observed_anchors: {
				[anchorId("QA-002")]: createObservedAnchorView({
					spec_path: repoPath("specs/z.md"),
					mapping_state: "absent",
				}),
				[anchorId("QA-001")]: createObservedAnchorView({
					spec_path: repoPath("specs/a.md"),
					mapping_state: "usable",
				}),
			},
			stored_mappings: {
				[anchorId("QA.STALE")]: createStoredMappingView({
					state: "stale",
					seed_files: [repoPath("src/old.ts")],
					reached_files: [repoPath("src/ignored.ts")],
				}),
				[anchorId("QA-001")]: createStoredMappingView({
					state: "usable",
					seed_files: [repoPath("src/z.ts"), repoPath("src/a.ts")],
					reached_files: [repoPath("src/z.ts"), repoPath("src/a.ts")],
				}),
			},
			files: {
				[repoPath("src/z.ts")]: createFileView({
					covering_anchor_ids: [anchorId("QA-001")],
					supported_local_targets: [],
				}),
				[repoPath("src/a.ts")]: createFileView({
					covering_anchor_ids: [anchorId("QA-001"), anchorId("QA-002")],
					supported_local_targets: [repoPath("src/z.ts")],
				}),
			},
			findings: normalizeFindings([
				createUntracedProductFileFinding({ path: repoPath("src/z.ts") }),
				createUnmappedAnchorFinding({ anchor_id: anchorId("QA-002") }),
				createStaleMappingAnchorFinding({ anchor_id: anchorId("QA.STALE") }),
				createOutOfScopeStaticEdgeFinding({
					importer: repoPath("src/a.ts"),
					target_path: repoPath("outside/x.ts"),
				}),
			]),
		}),
	);

	assert.equal(
		rendered,
		'{"schema_version":1,"config":{"version":1,"product_root":"src","spec_roots":["specs/a","specs/z"],"ignore_roots":["src/vendor"]},"analysis_health":"degraded","observed_anchors":{"QA-001":{"spec_path":"specs/a.md","mapping_state":"usable"},"QA-002":{"spec_path":"specs/z.md","mapping_state":"absent"}},"stored_mappings":{"QA-001":{"state":"usable","seed_files":["src/a.ts","src/z.ts"],"reached_files":["src/a.ts","src/z.ts"]},"QA.STALE":{"state":"stale","seed_files":["src/old.ts"],"reached_files":[]}},"files":{"src/a.ts":{"covering_anchor_ids":["QA-001","QA-002"],"supported_local_targets":["src/z.ts"]},"src/z.ts":{"covering_anchor_ids":["QA-001"],"supported_local_targets":[]}},"findings":[{"kind":"out_of_scope_static_edge","importer":"src/a.ts","target_path":"outside/x.ts"},{"kind":"stale_mapping_anchor","anchor_id":"QA.STALE"},{"kind":"unmapped_anchor","anchor_id":"QA-002"},{"kind":"untraced_product_file","path":"src/z.ts"}]}\n',
	);
});

test("renders finding variants and exact JSON string escaping profile", () => {
	const controls = String.fromCharCode(...Array.from({ length: 0x20 }, (_, index) => index));
	const rendered = renderScanResultJson(
		createScanResultView({
			config: createConfigView({
				product_root: repoPath("src"),
				spec_roots: [repoPath("specs")],
				ignore_roots: [],
			}),
			observed_anchors: {},
			stored_mappings: {},
			files: {},
			findings: normalizeFindings([
				createBrokenSeedPathFinding({
					anchor_id: anchorId("QA-001"),
					seed_path: repoPath("src/missing.ts"),
				}),
				createUnresolvedStaticEdgeFinding({
					importer: repoPath("src/importer.ts"),
					specifier: `./quote"slash/path\\controls${controls}surrogate-\uD800-pair-😀`,
				}),
				createUnsupportedStaticEdgeFinding({
					importer: repoPath("src/importer.ts"),
					syntax_kind: "dynamic_import",
					specifier: "./late",
				}),
				createUnsupportedLocalTargetFinding({
					importer: repoPath("src/importer.ts"),
					target_path: repoPath("src/view.tsx"),
				}),
			]),
		}),
	);

	assert.equal(
		rendered,
		`{"schema_version":1,"config":{"version":1,"product_root":"src","spec_roots":["specs"],"ignore_roots":[]},"analysis_health":"degraded","observed_anchors":{},"stored_mappings":{},"files":{},"findings":[{"kind":"broken_seed_path","anchor_id":"QA-001","seed_path":"src/missing.ts"},{"kind":"unresolved_static_edge","importer":"src/importer.ts","specifier":"./quote\\"slash/path\\\\controls${escapedControls()}surrogate-\\ud800-pair-😀"},{"kind":"unsupported_local_target","importer":"src/importer.ts","target_path":"src/view.tsx"},{"kind":"unsupported_static_edge","importer":"src/importer.ts","syntax_kind":"dynamic_import","specifier":"./late"}]}\n`,
	);
	assert.equal(rendered.includes("\\/"), false);
});

function escapedControls(): string {
	return Array.from(
		{ length: 0x20 },
		(_, index) => `\\u00${index.toString(16).padStart(2, "0")}`,
	).join("");
}

function anchorId(value: string): AnchorId {
	const result = validateAnchorId(value);
	assert.equal(result.kind, "ok");
	return result.anchorId;
}

function repoPath(value: string): RepoPath {
	const result = validateRepoPath(value);
	assert.equal(result.kind, "ok");
	return result.repoPath;
}
