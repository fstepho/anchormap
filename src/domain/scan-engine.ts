import type { Config } from "../infra/config-io";
import type { SpecIndex } from "../infra/spec-index";
import type { ProductGraph } from "../infra/ts-graph";
import {
	createConfigView,
	createFileView,
	createScanResultView,
	type ScanResultView,
} from "./scan-result";

export interface ScanEngineInput {
	readonly config: Config;
	readonly specIndex: SpecIndex;
	readonly productGraph: ProductGraph;
}

export function runScanEngine(input: ScanEngineInput): ScanResultView {
	assertT71StubCanRenderSuccess(input);

	return createScanResultView({
		config: createConfigView({
			product_root: input.config.productRoot,
			spec_roots: input.config.specRoots,
			ignore_roots: input.config.ignoreRoots,
		}),
		observed_anchors: {},
		stored_mappings: {},
		files: Object.fromEntries(
			input.productGraph.productFiles.map((productFile) => [
				productFile,
				createFileView({
					covering_anchor_ids: [],
					supported_local_targets: input.productGraph.edgesByImporter.get(productFile) ?? [],
				}),
			]),
		),
		findings: input.productGraph.graphFindings,
	});
}

function assertT71StubCanRenderSuccess(input: ScanEngineInput): void {
	if (input.specIndex.observedAnchors.size > 0) {
		throw new Error("T7.1 scan engine stub cannot render observed anchors");
	}

	if (Object.keys(input.config.mappings).length > 0) {
		throw new Error("T7.1 scan engine stub cannot render stored mappings");
	}
}
