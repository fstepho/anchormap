import { statSync } from "node:fs";
import { join } from "node:path";
import { TextDecoder } from "node:util";

import { type RepoPath, repoPathToString } from "../domain/repo-path";

export const UTF8_DECODE_ERROR_KIND = "Utf8DecodeError";

export type RepoPathEntryStatus =
	| { kind: "directory" }
	| { kind: "file" }
	| { kind: "other" }
	| { kind: "missing" }
	| { kind: "inaccessible"; cause: unknown };

export class Utf8DecodeError extends Error {
	readonly kind = UTF8_DECODE_ERROR_KIND;

	constructor(cause: unknown) {
		super("invalid UTF-8 byte sequence", { cause });
		this.name = "Utf8DecodeError";
	}
}

export type Utf8DecodeResult =
	| { kind: "ok"; text: string }
	| { kind: "decode_error"; error: Utf8DecodeError };

const utf8Decoder = new TextDecoder("utf-8", {
	fatal: true,
	ignoreBOM: true,
});

export function decodeUtf8StrictNoBom(bytes: Uint8Array): Utf8DecodeResult {
	try {
		const text = utf8Decoder.decode(bytes);
		return {
			kind: "ok",
			text: stripInitialBom(text),
		};
	} catch (error) {
		return {
			kind: "decode_error",
			error: new Utf8DecodeError(error),
		};
	}
}

export function stripInitialBom(text: string): string {
	if (text.charCodeAt(0) === 0xfeff) {
		return text.slice(1);
	}

	return text;
}

export function statRepoPath(root: string, repoPath: RepoPath): RepoPathEntryStatus {
	try {
		const stats = statSync(join(root, repoPathToString(repoPath)));
		if (stats.isDirectory()) {
			return { kind: "directory" };
		}
		if (stats.isFile()) {
			return { kind: "file" };
		}
		return { kind: "other" };
	} catch (error) {
		if (isMissingStatError(error)) {
			return { kind: "missing" };
		}
		return {
			kind: "inaccessible",
			cause: error,
		};
	}
}

function isMissingStatError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		((error as { code?: unknown }).code === "ENOENT" ||
			(error as { code?: unknown }).code === "ENOTDIR")
	);
}
