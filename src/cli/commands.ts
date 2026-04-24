export type AnchormapCommandName = "init" | "map" | "scan";
export type ScanOutputMode = "human" | "json";

export interface TextWriter {
	write(chunk: string): unknown;
}

export interface AnchormapCommandContext {
	args: readonly string[];
	stdout: TextWriter;
	stderr: TextWriter;
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
