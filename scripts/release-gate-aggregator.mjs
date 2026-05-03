import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	BenchmarkReportValidationError,
	validateBenchmarkReportObject,
} from "./validate-release-benchmark-report.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultEvidenceDir = join("reports", "t9.6", "evidence");
const defaultOutDir = join("reports", "t9.6");
const optionalEvidenceMissing = Symbol("optionalEvidenceMissing");
const requiredBFamilies = [
	"B-cli",
	"B-config",
	"B-decodage",
	"B-graph",
	"B-init",
	"B-map",
	"B-repo",
	"B-scan",
	"B-specs",
];
const priorityFixtureIds = [
	"fx72_cli_priority_4_over_2",
	"fx73_cli_priority_2_over_3",
	"fx74_cli_priority_3_over_1",
	"fx75_cli_internal_error_code_1",
];
const cliSurfaceFixtureIds = [
	"fx68_cli_unknown_command",
	"fx69_cli_unknown_option",
	"fx70_cli_invalid_option_combination",
	"fx71_cli_scan_option_order_invariant",
	"fx76_cli_write_failure_code_1",
];
const scanHumanFixtureIds = [
	"fx71a_cli_scan_human_success",
	"fx71b_cli_scan_human_config_error_code2",
	"fx71c_cli_scan_human_repo_error_code3",
	"fx71d_cli_scan_human_invalid_args_code4",
	"fx71e_cli_scan_human_internal_error_code1",
];
const requiredExitCodes = [0, 1, 2, 3, 4];
const requiredMetamorphicCases = [
	"C1",
	"C2",
	"C3",
	"C4",
	"C5",
	"C6",
	"C7",
	"C8",
	"C9",
	"C10",
	"C11",
	"C12",
];
const requiredPlatforms = [
	{ key: "darwin:arm64", platform: "darwin", archAliases: ["arm64"], label: "macOS arm64" },
	{ key: "linux:x64", platform: "linux", archAliases: ["x64", "x86_64"], label: "Linux x86_64" },
];
const artifactInputs = [
	["fixture_report", "fixture-report.json", "fixtureReport"],
	["golden_report", "golden-report.json", "goldenReport"],
	["metamorphic_report", "metamorphic-report.json", "metamorphicReport"],
	["cross_platform_report", "cross-platform-report.json", "crossPlatformReport"],
	["performance_report", "performance-report.json", "performanceReport"],
	["dependency_audit", "dependency-audit.json", "dependencyAudit"],
	["golden_diffs", "golden-diffs.json", "goldenDiffs"],
	["consumer_lockback", "consumer-lockback.json", "consumerLockback"],
	["t10_5_tarball_artifact", "t10.5-tarball-artifact.json", "t10_5TarballArtifact"],
	["t10_5_publication_dry_run", "t10.5-publication-dry-run.json", "t10_5PublicationDryRun"],
	["t10_6_publication_evidence", "t10.6-publication-evidence.json", "t10_6PublicationEvidence"],
	[
		"entropy_review",
		"entropy-review.json",
		"entropyReview",
		join("reports", "t9.7", "entropy-review.json"),
	],
];
const postM9PublicationArtifactNames = new Set([
	"consumer_lockback",
	"t10_5_tarball_artifact",
	"t10_5_publication_dry_run",
	"t10_6_publication_evidence",
]);
const expectedPackageName = "anchormap";
const expectedPackageVersion = JSON.parse(
	readFileSync(join(repoRoot, "package.json"), "utf8"),
).version;
const allowedGoldenDiffClassifications = new Set([
	"bug d'implémentation",
	"ambiguïté du contrat",
	"fixture incorrecte",
	"changement volontaire de contrat",
]);
const allowedEntropyReviewClassifications = new Set([
	"contract violation",
	"spec ambiguity",
	"design gap",
	"eval defect",
	"product question",
	"tooling problem",
	"out-of-scope discovery",
]);
const allowedEntropyReviewBlockingStatuses = new Set(["bloquant", "non bloquant"]);

function parseArgs(argv) {
	const options = {
		repoRoot,
		fixturesRoot: undefined,
		evidenceDir: defaultEvidenceDir,
		outDir: defaultOutDir,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--repo-root") {
			options.repoRoot = requireValue(argv, index, arg);
			index += 1;
			continue;
		}
		if (arg === "--fixtures-root") {
			options.fixturesRoot = requireValue(argv, index, arg);
			index += 1;
			continue;
		}
		if (arg === "--evidence-dir") {
			options.evidenceDir = requireValue(argv, index, arg);
			index += 1;
			continue;
		}
		if (arg === "--out-dir") {
			options.outDir = requireValue(argv, index, arg);
			index += 1;
			continue;
		}

		const artifactOption = artifactInputs.find(
			([, , optionName]) => arg === `--${dashCase(optionName)}`,
		);
		if (artifactOption) {
			options[artifactOption[2]] = requireValue(argv, index, arg);
			index += 1;
			continue;
		}

		failUsage(`release-gates: invalid argument ${arg}`);
	}

	for (const [, defaultFilename, optionName, defaultSource] of artifactInputs) {
		options[optionName] ??= defaultSource ?? join(options.evidenceDir, defaultFilename);
	}

	const resolvedRepoRoot = resolve(options.repoRoot);
	const resolvedFixturesRoot =
		options.fixturesRoot === undefined
			? join(resolvedRepoRoot, "fixtures")
			: resolve(resolvedRepoRoot, options.fixturesRoot);
	const resolvedEvidenceDir = resolve(resolvedRepoRoot, options.evidenceDir);
	const resolvedOutDir = resolve(resolvedRepoRoot, options.outDir);

	return {
		...options,
		repoRoot: resolvedRepoRoot,
		fixturesRoot: resolvedFixturesRoot,
		evidenceDir: resolvedEvidenceDir,
		outDir: resolvedOutDir,
		...Object.fromEntries(
			artifactInputs.map(([, , optionName]) => [
				optionName,
				resolve(resolvedRepoRoot, options[optionName]),
			]),
		),
	};
}

function requireValue(argv, index, flag) {
	const value = argv[index + 1];
	if (value === undefined || value.startsWith("--")) {
		failUsage(`release-gates: ${flag} requires a path`);
	}
	return value;
}

function dashCase(value) {
	return value.replace(/[A-Z]/gu, (match) => `-${match.toLowerCase()}`);
}

function failUsage(message) {
	process.stderr.write(`${message}\n`);
	process.exit(2);
}

function readJson(path, label, errors) {
	if (!existsSync(path)) {
		errors.push(`missing ${label}: ${path}`);
		return null;
	}
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		errors.push(`invalid ${label} JSON: ${path}: ${error.message}`);
		return null;
	}
}

function readOptionalJson(path, label, errors) {
	if (!existsSync(path)) {
		return optionalEvidenceMissing;
	}
	return readJson(path, label, errors);
}

function compareStrings(left, right) {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function fixtureIdentity(family, id) {
	return typeof family === "string" && typeof id === "string" ? `${family}/${id}` : null;
}

function buildFixtureIndex(fixturesRoot, errors) {
	const index = new Map();
	const invalidLevelBManifests = [];
	if (!existsSync(fixturesRoot)) {
		errors.push(`fixtures root is missing: ${fixturesRoot}`);
		return { index, invalidLevelBManifests };
	}
	for (const family of readdirSync(fixturesRoot).sort(compareStrings)) {
		const familyDir = join(fixturesRoot, family);
		let fixtureDirs;
		try {
			fixtureDirs = readdirSync(familyDir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const fixtureDirent of fixtureDirs.sort((left, right) =>
			compareStrings(left.name, right.name),
		)) {
			if (!fixtureDirent.isDirectory()) {
				continue;
			}
			const manifestPath = join(familyDir, fixtureDirent.name, "manifest.json");
			if (!existsSync(manifestPath)) {
				if (requiredBFamilies.includes(family)) {
					const expectedIdentity = fixtureIdentity(family, fixtureDirent.name);
					errors.push(`missing fixture manifest: ${manifestPath}`);
					invalidLevelBManifests.push(expectedIdentity);
				}
				continue;
			}
			const manifest = readJson(
				manifestPath,
				`fixture manifest ${family}/${fixtureDirent.name}`,
				errors,
			);
			if (requiredBFamilies.includes(family)) {
				const expectedIdentity = fixtureIdentity(family, fixtureDirent.name);
				const manifestIdentityError = validateFixtureManifestIdentity(
					manifest,
					family,
					fixtureDirent.name,
					manifestPath,
				);
				if (manifestIdentityError !== null) {
					errors.push(manifestIdentityError);
					invalidLevelBManifests.push(expectedIdentity);
					continue;
				}
			}
			const identity = fixtureIdentity(family, manifest?.id);
			if (identity !== null) {
				index.set(identity, {
					...manifest,
					_fixture_family: family,
				});
			}
		}
	}
	return {
		index,
		invalidLevelBManifests: invalidLevelBManifests.sort(compareStrings),
	};
}

function validateFixtureManifestIdentity(manifest, family, fixtureId, manifestPath) {
	if (manifest === null) {
		return `invalid fixture manifest identity: ${manifestPath}: manifest JSON could not be read`;
	}
	if (typeof manifest?.id !== "string" || manifest.id.length === 0) {
		return `invalid fixture manifest identity: ${manifestPath}: id must be ${JSON.stringify(fixtureId)}`;
	}
	if (typeof manifest?.family !== "string" || manifest.family.length === 0) {
		return `invalid fixture manifest identity: ${manifestPath}: family must be ${JSON.stringify(family)}`;
	}
	if (manifest.id !== fixtureId || manifest.family !== family) {
		return `invalid fixture manifest identity: ${manifestPath}: expected ${family}/${fixtureId}, found ${manifest.family}/${manifest.id}`;
	}
	return null;
}

function fixtureRecords(report) {
	return Array.isArray(report?.records) ? report.records : [];
}

function passedFixtureRecords(report) {
	return fixtureRecords(report).filter((record) => record?.status === "pass");
}

function allFixtureRecordsPass(report) {
	return report?.exit_code === 0 && report?.failed_count === 0 && fixtureRecords(report).length > 0;
}

function scopedFixtureRecordsPass(records) {
	return records.length > 0 && records.every((record) => record?.status === "pass");
}

function failedScopedFixtureRecordCount(records) {
	return records.filter((record) => record?.status !== "pass").length;
}

function recordFixtureId(record) {
	return record?.fixture_id ?? record?.fixtureId ?? null;
}

function recordFamily(record) {
	return record?.family ?? null;
}

function recordFixtureIdentity(record) {
	return fixtureIdentity(recordFamily(record), recordFixtureId(record));
}

function fixtureIdentities(records) {
	return new Set(
		records.map(recordFixtureIdentity).filter((identity) => typeof identity === "string"),
	);
}

function duplicateRecordIdentities(records) {
	const seen = new Set();
	const duplicates = new Set();
	for (const record of records) {
		const identity = recordFixtureIdentity(record);
		if (identity === null) {
			continue;
		}
		if (seen.has(identity)) {
			duplicates.add(identity);
		}
		seen.add(identity);
	}
	return [...duplicates].sort(compareStrings);
}

function manifestFamily(manifest) {
	return typeof manifest?._fixture_family === "string"
		? manifest._fixture_family
		: manifest?.family;
}

function requiredLevelBFixtureManifests(fixtureIndex) {
	return [...fixtureIndex.values()].filter((manifest) =>
		requiredBFamilies.includes(manifestFamily(manifest)),
	);
}

function requiredLevelBFixtureFamilies(fixtureIndex) {
	return new Set(
		requiredLevelBFixtureManifests(fixtureIndex)
			.map(manifestFamily)
			.filter((family) => typeof family === "string"),
	);
}

function manifestFixtureIdentity(manifest) {
	return fixtureIdentity(manifestFamily(manifest), manifest?.id);
}

function missingPassingLevelBFixtureIdentities(fixtureReport, fixtureIndex) {
	const passedIdentities = fixtureIdentities(passedFixtureRecords(fixtureReport));
	return requiredLevelBFixtureManifests(fixtureIndex)
		.map(manifestFixtureIdentity)
		.filter((identity) => typeof identity === "string" && !passedIdentities.has(identity))
		.sort(compareStrings);
}

function currentLevelBFixtureIdentities(fixtureIndex) {
	return requiredLevelBFixtureManifests(fixtureIndex)
		.map(manifestFixtureIdentity)
		.filter((identity) => typeof identity === "string")
		.sort(compareStrings);
}

function fixtureReportRecordProblems(fixtureReport, fixtureIndex) {
	return reportRecordProblems(
		requiredLevelBFixtureRecords(fixtureReport),
		currentLevelBFixtureIdentities(fixtureIndex),
	);
}

function goldenReportRecordProblems(goldenReport, fixtureIndex) {
	return reportRecordProblems(
		fixtureRecords(goldenReport),
		currentStdoutGoldenFixtureIdentities(fixtureIndex),
	);
}

function requiredLevelBFixtureRecords(report) {
	return fixtureRecords(report).filter((record) =>
		requiredBFamilies.includes(recordFamily(record)),
	);
}

function bCliFixtureRecords(report) {
	return fixtureRecords(report).filter((record) => recordFamily(record) === "B-cli");
}

function reportRecordProblems(records, expectedIdentities) {
	const currentIdentities = new Set(expectedIdentities);
	const recordIdentities = records
		.map(recordFixtureIdentity)
		.filter((identity) => typeof identity === "string");
	const duplicateIdentities = duplicateRecordIdentities(records);
	const staleOrUnknownIdentities = [...new Set(recordIdentities)]
		.filter((identity) => !currentIdentities.has(identity))
		.sort(compareStrings);
	const malformedRecordCount = records.length - recordIdentities.length;
	const expectedCount = currentIdentities.size;
	const countMatches =
		records.filter((record) => record?.status === "pass").length === expectedCount &&
		records.length === expectedCount;
	return {
		duplicateIdentities,
		staleOrUnknownIdentities,
		malformedRecordCount,
		expectedCount,
		actualCount: records.length,
		countMatches,
	};
}

function currentStdoutGoldenFixtureIdentities(fixtureIndex) {
	return [...fixtureIndex.values()]
		.filter(isStdoutGoldenFixtureManifest)
		.map(manifestFixtureIdentity)
		.filter((identity) => typeof identity === "string")
		.sort(compareStrings);
}

function currentExpectedFileFixtureIdentities(fixtureIndex) {
	return [...fixtureIndex.values()]
		.filter(isExpectedFileFixtureManifest)
		.map(manifestFixtureIdentity)
		.filter((identity) => typeof identity === "string")
		.sort(compareStrings);
}

function isStdoutGoldenFixtureManifest(manifest) {
	return manifest?.stdout?.kind === "golden";
}

function isExpectedFileFixtureManifest(manifest) {
	return manifest?.filesystem?.kind === "expected_files";
}

function isScanJsonCommand(command) {
	if (!Array.isArray(command)) {
		return false;
	}
	const scanIndex = scanSubcommandIndex(command);
	return scanIndex >= 0 && command[scanIndex + 1] === "--json";
}

function scanSubcommandIndex(command) {
	if (command[0] === "node") {
		return typeof command[1] === "string" && !command[1].startsWith("-") && command[2] === "scan"
			? 2
			: -1;
	}
	if (command[0] === "scan") {
		return 0;
	}
	return command[1] === "scan" ? 1 : -1;
}

function evaluateGateA(fixtureReport, fixtureIndex, invalidLevelBManifests) {
	const families = requiredLevelBFixtureFamilies(fixtureIndex);
	const missingFamilies = requiredBFamilies.filter((family) => !families.has(family));
	const levelBRecords = requiredLevelBFixtureRecords(fixtureReport);
	const missingFixtures = missingPassingLevelBFixtureIdentities(fixtureReport, fixtureIndex);
	const recordProblems = fixtureReportRecordProblems(fixtureReport, fixtureIndex);
	const checks = [
		check("current_level_b_fixture_manifests_valid", invalidLevelBManifests.length === 0, {
			invalid_manifests: invalidLevelBManifests,
		}),
		check("level_b_fixture_report_passed", scopedFixtureRecordsPass(levelBRecords), {
			scoped_record_count: levelBRecords.length,
			failed_scoped_record_count: failedScopedFixtureRecordCount(levelBRecords),
		}),
		check("level_b_fixture_report_matches_current_manifests", recordProblems.countMatches, {
			expected_count: recordProblems.expectedCount,
			actual_count: recordProblems.actualCount,
			total_count: fixtureReport?.total_count ?? null,
			passed_count: fixtureReport?.passed_count ?? null,
		}),
		check("level_b_fixture_report_records_well_formed", recordProblems.malformedRecordCount === 0, {
			malformed_record_count: recordProblems.malformedRecordCount,
		}),
		check(
			"level_b_fixture_report_has_no_duplicate_records",
			recordProblems.duplicateIdentities.length === 0,
			{
				duplicate_fixtures: recordProblems.duplicateIdentities,
			},
		),
		check(
			"level_b_fixture_report_has_no_stale_records",
			recordProblems.staleOrUnknownIdentities.length === 0,
			{
				stale_or_unknown_fixtures: recordProblems.staleOrUnknownIdentities,
			},
		),
		check("all_required_b_families_present", missingFamilies.length === 0, {
			missing_families: missingFamilies,
		}),
		check("all_level_b_fixture_manifests_passed", missingFixtures.length === 0, {
			missing_fixtures: missingFixtures,
		}),
	];
	return gate("A", "Couverture du contrat observable", checks);
}

function evaluateGateB(fixtureReport, goldenReport, fixtureIndex, goldenDiffs) {
	const levelBRecords = requiredLevelBFixtureRecords(fixtureReport);
	const passedIdentities = fixtureIdentities(passedFixtureRecords(fixtureReport));
	const passedGoldenIdentities = fixtureIdentities(passedFixtureRecords(goldenReport));
	const manifestsForPassedGoldenRecords = [...passedGoldenIdentities]
		.map((identity) => fixtureIndex.get(identity))
		.filter(Boolean);
	const goldenReportProblems = goldenReportRecordProblems(goldenReport, fixtureIndex);
	const currentStdoutGoldenIdentities = currentStdoutGoldenFixtureIdentities(fixtureIndex);
	const missingStdoutGoldenFixtures = currentStdoutGoldenIdentities
		.filter((identity) => !passedGoldenIdentities.has(identity))
		.sort(compareStrings);
	const currentExpectedFileIdentities = currentExpectedFileFixtureIdentities(fixtureIndex);
	const missingExpectedFileFixtures = currentExpectedFileIdentities
		.filter((identity) => !passedIdentities.has(identity))
		.sort(compareStrings);
	const jsonGoldenCount = manifestsForPassedGoldenRecords.filter((manifest) => {
		return isScanJsonCommand(manifest.command) && manifest.stdout?.kind === "golden";
	}).length;
	const yamlGoldenCount = currentExpectedFileIdentities.length - missingExpectedFileFixtures.length;
	const normalizedGoldenDiffs = normalizeGoldenDiffs(goldenDiffs);
	const invalidPathDiffs = normalizedGoldenDiffs.filter((diff) => diff.path === null);
	const unclassifiedDiffs = normalizedGoldenDiffs.filter((diff) => diff.classification === null);
	const unsupportedClassificationDiffs = normalizedGoldenDiffs.filter(
		(diff) => diff.unsupportedClassification !== null,
	);
	const checks = [
		check("json_and_stdout_golden_report_passed", allFixtureRecordsPass(goldenReport)),
		check(
			"golden_report_matches_current_stdout_golden_manifests",
			missingStdoutGoldenFixtures.length === 0 && goldenReportProblems.countMatches,
			{
				missing_stdout_golden_fixtures: missingStdoutGoldenFixtures,
				expected_count: goldenReportProblems.expectedCount,
				actual_count: goldenReportProblems.actualCount,
				total_count: goldenReport?.total_count ?? null,
				passed_count: goldenReport?.passed_count ?? null,
			},
		),
		check("golden_report_records_well_formed", goldenReportProblems.malformedRecordCount === 0, {
			malformed_record_count: goldenReportProblems.malformedRecordCount,
		}),
		check(
			"golden_report_has_no_duplicate_records",
			goldenReportProblems.duplicateIdentities.length === 0,
			{
				duplicate_fixtures: goldenReportProblems.duplicateIdentities,
			},
		),
		check(
			"golden_report_has_no_stale_records",
			goldenReportProblems.staleOrUnknownIdentities.length === 0,
			{
				stale_or_unknown_fixtures: goldenReportProblems.staleOrUnknownIdentities,
			},
		),
		check("json_goldens_present", jsonGoldenCount > 0, { json_golden_count: jsonGoldenCount }),
		check("yaml_goldens_present", yamlGoldenCount > 0, { yaml_golden_count: yamlGoldenCount }),
		check("yaml_expected_file_fixtures_passed", missingExpectedFileFixtures.length === 0, {
			missing_yaml_expected_file_fixtures: missingExpectedFileFixtures,
		}),
		check("all_level_b_fixture_oracles_passed", scopedFixtureRecordsPass(levelBRecords), {
			scoped_record_count: levelBRecords.length,
			failed_scoped_record_count: failedScopedFixtureRecordCount(levelBRecords),
		}),
		check("golden_diff_paths_present", invalidPathDiffs.length === 0, {
			invalid_path_count: invalidPathDiffs.length,
			invalid_golden_diff_indexes: invalidPathDiffs.map((diff) => diff.index),
		}),
		check("golden_diffs_classified", unclassifiedDiffs.length === 0, {
			unclassified_count: unclassifiedDiffs.length,
			unsupported_classification_count: unsupportedClassificationDiffs.length,
			unsupported_classifications: unsupportedClassificationDiffs.map((diff) => ({
				path: diff.path,
				classification: diff.unsupportedClassification,
			})),
		}),
	];
	return gate("B", "Schéma machine, goldens et ordre canonique", checks);
}

function evaluateGateC(fixtureReport, fixtureIndex) {
	const bCliRecords = bCliFixtureRecords(fixtureReport);
	const passedBcliIdentities = fixtureIdentities(
		bCliRecords.filter((record) => record?.status === "pass"),
	);
	const coveredExitCodes = new Set(
		[...passedBcliIdentities]
			.map((identity) => fixtureIndex.get(identity)?.exit_code)
			.filter((exitCode) => Number.isInteger(exitCode)),
	);
	const missingExitCodes = requiredExitCodes.filter((exitCode) => !coveredExitCodes.has(exitCode));
	const missingPriorityFixtures = missingRequiredBcliFixtures(
		priorityFixtureIds,
		passedBcliIdentities,
		fixtureIndex,
	);
	const missingCliSurfaceFixtures = missingRequiredBcliFixtures(
		cliSurfaceFixtureIds,
		passedBcliIdentities,
		fixtureIndex,
	);
	const missingScanHumanFixtures = missingRequiredBcliFixtures(
		scanHumanFixtureIds,
		passedBcliIdentities,
		fixtureIndex,
	);
	const checks = [
		check("b_cli_fixtures_passed", scopedFixtureRecordsPass(bCliRecords), {
			scoped_record_count: bCliRecords.length,
			failed_scoped_record_count: failedScopedFixtureRecordCount(bCliRecords),
		}),
		check("exit_codes_0_1_2_3_4_covered", missingExitCodes.length === 0, {
			missing_exit_codes: missingExitCodes,
		}),
		check("priority_fixtures_fx72_fx75_passed", missingPriorityFixtures.length === 0, {
			missing_fixtures: missingPriorityFixtures,
		}),
		check("cli_surface_fixtures_fx68_fx71_fx76_passed", missingCliSurfaceFixtures.length === 0, {
			missing_fixtures: missingCliSurfaceFixtures,
		}),
		check("scan_human_exit_modes_covered", missingScanHumanFixtures.length === 0, {
			missing_fixtures: missingScanHumanFixtures,
		}),
	];
	return gate("C", "Codes de sortie, préconditions et priorité", checks);
}

function missingRequiredBcliFixtures(fixtureIds, passedIdentities, fixtureIndex) {
	return fixtureIds.filter((id) => {
		const identity = fixtureIdentity("B-cli", id);
		return !passedIdentities.has(identity) || !fixtureIndex.has(identity);
	});
}

function evaluateGateD(metamorphicReport) {
	const cases = Array.isArray(metamorphicReport?.cases) ? metamorphicReport.cases : [];
	const duplicateCases = duplicateValues(
		cases.map((entry) => entry?.case).filter((caseId) => typeof caseId === "string"),
	);
	const unsupportedCases = [
		...new Set(
			cases
				.map((entry) => entry?.case)
				.filter(
					(caseId) => typeof caseId === "string" && !requiredMetamorphicCases.includes(caseId),
				),
		),
	].sort(compareStrings);
	const passedCases = new Set(
		cases
			.filter((entry) => entry?.status === "pass")
			.map((entry) => entry?.case)
			.filter((caseId) => typeof caseId === "string"),
	);
	const missingCases = requiredMetamorphicCases.filter((caseId) => !passedCases.has(caseId));
	const checks = [
		check("c1_c12_cases_passed", missingCases.length === 0, { missing_cases: missingCases }),
		check("c1_c12_cases_not_duplicated", duplicateCases.length === 0, {
			duplicate_cases: duplicateCases,
		}),
		check("c1_c12_cases_only_supported", unsupportedCases.length === 0, {
			unsupported_cases: unsupportedCases,
		}),
		check("metamorphic_report_verdict_passed", metamorphicReport?.gate_d?.verdict === "pass"),
	];
	return gate("D", "Déterminisme et isolation", checks);
}

function duplicateValues(values) {
	const seen = new Set();
	const duplicates = new Set();
	for (const value of values) {
		if (seen.has(value)) {
			duplicates.add(value);
		}
		seen.add(value);
	}
	return [...duplicates].sort(compareStrings);
}

function evaluateGateE(crossPlatformReport) {
	const platforms = Array.isArray(crossPlatformReport?.platforms)
		? crossPlatformReport.platforms
		: [];
	const missingPlatforms = [];
	const duplicatePlatforms = [];
	const unsupportedPlatforms = [];
	for (const required of requiredPlatforms) {
		const reports = platforms.filter((platform) => {
			return (
				platform?.platform === required.platform && required.archAliases.includes(platform?.arch)
			);
		});
		if (reports.length === 0 || reports.some((report) => report?.verdict !== "pass")) {
			missingPlatforms.push(required.label);
		}
		if (reports.length > 1) {
			duplicatePlatforms.push(required.key);
		}
	}
	for (const platform of platforms) {
		const supported = requiredPlatforms.some(
			(required) =>
				platform?.platform === required.platform && required.archAliases.includes(platform?.arch),
		);
		if (!supported) {
			unsupportedPlatforms.push({
				platform: platform?.platform ?? null,
				arch: platform?.arch ?? null,
			});
		}
	}
	const checks = [
		check(
			"supported_platform_matrix_passed",
			missingPlatforms.length === 0 &&
				duplicatePlatforms.length === 0 &&
				unsupportedPlatforms.length === 0 &&
				platforms.length === requiredPlatforms.length,
			{
				missing_or_failing_platforms: missingPlatforms,
				duplicate_supported_platforms: duplicatePlatforms.sort(compareStrings),
				unsupported_platforms: unsupportedPlatforms,
				platform_count: platforms.length,
				expected_platform_count: requiredPlatforms.length,
			},
		),
		check("cross_platform_report_verdict_passed", crossPlatformReport?.gate_e?.verdict === "pass"),
	];
	return gate("E", "Cross-platform", checks);
}

function performanceReports(performanceReport) {
	if (Array.isArray(performanceReport)) {
		return performanceReport;
	}
	for (const field of ["platform_reports", "performance_reports", "supported_platform_reports"]) {
		if (Array.isArray(performanceReport?.[field])) {
			return performanceReport[field];
		}
	}
	return performanceReport ? [performanceReport] : [];
}

function supportedPlatformKey(report) {
	const platform = report?.reference_machine?.platform;
	const arch = report?.reference_machine?.arch;
	const required = requiredPlatforms.find((entry) => {
		return entry.platform === platform && entry.archAliases.includes(arch);
	});
	return required?.key ?? null;
}

function resultForCorpus(report, corpusId) {
	const results = Array.isArray(report?.results) ? report.results : [];
	return results.find((result) => result?.corpus_id === corpusId);
}

function allRequiredPlatformReportsPass(reportsByPlatform, predicate) {
	return requiredPlatforms.every((platform) => {
		const report = reportsByPlatform.get(platform.key);
		return report !== undefined && predicate(report);
	});
}

function validateBenchmarkReport(report, platformKey) {
	try {
		validateBenchmarkReportObject(report, { requiredPlatformKey: platformKey });
		return null;
	} catch (error) {
		if (error instanceof BenchmarkReportValidationError) {
			return error.message;
		}
		throw error;
	}
}

function evaluateGateF(performanceReport) {
	const reportsByPlatform = new Map();
	const duplicatePlatforms = [];
	const unsupportedReports = [];
	for (const report of performanceReports(performanceReport)) {
		const platformKey = supportedPlatformKey(report);
		if (!platformKey) {
			unsupportedReports.push({
				platform: report?.reference_machine?.platform ?? null,
				arch: report?.reference_machine?.arch ?? null,
			});
			continue;
		}
		if (reportsByPlatform.has(platformKey)) {
			duplicatePlatforms.push(platformKey);
			continue;
		}
		reportsByPlatform.set(platformKey, report);
	}
	const missingPlatforms = requiredPlatforms
		.filter((platform) => !reportsByPlatform.has(platform.key))
		.map((platform) => platform.key);
	const validationErrors = requiredPlatforms
		.map((platform) => {
			const report = reportsByPlatform.get(platform.key);
			if (report === undefined) {
				return null;
			}
			const error = validateBenchmarkReport(report, platform.key);
			return error === null ? null : { platform: platform.key, error };
		})
		.filter((error) => error !== null);
	const checks = [
		check(
			"supported_platform_benchmark_reports_present",
			missingPlatforms.length === 0 &&
				duplicatePlatforms.length === 0 &&
				unsupportedReports.length === 0,
			{
				missing_platforms: missingPlatforms,
				duplicate_platforms: duplicatePlatforms.sort(compareStrings),
				unsupported_reports: unsupportedReports,
			},
		),
		check("gate_f_benchmark_reports_validated", validationErrors.length === 0, {
			validation_errors: validationErrors,
		}),
		check(
			"gate_f_report_evaluable",
			allRequiredPlatformReportsPass(
				reportsByPlatform,
				(report) => report?.gate_f?.evaluable === true,
			),
		),
		check(
			"gate_f_verdict_passed",
			allRequiredPlatformReportsPass(
				reportsByPlatform,
				(report) => report?.gate_f?.verdict === "pass",
			),
		),
		check(
			"small_benchmark_passed",
			allRequiredPlatformReportsPass(reportsByPlatform, (report) => {
				const result = resultForCorpus(report, "small");
				return result?.gate === true && result?.verdict === "pass";
			}),
		),
		check(
			"medium_benchmark_passed",
			allRequiredPlatformReportsPass(reportsByPlatform, (report) => {
				const result = resultForCorpus(report, "medium");
				return result?.gate === true && result?.verdict === "pass";
			}),
		),
		check(
			"large_benchmark_archived_informational",
			allRequiredPlatformReportsPass(reportsByPlatform, (report) => {
				const result = resultForCorpus(report, "large");
				return result?.gate === false && result?.verdict === "informational";
			}),
		),
		check(
			"large_excluded_from_pass_fail",
			allRequiredPlatformReportsPass(
				reportsByPlatform,
				(report) => report?.gate_f?.large_excluded_from_pass_fail === true,
			),
		),
	];
	return gate("F", "Performance", checks);
}

function evaluateGateG(dependencyAudit) {
	const checks = [
		check("dependency_audit_verdict_passed", dependencyAudit?.gate_g_dependency_verdict === "pass"),
		check(
			"floating_semver_ranges_rejected",
			dependencyAudit?.contract_dependency_policy?.floating_semver_ranges_rejected === true,
		),
		check(
			"lockfile_required",
			dependencyAudit?.contract_dependency_policy?.lockfile_required === true,
		),
		check(
			"lockfile_root_consistency_checked",
			dependencyAudit?.contract_dependency_policy?.lockfile_root_consistency_checked === true,
		),
		check(
			"full_lockfile_hash_checked",
			dependencyAudit?.contract_dependency_policy?.full_lockfile_hash_checked === true,
		),
		check(
			"installed_parser_versions_checked",
			dependencyAudit?.contract_dependency_policy?.installed_parser_versions_checked === true,
		),
		check(
			"versioned_goldens_checked_with_git",
			dependencyAudit?.contract_dependency_policy?.versioned_goldens_checked_with_git === true,
		),
		check("goldens_versioned", dependencyAudit?.goldens?.versioned === true),
	];
	return gate("G", "Reproductibilité de release", checks);
}

function evaluateChecklist(
	artifactResults,
	goldenDiffs,
	invalidLevelBManifests,
	entropyReviewValidation,
	publicationEvidenceValidation,
) {
	const missingArtifacts = artifactResults
		.filter((artifact) => artifact.required && artifact.status !== "archived")
		.map((artifact) => artifact.name);
	const requiredArtifacts = artifactResults.filter((artifact) => artifact.required);
	const postM9PublicationArtifacts = artifactResults.filter((artifact) => !artifact.required);
	const normalizedGoldenDiffs = normalizeGoldenDiffs(goldenDiffs);
	const invalidGoldenDiffPaths = normalizedGoldenDiffs.filter((diff) => diff.path === null);
	const unclassifiedGoldenDiffs = normalizedGoldenDiffs.filter(
		(diff) => diff.classification === null,
	);
	const unsupportedGoldenDiffClassifications = normalizedGoldenDiffs.filter(
		(diff) => diff.unsupportedClassification !== null,
	);
	return {
		verdict:
			missingArtifacts.length === 0 &&
			invalidGoldenDiffPaths.length === 0 &&
			unclassifiedGoldenDiffs.length === 0 &&
			invalidLevelBManifests.length === 0 &&
			entropyReviewValidation.status === "pass" &&
			publicationEvidenceValidation.status === "pass"
				? "pass"
				: "fail",
		required_artifacts: requiredArtifacts,
		pre_publication_required_artifacts: requiredArtifacts,
		post_m9_publication_evidence_artifacts: postM9PublicationArtifacts,
		post_publication_evidence_artifacts: postM9PublicationArtifacts,
		entropy_review: entropyReviewValidation,
		publication_evidence: publicationEvidenceValidation,
		golden_diffs: normalizedGoldenDiffs.map((diff) => ({
			path: diff.path,
			classification: diff.classification,
			summary: diff.summary,
		})),
		missing_blocking_artifacts: missingArtifacts,
		invalid_golden_diff_paths: invalidGoldenDiffPaths.map((diff) => diff.path),
		unclassified_golden_diffs: unclassifiedGoldenDiffs.map((diff) => diff.path),
		unsupported_golden_diff_classifications: unsupportedGoldenDiffClassifications.map((diff) => ({
			path: diff.path,
			classification: diff.unsupportedClassification,
		})),
		invalid_level_b_fixture_manifests: invalidLevelBManifests,
	};
}

function validatePublicationEvidence(reports) {
	const validationErrors = [];
	const result = {
		status: "pass",
		validation_errors: validationErrors,
		consumer_lockback: {
			status: isOptionalEvidenceMissing(reports.consumerLockback) ? "pending" : "pass",
		},
		t10_5_tarball_artifact: {
			status: isOptionalEvidenceMissing(reports.t10_5TarballArtifact) ? "pending" : "pass",
		},
		t10_5_publication_dry_run: {
			status: isOptionalEvidenceMissing(reports.t10_5PublicationDryRun) ? "pending" : "pass",
		},
		t10_6_publication_evidence: { status: "pending" },
	};

	if (!isOptionalEvidenceMissing(reports.consumerLockback)) {
		validatePublicationPackageIdentity(
			reports.consumerLockback,
			"consumer lockback",
			result.consumer_lockback,
			validationErrors,
		);
	}
	if (!isOptionalEvidenceMissing(reports.t10_5TarballArtifact)) {
		validateT10_5ArtifactIdentity(
			reports.t10_5TarballArtifact,
			result.t10_5_tarball_artifact,
			validationErrors,
		);
	}
	if (!isOptionalEvidenceMissing(reports.t10_5PublicationDryRun)) {
		validateT10_5DryRunCoherence(
			reports.t10_5PublicationDryRun,
			reports.t10_5TarballArtifact,
			result.t10_5_publication_dry_run,
			validationErrors,
		);
	}
	if (!isOptionalEvidenceMissing(reports.t10_6PublicationEvidence)) {
		result.t10_6_publication_evidence = { status: "pass" };
		validateT10_6PublicationCoherence(
			reports.t10_6PublicationEvidence,
			result.t10_6_publication_evidence,
			validationErrors,
		);
	}

	if (validationErrors.length > 0) {
		result.status = "fail";
	}
	return result;
}

function isOptionalEvidenceMissing(value) {
	return value === optionalEvidenceMissing;
}

function validatePublicationPackageIdentity(report, label, result, validationErrors) {
	if (!isJsonObject(report)) {
		failPublicationEvidence(result, validationErrors, `${label} evidence must be a JSON object`);
		return;
	}
	validatePublicationReportStatus(report, label, result, validationErrors);
	if (!isNonEmptyString(report.package_name)) {
		failPublicationEvidence(result, validationErrors, `${label} requires package_name`);
	} else if (report.package_name !== expectedPackageName) {
		failPublicationEvidence(
			result,
			validationErrors,
			`${label} package_name must be ${expectedPackageName}`,
		);
	}
	if (!isNonEmptyString(report.package_version)) {
		failPublicationEvidence(result, validationErrors, `${label} requires package_version`);
	} else if (report.package_version !== expectedPackageVersion) {
		failPublicationEvidence(
			result,
			validationErrors,
			`${label} package_version must be ${expectedPackageVersion}`,
		);
	}
}

function validatePublicationReportStatus(report, label, result, validationErrors) {
	if (Object.hasOwn(report, "status") && report.status !== "pass") {
		failPublicationEvidence(result, validationErrors, `${label} status must be pass when present`);
	}
}

function validateT10_5ArtifactIdentity(report, result, validationErrors) {
	if (!isJsonObject(report)) {
		failPublicationEvidence(
			result,
			validationErrors,
			"T10.5 tarball artifact report must be a JSON object",
		);
		return;
	}
	validatePublicationPackageIdentity(report, "T10.5 tarball artifact", result, validationErrors);
	validateArtifactChecksumShape(report, "T10.5 tarball artifact", result, validationErrors);
	if (!isNonEmptyString(report.tarball_file)) {
		failPublicationEvidence(
			result,
			validationErrors,
			"T10.5 tarball artifact requires tarball_file",
		);
	}
}

function validateT10_5DryRunCoherence(report, tarballReport, result, validationErrors) {
	if (!isJsonObject(report)) {
		failPublicationEvidence(
			result,
			validationErrors,
			"T10.5 publication dry-run report must be a JSON object",
		);
		return;
	}
	validatePublicationReportStatus(report, "T10.5 publication dry-run", result, validationErrors);
	if (!isNonEmptyString(report.tarball_file)) {
		failPublicationEvidence(
			result,
			validationErrors,
			"T10.5 publication dry-run requires tarball_file",
		);
	}
	if (isJsonObject(tarballReport)) {
		validateSameNamedArtifact(
			report,
			tarballReport,
			"T10.5 publication dry-run",
			"T10.5 tarball artifact",
			result,
			validationErrors,
		);
	}
}

function validateT10_6PublicationCoherence(report, result, validationErrors) {
	if (!isJsonObject(report)) {
		failPublicationEvidence(
			result,
			validationErrors,
			"T10.6 publication evidence must be a JSON object",
		);
		return;
	}
	validatePublicationReportStatus(report, "T10.6 publication evidence", result, validationErrors);
	if (!isNonEmptyString(report.registry_coordinate)) {
		failPublicationEvidence(
			result,
			validationErrors,
			"T10.6 publication evidence requires registry_coordinate",
		);
	} else {
		const coordinate = parseNpmRegistryCoordinate(report.registry_coordinate);
		if (coordinate === null) {
			failPublicationEvidence(
				result,
				validationErrors,
				"T10.6 registry_coordinate must be an npm package coordinate",
			);
		} else {
			if (coordinate.packageName !== expectedPackageName) {
				failPublicationEvidence(
					result,
					validationErrors,
					`T10.6 registry_coordinate package name must be ${expectedPackageName}`,
				);
			}
			if (coordinate.version !== expectedPackageVersion) {
				failPublicationEvidence(
					result,
					validationErrors,
					`T10.6 registry_coordinate package version must be ${expectedPackageVersion}`,
				);
			}
		}
	}
	validateArtifactChecksumShape(report, "T10.6 publication evidence", result, validationErrors);
}

function failPublicationEvidence(result, validationErrors, message) {
	result.status = "fail";
	validationErrors.push(message);
}

function validateArtifactChecksumShape(report, label, result, validationErrors) {
	if (Object.hasOwn(report, "npm_integrity") && !isNpmIntegrity(report.npm_integrity)) {
		failPublicationEvidence(result, validationErrors, `${label} npm_integrity must be valid`);
	}
	if (Object.hasOwn(report, "dist_integrity") && !isNpmIntegrity(report.dist_integrity)) {
		failPublicationEvidence(result, validationErrors, `${label} dist_integrity must be valid`);
	}
	if (Object.hasOwn(report, "npm_shasum") && !isSha1Hex(report.npm_shasum)) {
		failPublicationEvidence(result, validationErrors, `${label} npm_shasum must be valid`);
	}
	if (Object.hasOwn(report, "dist_shasum") && !isSha1Hex(report.dist_shasum)) {
		failPublicationEvidence(result, validationErrors, `${label} dist_shasum must be valid`);
	}
	if (Object.hasOwn(report, "sha256") && !isSha256Hex(report.sha256)) {
		failPublicationEvidence(result, validationErrors, `${label} sha256 must be valid`);
	}
}

function validateSameNamedArtifact(left, right, leftLabel, rightLabel, result, validationErrors) {
	if (
		isNonEmptyString(left.tarball_file) &&
		isNonEmptyString(right.tarball_file) &&
		left.tarball_file !== right.tarball_file
	) {
		failPublicationEvidence(
			result,
			validationErrors,
			`${leftLabel} tarball_file must match ${rightLabel} tarball_file`,
		);
	}
}

function validateEntropyReview(entropyReview) {
	const validationErrors = [];
	const result = {
		status: "pass",
		validation_errors: validationErrors,
		findings_count: 0,
		findings_missing_primary_classification: [],
		findings_with_unsupported_primary_classification: [],
		findings_missing_blocking_status: [],
		findings_with_unsupported_blocking_status: [],
		findings_missing_follow_up_disposition: [],
		blocking_findings_remaining: null,
		unclassified_drift_remaining: null,
	};

	if (!isJsonObject(entropyReview)) {
		validationErrors.push("entropy review must be a JSON object");
		result.status = "fail";
		return result;
	}

	if (entropyReview.schema_version !== 1) {
		validationErrors.push("entropy review schema_version must be 1");
	}
	if (entropyReview.task !== "T9.7") {
		validationErrors.push("entropy review task must be T9.7");
	}
	if (entropyReview.report_version !== "entropy-review-v1") {
		validationErrors.push("entropy review report_version must be entropy-review-v1");
	}

	if (!Array.isArray(entropyReview.findings)) {
		validationErrors.push("entropy review findings must be an array");
	} else {
		result.findings_count = entropyReview.findings.length;
		for (const [index, finding] of entropyReview.findings.entries()) {
			validateEntropyReviewFinding(finding, index, result);
		}
	}

	const summary = entropyReview.summary;
	if (!isJsonObject(summary)) {
		validationErrors.push("entropy review summary must be a JSON object");
	} else {
		result.blocking_findings_remaining = Number.isInteger(summary.blocking_findings_remaining)
			? summary.blocking_findings_remaining
			: null;
		if (result.blocking_findings_remaining !== 0) {
			validationErrors.push("entropy review summary.blocking_findings_remaining must be 0");
		}
		if (summary.unclassified_drift_remaining !== false) {
			validationErrors.push("entropy review summary.unclassified_drift_remaining must be false");
		}
	}

	const reviewSet = entropyReview.release_candidate_review_set;
	if (!isJsonObject(reviewSet)) {
		validationErrors.push("entropy review release_candidate_review_set must be a JSON object");
	} else {
		result.unclassified_drift_remaining =
			typeof reviewSet.unclassified_drift_remaining === "boolean"
				? reviewSet.unclassified_drift_remaining
				: null;
		if (result.unclassified_drift_remaining !== false) {
			validationErrors.push(
				"entropy review release_candidate_review_set.unclassified_drift_remaining must be false",
			);
		}
	}

	if (result.findings_missing_primary_classification.length > 0) {
		validationErrors.push("entropy review findings require primary_classification");
	}
	if (result.findings_with_unsupported_primary_classification.length > 0) {
		validationErrors.push("entropy review findings use unsupported primary_classification");
	}
	if (result.findings_missing_blocking_status.length > 0) {
		validationErrors.push("entropy review findings require blocking_status");
	}
	if (result.findings_with_unsupported_blocking_status.length > 0) {
		validationErrors.push("entropy review findings use unsupported blocking_status");
	}
	if (result.findings_missing_follow_up_disposition.length > 0) {
		validationErrors.push("entropy review findings require follow_up_disposition");
	}

	result.status = validationErrors.length === 0 ? "pass" : "fail";
	return result;
}

function validateEntropyReviewFinding(finding, index, result) {
	const label = entropyReviewFindingLabel(finding, index);
	const primaryClassification = normalizeEntropyReviewText(finding?.primary_classification);
	if (primaryClassification === null) {
		result.findings_missing_primary_classification.push(label);
	} else if (!allowedEntropyReviewClassifications.has(primaryClassification)) {
		result.findings_with_unsupported_primary_classification.push({
			finding: label,
			primary_classification: primaryClassification,
		});
	}

	const blockingStatus = normalizeEntropyReviewText(finding?.blocking_status);
	if (blockingStatus === null) {
		result.findings_missing_blocking_status.push(label);
	} else if (!allowedEntropyReviewBlockingStatuses.has(blockingStatus)) {
		result.findings_with_unsupported_blocking_status.push({
			finding: label,
			blocking_status: blockingStatus,
		});
	}

	if (normalizeEntropyReviewText(finding?.follow_up_disposition) === null) {
		result.findings_missing_follow_up_disposition.push(label);
	}
}

function entropyReviewFindingLabel(finding, index) {
	return isNonEmptyString(finding?.id) ? finding.id.trim() : `#${index}`;
}

function normalizeEntropyReviewText(value) {
	return isNonEmptyString(value) ? value.trim() : null;
}

function isJsonObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function check(id, passed, details = {}) {
	return {
		id,
		status: passed ? "pass" : "fail",
		...details,
	};
}

function gate(id, name, checks) {
	return {
		id,
		name,
		status: checks.every((entry) => entry.status === "pass") ? "pass" : "fail",
		checks,
	};
}

function isNonEmptyString(value) {
	return typeof value === "string" && value.trim().length > 0;
}

function parseNpmRegistryCoordinate(value) {
	if (!isNonEmptyString(value)) {
		return null;
	}
	const separatorIndex = value.lastIndexOf("@");
	if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
		return null;
	}
	const packageName = value.slice(0, separatorIndex);
	const version = value.slice(separatorIndex + 1);
	if (!isNonEmptyString(packageName) || !isSemver(version)) {
		return null;
	}
	return { packageName, version };
}

function isSemver(value) {
	return isNonEmptyString(value) && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(value);
}

function isNpmIntegrity(value) {
	return isNonEmptyString(value) && /^sha\d+-[A-Za-z0-9+/]+={0,2}$/u.test(value);
}

function isSha1Hex(value) {
	return isNonEmptyString(value) && /^[a-f0-9]{40}$/iu.test(value);
}

function isSha256Hex(value) {
	return isNonEmptyString(value) && /^[a-f0-9]{64}$/iu.test(value);
}

function normalizeGoldenDiffs(goldenDiffs) {
	return goldenDiffs.map((diff, index) => normalizeGoldenDiff(diff, index));
}

function normalizeGoldenDiff(diff, index) {
	const path = normalizeGoldenDiffPath(diff?.path);
	const rawClassification = normalizeGoldenDiffClassificationText(diff?.classification);
	const classification =
		rawClassification !== null && allowedGoldenDiffClassifications.has(rawClassification)
			? rawClassification
			: null;
	return {
		index,
		path,
		classification,
		unsupportedClassification:
			rawClassification !== null && classification === null ? rawClassification : null,
		summary: typeof diff?.summary === "string" ? diff.summary : null,
	};
}

function normalizeGoldenDiffPath(value) {
	return isNonEmptyString(value) ? value.trim() : null;
}

function normalizeGoldenDiffClassificationText(value) {
	return isNonEmptyString(value) ? value.trim() : null;
}

function archiveInputs(options, errors) {
	const artifactsDir = join(options.outDir, "artifacts");
	mkdirSync(artifactsDir, { recursive: true });
	return artifactInputs.map(([name, defaultFilename, optionName]) => {
		const required = !postM9PublicationArtifactNames.has(name);
		const source = resolve(options[optionName]);
		const destination = join(artifactsDir, defaultFilename);
		if (!existsSync(source)) {
			if (required) {
				errors.push(`missing ${name}: ${source}`);
			}
			return {
				name,
				required,
				status: required ? "missing" : "pending",
				source: relativePath(options.repoRoot, source),
				archived_path: relativePath(options.repoRoot, destination),
			};
		}
		try {
			if (!statSync(source).isFile()) {
				errors.push(`invalid ${name}: ${source}: artifact path is not a file`);
				return {
					name,
					required,
					status: "invalid",
					source: relativePath(options.repoRoot, source),
					archived_path: relativePath(options.repoRoot, destination),
				};
			}
			copyFileSync(source, destination);
		} catch (error) {
			errors.push(`unable to archive ${name}: ${source}: ${error.code ?? "copy_failed"}`);
			return {
				name,
				required,
				status: "invalid",
				source: relativePath(options.repoRoot, source),
				archived_path: relativePath(options.repoRoot, destination),
			};
		}
		return {
			name,
			required,
			status: "archived",
			source: relativePath(options.repoRoot, source),
			archived_path: relativePath(options.repoRoot, destination),
		};
	});
}

function relativePath(root, path) {
	return relative(root, path).split("\\").join("/");
}

function buildReport(options) {
	const errors = [];
	const fixtureIndexResult = buildFixtureIndex(options.fixturesRoot, errors);
	const fixtureIndex = fixtureIndexResult.index;
	const reports = {
		fixture: readJson(options.fixtureReport, "fixture report", errors),
		golden: readJson(options.goldenReport, "golden report", errors),
		metamorphic: readJson(options.metamorphicReport, "metamorphic report", errors),
		crossPlatform: readJson(options.crossPlatformReport, "cross-platform report", errors),
		performance: readJson(options.performanceReport, "performance report", errors),
		dependencyAudit: readJson(options.dependencyAudit, "dependency audit", errors),
		goldenDiffs: readJson(options.goldenDiffs, "golden diffs", errors),
		consumerLockback: readOptionalJson(options.consumerLockback, "consumer lockback", errors),
		t10_5TarballArtifact: readOptionalJson(
			options.t10_5TarballArtifact,
			"T10.5 tarball artifact",
			errors,
		),
		t10_5PublicationDryRun: readOptionalJson(
			options.t10_5PublicationDryRun,
			"T10.5 publication dry-run",
			errors,
		),
		t10_6PublicationEvidence: readOptionalJson(
			options.t10_6PublicationEvidence,
			"T10.6 publication evidence",
			errors,
		),
		entropyReview: readJson(options.entropyReview, "entropy review", errors),
	};
	const goldenDiffs = Array.isArray(reports.goldenDiffs) ? reports.goldenDiffs : [];
	if (reports.goldenDiffs !== null && !Array.isArray(reports.goldenDiffs)) {
		errors.push("golden diffs report must be a JSON array");
	}
	const entropyReviewValidation = validateEntropyReview(reports.entropyReview);
	const publicationEvidenceValidation = validatePublicationEvidence(reports);

	const artifactResults = archiveInputs(options, errors);
	const gates = [
		evaluateGateA(reports.fixture, fixtureIndex, fixtureIndexResult.invalidLevelBManifests),
		evaluateGateB(reports.fixture, reports.golden, fixtureIndex, goldenDiffs),
		evaluateGateC(reports.fixture, fixtureIndex),
		evaluateGateD(reports.metamorphic),
		evaluateGateE(reports.crossPlatform),
		evaluateGateF(reports.performance),
		evaluateGateG(reports.dependencyAudit),
	];
	const checklist = evaluateChecklist(
		artifactResults,
		goldenDiffs,
		fixtureIndexResult.invalidLevelBManifests,
		entropyReviewValidation,
		publicationEvidenceValidation,
	);
	const verdict =
		errors.length === 0 &&
		checklist.verdict === "pass" &&
		gates.every((entry) => entry.status === "pass")
			? "pass"
			: "fail";

	return {
		schema_version: 1,
		task: "T9.6",
		report_version: "release-gate-report-v2",
		release_verdict: verdict,
		gates,
		publication_checklist: checklist,
		input_errors: errors,
	};
}

function writeReports(options, report) {
	mkdirSync(options.outDir, { recursive: true });
	const jsonPath = join(options.outDir, "release-report.json");
	const markdownPath = join(options.outDir, "release-report.md");
	writeFileSync(jsonPath, `${JSON.stringify(report, null, "\t")}\n`, "utf8");
	writeFileSync(markdownPath, renderMarkdownReport(report), "utf8");
	return { jsonPath, markdownPath };
}

function renderMarkdownReport(report) {
	const lines = [
		"# Release Gate Report",
		"",
		`Task: ${report.task}`,
		`Report version: ${report.report_version}`,
		`Release verdict: ${report.release_verdict}`,
		"",
		"## Gates",
		"",
	];
	for (const gateResult of report.gates) {
		lines.push(`- Gate ${gateResult.id}: ${gateResult.status} - ${gateResult.name}`);
	}
	lines.push("", "## Publication Checklist", "");
	lines.push(`Checklist verdict: ${report.publication_checklist.verdict}`);
	for (const artifact of report.publication_checklist.required_artifacts) {
		lines.push(`- ${artifact.name}: ${artifact.status} (${artifact.archived_path})`);
	}
	for (const artifact of report.publication_checklist.post_publication_evidence_artifacts) {
		lines.push(`- ${artifact.name}: ${artifact.status} (${artifact.archived_path})`);
	}
	lines.push("", "## Golden Diffs", "");
	if (report.publication_checklist.golden_diffs.length === 0) {
		lines.push("- none");
	} else {
		for (const diff of report.publication_checklist.golden_diffs) {
			lines.push(`- ${diff.path}: ${diff.classification ?? "unclassified"}`);
		}
	}
	if (report.input_errors.length > 0) {
		lines.push("", "## Input Errors", "");
		for (const error of report.input_errors) {
			lines.push(`- ${error}`);
		}
	}
	lines.push("");
	return lines.join("\n");
}

const options = parseArgs(process.argv.slice(2));
const report = buildReport(options);
const paths = writeReports(options, report);

process.stdout.write(`release report: ${relativePath(options.repoRoot, paths.jsonPath)}\n`);
process.stdout.write(
	`release report markdown: ${relativePath(options.repoRoot, paths.markdownPath)}\n`,
);
process.stdout.write(`release verdict: ${report.release_verdict}\n`);
process.exit(report.release_verdict === "pass" ? 0 : 1);
