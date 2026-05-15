import { createHash } from "node:crypto";
import type { TraceabilityDiff } from "./diff-engine";
import type { PolicyResult } from "./policy-engine";
import type { ScanResultView } from "./scan-result";

export type BundleMetadataProvider = "github" | "gitlab" | "generic" | "other";

export interface BundleMetadata {
	readonly provider: BundleMetadataProvider;
	readonly repository: string | null;
	readonly commit: string | null;
	readonly branch: string | null;
	readonly pull_request: number | null;
	readonly run_url: string | null;
}

export interface ArtifactBundle {
	readonly schema_version: 1;
	readonly tool: {
		readonly name: "anchormap";
		readonly version: string;
	};
	readonly metadata: BundleMetadata;
	readonly artifacts: {
		readonly scan: ScanResultView;
		readonly check: PolicyResult;
		readonly diff: TraceabilityDiff;
	};
	readonly hashes: {
		readonly scan_sha256: string;
		readonly check_sha256: string;
		readonly diff_sha256: string;
	};
}

export interface BundleCanonicalArtifactBytes {
	readonly scan: string;
	readonly check: string;
	readonly diff: string;
}

export function buildArtifactBundle(input: {
	readonly scan: ScanResultView;
	readonly check: PolicyResult;
	readonly diff: TraceabilityDiff;
	readonly metadata: BundleMetadata;
	readonly toolVersion: string;
	readonly canonicalArtifactBytes: BundleCanonicalArtifactBytes;
}): ArtifactBundle {
	return {
		schema_version: 1,
		tool: {
			name: "anchormap",
			version: input.toolVersion,
		},
		metadata: input.metadata,
		artifacts: {
			scan: input.scan,
			check: input.check,
			diff: input.diff,
		},
		hashes: {
			scan_sha256: sha256Hex(input.canonicalArtifactBytes.scan),
			check_sha256: sha256Hex(input.canonicalArtifactBytes.check),
			diff_sha256: sha256Hex(input.canonicalArtifactBytes.diff),
		},
	};
}

function sha256Hex(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}
