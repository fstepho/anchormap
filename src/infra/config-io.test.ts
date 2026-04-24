import { strict as assert } from "node:assert";
import { Buffer } from "node:buffer";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
	ANCHORMAP_CONFIG_FILENAME,
	type ConfigYamlReadFile,
	loadAnchormapYaml,
	parseAnchormapYamlText,
} from "./config-io";

test("loads exactly anchormap.yaml from the provided cwd", () => {
	const cwd = mkdtempSync(join(tmpdir(), "anchormap-config-"));
	writeFileSync(join(cwd, ANCHORMAP_CONFIG_FILENAME), "version: 1\n");

	const result = loadAnchormapYaml({ cwd });

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.equal(result.yaml.path, join(cwd, ANCHORMAP_CONFIG_FILENAME));
		assert.equal(result.yaml.root.get("version"), 1);
	}
});

test("classifies missing anchormap.yaml as ConfigError", () => {
	const cwd = mkdtempSync(join(tmpdir(), "anchormap-config-missing-"));

	const result = loadAnchormapYaml({ cwd });

	assertConfigError(result);
});

test("classifies unreadable anchormap.yaml reads as ConfigError", () => {
	const readFile: ConfigYamlReadFile = () => {
		throw Object.assign(new Error("EACCES"), { code: "EACCES" });
	};

	const result = loadAnchormapYaml({
		cwd: "/repo",
		readFile,
	});

	assertConfigError(result);
});

test("classifies non-UTF-8 anchormap.yaml as ConfigError", () => {
	const result = loadAnchormapYaml({
		cwd: "/repo",
		readFile: () => Uint8Array.from([0x76, 0x65, 0x72, 0x80]),
	});

	assertConfigError(result);
});

test("classifies invalid YAML as ConfigError", () => {
	const result = parseAnchormapYamlText("version: [\n");

	assertConfigError(result);
});

test("classifies multidocument YAML as ConfigError", () => {
	const result = parseAnchormapYamlText("version: 1\n---\nversion: 1\n");

	assertConfigError(result);
});

test("classifies root non-mapping YAML as ConfigError", () => {
	const result = parseAnchormapYamlText("- version\n");

	assertConfigError(result);
});

test("classifies duplicate keys at any mapping depth as ConfigError", () => {
	for (const source of ["version: 1\nversion: 1\n", "mappings:\n  A:\n    x: 1\n    x: 2\n"]) {
		const result = parseAnchormapYamlText(source);

		assertConfigError(result);
	}
});

test("accepts explicit YAML 1.2 directives when otherwise valid", () => {
	const result = parseAnchormapYamlText("%YAML 1.2\n---\nversion: 1\n");

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.equal(result.yaml.root.get("version"), 1);
	}
});

test("classifies explicit non-1.2 YAML directives as ConfigError", () => {
	for (const source of [
		"%YAML 1.1\n---\nversion: 1\n",
		"%YAML 1.3\n---\nversion: 1\n",
		"%YAML 2.0\n---\nversion: 1\n",
	]) {
		const result = parseAnchormapYamlText(source);

		assertConfigError(result);
	}
});

test("removes an initial BOM before YAML parsing", () => {
	const result = loadAnchormapYaml({
		cwd: "/repo",
		readFile: () => Buffer.from("\uFEFFversion: 1\n", "utf8"),
	});

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.equal(result.yaml.root.get("version"), 1);
	}
});

function assertConfigError(result: ReturnType<typeof loadAnchormapYaml>): void {
	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.error.kind, "ConfigError");
	}
}
