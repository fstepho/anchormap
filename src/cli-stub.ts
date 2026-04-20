import { existsSync } from "node:fs";
import { resolve } from "node:path";

const STUB_SCAN_JSON_SUCCESS = '{"ok":true}\n';

export interface CliStubOptions {
	cwd?: string;
	stdout?: { write(chunk: string): unknown };
	stderr?: { write(chunk: string): unknown };
}

export function runCliStub(argv: readonly string[], options: CliStubOptions = {}): number {
	const cwd = options.cwd ?? process.cwd();
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;

	const [command, ...args] = argv;

	switch (command) {
		case "scan":
			return runScanStub(args, cwd, stdout, stderr);
		case "init":
		case "map":
			return 0;
		default:
			stderr.write(`stub unsupported command: ${command ?? "<none>"}\n`);
			return 4;
	}
}

function runScanStub(
	args: readonly string[],
	cwd: string,
	stdout: { write(chunk: string): unknown },
	stderr: { write(chunk: string): unknown },
): number {
	if (args[0] === "--json") {
		if (existsSync(resolve(cwd, "specs", "example.md"))) {
			stdout.write(STUB_SCAN_JSON_SUCCESS);
			return 0;
		}

		stderr.write("stub scan fixture missing specs/example.md\n");
		return 2;
	}

	stdout.write("stub scan\n");
	return 0;
}

if (require.main === module) {
	process.exitCode = runCliStub(process.argv.slice(2));
}
