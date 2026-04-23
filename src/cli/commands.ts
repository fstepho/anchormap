export type AnchormapCommandName = "init" | "map" | "scan";

export interface TextWriter {
	write(chunk: string): unknown;
}

export interface AnchormapCommandContext {
	args: readonly string[];
	stdout: TextWriter;
	stderr: TextWriter;
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

	return handlers[command]({
		args,
		stdout,
		stderr,
	});
}

function isSupportedCommand(command: string): command is AnchormapCommandName {
	return SUPPORTED_COMMANDS.has(command as AnchormapCommandName);
}

function createNotImplementedHandler(
	command: AnchormapCommandName,
): (context: AnchormapCommandContext) => number {
	return ({ stderr }) => {
		stderr.write(`anchormap ${command} is not implemented yet\n`);
		return 1;
	};
}
