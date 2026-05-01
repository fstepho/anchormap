import { strict as assert } from "node:assert";
import { test } from "node:test";

import { anchorIdToString, validateAnchorId } from "./anchor-id";

test("validates supported AnchorId formats", () => {
	for (const value of [
		"US-001",
		"FR-014",
		"DOC.README.PRESENT",
		"DOC.README.SECTIONS_MIN",
		"OWN.CODEOWNERS.FILE_SIZE_UNDER_3MB",
		"REL.PR_TITLE.CONVENTIONAL_COMMITS",
		"T10.6",
		"T0.0a",
		"M10",
		"S5",
		"ADR-0012",
	]) {
		const result = validateAnchorId(value);

		assert.equal(result.kind, "ok");
		assert.equal(anchorIdToString(result.anchorId), value);
	}
});

test("rejects unsupported AnchorId forms with a typed validation failure", () => {
	const invalidValues = [
		"us-001",
		"FR-14",
		"FR-014.",
		"",
		"FR-014.DOC",
		"DOC",
		"DOC.README-PRESENT",
		"_DOC.README",
		"DOC._README",
		"DOC..README",
		"DOC.README_",
		"doc.README.SECTIONS_MIN",
		"DOC.README.SECTIONS-MIN",
		"t10.6",
		"T10",
		"T10.",
		"T10.6A",
		"M10.1",
		"S05",
		"ADR-12",
		"ADR0012",
	];

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
