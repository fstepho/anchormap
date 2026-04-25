import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { Config } from "../infra/config-io";
import type { SpecIndex } from "../infra/spec-index";
import type { ProductGraph } from "../infra/ts-graph";
import type { AnchorId } from "./anchor-id";
import { validateAnchorId } from "./anchor-id";
import type { RepoPath } from "./repo-path";
import { validateRepoPath } from "./repo-path";
import { runScanEngine } from "./scan-engine";

test("T7.1 scan engine stub succeeds only for empty anchors and mappings", () => {
	const result = runScanEngine({
		config: minimalConfig(),
		specIndex: emptySpecIndex(),
		productGraph: minimalProductGraph(),
	});

	assert.deepEqual(result.observed_anchors, {});
	assert.deepEqual(result.stored_mappings, {});
	assert.deepEqual(Object.keys(result.files), ["src/index.ts"]);
});

test("T7.1 scan engine stub fails fast before dropping observed anchors", () => {
	assert.throws(
		() =>
			runScanEngine({
				config: minimalConfig(),
				specIndex: {
					specFiles: [],
					observedAnchors: new Map([
						[
							anchorId("FR-014"),
							{
								anchorId: anchorId("FR-014"),
								specPath: repoPath("specs/requirements.md"),
								sourceKind: "markdown",
							},
						],
					]),
					anchorOccurrences: [],
				},
				productGraph: minimalProductGraph(),
			}),
		/observed anchors/,
	);
});

test("T7.1 scan engine stub fails fast before dropping stored mappings", () => {
	assert.throws(
		() =>
			runScanEngine({
				config: {
					...minimalConfig(),
					mappings: {
						[anchorId("FR-014")]: {
							seedFiles: [repoPath("src/index.ts")],
						},
					},
				},
				specIndex: emptySpecIndex(),
				productGraph: minimalProductGraph(),
			}),
		/stored mappings/,
	);
});

function minimalConfig(): Config {
	return {
		version: 1,
		productRoot: repoPath("src"),
		specRoots: [repoPath("specs")],
		ignoreRoots: [],
		mappings: {},
	};
}

function emptySpecIndex(): SpecIndex {
	return {
		specFiles: [],
		observedAnchors: new Map(),
		anchorOccurrences: [],
	};
}

function minimalProductGraph(): ProductGraph {
	return {
		productFiles: [repoPath("src/index.ts")],
		parsedFiles: [],
		edgesByImporter: new Map(),
		graphFindings: [],
	};
}

function repoPath(value: string): RepoPath {
	const result = validateRepoPath(value);
	assert.equal(result.kind, "ok");
	return result.repoPath;
}

function anchorId(value: string): AnchorId {
	const result = validateAnchorId(value);
	assert.equal(result.kind, "ok");
	return result.anchorId;
}
