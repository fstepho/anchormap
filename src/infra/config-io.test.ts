import { strict as assert } from "node:assert";
import { Buffer } from "node:buffer";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
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
	renderConfigCanonicalYaml,
	type WriteConfigAtomicFs,
	writeConfigAtomic,
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

test("renders minimal config as canonical YAML with empty mappings", () => {
	const rendered = renderParsedConfig(`
version: 1
product_root: src
spec_roots:
  - specs
`);

	assert.equal(
		rendered,
		"version: 1\n" + "product_root: 'src'\n" + "spec_roots:\n" + "  - 'specs'\n" + "mappings: {}\n",
	);
	assertUtf8NoBomWithSingleFinalNewline(rendered);
});

test("renders canonical YAML with sorted roots, anchors, and seed files", () => {
	const rendered = renderParsedConfig(`
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

	assert.equal(
		rendered,
		"version: 1\n" +
			"product_root: 'src'\n" +
			"spec_roots:\n" +
			"  - 'specs/a'\n" +
			"  - 'specs/z'\n" +
			"ignore_roots:\n" +
			"  - 'src/generated'\n" +
			"  - 'src/vendor'\n" +
			"mappings:\n" +
			"  'DOC.README.PRESENT':\n" +
			"    seed_files:\n" +
			"      - 'src/core/a.ts'\n" +
			"      - 'src/core/z.ts'\n" +
			"  'FR-014':\n" +
			"    seed_files:\n" +
			"      - 'src/changelog/validate-format.ts'\n",
	);
	assertUtf8NoBomWithSingleFinalNewline(rendered);
});

test("omits empty ignore_roots when rendering canonical YAML", () => {
	const rendered = renderParsedConfig(`
version: 1
product_root: src
spec_roots:
  - specs
ignore_roots: []
`);

	assert.equal(
		rendered,
		"version: 1\n" + "product_root: 'src'\n" + "spec_roots:\n" + "  - 'specs'\n" + "mappings: {}\n",
	);
});

test("doubles internal single quotes when rendering canonical YAML strings", () => {
	const rendered = renderParsedConfig(`
version: 1
product_root: src/app's
spec_roots:
  - specs/owner's-guide
ignore_roots:
  - src/app's/generated
mappings:
  FR-014:
    seed_files:
      - src/app's/main.ts
`);

	assert.equal(
		rendered,
		"version: 1\n" +
			"product_root: 'src/app''s'\n" +
			"spec_roots:\n" +
			"  - 'specs/owner''s-guide'\n" +
			"ignore_roots:\n" +
			"  - 'src/app''s/generated'\n" +
			"mappings:\n" +
			"  'FR-014':\n" +
			"    seed_files:\n" +
			"      - 'src/app''s/main.ts'\n",
	);
});

test("writeConfigAtomic writes complete canonical YAML through the same-directory temp path", () => {
	const cwd = mkdtempSync(join(tmpdir(), "anchormap-write-success-"));
	const config = parseValidConfig(`
version: 1
product_root: src
spec_roots:
  - specs/z
  - specs/a
mappings:
  FR-014:
    seed_files:
      - src/z.ts
      - src/a.ts
`);

	const result = writeConfigAtomic(config, { cwd });

	assert.equal(result.kind, "ok");
	assert.equal(
		readFileSync(join(cwd, ANCHORMAP_CONFIG_FILENAME), "utf8"),
		"version: 1\n" +
			"product_root: 'src'\n" +
			"spec_roots:\n" +
			"  - 'specs/a'\n" +
			"  - 'specs/z'\n" +
			"mappings:\n" +
			"  'FR-014':\n" +
			"    seed_files:\n" +
			"      - 'src/a.ts'\n" +
			"      - 'src/z.ts'\n",
	);
	assertNoAnchormapTemps(cwd);
});

test("writeConfigAtomic returns WriteError before temp reservation without touching disk", () => {
	const cwd = mkdtempSync(join(tmpdir(), "anchormap-write-before-temp-"));
	const config = minimalConfig();

	const result = writeConfigAtomic(config, {
		cwd,
		faults: {
			beforeTempReservation: () => {
				throw new Error("injected before temp reservation");
			},
		},
	});

	assertWriteError(result);
	assert.equal(existsSync(join(cwd, ANCHORMAP_CONFIG_FILENAME)), false);
	assertNoAnchormapTemps(cwd);
});

test("writeConfigAtomic cleans up an attempt-owned temp file after temp creation failure", () => {
	const cwd = mkdtempSync(join(tmpdir(), "anchormap-write-after-temp-"));
	const config = minimalConfig();

	const result = writeConfigAtomic(config, {
		cwd,
		faults: {
			afterTempCreation: () => {
				throw new Error("injected after temp creation");
			},
		},
	});

	assertWriteError(result);
	assert.equal(existsSync(join(cwd, ANCHORMAP_CONFIG_FILENAME)), false);
	assertNoAnchormapTemps(cwd);
});

test("writeConfigAtomic returns InternalError when cleanup unlink fails", () => {
	const cleanupFailure = errorWithCode("EACCES", "unlink denied");
	const fs: WriteConfigAtomicFs = {
		openExclusive: () => 9,
		writeAll: () => {},
		fsync: () => {},
		close: () => {},
		rename: () => {
			throw new Error("rename must not run after pre-commit failure");
		},
		unlink: () => {
			throw cleanupFailure;
		},
		exists: () => true,
	};

	const result = writeConfigAtomic(minimalConfig(), {
		cwd: "/repo",
		fs,
		faults: {
			afterTempCreation: () => {
				throw new Error("injected after temp creation");
			},
		},
	});

	assertInternalError(result);
	if (result.kind === "error") {
		assert.equal(result.error.cause, cleanupFailure);
	}
});

test("writeConfigAtomic returns InternalError when cleanup absence check fails", () => {
	const cleanupFailure = errorWithCode("EIO", "exists failed");
	let tempExists = false;
	const fs: WriteConfigAtomicFs = {
		openExclusive: () => {
			tempExists = true;
			return 9;
		},
		writeAll: () => {},
		fsync: () => {},
		close: () => {},
		rename: () => {
			throw new Error("rename must not run after pre-commit failure");
		},
		unlink: () => {
			tempExists = false;
		},
		exists: () => {
			assert.equal(tempExists, false);
			throw cleanupFailure;
		},
	};

	const result = writeConfigAtomic(minimalConfig(), {
		cwd: "/repo",
		fs,
		faults: {
			afterWriteBeforeFsync: () => {
				throw new Error("injected after write");
			},
		},
	});

	assertInternalError(result);
	if (result.kind === "error") {
		assert.equal(result.error.cause, cleanupFailure);
	}
});

test("writeConfigAtomic returns InternalError when cleanup close fails", () => {
	const cleanupFailure = errorWithCode("EIO", "close failed");
	const operations: string[] = [];
	const fs: WriteConfigAtomicFs = {
		openExclusive: () => {
			operations.push("open");
			return 9;
		},
		writeAll: () => {
			operations.push("write");
		},
		fsync: () => {
			operations.push("fsync");
		},
		close: () => {
			operations.push("cleanup-close");
			throw cleanupFailure;
		},
		rename: () => {
			throw new Error("rename must not run after pre-commit failure");
		},
		unlink: () => {
			operations.push("unlink");
		},
		exists: () => {
			operations.push("exists");
			return false;
		},
	};

	const result = writeConfigAtomic(minimalConfig(), {
		cwd: "/repo",
		fs,
		faults: {
			afterTempCreation: () => {
				throw new Error("injected after temp creation");
			},
		},
	});

	assertInternalError(result);
	if (result.kind === "error") {
		assert.equal(result.error.cause, cleanupFailure);
	}
	assert.deepEqual(operations, ["open", "cleanup-close", "unlink", "exists"]);
});

test("writeConfigAtomic preserves the initial target and cleans up before rename failures", () => {
	const cwd = mkdtempSync(join(tmpdir(), "anchormap-write-before-rename-"));
	writeFileSync(join(cwd, ANCHORMAP_CONFIG_FILENAME), "initial bytes\n");

	const result = writeConfigAtomic(minimalConfig(), {
		cwd,
		faults: {
			beforeRename: () => {
				throw new Error("injected before rename");
			},
		},
	});

	assertWriteError(result);
	assert.equal(readFileSync(join(cwd, ANCHORMAP_CONFIG_FILENAME), "utf8"), "initial bytes\n");
	assertNoAnchormapTemps(cwd);
});

test("writeConfigAtomic retries EEXIST candidates without deleting collision paths", () => {
	const cwd = mkdtempSync(join(tmpdir(), "anchormap-write-eexist-"));
	const collision = tempCandidatePath(cwd, 0);
	writeFileSync(collision, "collision bytes\n");

	const result = writeConfigAtomic(minimalConfig(), { cwd });

	assert.equal(result.kind, "ok");
	assert.equal(readFileSync(collision, "utf8"), "collision bytes\n");
	assert.equal(existsSync(tempCandidatePath(cwd, 1)), false);
	assert.equal(readFileSync(join(cwd, ANCHORMAP_CONFIG_FILENAME), "utf8"), minimalConfigYaml());
});

test("writeConfigAtomic preserves non-owned collisions while cleaning only the attempt-owned temp", () => {
	const cwd = mkdtempSync(join(tmpdir(), "anchormap-write-owned-cleanup-"));
	const collision = tempCandidatePath(cwd, 0);
	writeFileSync(collision, "collision bytes\n");

	const result = writeConfigAtomic(minimalConfig(), {
		cwd,
		faults: {
			afterWriteBeforeFsync: () => {
				throw new Error("injected after write");
			},
		},
	});

	assertWriteError(result);
	assert.equal(readFileSync(collision, "utf8"), "collision bytes\n");
	assert.equal(existsSync(tempCandidatePath(cwd, 1)), false);
	assert.equal(existsSync(join(cwd, ANCHORMAP_CONFIG_FILENAME)), false);
});

test("writeConfigAtomic exhausts the 100-candidate EEXIST range without mutation", () => {
	const cwd = mkdtempSync(join(tmpdir(), "anchormap-write-exhausted-"));
	writeFileSync(join(cwd, ANCHORMAP_CONFIG_FILENAME), "initial bytes\n");
	for (let counter = 0; counter < 100; counter += 1) {
		writeFileSync(tempCandidatePath(cwd, counter), `collision ${counter}\n`);
	}

	const result = writeConfigAtomic(minimalConfig(), { cwd });

	assertWriteError(result);
	assert.equal(readFileSync(join(cwd, ANCHORMAP_CONFIG_FILENAME), "utf8"), "initial bytes\n");
	for (let counter = 0; counter < 100; counter += 1) {
		assert.equal(readFileSync(tempCandidatePath(cwd, counter), "utf8"), `collision ${counter}\n`);
	}
	assert.equal(existsSync(tempCandidatePath(cwd, 100)), false);
});

test("writeConfigAtomic performs no fallible filesystem step after successful rename", () => {
	const operations: string[] = [];
	const fs: WriteConfigAtomicFs = {
		openExclusive: () => {
			operations.push("open");
			return 9;
		},
		writeAll: () => {
			operations.push("write");
		},
		fsync: () => {
			operations.push("fsync");
		},
		close: () => {
			operations.push("close");
		},
		rename: () => {
			operations.push("rename");
		},
		unlink: () => {
			operations.push("unlink");
			throw new Error("unlink must not run after commit");
		},
		exists: () => {
			operations.push("exists");
			throw new Error("exists must not run after commit");
		},
	};

	const result = writeConfigAtomic(minimalConfig(), {
		cwd: "/repo",
		fs,
	});

	assert.equal(result.kind, "ok");
	assert.deepEqual(operations, ["open", "write", "fsync", "close", "rename"]);
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

function assertWriteError(
	result: { kind: "ok" } | { kind: "error"; error: { kind: string } },
): void {
	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.error.kind, "WriteError");
	}
}

function assertInternalError(
	result: { kind: "ok" } | { kind: "error"; error: { kind: string } },
): void {
	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.error.kind, "InternalError");
	}
}

function configToPlainObject(config: Config): unknown {
	return config;
}

function minimalConfig(): Config {
	return parseValidConfig(`
version: 1
product_root: src
spec_roots:
  - specs
`);
}

function minimalConfigYaml(): string {
	return (
		"version: 1\n" + "product_root: 'src'\n" + "spec_roots:\n" + "  - 'specs'\n" + "mappings: {}\n"
	);
}

function tempCandidatePath(cwd: string, counter: number): string {
	return join(cwd, `.${ANCHORMAP_CONFIG_FILENAME}.${process.pid}.${String(counter)}.tmp`);
}

function parseValidConfig(source: string): Config {
	const result = parseAnchormapConfigText(source);

	assert.equal(result.kind, "ok");
	if (result.kind !== "ok") {
		throw new Error("expected valid config");
	}

	return result.config;
}

function renderParsedConfig(source: string): string {
	return renderConfigCanonicalYaml(parseValidConfig(source));
}

function assertUtf8NoBomWithSingleFinalNewline(rendered: string): void {
	const bytes = Buffer.from(rendered, "utf8");

	assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
	assert.equal(rendered.endsWith("\n"), true);
	assert.equal(rendered.endsWith("\n\n"), false);
}

function assertNoAnchormapTemps(cwd: string): void {
	assert.deepEqual(
		readdirSync(cwd).filter(
			(entry) => entry.startsWith(".anchormap.yaml.") && entry.endsWith(".tmp"),
		),
		[],
	);
}

function errorWithCode(code: string, message: string): Error & { code: string } {
	const error = new Error(message) as Error & { code: string };
	error.code = code;
	return error;
}
