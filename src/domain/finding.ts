import type { AnchorId } from "./anchor-id";
import { compareCanonicalTextByUtf8 } from "./canonical-order";
import type { RepoPath } from "./repo-path";

export type FindingKind =
	| "unmapped_anchor"
	| "stale_mapping_anchor"
	| "broken_seed_path"
	| "unresolved_static_edge"
	| "unsupported_static_edge"
	| "out_of_scope_static_edge"
	| "unsupported_local_target"
	| "untraced_product_file";

export type StaticEdgeSyntaxKind = "require_call" | "dynamic_import";

export interface UnmappedAnchorFinding {
	readonly kind: "unmapped_anchor";
	readonly anchor_id: AnchorId;
}

export interface StaleMappingAnchorFinding {
	readonly kind: "stale_mapping_anchor";
	readonly anchor_id: AnchorId;
}

export interface BrokenSeedPathFinding {
	readonly kind: "broken_seed_path";
	readonly anchor_id: AnchorId;
	readonly seed_path: RepoPath;
}

export interface UnresolvedStaticEdgeFinding {
	readonly kind: "unresolved_static_edge";
	readonly importer: RepoPath;
	readonly specifier: string;
}

export interface UnsupportedStaticEdgeFinding {
	readonly kind: "unsupported_static_edge";
	readonly importer: RepoPath;
	readonly syntax_kind: StaticEdgeSyntaxKind;
	readonly specifier: string;
}

export interface OutOfScopeStaticEdgeFinding {
	readonly kind: "out_of_scope_static_edge";
	readonly importer: RepoPath;
	readonly target_path: RepoPath;
}

export interface UnsupportedLocalTargetFinding {
	readonly kind: "unsupported_local_target";
	readonly importer: RepoPath;
	readonly target_path: RepoPath;
}

export interface UntracedProductFileFinding {
	readonly kind: "untraced_product_file";
	readonly path: RepoPath;
}

export type Finding =
	| UnmappedAnchorFinding
	| StaleMappingAnchorFinding
	| BrokenSeedPathFinding
	| UnresolvedStaticEdgeFinding
	| UnsupportedStaticEdgeFinding
	| OutOfScopeStaticEdgeFinding
	| UnsupportedLocalTargetFinding
	| UntracedProductFileFinding;

export type UnmappedAnchorFindingFields = Pick<UnmappedAnchorFinding, "anchor_id">;
export type StaleMappingAnchorFindingFields = Pick<StaleMappingAnchorFinding, "anchor_id">;
export type BrokenSeedPathFindingFields = Pick<BrokenSeedPathFinding, "anchor_id" | "seed_path">;
export type UnresolvedStaticEdgeFindingFields = Pick<
	UnresolvedStaticEdgeFinding,
	"importer" | "specifier"
>;
export type UnsupportedStaticEdgeFindingFields = Pick<
	UnsupportedStaticEdgeFinding,
	"importer" | "syntax_kind" | "specifier"
>;
export type OutOfScopeStaticEdgeFindingFields = Pick<
	OutOfScopeStaticEdgeFinding,
	"importer" | "target_path"
>;
export type UnsupportedLocalTargetFindingFields = Pick<
	UnsupportedLocalTargetFinding,
	"importer" | "target_path"
>;
export type UntracedProductFileFindingFields = Pick<UntracedProductFileFinding, "path">;

type NoExtraFields<Input, Shape> = Input & Record<Exclude<keyof Input, keyof Shape>, never>;

export function createUnmappedAnchorFinding<const Input extends UnmappedAnchorFindingFields>(
	fields: NoExtraFields<Input, UnmappedAnchorFindingFields>,
): UnmappedAnchorFinding {
	return { kind: "unmapped_anchor", anchor_id: fields.anchor_id };
}

export function createStaleMappingAnchorFinding<
	const Input extends StaleMappingAnchorFindingFields,
>(fields: NoExtraFields<Input, StaleMappingAnchorFindingFields>): StaleMappingAnchorFinding {
	return { kind: "stale_mapping_anchor", anchor_id: fields.anchor_id };
}

export function createBrokenSeedPathFinding<const Input extends BrokenSeedPathFindingFields>(
	fields: NoExtraFields<Input, BrokenSeedPathFindingFields>,
): BrokenSeedPathFinding {
	return {
		kind: "broken_seed_path",
		anchor_id: fields.anchor_id,
		seed_path: fields.seed_path,
	};
}

export function createUnresolvedStaticEdgeFinding<
	const Input extends UnresolvedStaticEdgeFindingFields,
>(fields: NoExtraFields<Input, UnresolvedStaticEdgeFindingFields>): UnresolvedStaticEdgeFinding {
	return {
		kind: "unresolved_static_edge",
		importer: fields.importer,
		specifier: fields.specifier,
	};
}

export function createUnsupportedStaticEdgeFinding<
	const Input extends UnsupportedStaticEdgeFindingFields,
>(fields: NoExtraFields<Input, UnsupportedStaticEdgeFindingFields>): UnsupportedStaticEdgeFinding {
	return {
		kind: "unsupported_static_edge",
		importer: fields.importer,
		syntax_kind: fields.syntax_kind,
		specifier: fields.specifier,
	};
}

export function createOutOfScopeStaticEdgeFinding<
	const Input extends OutOfScopeStaticEdgeFindingFields,
>(fields: NoExtraFields<Input, OutOfScopeStaticEdgeFindingFields>): OutOfScopeStaticEdgeFinding {
	return {
		kind: "out_of_scope_static_edge",
		importer: fields.importer,
		target_path: fields.target_path,
	};
}

export function createUnsupportedLocalTargetFinding<
	const Input extends UnsupportedLocalTargetFindingFields,
>(
	fields: NoExtraFields<Input, UnsupportedLocalTargetFindingFields>,
): UnsupportedLocalTargetFinding {
	return {
		kind: "unsupported_local_target",
		importer: fields.importer,
		target_path: fields.target_path,
	};
}

export function createUntracedProductFileFinding<
	const Input extends UntracedProductFileFindingFields,
>(fields: NoExtraFields<Input, UntracedProductFileFindingFields>): UntracedProductFileFinding {
	return { kind: "untraced_product_file", path: fields.path };
}

export function normalizeFindings(findings: readonly Finding[]): Finding[] {
	const deduplicated = new Map<string, Finding>();

	for (const finding of findings) {
		const key = findingTupleKey(finding);
		if (!deduplicated.has(key)) {
			deduplicated.set(key, finding);
		}
	}

	return [...deduplicated.values()].sort(compareFindings);
}

export function compareFindings(left: Finding, right: Finding): number {
	const leftTuple = findingTuple(left);
	const rightTuple = findingTuple(right);
	const length = Math.min(leftTuple.length, rightTuple.length);

	for (let index = 0; index < length; index += 1) {
		const comparison = compareCanonicalTextByUtf8(leftTuple[index], rightTuple[index]);
		if (comparison !== 0) {
			return comparison;
		}
	}

	return leftTuple.length - rightTuple.length;
}

function findingTupleKey(finding: Finding): string {
	return JSON.stringify(findingTuple(finding));
}

function findingTuple(finding: Finding): readonly string[] {
	switch (finding.kind) {
		case "unmapped_anchor":
			return [finding.kind, finding.anchor_id];
		case "stale_mapping_anchor":
			return [finding.kind, finding.anchor_id];
		case "broken_seed_path":
			return [finding.kind, finding.anchor_id, finding.seed_path];
		case "unresolved_static_edge":
			return [finding.kind, finding.importer, finding.specifier];
		case "unsupported_static_edge":
			return [finding.kind, finding.importer, finding.syntax_kind, finding.specifier];
		case "out_of_scope_static_edge":
			return [finding.kind, finding.importer, finding.target_path];
		case "unsupported_local_target":
			return [finding.kind, finding.importer, finding.target_path];
		case "untraced_product_file":
			return [finding.kind, finding.path];
	}
}
