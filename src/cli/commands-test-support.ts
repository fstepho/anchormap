import { strict as assert } from "node:assert";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type RepoPath, validateRepoPath } from "../domain/repo-path";
import {
	type AnchormapCommandContext,
	type AnchormapCommandHandlers,
	type AppError,
	commandSuccess,
} from "./commands";

export function createBufferingWriter(): {
	writer: { write(chunk: string): boolean };
	read(): string;
} {
	const chunks: string[] = [];

	return {
		writer: {
			write(chunk: string): boolean {
				chunks.push(chunk);
				return true;
			},
		},
		read(): string {
			return chunks.join("");
		},
	};
}

export function createRecordingHandlers(calls: string[]): AnchormapCommandHandlers {
	function record(
		command: string,
	): (context: AnchormapCommandContext) => ReturnType<AnchormapCommandHandlers["scan"]> {
		return (context) => {
			const initSuffix = context.initArgs
				? `:root=${context.initArgs.root}:spec=${context.initArgs.specRoots.join(",")}:ignore=${context.initArgs.ignoreRoots.join(",")}`
				: "";
			const mapSuffix = context.mapArgs
				? `:anchor=${context.mapArgs.anchor}:seeds=${context.mapArgs.seeds.join(",")}:replace=${context.mapArgs.replace}`
				: "";
			const scanSuffix = context.scanMode ? `:${context.scanMode}` : "";
			const scaffoldSuffix = context.scaffoldArgs ? `:output=${context.scaffoldArgs.output}` : "";
			const checkSuffix = context.checkArgs
				? `:policy=${context.checkArgs.policy}:scan=${context.checkArgs.scan ?? ""}:json=${context.checkArgs.json}`
				: "";
			const diffSuffix = context.diffArgs
				? `:base=${context.diffArgs.base}:head=${context.diffArgs.head}:json=${context.diffArgs.json}`
				: "";
			const explainSuffix = context.explainArgs
				? `:scan=${context.explainArgs.scan}:anchor=${context.explainArgs.anchor ?? ""}:file=${context.explainArgs.file ?? ""}:json=${context.explainArgs.json}`
				: "";
			const reportSuffix = context.reportArgs
				? `:scan=${context.reportArgs.scan}:check=${context.reportArgs.check ?? ""}:diff=${context.reportArgs.diff ?? ""}:format=${context.reportArgs.format}`
				: "";
			const suffix = `${initSuffix}${mapSuffix}${scanSuffix}${scaffoldSuffix}${checkSuffix}${diffSuffix}${explainSuffix}${reportSuffix}`;
			calls.push(`${command}:${context.args.join(" ")}${suffix}`);
			if (
				context.scanMode === "json" ||
				context.checkArgs?.json ||
				context.diffArgs?.json ||
				context.explainArgs?.json
			) {
				return commandSuccess({ stdout: "{}\n" });
			}
			if (context.reportArgs) {
				return commandSuccess({ stdout: "report\n" });
			}
			return commandSuccess();
		};
	}

	return {
		init: record("init"),
		map: record("map"),
		scan: record("scan"),
		scaffold: record("scaffold"),
		check: record("check"),
		diff: record("diff"),
		explain: record("explain"),
		report: record("report"),
	};
}

export function createHandlersReturning(result: AppError): AnchormapCommandHandlers {
	return {
		init: () => result,
		map: () => result,
		scan: () => result,
		scaffold: () => result,
		check: () => result,
		diff: () => result,
		explain: () => result,
		report: () => result,
	};
}

export function createTempRepo(): string {
	return mkdtempSync(join(tmpdir(), "anchormap-init-"));
}

export function repoPath(value: string): RepoPath {
	const result = validateRepoPath(value);
	assert.equal(result.kind, "ok");
	if (result.kind !== "ok") {
		throw new Error(`invalid RepoPath fixture value ${value}`);
	}
	return result.repoPath;
}

export function traceabilityMetrics(input: {
	readonly productFileCount?: number;
	readonly storedMappingCount?: number;
	readonly usableMappingCount?: number;
	readonly observedAnchorCount?: number;
	readonly activeAnchorCount?: number;
	readonly draftAnchorCount?: number;
	readonly coveredProductFileCount?: number;
	readonly uncoveredProductFileCount?: number;
	readonly directlySeededProductFileCount?: number;
	readonly singleCoverProductFileCount?: number;
	readonly multiCoverProductFileCount?: number;
	readonly anchors?: Record<string, ReturnType<typeof anchorTraceabilityMetrics>>;
}) {
	return {
		summary: {
			product_file_count: input.productFileCount ?? 0,
			stored_mapping_count: input.storedMappingCount ?? 0,
			usable_mapping_count: input.usableMappingCount ?? 0,
			observed_anchor_count: input.observedAnchorCount ?? 0,
			active_anchor_count:
				input.activeAnchorCount ?? (input.observedAnchorCount ?? 0) - (input.draftAnchorCount ?? 0),
			draft_anchor_count: input.draftAnchorCount ?? 0,
			covered_product_file_count: input.coveredProductFileCount ?? 0,
			uncovered_product_file_count: input.uncoveredProductFileCount ?? 0,
			directly_seeded_product_file_count: input.directlySeededProductFileCount ?? 0,
			single_cover_product_file_count: input.singleCoverProductFileCount ?? 0,
			multi_cover_product_file_count: input.multiCoverProductFileCount ?? 0,
		},
		anchors: input.anchors ?? {},
	};
}

export function anchorTraceabilityMetrics(
	input: {
		readonly seedFileCount?: number;
		readonly directSeedFileCount?: number;
		readonly reachedFileCount?: number;
		readonly transitiveReachedFileCount?: number;
		readonly uniqueReachedFileCount?: number;
		readonly sharedReachedFileCount?: number;
	} = {},
) {
	return {
		seed_file_count: input.seedFileCount ?? 0,
		direct_seed_file_count: input.directSeedFileCount ?? 0,
		reached_file_count: input.reachedFileCount ?? 0,
		transitive_reached_file_count: input.transitiveReachedFileCount ?? 0,
		unique_reached_file_count: input.uniqueReachedFileCount ?? 0,
		shared_reached_file_count: input.sharedReachedFileCount ?? 0,
	};
}

export function writeMinimalScanConfig(cwd: string): void {
	writeFileSync(
		join(cwd, "anchormap.yaml"),
		["version: 1", "product_root: 'src'", "spec_roots:", "  - 'specs'", "mappings: {}", ""].join(
			"\n",
		),
	);
}

export function tsconfigWithAtAlias(): string {
	return [
		"{",
		'  "compilerOptions": {',
		'    "baseUrl": ".",',
		'    "paths": {',
		'      "@/*": ["src/*"]',
		"    }",
		"  }",
		"}",
		"",
	].join("\n");
}

export function assertNoAnchormapTemps(cwd: string): void {
	assert.equal(
		readdirSync(cwd).some(
			(entry) => entry.startsWith(".anchormap.yaml.") && entry.endsWith(".tmp"),
		),
		false,
	);
}

export function minimalScanArtifactJson(schemaVersion: 4 | 5 = 4): string {
	return `${JSON.stringify({
		schema_version: schemaVersion,
		config: {
			version: 1,
			product_root: "src",
			spec_roots: ["specs"],
			ignore_roots: [],
			tsconfig_path: null,
			local_aliases: [],
		},
		analysis_health: "clean",
		observed_anchors: {},
		stored_mappings: {},
		files: {},
		traceability_metrics: traceabilityMetrics({}),
		findings: [],
	})}\n`;
}
