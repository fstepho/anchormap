import type { AnchorId } from "../domain/anchor-id";
import { sortAnchorIdsByUtf8, sortRepoPathsByUtf8 } from "../domain/canonical-order";
import type { Config } from "./config-io";

export function renderConfigCanonicalYaml(config: Config): string {
	const lines: string[] = [
		"version: 1",
		`product_root: ${renderSingleQuoted(config.productRoot)}`,
		"spec_roots:",
	];

	for (const specRoot of sortRepoPathsByUtf8(config.specRoots)) {
		lines.push(`  - ${renderSingleQuoted(specRoot)}`);
	}

	const ignoreRoots = sortRepoPathsByUtf8(config.ignoreRoots);
	if (ignoreRoots.length > 0) {
		lines.push("ignore_roots:");
		for (const ignoreRoot of ignoreRoots) {
			lines.push(`  - ${renderSingleQuoted(ignoreRoot)}`);
		}
	}

	const anchors = sortAnchorIdsByUtf8(Object.keys(config.mappings) as AnchorId[]);
	if (anchors.length === 0) {
		lines.push("mappings: {}");
		return `${lines.join("\n")}\n`;
	}

	lines.push("mappings:");
	for (const anchor of anchors) {
		const mapping = config.mappings[anchor];
		lines.push(`  ${renderSingleQuoted(anchor)}:`, "    seed_files:");
		for (const seedFile of sortRepoPathsByUtf8(mapping.seedFiles)) {
			lines.push(`      - ${renderSingleQuoted(seedFile)}`);
		}
	}

	return `${lines.join("\n")}\n`;
}

function renderSingleQuoted(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}
