import { type AnchorId, validateAnchorId } from "../domain/anchor-id";
import { buildArtifactBundle } from "../domain/bundle-model";
import { diffScanResults } from "../domain/diff-engine";
import { explainScanSubject } from "../domain/explain-engine";
import type { RepoPath } from "../domain/repo-path";
import { buildJUnitReportModel, buildMarkdownReportModel } from "../domain/report-model";
import {
	loadPolicyResultArtifact,
	loadScanArtifact,
	loadTraceabilityDiffArtifact,
} from "../infra/artifact-io";
import { loadBundleMetadata } from "../infra/metadata-io";
import { loadAnchormapPackageVersion } from "../package-version";
import {
	renderArtifactBundleJson,
	renderCanonicalString,
	renderExplainResultHuman,
	renderExplainResultJson,
	renderPolicyResultJson,
	renderScanResultJson,
	renderTraceabilityDiffHuman,
	renderTraceabilityDiffJson,
} from "../render/render-json";
import { renderJUnitReport } from "../render/render-junit-report";
import { renderMarkdownReport } from "../render/render-markdown-report";
import type {
	ParsedBundleArgs,
	ParsedCheckArgs,
	ParsedDiffArgs,
	ParsedExplainArgs,
	ParsedReportArgs,
} from "./command-args";
import { normalizeCliPathArg } from "./command-preconditions";
import { type AnchormapCommandResult, internalError } from "./command-result";

interface ArtifactCommandContext {
	readonly cwd: string;
	readonly diffArgs?: ParsedDiffArgs;
	readonly explainArgs?: ParsedExplainArgs;
	readonly reportArgs?: ParsedReportArgs;
	readonly bundleArgs?: ParsedBundleArgs;
}

export function validateRawCheckArgs(
	args: ParsedCheckArgs,
): { kind: "ok"; args: ParsedCheckArgs } | { kind: "usage_error"; message: string } {
	const policy = normalizeRequiredCliPath(args.policy, "--policy");
	if (policy.kind === "usage_error") {
		return policy;
	}
	const scan = args.scan === undefined ? undefined : normalizeRequiredCliPath(args.scan, "--scan");
	if (scan?.kind === "usage_error") {
		return scan;
	}

	return {
		kind: "ok",
		args: { policy: policy.path, ...(scan ? { scan: scan.path } : {}), json: args.json },
	};
}

export function validateRawDiffArgs(
	args: ParsedDiffArgs,
): { kind: "ok"; args: ParsedDiffArgs } | { kind: "usage_error"; message: string } {
	const base = normalizeRequiredCliPath(args.base, "--base");
	if (base.kind === "usage_error") {
		return base;
	}
	const head = normalizeRequiredCliPath(args.head, "--head");
	if (head.kind === "usage_error") {
		return head;
	}

	return { kind: "ok", args: { base: base.path, head: head.path, json: args.json } };
}

export function validateRawExplainArgs(
	args: ParsedExplainArgs,
): { kind: "ok"; args: ParsedExplainArgs } | { kind: "usage_error"; message: string } {
	const scan = normalizeRequiredCliPath(args.scan, "--scan");
	if (scan.kind === "usage_error") {
		return scan;
	}

	if (
		(args.anchor === undefined && args.file === undefined) ||
		(args.anchor !== undefined && args.file !== undefined)
	) {
		return { kind: "usage_error", message: "exactly one of --anchor or --file is required" };
	}

	if (args.anchor !== undefined) {
		const anchor = validateAnchorId(args.anchor);
		if (anchor.kind === "validation_failure") {
			return { kind: "usage_error", message: "--anchor must be a supported anchor ID" };
		}
		return { kind: "ok", args: { scan: scan.path, anchor: anchor.anchorId, json: args.json } };
	}

	if (args.file === undefined) {
		return { kind: "usage_error", message: "exactly one of --anchor or --file is required" };
	}

	const file = normalizeRequiredCliPath(args.file, "--file");
	if (file.kind === "usage_error") {
		return file;
	}

	return { kind: "ok", args: { scan: scan.path, file: file.path, json: args.json } };
}

export function validateRawReportArgs(
	args: ParsedReportArgs,
): { kind: "ok"; args: ParsedReportArgs } | { kind: "usage_error"; message: string } {
	if (args.format === "junit") {
		const check = normalizeRequiredCliPath(args.check, "--check");
		if (check.kind === "usage_error") {
			return check;
		}

		return {
			kind: "ok",
			args: {
				check: check.path,
				format: "junit",
			},
		};
	}

	const scan = normalizeRequiredCliPath(args.scan, "--scan");
	if (scan.kind === "usage_error") {
		return scan;
	}
	const check =
		args.check === undefined ? undefined : normalizeRequiredCliPath(args.check, "--check");
	if (check?.kind === "usage_error") {
		return check;
	}
	const diff = args.diff === undefined ? undefined : normalizeRequiredCliPath(args.diff, "--diff");
	if (diff?.kind === "usage_error") {
		return diff;
	}

	return {
		kind: "ok",
		args: {
			scan: scan.path,
			...(check ? { check: check.path } : {}),
			...(diff ? { diff: diff.path } : {}),
			format: "markdown",
		},
	};
}

export function validateRawBundleArgs(
	args: ParsedBundleArgs,
): { kind: "ok"; args: ParsedBundleArgs } | { kind: "usage_error"; message: string } {
	const scan = normalizeRequiredCliPath(args.scan, "--scan");
	if (scan.kind === "usage_error") {
		return scan;
	}
	const check = normalizeRequiredCliPath(args.check, "--check");
	if (check.kind === "usage_error") {
		return check;
	}
	const diff = normalizeRequiredCliPath(args.diff, "--diff");
	if (diff.kind === "usage_error") {
		return diff;
	}
	const metadata = normalizeRequiredCliPath(args.metadata, "--metadata");
	if (metadata.kind === "usage_error") {
		return metadata;
	}

	return {
		kind: "ok",
		args: {
			scan: scan.path,
			check: check.path,
			diff: diff.path,
			metadata: metadata.path,
			json: true,
		},
	};
}

export function runDiffCommand(context: ArtifactCommandContext): AnchormapCommandResult {
	const args = context.diffArgs;
	if (args === undefined) {
		return internalError("diff arguments were not parsed");
	}

	const base = loadScanArtifact(args.base, { cwd: context.cwd, optionName: "--base" });
	if (base.kind === "error") {
		return base.error;
	}
	const head = loadScanArtifact(args.head, { cwd: context.cwd, optionName: "--head" });
	if (head.kind === "error") {
		return head.error;
	}

	const diff = diffScanResults(base.scan, head.scan);
	return {
		kind: "success",
		stdout: args.json ? renderTraceabilityDiffJson(diff) : renderTraceabilityDiffHuman(diff),
	};
}

export function runExplainCommand(context: ArtifactCommandContext): AnchormapCommandResult {
	const args = context.explainArgs;
	if (args === undefined) {
		return internalError("explain arguments were not parsed");
	}

	const scan = loadScanArtifact(args.scan, { cwd: context.cwd, optionName: "--scan" });
	if (scan.kind === "error") {
		return scan.error;
	}

	const subject =
		args.anchor !== undefined
			? { kind: "anchor" as const, anchor_id: args.anchor as AnchorId }
			: { kind: "file" as const, path: args.file as RepoPath };
	const explanation = explainScanSubject(scan.scan, subject);
	return {
		kind: "success",
		stdout: args.json
			? renderExplainResultJson(explanation)
			: renderExplainResultHuman(explanation),
	};
}

export function runReportCommand(context: ArtifactCommandContext): AnchormapCommandResult {
	const args = context.reportArgs;
	if (args === undefined) {
		return internalError("report arguments were not parsed");
	}

	if (args.format === "junit") {
		const check = loadPolicyResultArtifact(args.check, {
			cwd: context.cwd,
			optionName: "--check",
		});
		if (check.kind === "error") {
			return check.error;
		}

		return {
			kind: "success",
			stdout: renderJUnitReport(buildJUnitReportModel({ check: check.policyResult })),
		};
	}

	const scan = loadScanArtifact(args.scan, { cwd: context.cwd, optionName: "--scan" });
	if (scan.kind === "error") {
		return scan.error;
	}

	const check =
		args.check === undefined
			? undefined
			: loadPolicyResultArtifact(args.check, { cwd: context.cwd, optionName: "--check" });
	if (check?.kind === "error") {
		return check.error;
	}

	const diff =
		args.diff === undefined
			? undefined
			: loadTraceabilityDiffArtifact(args.diff, { cwd: context.cwd, optionName: "--diff" });
	if (diff?.kind === "error") {
		return diff.error;
	}

	const model = buildMarkdownReportModel({
		scan: scan.scan,
		...(check !== undefined ? { check: check.policyResult } : {}),
		...(diff !== undefined ? { diff: diff.diff } : {}),
		renderString: renderCanonicalString,
	});
	return {
		kind: "success",
		stdout: renderMarkdownReport(model),
	};
}

export function runBundleCommand(context: ArtifactCommandContext): AnchormapCommandResult {
	const args = context.bundleArgs;
	if (args === undefined) {
		return internalError("bundle arguments were not parsed");
	}

	const scan = loadScanArtifact(args.scan, { cwd: context.cwd, optionName: "--scan" });
	if (scan.kind === "error") {
		return scan.error;
	}
	const check = loadPolicyResultArtifact(args.check, { cwd: context.cwd, optionName: "--check" });
	if (check.kind === "error") {
		return check.error;
	}
	const diff = loadTraceabilityDiffArtifact(args.diff, { cwd: context.cwd, optionName: "--diff" });
	if (diff.kind === "error") {
		return diff.error;
	}
	const metadata = loadBundleMetadata(args.metadata, {
		cwd: context.cwd,
		optionName: "--metadata",
	});
	if (metadata.kind === "error") {
		return metadata.error;
	}

	const bundle = buildArtifactBundle({
		scan: scan.scan,
		check: check.policyResult,
		diff: diff.diff,
		metadata: metadata.metadata,
		toolVersion: loadAnchormapPackageVersion(),
		canonicalArtifactBytes: {
			scan: renderScanResultJson(scan.scan),
			check: renderPolicyResultJson(check.policyResult),
			diff: renderTraceabilityDiffJson(diff.diff),
		},
	});

	return {
		kind: "success",
		stdout: renderArtifactBundleJson(bundle),
	};
}

function normalizeRequiredCliPath(
	value: string,
	optionName: string,
): { kind: "ok"; path: string } | { kind: "usage_error"; message: string } {
	const normalized = normalizeCliPathArg(value, optionName);
	if (normalized.kind === "usage_error") {
		return normalized;
	}

	return { kind: "ok", path: normalized.path };
}
