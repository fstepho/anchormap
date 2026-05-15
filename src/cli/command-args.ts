export type ScanOutputMode = "human" | "json";

export interface ParsedInitArgs {
	root: string;
	specRoots: string[];
	ignoreRoots: string[];
}

export interface ParsedMapArgs {
	anchor: string;
	seeds: string[];
	replace: boolean;
}

export interface ParsedScaffoldArgs {
	output: string;
}

export interface ParsedCheckArgs {
	policy: string;
	scan?: string;
	json: boolean;
}

export interface ParsedDiffArgs {
	base: string;
	head: string;
	json: boolean;
}

export interface ParsedExplainArgs {
	scan: string;
	anchor?: string;
	file?: string;
	json: boolean;
}

export interface ParsedReportArgs {
	scan: string;
	check?: string;
	diff?: string;
	format: "markdown";
}

export interface ParsedBundleArgs {
	scan: string;
	check: string;
	diff: string;
	metadata: string;
	json: true;
}

export type ParsedScanArgs =
	| { kind: "ok"; mode: ScanOutputMode }
	| { kind: "usage_error"; message: string };

export type ParsedInitArgsResult =
	| { kind: "ok"; args: ParsedInitArgs }
	| { kind: "usage_error"; message: string };

export type ParsedMapArgsResult =
	| { kind: "ok"; args: ParsedMapArgs }
	| { kind: "usage_error"; message: string };

export type ParsedScaffoldArgsResult =
	| { kind: "ok"; args: ParsedScaffoldArgs }
	| { kind: "usage_error"; message: string };

export type ParsedCheckArgsResult =
	| { kind: "ok"; args: ParsedCheckArgs }
	| { kind: "usage_error"; message: string };

export type ParsedDiffArgsResult =
	| { kind: "ok"; args: ParsedDiffArgs }
	| { kind: "usage_error"; message: string };

export type ParsedExplainArgsResult =
	| { kind: "ok"; args: ParsedExplainArgs }
	| { kind: "usage_error"; message: string };

export type ParsedReportArgsResult =
	| { kind: "ok"; args: ParsedReportArgs }
	| { kind: "usage_error"; message: string };

export type ParsedBundleArgsResult =
	| { kind: "ok"; args: ParsedBundleArgs }
	| { kind: "usage_error"; message: string };

type ParsedOptionValue = { kind: "ok"; value: string } | { kind: "usage_error"; message: string };

export function parseInitArgs(args: readonly string[]): ParsedInitArgsResult {
	let root: string | undefined;
	const specRoots: string[] = [];
	const ignoreRoots: string[] = [];

	for (let index = 0; index < args.length; ) {
		const option = args[index];

		switch (option) {
			case "--root": {
				if (root !== undefined) {
					return { kind: "usage_error", message: "--root may be provided at most once" };
				}

				const parsedValue = parseOptionValue(args, index, "--root");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}

				root = parsedValue.value;
				index += 2;
				break;
			}
			case "--spec-root": {
				const parsedValue = parseOptionValue(args, index, "--spec-root");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}

				specRoots.push(parsedValue.value);
				index += 2;
				break;
			}
			case "--ignore-root": {
				const parsedValue = parseOptionValue(args, index, "--ignore-root");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}

				ignoreRoots.push(parsedValue.value);
				index += 2;
				break;
			}
			default: {
				if (option.startsWith("-")) {
					return { kind: "usage_error", message: `unknown option "${option}"` };
				}

				return { kind: "usage_error", message: `unsupported argument "${option}"` };
			}
		}
	}

	if (root === undefined) {
		return { kind: "usage_error", message: "--root is required" };
	}

	if (specRoots.length === 0) {
		return { kind: "usage_error", message: "--spec-root is required" };
	}

	return {
		kind: "ok",
		args: {
			root,
			specRoots,
			ignoreRoots,
		},
	};
}

export function parseMapArgs(args: readonly string[]): ParsedMapArgsResult {
	let anchor: string | undefined;
	const seeds: string[] = [];
	let replace = false;

	for (let index = 0; index < args.length; ) {
		const option = args[index];

		switch (option) {
			case "--anchor": {
				if (anchor !== undefined) {
					return { kind: "usage_error", message: "--anchor may be provided at most once" };
				}

				const parsedValue = parseOptionValue(args, index, "--anchor");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}

				anchor = parsedValue.value;
				index += 2;
				break;
			}
			case "--seed": {
				const parsedValue = parseOptionValue(args, index, "--seed");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}

				seeds.push(parsedValue.value);
				index += 2;
				break;
			}
			case "--replace": {
				if (replace) {
					return { kind: "usage_error", message: "--replace may be provided at most once" };
				}

				const next = args[index + 1];
				if (next !== undefined && !next.startsWith("-")) {
					return { kind: "usage_error", message: "--replace does not take a value" };
				}

				replace = true;
				index += 1;
				break;
			}
			default: {
				if (option.startsWith("-")) {
					return { kind: "usage_error", message: `unknown option "${option}"` };
				}

				return { kind: "usage_error", message: `unsupported argument "${option}"` };
			}
		}
	}

	if (anchor === undefined) {
		return { kind: "usage_error", message: "--anchor is required" };
	}

	if (seeds.length === 0) {
		return { kind: "usage_error", message: "--seed is required" };
	}

	return {
		kind: "ok",
		args: {
			anchor,
			seeds,
			replace,
		},
	};
}

export function parseScanArgs(args: readonly string[]): ParsedScanArgs {
	if (args.length === 0) {
		return { kind: "ok", mode: "human" };
	}

	if (args.length === 1 && args[0] === "--json") {
		return { kind: "ok", mode: "json" };
	}

	const unknownOption = args.find((argument) => argument.startsWith("-") && argument !== "--json");
	if (unknownOption !== undefined) {
		return { kind: "usage_error", message: `unknown option "${unknownOption}"` };
	}

	return {
		kind: "usage_error",
		message: "unsupported option combination",
	};
}

export function parseScaffoldArgs(args: readonly string[]): ParsedScaffoldArgsResult {
	let output: string | undefined;

	for (let index = 0; index < args.length; ) {
		const option = args[index];

		switch (option) {
			case "--output": {
				if (output !== undefined) {
					return { kind: "usage_error", message: "--output may be provided at most once" };
				}

				const parsedValue = parseOptionValue(args, index, "--output");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}

				output = parsedValue.value;
				index += 2;
				break;
			}
			default: {
				if (option.startsWith("-")) {
					return { kind: "usage_error", message: `unknown option "${option}"` };
				}

				return { kind: "usage_error", message: `unsupported argument "${option}"` };
			}
		}
	}

	if (output === undefined) {
		return { kind: "usage_error", message: "--output is required" };
	}

	return {
		kind: "ok",
		args: {
			output,
		},
	};
}

export function parseCheckArgs(args: readonly string[]): ParsedCheckArgsResult {
	let policy: string | undefined;
	let scan: string | undefined;
	let json = false;

	for (let index = 0; index < args.length; ) {
		const option = args[index];

		switch (option) {
			case "--policy": {
				if (policy !== undefined) {
					return { kind: "usage_error", message: "--policy may be provided at most once" };
				}

				const parsedValue = parseOptionValue(args, index, "--policy");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}

				policy = parsedValue.value;
				index += 2;
				break;
			}
			case "--scan": {
				if (scan !== undefined) {
					return { kind: "usage_error", message: "--scan may be provided at most once" };
				}

				const parsedValue = parseOptionValue(args, index, "--scan");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}

				scan = parsedValue.value;
				index += 2;
				break;
			}
			case "--json": {
				if (json) {
					return { kind: "usage_error", message: "--json may be provided at most once" };
				}
				const flagValue = rejectFlagValue(args, index, "--json");
				if (flagValue.kind === "usage_error") {
					return flagValue;
				}
				json = true;
				index += 1;
				break;
			}
			default:
				return parseUnknownArgument(option);
		}
	}

	if (policy === undefined) {
		return { kind: "usage_error", message: "--policy is required" };
	}

	return { kind: "ok", args: { policy, ...(scan !== undefined ? { scan } : {}), json } };
}

export function parseDiffArgs(args: readonly string[]): ParsedDiffArgsResult {
	let base: string | undefined;
	let head: string | undefined;
	let json = false;

	for (let index = 0; index < args.length; ) {
		const option = args[index];

		switch (option) {
			case "--base": {
				if (base !== undefined) {
					return { kind: "usage_error", message: "--base may be provided at most once" };
				}
				const parsedValue = parseOptionValue(args, index, "--base");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}
				base = parsedValue.value;
				index += 2;
				break;
			}
			case "--head": {
				if (head !== undefined) {
					return { kind: "usage_error", message: "--head may be provided at most once" };
				}
				const parsedValue = parseOptionValue(args, index, "--head");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}
				head = parsedValue.value;
				index += 2;
				break;
			}
			case "--json": {
				if (json) {
					return { kind: "usage_error", message: "--json may be provided at most once" };
				}
				const flagValue = rejectFlagValue(args, index, "--json");
				if (flagValue.kind === "usage_error") {
					return flagValue;
				}
				json = true;
				index += 1;
				break;
			}
			default:
				return parseUnknownArgument(option);
		}
	}

	if (base === undefined) {
		return { kind: "usage_error", message: "--base is required" };
	}
	if (head === undefined) {
		return { kind: "usage_error", message: "--head is required" };
	}

	return { kind: "ok", args: { base, head, json } };
}

export function parseExplainArgs(args: readonly string[]): ParsedExplainArgsResult {
	let scan: string | undefined;
	let anchor: string | undefined;
	let file: string | undefined;
	let json = false;

	for (let index = 0; index < args.length; ) {
		const option = args[index];

		switch (option) {
			case "--scan": {
				if (scan !== undefined) {
					return { kind: "usage_error", message: "--scan may be provided at most once" };
				}
				const parsedValue = parseOptionValue(args, index, "--scan");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}
				scan = parsedValue.value;
				index += 2;
				break;
			}
			case "--anchor": {
				if (anchor !== undefined) {
					return { kind: "usage_error", message: "--anchor may be provided at most once" };
				}
				const parsedValue = parseOptionValue(args, index, "--anchor");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}
				anchor = parsedValue.value;
				index += 2;
				break;
			}
			case "--file": {
				if (file !== undefined) {
					return { kind: "usage_error", message: "--file may be provided at most once" };
				}
				const parsedValue = parseOptionValue(args, index, "--file");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}
				file = parsedValue.value;
				index += 2;
				break;
			}
			case "--json": {
				if (json) {
					return { kind: "usage_error", message: "--json may be provided at most once" };
				}
				const flagValue = rejectFlagValue(args, index, "--json");
				if (flagValue.kind === "usage_error") {
					return flagValue;
				}
				json = true;
				index += 1;
				break;
			}
			default:
				return parseUnknownArgument(option);
		}
	}

	if (scan === undefined) {
		return { kind: "usage_error", message: "--scan is required" };
	}
	if (
		(anchor === undefined && file === undefined) ||
		(anchor !== undefined && file !== undefined)
	) {
		return { kind: "usage_error", message: "exactly one of --anchor or --file is required" };
	}

	return {
		kind: "ok",
		args: {
			scan,
			...(anchor !== undefined ? { anchor } : {}),
			...(file !== undefined ? { file } : {}),
			json,
		},
	};
}

export function parseReportArgs(args: readonly string[]): ParsedReportArgsResult {
	let scan: string | undefined;
	let check: string | undefined;
	let diff: string | undefined;
	let format: string | undefined;

	for (let index = 0; index < args.length; ) {
		const option = args[index];

		switch (option) {
			case "--scan": {
				if (scan !== undefined) {
					return { kind: "usage_error", message: "--scan may be provided at most once" };
				}
				const parsedValue = parseOptionValue(args, index, "--scan");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}
				scan = parsedValue.value;
				index += 2;
				break;
			}
			case "--check": {
				if (check !== undefined) {
					return { kind: "usage_error", message: "--check may be provided at most once" };
				}
				const parsedValue = parseOptionValue(args, index, "--check");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}
				check = parsedValue.value;
				index += 2;
				break;
			}
			case "--diff": {
				if (diff !== undefined) {
					return { kind: "usage_error", message: "--diff may be provided at most once" };
				}
				const parsedValue = parseOptionValue(args, index, "--diff");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}
				diff = parsedValue.value;
				index += 2;
				break;
			}
			case "--format": {
				if (format !== undefined) {
					return { kind: "usage_error", message: "--format may be provided at most once" };
				}
				const parsedValue = parseOptionValue(args, index, "--format");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}
				format = parsedValue.value;
				index += 2;
				break;
			}
			default:
				return parseUnknownArgument(option);
		}
	}

	if (scan === undefined) {
		return { kind: "usage_error", message: "--scan is required" };
	}
	if (format === undefined) {
		return { kind: "usage_error", message: "--format is required" };
	}
	if (format !== "markdown") {
		return { kind: "usage_error", message: "--format must be markdown" };
	}

	return {
		kind: "ok",
		args: {
			scan,
			...(check !== undefined ? { check } : {}),
			...(diff !== undefined ? { diff } : {}),
			format,
		},
	};
}

export function parseBundleArgs(args: readonly string[]): ParsedBundleArgsResult {
	let scan: string | undefined;
	let check: string | undefined;
	let diff: string | undefined;
	let metadata: string | undefined;
	let json = false;

	for (let index = 0; index < args.length; ) {
		const option = args[index];

		switch (option) {
			case "--scan": {
				if (scan !== undefined) {
					return { kind: "usage_error", message: "--scan may be provided at most once" };
				}
				const parsedValue = parseOptionValue(args, index, "--scan");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}
				scan = parsedValue.value;
				index += 2;
				break;
			}
			case "--check": {
				if (check !== undefined) {
					return { kind: "usage_error", message: "--check may be provided at most once" };
				}
				const parsedValue = parseOptionValue(args, index, "--check");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}
				check = parsedValue.value;
				index += 2;
				break;
			}
			case "--diff": {
				if (diff !== undefined) {
					return { kind: "usage_error", message: "--diff may be provided at most once" };
				}
				const parsedValue = parseOptionValue(args, index, "--diff");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}
				diff = parsedValue.value;
				index += 2;
				break;
			}
			case "--metadata": {
				if (metadata !== undefined) {
					return { kind: "usage_error", message: "--metadata may be provided at most once" };
				}
				const parsedValue = parseOptionValue(args, index, "--metadata");
				if (parsedValue.kind === "usage_error") {
					return parsedValue;
				}
				metadata = parsedValue.value;
				index += 2;
				break;
			}
			case "--json": {
				if (json) {
					return { kind: "usage_error", message: "--json may be provided at most once" };
				}
				const flagValue = rejectFlagValue(args, index, "--json");
				if (flagValue.kind === "usage_error") {
					return flagValue;
				}
				json = true;
				index += 1;
				break;
			}
			default:
				return parseUnknownArgument(option);
		}
	}

	if (scan === undefined) {
		return { kind: "usage_error", message: "--scan is required" };
	}
	if (check === undefined) {
		return { kind: "usage_error", message: "--check is required" };
	}
	if (diff === undefined) {
		return { kind: "usage_error", message: "--diff is required" };
	}
	if (metadata === undefined) {
		return { kind: "usage_error", message: "--metadata is required" };
	}
	if (!json) {
		return { kind: "usage_error", message: "--json is required" };
	}

	return { kind: "ok", args: { scan, check, diff, metadata, json: true } };
}

function parseOptionValue(
	args: readonly string[],
	optionIndex: number,
	optionName: string,
): ParsedOptionValue {
	const value = args[optionIndex + 1];
	if (value === undefined || value.startsWith("-")) {
		return { kind: "usage_error", message: `${optionName} requires a value` };
	}

	return { kind: "ok", value };
}

function rejectFlagValue(
	args: readonly string[],
	optionIndex: number,
	optionName: string,
): ParsedOptionValue {
	const next = args[optionIndex + 1];
	if (next !== undefined && !next.startsWith("-")) {
		return { kind: "usage_error", message: `${optionName} does not take a value` };
	}

	return { kind: "ok", value: "" };
}

function parseUnknownArgument(argument: string): { kind: "usage_error"; message: string } {
	if (argument.startsWith("-")) {
		return { kind: "usage_error", message: `unknown option "${argument}"` };
	}

	return { kind: "usage_error", message: `unsupported argument "${argument}"` };
}
