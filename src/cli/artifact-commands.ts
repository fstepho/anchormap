import { type AnchorId, validateAnchorId } from "../domain/anchor-id";
import { diffScanResults } from "../domain/diff-engine";
import { explainScanSubject } from "../domain/explain-engine";
import type { RepoPath } from "../domain/repo-path";
import { loadScanArtifact } from "../infra/artifact-io";
import {
	renderExplainResultHuman,
	renderExplainResultJson,
	renderTraceabilityDiffHuman,
	renderTraceabilityDiffJson,
} from "../render/render-json";
import type {
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

export function runReportCommandStub(context: ArtifactCommandContext): AnchormapCommandResult {
	const args = context.reportArgs;
	if (args === undefined) {
		return internalError("report arguments were not parsed");
	}

	const scan = loadScanArtifact(args.scan, { cwd: context.cwd, optionName: "--scan" });
	if (scan.kind === "error") {
		return scan.error;
	}

	return internalError("Markdown report rendering is not implemented");
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
