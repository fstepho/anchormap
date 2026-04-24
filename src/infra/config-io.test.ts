import { strict as assert } from "node:assert";
import { Buffer } from "node:buffer";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
	ANCHORMAP_CONFIG_FILENAME,
	type Config,
	type ConfigYamlReadFile,
	loadAnchormapYaml,
	loadConfig,
	parseAnchormapConfigText,
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

test("does not search parent directories for anchormap.yaml", () => {
	const parent = mkdtempSync(join(tmpdir(), "anchormap-config-parent-"));
	const cwd = join(parent, "nested");
	mkdirSync(cwd);
	writeFileSync(join(parent, ANCHORMAP_CONFIG_FILENAME), "version: 1\n");

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

test("loads a normalized Config model from anchormap.yaml", () => {
	const result = parseAnchormapConfigText(`
version: 1
product_root: src
spec_roots:
  - specs/z
  - specs/a
ignore_roots:
  - src/vendor
  - src/generated
mappings:
  DOC.README.PRESENT:
    seed_files:
      - src/core/z.ts
      - src/core/a.ts
  FR-014:
    seed_files:
      - src/changelog/validate-format.ts
`);

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(configToPlainObject(result.config), {
			version: 1,
			productRoot: "src",
			specRoots: ["specs/a", "specs/z"],
			ignoreRoots: ["src/generated", "src/vendor"],
			mappings: {
				"DOC.README.PRESENT": {
					seedFiles: ["src/core/a.ts", "src/core/z.ts"],
				},
				"FR-014": {
					seedFiles: ["src/changelog/validate-format.ts"],
				},
			},
		});
	}
});

test("loadConfig validates product_root and spec_roots as existing directories", () => {
	const cwd = mkdtempSync(join(tmpdir(), "anchormap-config-roots-"));
	mkdirSync(join(cwd, "src"));
	mkdirSync(join(cwd, "specs"));
	writeFileSync(
		join(cwd, ANCHORMAP_CONFIG_FILENAME),
		`
version: 1
product_root: src
spec_roots:
  - specs
`,
	);

	const result = loadConfig({ cwd });

	assert.equal(result.kind, "ok");
});

test("loadConfig classifies missing product_root as ConfigError", () => {
	const cwd = mkdtempSync(join(tmpdir(), "anchormap-config-product-missing-"));
	mkdirSync(join(cwd, "specs"));
	writeFileSync(
		join(cwd, ANCHORMAP_CONFIG_FILENAME),
		`
version: 1
product_root: src
spec_roots:
  - specs
`,
	);

	const result = loadConfig({ cwd });

	assertConfigError(result);
});

test("loadConfig classifies non-directory product_root as ConfigError", () => {
	const cwd = mkdtempSync(join(tmpdir(), "anchormap-config-product-file-"));
	writeFileSync(join(cwd, "src"), "");
	mkdirSync(join(cwd, "specs"));
	writeFileSync(
		join(cwd, ANCHORMAP_CONFIG_FILENAME),
		`
version: 1
product_root: src
spec_roots:
  - specs
`,
	);

	const result = loadConfig({ cwd });

	assertConfigError(result);
});

test("loadConfig classifies missing spec_root as ConfigError", () => {
	const cwd = mkdtempSync(join(tmpdir(), "anchormap-config-spec-missing-"));
	mkdirSync(join(cwd, "src"));
	writeFileSync(
		join(cwd, ANCHORMAP_CONFIG_FILENAME),
		`
version: 1
product_root: src
spec_roots:
  - specs
`,
	);

	const result = loadConfig({ cwd });

	assertConfigError(result);
});

test("loadConfig classifies non-directory spec_root as ConfigError", () => {
	const cwd = mkdtempSync(join(tmpdir(), "anchormap-config-spec-file-"));
	mkdirSync(join(cwd, "src"));
	writeFileSync(join(cwd, "specs"), "");
	writeFileSync(
		join(cwd, ANCHORMAP_CONFIG_FILENAME),
		`
version: 1
product_root: src
spec_roots:
  - specs
`,
	);

	const result = loadConfig({ cwd });

	assertConfigError(result);
});

test("defaults absent optional ignore_roots and mappings to empty values", () => {
	const result = parseAnchormapConfigText(`
version: 1
product_root: src
spec_roots:
  - specs
`);

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.deepEqual(configToPlainObject(result.config), {
			version: 1,
			productRoot: "src",
			specRoots: ["specs"],
			ignoreRoots: [],
			mappings: {},
		});
	}
});

test("classifies duplicate and overlapping spec_roots as ConfigError", () => {
	for (const source of [
		`
version: 1
product_root: src
spec_roots:
  - specs
  - specs
`,
		`
version: 1
product_root: src
spec_roots:
  - specs
  - specs/api
`,
	]) {
		const result = parseAnchormapConfigText(source);

		assertConfigError(result);
	}
});

test("classifies duplicate and overlapping ignore_roots as ConfigError", () => {
	for (const source of [
		`
version: 1
product_root: src
spec_roots:
  - specs
ignore_roots:
  - src/generated
  - src/generated
`,
		`
version: 1
product_root: src
spec_roots:
  - specs
ignore_roots:
  - src/generated
  - src/generated/client
`,
	]) {
		const result = parseAnchormapConfigText(source);

		assertConfigError(result);
	}
});

test("loadConfig rejects existing ignore_roots outside product_root", () => {
	const cwd = mkdtempSync(join(tmpdir(), "anchormap-config-ignore-outside-"));
	mkdirSync(join(cwd, "src"));
	mkdirSync(join(cwd, "specs"));
	mkdirSync(join(cwd, "other"));
	writeFileSync(
		join(cwd, ANCHORMAP_CONFIG_FILENAME),
		`
version: 1
product_root: src
spec_roots:
  - specs
ignore_roots:
  - other
`,
	);

	const result = loadConfig({ cwd });

	assertConfigError(result);
});

test("loadConfig accepts absent ignore_roots outside product_root", () => {
	const cwd = mkdtempSync(join(tmpdir(), "anchormap-config-ignore-absent-"));
	mkdirSync(join(cwd, "src"));
	mkdirSync(join(cwd, "specs"));
	writeFileSync(
		join(cwd, ANCHORMAP_CONFIG_FILENAME),
		`
version: 1
product_root: src
spec_roots:
  - specs
ignore_roots:
  - other
`,
	);

	const result = loadConfig({ cwd });

	assert.equal(result.kind, "ok");
});

test("loadConfig classifies schema validation failures as ConfigError", () => {
	const result = loadConfig({
		cwd: "/repo",
		readFile: () =>
			Buffer.from(
				`
version: 1
product_root: src
spec_roots: []
`,
				"utf8",
			),
	});

	assertConfigError(result);
});

test("classifies unknown top-level fields as ConfigError", () => {
	const result = parseAnchormapConfigText(`
version: 1
product_root: src
spec_roots:
  - specs
extra: true
`);

	assertConfigError(result);
});

test("classifies missing required config fields as ConfigError", () => {
	for (const source of [
		`
product_root: src
spec_roots:
  - specs
`,
		`
version: 1
spec_roots:
  - specs
`,
		`
version: 1
product_root: src
`,
	]) {
		const result = parseAnchormapConfigText(source);

		assertConfigError(result);
	}
});

test("classifies non-integer or unsupported versions as ConfigError", () => {
	for (const source of [
		`
version: "1"
product_root: src
spec_roots:
  - specs
`,
		`
version: 2
product_root: src
spec_roots:
  - specs
`,
		`
version: 1.5
product_root: src
spec_roots:
  - specs
`,
	]) {
		const result = parseAnchormapConfigText(source);

		assertConfigError(result);
	}
});

test("classifies invalid product_root shapes and paths as ConfigError", () => {
	for (const source of [
		`
version: 1
product_root:
  - src
spec_roots:
  - specs
`,
		`
version: 1
product_root: ./src
spec_roots:
  - specs
`,
		`
version: 1
product_root: /src
spec_roots:
  - specs
`,
		`
version: 1
product_root: ../src
spec_roots:
  - specs
`,
	]) {
		const result = parseAnchormapConfigText(source);

		assertConfigError(result);
	}
});

test("classifies invalid spec_roots shapes, emptiness, items, and paths as ConfigError", () => {
	for (const source of [
		`
version: 1
product_root: src
spec_roots: specs
`,
		`
version: 1
product_root: src
spec_roots: []
`,
		`
version: 1
product_root: src
spec_roots:
  - 1
`,
		`
version: 1
product_root: src
spec_roots:
  - specs/
`,
		`
version: 1
product_root: src
spec_roots:
  - /specs
`,
		`
version: 1
product_root: src
spec_roots:
  - ../specs
`,
	]) {
		const result = parseAnchormapConfigText(source);

		assertConfigError(result);
	}
});

test("classifies invalid ignore_roots shapes, items, and paths as ConfigError", () => {
	for (const source of [
		`
version: 1
product_root: src
spec_roots:
  - specs
ignore_roots: src/generated
`,
		`
version: 1
product_root: src
spec_roots:
  - specs
ignore_roots:
  - false
`,
		`
version: 1
product_root: src
spec_roots:
  - specs
ignore_roots:
  - src//generated
`,
		`
version: 1
product_root: src
spec_roots:
  - specs
ignore_roots:
  - /src/generated
`,
		`
version: 1
product_root: src
spec_roots:
  - specs
ignore_roots:
  - ../generated
`,
	]) {
		const result = parseAnchormapConfigText(source);

		assertConfigError(result);
	}
});

test("classifies invalid mappings shape and anchor keys as ConfigError", () => {
	for (const source of [
		`
version: 1
product_root: src
spec_roots:
  - specs
mappings: []
`,
		`
version: 1
product_root: src
spec_roots:
  - specs
mappings:
  not-supported:
    seed_files:
      - src/a.ts
`,
		`
version: 1
product_root: src
spec_roots:
  - specs
mappings:
  12:
    seed_files:
      - src/a.ts
`,
	]) {
		const result = parseAnchormapConfigText(source);

		assertConfigError(result);
	}
});

test("classifies invalid mapping values and unknown mapping fields as ConfigError", () => {
	for (const source of [
		`
version: 1
product_root: src
spec_roots:
  - specs
mappings:
  FR-014: []
`,
		`
version: 1
product_root: src
spec_roots:
  - specs
mappings:
  FR-014:
    seed_files:
      - src/a.ts
    extra: true
`,
		`
version: 1
product_root: src
spec_roots:
  - specs
mappings:
  FR-014:
    other:
      - src/a.ts
`,
	]) {
		const result = parseAnchormapConfigText(source);

		assertConfigError(result);
	}
});

test("classifies invalid seed_files shape, emptiness, items, paths, and duplicates as ConfigError", () => {
	for (const source of [
		`
version: 1
product_root: src
spec_roots:
  - specs
mappings:
  FR-014:
    seed_files: src/a.ts
`,
		`
version: 1
product_root: src
spec_roots:
  - specs
mappings:
  FR-014:
    seed_files: []
`,
		`
version: 1
product_root: src
spec_roots:
  - specs
mappings:
  FR-014:
    seed_files:
      - true
`,
		`
version: 1
product_root: src
spec_roots:
  - specs
mappings:
  FR-014:
    seed_files:
      - /src/a.ts
`,
		`
version: 1
product_root: src
spec_roots:
  - specs
mappings:
  FR-014:
    seed_files:
      - src/a.ts
      - src/a.ts
`,
	]) {
		const result = parseAnchormapConfigText(source);

		assertConfigError(result);
	}
});

function assertConfigError(
	result: { kind: "ok" } | { kind: "error"; error: { kind: string } },
): void {
	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.error.kind, "ConfigError");
	}
}

function configToPlainObject(config: Config): unknown {
	return config;
}
