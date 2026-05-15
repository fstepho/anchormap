import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { loadAnchormapPackageVersion } from "../package-version";

test("loads the bundle tool version from the package artifact", () => {
	const packageJson = JSON.parse(
		readFileSync(resolve(__dirname, "..", "..", "package.json"), "utf8"),
	) as { version: string };

	assert.equal(loadAnchormapPackageVersion(), packageJson.version);
});
