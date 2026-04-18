import { strict as assert } from "node:assert";
import { test } from "node:test";

import { BOOTSTRAP_SENTINEL } from "./bootstrap";

test("bootstrap workspace compiles and runs node:test", () => {
	assert.equal(BOOTSTRAP_SENTINEL, "anchormap-bootstrap");
});
