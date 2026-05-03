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
