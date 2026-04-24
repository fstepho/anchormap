import { strict as assert } from "node:assert";
import { Buffer } from "node:buffer";
import { test } from "node:test";

import { configError, unsupportedRepoError } from "../cli/commands";
import {
	decodeUtf8StrictNoBom,
	stripInitialBom,
	UTF8_DECODE_ERROR_KIND,
	Utf8DecodeError,
} from "./repo-fs";

test("decodes valid UTF-8 bytes without changing content", () => {
	const result = decodeUtf8StrictNoBom(Buffer.from("line 1\nline 2\r\n", "utf8"));

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.equal(result.text, "line 1\nline 2\r\n");
	}
});

test("removes exactly one initial BOM after decoding", () => {
	const result = decodeUtf8StrictNoBom(Buffer.from("\uFEFF\uFEFFanchor\n", "utf8"));

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.equal(result.text, "\uFEFFanchor\n");
	}
});

test("preserves later BOM characters", () => {
	const result = decodeUtf8StrictNoBom(Buffer.from("before\uFEFFafter", "utf8"));

	assert.equal(result.kind, "ok");
	if (result.kind === "ok") {
		assert.equal(result.text, "before\uFEFFafter");
	}
});

test("rejects invalid UTF-8 byte sequences with a typed error", () => {
	const result = decodeUtf8StrictNoBom(Uint8Array.from([0x66, 0x80, 0x67]));

	assert.equal(result.kind, "decode_error");
	if (result.kind === "decode_error") {
		assert.ok(result.error instanceof Utf8DecodeError);
		assert.equal(result.error.kind, UTF8_DECODE_ERROR_KIND);
	}
});

test("exposes decode failure hooks for caller-owned classification", () => {
	const result = decodeUtf8StrictNoBom(Uint8Array.from([0xc3, 0x28]));

	assert.equal(result.kind, "decode_error");
	if (result.kind === "decode_error") {
		assert.equal(configError("config decode failed").kind, "ConfigError");
		assert.equal(unsupportedRepoError("repo decode failed").kind, "UnsupportedRepoError");
	}
});

test("stripInitialBom preserves empty strings and non-BOM starts", () => {
	assert.equal(stripInitialBom(""), "");
	assert.equal(stripInitialBom("abc\uFEFF"), "abc\uFEFF");
});
