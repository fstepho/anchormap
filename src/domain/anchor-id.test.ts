import { strict as assert } from "node:assert";
import { test } from "node:test";

import { anchorIdToString, validateAnchorId } from "./anchor-id";

test("validates supported AnchorId formats", () => {
	for (const value of ["US-001", "FR-014", "DOC.README.PRESENT"]) {
		const result = validateAnchorId(value);

		assert.equal(result.kind, "ok");
		assert.equal(anchorIdToString(result.anchorId), value);
	}
});

test("rejects unsupported AnchorId forms with a typed validation failure", () => {
	const invalidValues = ["us-001", "FR-14", "FR-014.", "", "FR-014.DOC", "DOC.README-PRESENT"];

	for (const value of invalidValues) {
		const result = validateAnchorId(value);

		assert.deepEqual(result, {
			kind: "validation_failure",
			failure: {
				kind: "InvalidAnchorId",
				value,
			},
		});
	}
});
