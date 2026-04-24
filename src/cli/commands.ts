export type AnchormapCommandName = "init" | "map" | "scan";
export type ScanOutputMode = "human" | "json";

export interface ParsedInitArgs {
	root: string;
	specRoots: string[];
	ignoreRoots: string[];
}

export interface TextWriter {
	write(chunk: string): unknown;
}

export interface AnchormapCommandContext {
	args: readonly string[];
	stdout: TextWriter;
	stderr: TextWriter;
	initArgs?: ParsedInitArgs;
	scanMode?: ScanOutputMode;
}

export type AnchormapCommandHandlers = {
	[command in AnchormapCommandName]: (context: AnchormapCommandContext) => number;
};

export interface AnchormapRunOptions {
	stdout?: TextWriter;
	stderr?: TextWriter;
	handlers?: AnchormapCommandHandlers;
}

const SUPPORTED_COMMANDS = new Set<AnchormapCommandName>(["init", "map", "scan"]);

const DEFAULT_HANDLERS: AnchormapCommandHandlers = {
	init: createNotImplementedHandler("init"),
	map: createNotImplementedHandler("map"),
	scan: createNotImplementedHandler("scan"),
};

export function runAnchormap(argv: readonly string[], options: AnchormapRunOptions = {}): number {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	const handlers = options.handlers ?? DEFAULT_HANDLERS;
	const [command, ...args] = argv;

	if (command === undefined) {
		stderr.write("anchormap: missing command\n");
		return 4;
	}

	if (!isSupportedCommand(command)) {
		stderr.write(`anchormap: unknown command "${command}"\n`);
		return 4;
	}

	if (command === "scan") {
		const parsedScan = parseScanArgs(args);
		if (parsedScan.kind === "usage_error") {
			stderr.write(`anchormap scan: ${parsedScan.message}\n`);
			return 4;
		}

		return handlers.scan({
			args,
			stdout,
			stderr,
			scanMode: parsedScan.mode,
		});
	}

	if (command === "init") {
		const parsedInit = parseInitArgs(args);
		if (parsedInit.kind === "usage_error") {
			stderr.write(`anchormap init: ${parsedInit.message}\n`);
			return 4;
		}

		return handlers.init({
			args,
			stdout,
			stderr,
			initArgs: parsedInit.args,
		});
	}

	return handlers[command]({
		args,
		stdout,
		stderr,
	});
}

function isSupportedCommand(command: string): command is AnchormapCommandName {
	return SUPPORTED_COMMANDS.has(command as AnchormapCommandName);
}

type ParsedScanArgs =
	| { kind: "ok"; mode: ScanOutputMode }
	| { kind: "usage_error"; message: string };

type ParsedInitArgsResult =
	| { kind: "ok"; args: ParsedInitArgs }
	| { kind: "usage_error"; message: string };

function parseInitArgs(args: readonly string[]): ParsedInitArgsResult {
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

type ParsedOptionValue = { kind: "ok"; value: string } | { kind: "usage_error"; message: string };

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

function parseScanArgs(args: readonly string[]): ParsedScanArgs {
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

function createNotImplementedHandler(
	command: AnchormapCommandName,
): (context: AnchormapCommandContext) => number {
	return ({ stderr }) => {
		stderr.write(`anchormap ${command} is not implemented yet\n`);
		return 1;
	};
}
