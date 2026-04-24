import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isMap, parseAllDocuments, type YAMLMap } from "yaml";

import type { AppError } from "../cli/commands";
import { decodeUtf8StrictNoBom } from "./repo-fs";

export const ANCHORMAP_CONFIG_FILENAME = "anchormap.yaml";

export type ConfigYamlReadFile = (path: string) => Uint8Array;

export interface LoadAnchormapYamlOptions {
	cwd?: string;
	readFile?: ConfigYamlReadFile;
}

export interface LoadedAnchormapYaml {
	path: string;
	root: YAMLMap;
}

export type LoadAnchormapYamlResult =
	| { kind: "ok"; yaml: LoadedAnchormapYaml }
	| { kind: "error"; error: AppError };

export function loadAnchormapYaml(options: LoadAnchormapYamlOptions = {}): LoadAnchormapYamlResult {
	const cwd = options.cwd ?? process.cwd();
	const readFile = options.readFile ?? readFileSync;
	const configPath = join(cwd, ANCHORMAP_CONFIG_FILENAME);
	let bytes: Uint8Array;

	try {
		bytes = readFile(configPath);
	} catch (error) {
		return configLoadError("cannot read anchormap.yaml", error);
	}

	const decoded = decodeUtf8StrictNoBom(bytes);
	if (decoded.kind === "decode_error") {
		return configLoadError("anchormap.yaml is not valid UTF-8", decoded.error);
	}

	return parseAnchormapYamlText(decoded.text, configPath);
}

export function parseAnchormapYamlText(
	text: string,
	configPath = ANCHORMAP_CONFIG_FILENAME,
): LoadAnchormapYamlResult {
	let documents: ReturnType<typeof parseAllDocuments>;

	try {
		documents = parseAllDocuments(text, {
			version: "1.2",
			uniqueKeys: true,
		});
	} catch (error) {
		return configLoadError("anchormap.yaml is invalid YAML", error);
	}

	if (documents.length !== 1) {
		return configLoadError("anchormap.yaml must contain exactly one YAML document");
	}

	const [document] = documents;
	if (document.errors.length > 0) {
		return configLoadError("anchormap.yaml is invalid YAML", document.errors[0]);
	}

	const yamlVersionViolation = getYamlVersionDirectiveViolation(document);
	if (yamlVersionViolation !== undefined) {
		return configLoadError("anchormap.yaml must use YAML 1.2", yamlVersionViolation);
	}

	if (!isMap(document.contents)) {
		return configLoadError("anchormap.yaml root must be a mapping");
	}

	return {
		kind: "ok",
		yaml: {
			path: configPath,
			root: document.contents,
		},
	};
}

type ParsedYamlDocument = ReturnType<typeof parseAllDocuments>[number];

function getYamlVersionDirectiveViolation(document: ParsedYamlDocument): unknown {
	if (document.directives?.yaml.explicit === true && document.directives.yaml.version !== "1.2") {
		return document.directives.yaml;
	}

	return document.warnings.find(
		(warning) =>
			warning.code === "BAD_DIRECTIVE" && warning.message.startsWith("Unsupported YAML version "),
	);
}

function configLoadError(message: string, cause?: unknown): LoadAnchormapYamlResult {
	return {
		kind: "error",
		error: {
			kind: "ConfigError",
			message,
			cause,
		},
	};
}
