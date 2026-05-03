import { existsSync, lstatSync, readFileSync } from "node:fs";
import { basename, dirname, posix, resolve } from "node:path";

export const FIXTURE_MANIFEST_FILENAME = "manifest.json";
export const FIXTURE_REPO_DIRNAME = "repo";
export const FIXTURE_EXPECTED_REPO_DIRNAME = "expected/repo";
export const FIXTURE_STDOUT_GOLDEN_FILENAME = "stdout.golden";

const MIN_EXIT_CODE = 0;
const MAX_EXIT_CODE = 4;

const TOP_LEVEL_KEYS = new Set([
	"id",
	"family",
	"purpose",
	"command",
	"cwd",
	"exit_code",
	"stdout",
	"stderr",
	"filesystem",
	"tags",
	"groups",
	"fault_injection",
]);

const STABLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/;
const FAMILY_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const SUPPORTED_SUBCOMMANDS = new Set(["init", "map", "scan", "scaffold"]);
const MISSING_SUBCOMMAND = "<missing>";
const UNSUPPORTED_WRAPPER_LAUNCHERS = new Set([
	"npm",
	"npx",
	"pnpm",
	"yarn",
	"bun",
	"bunx",
	"corepack",
	"sh",
	"bash",
	"zsh",
	"env",
]);

export type StdoutOracle =
	| { kind: "ignored" }
	| { kind: "empty" }
	| { kind: "exact"; value: string }
	| { kind: "golden" };

export type StderrOracle =
	| { kind: "ignored" }
	| { kind: "empty" }
	| { kind: "contains"; value: string }
	| { kind: "pattern"; value: string };

export type FilesystemOracle =
	| { kind: "no_mutation" }
	| { kind: "expected_files"; files: string[] };

export interface FaultInjectionMarker {
	marker: string;
}

export interface FixtureManifest {
	id: string;
	family: string;
	purpose: string;
	command: string[];
	cwd: string;
	exit_code: number;
	stdout: StdoutOracle;
	stderr: StderrOracle;
	filesystem: FilesystemOracle;
	tags?: string[];
	groups?: string[];
	fault_injection?: FaultInjectionMarker;
}

export interface FixtureLayout {
	fixtureDir: string;
	familyDir: string;
	manifestPath: string;
	repoDir: string;
	expectedRepoDir: string;
	stdoutGoldenPath: string;
}

export interface LoadedFixtureManifest {
	layout: FixtureLayout;
	manifest: FixtureManifest;
}

interface ValidationContext {
	manifestPath?: string;
	fixtureId?: string;
}

export class FixtureManifestValidationError extends Error {
	readonly manifestPath?: string;
	readonly fixtureId?: string;

	constructor(message: string, context: ValidationContext = {}) {
		super(message);
		this.name = "FixtureManifestValidationError";
		this.manifestPath = context.manifestPath;
		this.fixtureId = context.fixtureId;
	}
}

export function resolveFixtureLayout(fixtureDir: string): FixtureLayout {
	const absoluteFixtureDir = resolve(fixtureDir);

	return {
		fixtureDir: absoluteFixtureDir,
		familyDir: dirname(absoluteFixtureDir),
		manifestPath: resolve(absoluteFixtureDir, FIXTURE_MANIFEST_FILENAME),
		repoDir: resolve(absoluteFixtureDir, FIXTURE_REPO_DIRNAME),
		expectedRepoDir: resolve(absoluteFixtureDir, FIXTURE_EXPECTED_REPO_DIRNAME),
		stdoutGoldenPath: resolve(absoluteFixtureDir, FIXTURE_STDOUT_GOLDEN_FILENAME),
	};
}

export function loadFixtureManifest(fixtureDir: string): LoadedFixtureManifest {
	const layout = resolveFixtureLayout(fixtureDir);
	const fixtureId = basename(layout.fixtureDir);
	let manifestSource: string;
	try {
		manifestSource = readFileSync(layout.manifestPath, "utf8");
	} catch (error) {
		const reason = error instanceof Error ? error.message : "unknown manifest read failure";
		fail(`unable to read manifest: ${reason}`, {
			manifestPath: layout.manifestPath,
			fixtureId,
		});
	}

	let parsedManifest: unknown;
	try {
		parsedManifest = JSON.parse(manifestSource);
	} catch (error) {
		const reason = error instanceof Error ? error.message : "unknown JSON parse failure";
		fail(`manifest is not valid JSON: ${reason}`, {
			manifestPath: layout.manifestPath,
			fixtureId,
		});
	}

	const manifest = validateFixtureManifest(parsedManifest, {
		manifestPath: layout.manifestPath,
		fixtureId,
	});

	validateFixtureDirectoryContract(layout, manifest);

	return {
		layout,
		manifest,
	};
}

export function validateFixtureManifest(
	rawManifest: unknown,
	context: ValidationContext = {},
): FixtureManifest {
	const manifest = requireObject(rawManifest, "manifest", context);
	const fixtureId =
		typeof manifest.id === "string" && manifest.id.length > 0 ? manifest.id : context.fixtureId;
	const manifestContext = { ...context, fixtureId };

	assertOnlyKeys(manifest, TOP_LEVEL_KEYS, "top-level", manifestContext);

	for (const key of TOP_LEVEL_KEYS) {
		if (key === "tags" || key === "groups" || key === "fault_injection") {
			continue;
		}
		if (!(key in manifest)) {
			fail(`missing required key "${key}"`, manifestContext);
		}
	}

	const id = requireStableId(manifest.id, "id", STABLE_ID_PATTERN, manifestContext);
	const family = requireStableId(manifest.family, "family", FAMILY_PATTERN, manifestContext);
	const purpose = requireNonEmptyString(manifest.purpose, "purpose", manifestContext);
	const command = requireCommand(manifest.command, manifestContext);
	const cwd = requireRelativePosixPath(manifest.cwd, "cwd", manifestContext, {
		allowDot: true,
	});
	const exitCode = requireExitCode(manifest.exit_code, manifestContext);
	const stdout = requireStdoutOracle(manifest.stdout, manifestContext);
	const stderr = requireStderrOracle(manifest.stderr, manifestContext);
	const filesystem = requireFilesystemOracle(manifest.filesystem, manifestContext);
	const tags = requireOptionalStableList(manifest.tags, "tags", STABLE_ID_PATTERN, manifestContext);
	const groups = requireOptionalStableList(
		manifest.groups,
		"groups",
		STABLE_ID_PATTERN,
		manifestContext,
	);
	const faultInjection = requireFaultInjectionMarker(manifest.fault_injection, manifestContext);

	const validatedManifest: FixtureManifest = {
		id,
		family,
		purpose,
		command,
		cwd,
		exit_code: exitCode,
		stdout,
		stderr,
		filesystem,
		...(tags ? { tags } : {}),
		...(groups ? { groups } : {}),
		...(faultInjection ? { fault_injection: faultInjection } : {}),
	};

	validateManifestSemantics(validatedManifest, manifestContext);

	return validatedManifest;
}

function validateFixtureDirectoryContract(layout: FixtureLayout, manifest: FixtureManifest): void {
	if (basename(layout.fixtureDir) !== manifest.id) {
		fail(`fixture directory basename must match manifest id "${manifest.id}"`, {
			manifestPath: layout.manifestPath,
			fixtureId: manifest.id,
		});
	}

	if (basename(layout.familyDir) !== manifest.family) {
		fail(`fixture family directory basename must match manifest family "${manifest.family}"`, {
			manifestPath: layout.manifestPath,
			fixtureId: manifest.id,
		});
	}

	validateFixtureArtifacts(layout, manifest);
}

function requireObject(
	value: unknown,
	label: string,
	context: ValidationContext,
): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		fail(`${label} must be an object`, context);
	}

	return value as Record<string, unknown>;
}

function requireStableId(
	value: unknown,
	label: string,
	pattern: RegExp,
	context: ValidationContext,
): string {
	const parsed = requireNonEmptyString(value, label, context);

	if (!pattern.test(parsed)) {
		fail(`${label} must match ${pattern.toString()} and remain a stable identifier`, context);
	}

	return parsed;
}

function requireNonEmptyString(value: unknown, label: string, context: ValidationContext): string {
	if (typeof value !== "string" || value.length === 0) {
		fail(`${label} must be a non-empty string`, context);
	}

	return value;
}

function requireCommand(value: unknown, context: ValidationContext): string[] {
	if (!Array.isArray(value) || value.length === 0) {
		fail("command must be a non-empty array of strings", context);
	}

	return value.map((entry, index) => requireNonEmptyString(entry, `command[${index}]`, context));
}

function requireExitCode(value: unknown, context: ValidationContext): number {
	if (
		typeof value !== "number" ||
		!Number.isInteger(value) ||
		value < MIN_EXIT_CODE ||
		value > MAX_EXIT_CODE
	) {
		fail(
			`exit_code must be an integer in the contract range ${MIN_EXIT_CODE}..${MAX_EXIT_CODE}`,
			context,
		);
	}

	return value;
}

function validateManifestSemantics(manifest: FixtureManifest, context: ValidationContext): void {
	const subcommand = detectSubcommand(manifest.command, context);

	if (subcommand === undefined || subcommand === MISSING_SUBCOMMAND) {
		validateUsageErrorCommandSemantics(manifest, context);
		return;
	}

	if (subcommand === "scan" && hasImmediateScanJsonFlag(manifest.command)) {
		validateScanJsonSemantics(manifest, context);
		return;
	}

	if (subcommand === "scan") {
		validateHumanScanSemantics(manifest, context);
		return;
	}

	if (subcommand === "init" || subcommand === "map" || subcommand === "scaffold") {
		validateHumanWriteCommandSemantics(manifest, context);
	}
}

function hasImmediateScanJsonFlag(command: string[]): boolean {
	const scanArgIndex = command[0] === "node" ? 3 : 2;
	return command[scanArgIndex] === "--json";
}

function validateFixtureArtifacts(layout: FixtureLayout, manifest: FixtureManifest): void {
	const context = {
		manifestPath: layout.manifestPath,
		fixtureId: manifest.id,
	};

	assertExistingDirectory(layout.repoDir, FIXTURE_REPO_DIRNAME, context);

	if (manifest.stdout.kind === "golden") {
		assertExistingRegularFile(
			layout.stdoutGoldenPath,
			FIXTURE_STDOUT_GOLDEN_FILENAME,
			'stdout.kind "golden" requires companion artifact',
			context,
		);
	}

	if (manifest.filesystem.kind !== "expected_files") {
		return;
	}

	assertExistingDirectory(layout.expectedRepoDir, FIXTURE_EXPECTED_REPO_DIRNAME, context);

	for (const file of manifest.filesystem.files) {
		assertExistingRegularFile(
			resolve(layout.expectedRepoDir, file),
			`${FIXTURE_EXPECTED_REPO_DIRNAME}/${file}`,
			'filesystem.kind "expected_files" requires declared artifact',
			context,
		);
	}
}

function validateScanJsonSemantics(manifest: FixtureManifest, context: ValidationContext): void {
	if (manifest.exit_code === 0) {
		if (manifest.stdout.kind !== "golden") {
			fail('scan --json success fixtures must use stdout.kind "golden"', context);
		}

		if (manifest.stderr.kind !== "empty") {
			fail('scan --json success fixtures must use stderr.kind "empty"', context);
		}

		if (manifest.filesystem.kind !== "no_mutation") {
			fail('scan --json success fixtures must use filesystem.kind "no_mutation"', context);
		}

		return;
	}

	if (manifest.stdout.kind !== "empty") {
		fail('scan --json failure fixtures must use stdout.kind "empty"', context);
	}

	if (manifest.stderr.kind !== "ignored" && manifest.stderr.kind !== "empty") {
		fail('scan --json failure fixtures may only use stderr.kind "ignored" or "empty"', context);
	}

	if (manifest.filesystem.kind !== "no_mutation") {
		fail('scan --json failure fixtures must use filesystem.kind "no_mutation"', context);
	}
}

function validateHumanScanSemantics(manifest: FixtureManifest, context: ValidationContext): void {
	if (manifest.stdout.kind !== "ignored") {
		fail('scan fixtures without --json must use stdout.kind "ignored"', context);
	}

	if (manifest.stderr.kind !== "ignored" && manifest.stderr.kind !== "empty") {
		fail('scan fixtures without --json may only use stderr.kind "ignored" or "empty"', context);
	}

	if (manifest.filesystem.kind !== "no_mutation") {
		fail('scan fixtures without --json must use filesystem.kind "no_mutation"', context);
	}
}

function validateHumanWriteCommandSemantics(
	manifest: FixtureManifest,
	context: ValidationContext,
): void {
	if (manifest.stdout.kind !== "ignored") {
		fail(
			'init/map/scaffold fixtures must not oracle human stdout and must use stdout.kind "ignored"',
			context,
		);
	}

	if (manifest.stderr.kind !== "ignored" && manifest.stderr.kind !== "empty") {
		fail(
			'init/map/scaffold fixtures must not oracle human stderr and may only use stderr.kind "ignored" or "empty"',
			context,
		);
	}

	if (manifest.exit_code === 0) {
		if (manifest.filesystem.kind !== "expected_files") {
			fail('init/map/scaffold success fixtures must use filesystem.kind "expected_files"', context);
		}

		return;
	}

	if (manifest.filesystem.kind !== "no_mutation") {
		fail('init/map/scaffold failure fixtures must use filesystem.kind "no_mutation"', context);
	}
}

function validateUsageErrorCommandSemantics(
	manifest: FixtureManifest,
	context: ValidationContext,
): void {
	if (manifest.exit_code !== 4) {
		fail("unknown or missing command fixtures must expect exit_code 4", context);
	}

	if (manifest.stdout.kind !== "empty") {
		fail('unknown or missing command fixtures must use stdout.kind "empty"', context);
	}

	if (manifest.stderr.kind !== "ignored" && manifest.stderr.kind !== "empty") {
		fail(
			'unknown or missing command fixtures may only use stderr.kind "ignored" or "empty"',
			context,
		);
	}

	if (manifest.filesystem.kind !== "no_mutation") {
		fail('unknown or missing command fixtures must use filesystem.kind "no_mutation"', context);
	}
}

function assertExistingDirectory(path: string, label: string, context: ValidationContext): void {
	if (!existsSync(path)) {
		fail(`fixture directory must contain companion directory "${label}"`, context);
	}

	const stats = lstatSync(path);
	if (stats.isSymbolicLink()) {
		fail(`fixture artifact "${label}" must not be a symlink`, context);
	}

	if (!stats.isDirectory()) {
		fail(`fixture artifact "${label}" must be a directory`, context);
	}
}

function assertExistingRegularFile(
	path: string,
	label: string,
	prefix: string,
	context: ValidationContext,
): void {
	if (!existsSync(path)) {
		fail(`${prefix} "${label}"`, context);
	}

	const stats = lstatSync(path);
	if (stats.isSymbolicLink()) {
		fail(`fixture artifact "${label}" must not be a symlink`, context);
	}

	if (!stats.isFile()) {
		fail(`fixture artifact "${label}" must be a regular file`, context);
	}
}

function detectSubcommand(
	command: string[],
	context: ValidationContext,
): "init" | "map" | "scan" | "scaffold" | typeof MISSING_SUBCOMMAND | undefined {
	if (command[0] === "node") {
		if (command.length < 2) {
			fail('command using "node" must be ["node", "<script>", "<subcommand>", ...]', context);
		}

		if (command[1].startsWith("-")) {
			fail(
				'command using "node" must place the CLI script path in argv[1] and the subcommand in argv[2]',
				context,
			);
		}

		if (command.length === 2) {
			return MISSING_SUBCOMMAND;
		}

		const candidate = command[2];
		if (!SUPPORTED_SUBCOMMANDS.has(candidate)) {
			return undefined;
		}

		return candidate as "init" | "map" | "scan" | "scaffold";
	}

	if (UNSUPPORTED_WRAPPER_LAUNCHERS.has(command[0])) {
		fail(`command must use a direct CLI launcher, not wrapper launcher "${command[0]}"`, context);
	}

	if (command.length < 2) {
		return MISSING_SUBCOMMAND;
	}

	const candidate = command[1];
	if (!SUPPORTED_SUBCOMMANDS.has(candidate)) {
		return undefined;
	}

	return candidate as "init" | "map" | "scan" | "scaffold";
}

function requireStdoutOracle(value: unknown, context: ValidationContext): StdoutOracle {
	const stdout = requireObject(value, "stdout", context);
	const kind = requireNonEmptyString(stdout.kind, "stdout.kind", context);

	switch (kind) {
		case "ignored":
			assertOnlyKeys(stdout, new Set(["kind"]), "stdout", context);
			return { kind: "ignored" };
		case "empty":
			assertOnlyKeys(stdout, new Set(["kind"]), "stdout", context);
			return { kind: "empty" };
		case "golden":
			assertOnlyKeys(stdout, new Set(["kind"]), "stdout", context);
			return { kind: "golden" };
		case "exact":
			assertOnlyKeys(stdout, new Set(["kind", "value"]), "stdout", context);
			return {
				kind: "exact",
				value: requireNonEmptyString(stdout.value, "stdout.value", context),
			};
		default:
			fail(`unsupported stdout oracle "${kind}"`, context);
	}
}

function requireStderrOracle(value: unknown, context: ValidationContext): StderrOracle {
	const stderr = requireObject(value, "stderr", context);
	const kind = requireNonEmptyString(stderr.kind, "stderr.kind", context);

	switch (kind) {
		case "ignored":
			assertOnlyKeys(stderr, new Set(["kind"]), "stderr", context);
			return { kind: "ignored" };
		case "empty":
			assertOnlyKeys(stderr, new Set(["kind"]), "stderr", context);
			return { kind: "empty" };
		case "contains":
			assertOnlyKeys(stderr, new Set(["kind", "value"]), "stderr", context);
			return {
				kind: "contains",
				value: requireNonEmptyString(stderr.value, "stderr.value", context),
			};
		case "pattern":
			assertOnlyKeys(stderr, new Set(["kind", "value"]), "stderr", context);
			return {
				kind: "pattern",
				value: requireNonEmptyString(stderr.value, "stderr.value", context),
			};
		default:
			fail(`unsupported stderr oracle "${kind}"`, context);
	}
}

function requireFilesystemOracle(value: unknown, context: ValidationContext): FilesystemOracle {
	const filesystem = requireObject(value, "filesystem", context);
	const kind = requireNonEmptyString(filesystem.kind, "filesystem.kind", context);

	switch (kind) {
		case "no_mutation":
			assertOnlyKeys(filesystem, new Set(["kind"]), "filesystem", context);
			return { kind: "no_mutation" };
		case "expected_files":
			assertOnlyKeys(filesystem, new Set(["kind", "files"]), "filesystem", context);
			return {
				kind: "expected_files",
				files: requireRelativePathList(filesystem.files, "filesystem.files", context),
			};
		default:
			fail(`unsupported filesystem oracle "${kind}"`, context);
	}
}

function requireRelativePathList(
	value: unknown,
	label: string,
	context: ValidationContext,
): string[] {
	if (!Array.isArray(value) || value.length === 0) {
		fail(`${label} must be a non-empty array of POSIX relative paths`, context);
	}

	const unique = new Set<string>();
	const paths = value.map((entry, index) =>
		requireRelativePosixPath(entry, `${label}[${index}]`, context, {
			allowDot: false,
		}),
	);

	for (const pathValue of paths) {
		if (unique.has(pathValue)) {
			fail(`${label} must not contain duplicates`, context);
		}
		unique.add(pathValue);
	}

	return paths;
}

function requireOptionalStableList(
	value: unknown,
	label: string,
	pattern: RegExp,
	context: ValidationContext,
): string[] | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (!Array.isArray(value) || value.length === 0) {
		fail(`${label} must be a non-empty array when provided`, context);
	}

	const unique = new Set<string>();
	const items = value.map((entry, index) =>
		requireStableId(entry, `${label}[${index}]`, pattern, context),
	);

	for (const item of items) {
		if (unique.has(item)) {
			fail(`${label} must not contain duplicates`, context);
		}
		unique.add(item);
	}

	return items;
}

function requireFaultInjectionMarker(
	value: unknown,
	context: ValidationContext,
): FaultInjectionMarker | undefined {
	if (value === undefined) {
		return undefined;
	}

	const faultInjection = requireObject(value, "fault_injection", context);
	assertOnlyKeys(faultInjection, new Set(["marker"]), "fault_injection", context);

	return {
		marker: requireStableId(
			faultInjection.marker,
			"fault_injection.marker",
			STABLE_ID_PATTERN,
			context,
		),
	};
}

function requireRelativePosixPath(
	value: unknown,
	label: string,
	context: ValidationContext,
	options: { allowDot: boolean },
): string {
	const parsed = requireNonEmptyString(value, label, context);

	if (parsed.includes("\\")) {
		fail(`${label} must use POSIX separators`, context);
	}

	if (parsed.startsWith("/")) {
		fail(`${label} must be relative to the fixture repo`, context);
	}

	const normalized = posix.normalize(parsed);
	if (normalized !== parsed) {
		fail(`${label} must already be a normalized POSIX path`, context);
	}

	if (normalized === ".") {
		if (options.allowDot) {
			return normalized;
		}
		fail(`${label} must not resolve to "."`, context);
	}

	if (normalized === ".." || normalized.startsWith("../")) {
		fail(`${label} must stay inside the fixture repo`, context);
	}

	return normalized;
}

function assertOnlyKeys(
	record: Record<string, unknown>,
	allowedKeys: ReadonlySet<string>,
	label: string,
	context: ValidationContext,
): void {
	for (const key of Object.keys(record)) {
		if (!allowedKeys.has(key)) {
			fail(`unknown ${label} key "${key}"`, context);
		}
	}
}

function fail(detail: string, context: ValidationContext): never {
	const location = context.manifestPath ? ` at ${context.manifestPath}` : "";
	const fixture = context.fixtureId ? ` [fixture ${context.fixtureId}]` : "";

	throw new FixtureManifestValidationError(
		`Invalid fixture manifest${location}${fixture}: ${detail}`,
		context,
	);
}
