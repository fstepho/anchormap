import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { buildArtifactBundle } from "./bundle-model";

test("builds bundle hashes from canonical artifact bytes including final newline", () => {
	const scan = { schema_version: 4 } as Parameters<typeof buildArtifactBundle>[0]["scan"];
	const check = { schema_version: 1 } as Parameters<typeof buildArtifactBundle>[0]["check"];
	const diff = { schema_version: 1 } as Parameters<typeof buildArtifactBundle>[0]["diff"];
	const canonicalArtifactBytes = {
		scan: '{"schema_version":4}\n',
		check: '{"schema_version":1,"kind":"check"}\n',
		diff: '{"schema_version":1,"kind":"diff"}\n',
	};

	const bundle = buildArtifactBundle({
		scan,
		check,
		diff,
		metadata: {
			provider: "other",
			repository: null,
			commit: null,
			branch: null,
			pull_request: null,
			run_url: null,
		},
		toolVersion: "1.2.1",
		canonicalArtifactBytes,
	});

	assert.deepEqual(bundle.hashes, {
		scan_sha256: sha256(canonicalArtifactBytes.scan),
		check_sha256: sha256(canonicalArtifactBytes.check),
		diff_sha256: sha256(canonicalArtifactBytes.diff),
	});
	assert.equal(bundle.tool.version, "1.2.1");
	assert.equal(bundle.artifacts.scan, scan);
});

function sha256(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}
