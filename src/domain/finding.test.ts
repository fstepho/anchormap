import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { AnchorId } from "./anchor-id";
import { validateAnchorId } from "./anchor-id";
import {
	normalizeAnchorIdsByUtf8,
	normalizeRepoPathsByUtf8,
	sortAnchorIdsByUtf8,
	sortRepoPathsByUtf8,
} from "./canonical-order";
import {
	createBrokenSeedPathFinding,
	createOutOfScopeStaticEdgeFinding,
	createStaleMappingAnchorFinding,
	createUnmappedAnchorFinding,
	createUnresolvedStaticEdgeFinding,
	createUnsupportedLocalTargetFinding,
	createUnsupportedStaticEdgeFinding,
	createUntracedProductFileFinding,
	type Finding,
	normalizeFindings,
} from "./finding";
import type { RepoPath } from "./repo-path";
import { repoPathToString, validateRepoPath } from "./repo-path";

test("constructs every normative finding kind with only contract fields", () => {
	const findings = allFindingKinds();

	assert.deepEqual(
		findings.map((finding) => finding.kind),
		[
			"unmapped_anchor",
			"stale_mapping_anchor",
			"broken_seed_path",
			"unresolved_static_edge",
			"unsupported_static_edge",
			"out_of_scope_static_edge",
			"unsupported_local_target",
			"untraced_product_file",
		],
	);
});

test("constructs findings with contract key order", () => {
	const cases: Array<[Finding, string[]]> = [
		[createUnmappedAnchorFinding({ anchor_id: anchorId("QA-001") }), ["kind", "anchor_id"]],
		[createStaleMappingAnchorFinding({ anchor_id: anchorId("QA-002") }), ["kind", "anchor_id"]],
		[
			createBrokenSeedPathFinding({
				anchor_id: anchorId("QA-003"),
				seed_path: repoPath("src/missing.ts"),
			}),
			["kind", "anchor_id", "seed_path"],
		],
		[
			createUnresolvedStaticEdgeFinding({
				importer: repoPath("src/importer.ts"),
				specifier: "./missing",
			}),
			["kind", "importer", "specifier"],
		],
		[
			createUnsupportedStaticEdgeFinding({
				importer: repoPath("src/importer.ts"),
				syntax_kind: "require_call",
				specifier: "./feature",
			}),
			["kind", "importer", "syntax_kind", "specifier"],
		],
		[
			createOutOfScopeStaticEdgeFinding({
				importer: repoPath("src/importer.ts"),
				target_path: repoPath("other/target.ts"),
			}),
			["kind", "importer", "target_path"],
		],
		[
			createUnsupportedLocalTargetFinding({
				importer: repoPath("src/importer.ts"),
				target_path: repoPath("src/view.tsx"),
			}),
			["kind", "importer", "target_path"],
		],
		[createUntracedProductFileFinding({ path: repoPath("src/orphan.ts") }), ["kind", "path"]],
	];

	for (const [finding, expectedKeys] of cases) {
		assert.deepEqual(Object.keys(finding), expectedKeys);
	}
});

test("sorts anchor IDs and repo paths by binary UTF-8 byte order", () => {
	const anchorIds = [anchorId("A.A"), anchorId("A-001"), anchorId("AA.A")];
	const repoPaths = [repoPath("ä/file.ts"), repoPath("z/file.ts"), repoPath("a/file.ts")];

	assert.deepEqual(sortAnchorIdsByUtf8(anchorIds), [
		anchorId("A-001"),
		anchorId("A.A"),
		anchorId("AA.A"),
	]);
	assert.deepEqual(sortRepoPathsByUtf8(repoPaths).map(repoPathToString), [
		"a/file.ts",
		"z/file.ts",
		"ä/file.ts",
	]);
	assert.deepEqual(anchorIds, [anchorId("A.A"), anchorId("A-001"), anchorId("AA.A")]);
});

test("normalizes anchor ID and repo path collections by exact dedupe then binary UTF-8 order", () => {
	assert.deepEqual(
		normalizeAnchorIdsByUtf8([anchorId("A.A"), anchorId("A-001"), anchorId("A.A")]),
		[anchorId("A-001"), anchorId("A.A")],
	);
	assert.deepEqual(
		normalizeRepoPathsByUtf8([
			repoPath("z/file.ts"),
			repoPath("a/file.ts"),
			repoPath("z/file.ts"),
		]).map(repoPathToString),
		["a/file.ts", "z/file.ts"],
	);
});

test("deduplicates findings by exact contract tuple", () => {
	const duplicate = createUnsupportedStaticEdgeFinding({
		importer: repoPath("src/importer.ts"),
		syntax_kind: "dynamic_import",
		specifier: "./late",
	});

	const normalized = normalizeFindings([
		duplicate,
		createUnmappedAnchorFinding({ anchor_id: anchorId("QA-001") }),
		duplicate,
	]);

	assert.deepEqual(normalized, [
		createUnmappedAnchorFinding({ anchor_id: anchorId("QA-001") }),
		duplicate,
	]);
});

test("keeps findings distinct when any normative tuple field differs", () => {
	const normalized = normalizeFindings([
		createBrokenSeedPathFinding({
			anchor_id: anchorId("QA-001"),
			seed_path: repoPath("src/a.ts"),
		}),
		createBrokenSeedPathFinding({
			anchor_id: anchorId("QA-001"),
			seed_path: repoPath("src/b.ts"),
		}),
		createBrokenSeedPathFinding({
			anchor_id: anchorId("QA-002"),
			seed_path: repoPath("src/a.ts"),
		}),
		createUnresolvedStaticEdgeFinding({
			importer: repoPath("src/a.ts"),
			specifier: "./x",
		}),
		createUnresolvedStaticEdgeFinding({
			importer: repoPath("src/a.ts"),
			specifier: "./y",
		}),
	]);

	assert.equal(normalized.length, 5);
});

test("sorts findings by kind and normative fields in contract order", () => {
	const normalized = normalizeFindings([
		createUntracedProductFileFinding({ path: repoPath("src/z.ts") }),
		createUnsupportedStaticEdgeFinding({
			importer: repoPath("src/b.ts"),
			syntax_kind: "require_call",
			specifier: "./z",
		}),
		createBrokenSeedPathFinding({
			anchor_id: anchorId("QA-002"),
			seed_path: repoPath("src/a.ts"),
		}),
		createUnsupportedStaticEdgeFinding({
			importer: repoPath("src/a.ts"),
			syntax_kind: "dynamic_import",
			specifier: "./z",
		}),
		createUnmappedAnchorFinding({ anchor_id: anchorId("QA-001") }),
		createOutOfScopeStaticEdgeFinding({
			importer: repoPath("src/b.ts"),
			target_path: repoPath("outside/a.ts"),
		}),
		createStaleMappingAnchorFinding({ anchor_id: anchorId("QA-001") }),
		createUnsupportedLocalTargetFinding({
			importer: repoPath("src/a.ts"),
			target_path: repoPath("src/view.tsx"),
		}),
		createUnresolvedStaticEdgeFinding({
			importer: repoPath("src/a.ts"),
			specifier: "./missing",
		}),
		createBrokenSeedPathFinding({
			anchor_id: anchorId("QA-001"),
			seed_path: repoPath("src/z.ts"),
		}),
	]);

	assert.deepEqual(
		normalized.map((finding) => finding.kind),
		[
			"broken_seed_path",
			"broken_seed_path",
			"out_of_scope_static_edge",
			"stale_mapping_anchor",
			"unmapped_anchor",
			"unresolved_static_edge",
			"unsupported_local_target",
			"unsupported_static_edge",
			"unsupported_static_edge",
			"untraced_product_file",
		],
	);
	assert.deepEqual(normalized.slice(0, 2), [
		createBrokenSeedPathFinding({
			anchor_id: anchorId("QA-001"),
			seed_path: repoPath("src/z.ts"),
		}),
		createBrokenSeedPathFinding({
			anchor_id: anchorId("QA-002"),
			seed_path: repoPath("src/a.ts"),
		}),
	]);
});

test("sorts isolated surrogate specifier values by deterministic canonical order", () => {
	const normalized = normalizeFindings([
		createUnresolvedStaticEdgeFinding({
			importer: repoPath("src/importer.ts"),
			specifier: "\uD801",
		}),
		createUnresolvedStaticEdgeFinding({
			importer: repoPath("src/importer.ts"),
			specifier: "\uD800",
		}),
	]);

	assert.deepEqual(
		normalized.map((finding) => {
			assert.equal(finding.kind, "unresolved_static_edge");
			return finding.specifier;
		}),
		["\uD800", "\uD801"],
	);
});

test("collapses duplicate graph findings like fx35_graph_duplicate_findings_dedup", () => {
	const firstOccurrence = createUnresolvedStaticEdgeFinding({
		importer: repoPath("src/importer.ts"),
		specifier: "./missing",
	});
	const secondOccurrence = createUnresolvedStaticEdgeFinding({
		importer: repoPath("src/importer.ts"),
		specifier: "./missing",
	});

	assert.deepEqual(normalizeFindings([firstOccurrence, secondOccurrence]), [firstOccurrence]);
});

test("typed finding construction rejects extra fields", () => {
	const fieldsWithExtraKey = {
		anchor_id: anchorId("QA-001"),
		unexpected: "not_contract",
	};

	// @ts-expect-error finding constructors are closed over their normative fields.
	createUnmappedAnchorFinding(fieldsWithExtraKey);
});

function allFindingKinds(): Finding[] {
	return [
		createUnmappedAnchorFinding({ anchor_id: anchorId("QA-001") }),
		createStaleMappingAnchorFinding({ anchor_id: anchorId("QA-002") }),
		createBrokenSeedPathFinding({
			anchor_id: anchorId("QA-003"),
			seed_path: repoPath("src/missing.ts"),
		}),
		createUnresolvedStaticEdgeFinding({
			importer: repoPath("src/importer.ts"),
			specifier: "./missing",
		}),
		createUnsupportedStaticEdgeFinding({
			importer: repoPath("src/importer.ts"),
			syntax_kind: "dynamic_import",
			specifier: "./late",
		}),
		createOutOfScopeStaticEdgeFinding({
			importer: repoPath("src/importer.ts"),
			target_path: repoPath("outside/target.ts"),
		}),
		createUnsupportedLocalTargetFinding({
			importer: repoPath("src/importer.ts"),
			target_path: repoPath("src/view.tsx"),
		}),
		createUntracedProductFileFinding({ path: repoPath("src/orphan.ts") }),
	];
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
