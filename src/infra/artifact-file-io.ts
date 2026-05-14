import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeCliPathArg } from "../cli/command-preconditions";
import { type AppError, usageError } from "../cli/command-result";
import { repoPathToString } from "../domain/repo-path";
import { decodeUtf8StrictNoBom } from "./repo-fs";

export function loadJsonArtifactText(
	pathArg: string,
	optionName: string,
	cwd: string | undefined,
): { kind: "ok"; text: string; label: string } | { kind: "error"; error: AppError } {
	const normalizedPath = normalizeCliPathArg(pathArg, optionName);
	if (normalizedPath.kind === "usage_error") {
		return { kind: "error", error: usageError(normalizedPath.message) };
	}

	let bytes: Uint8Array;
	try {
		bytes = readFileSync(join(cwd ?? process.cwd(), repoPathToString(normalizedPath.path)));
	} catch {
		return { kind: "error", error: usageError(`${optionName} artifact could not be read`) };
	}

	const decoded = decodeUtf8StrictNoBom(bytes);
	if (decoded.kind === "decode_error") {
		return { kind: "error", error: usageError(`${optionName} artifact is not valid UTF-8`) };
	}

	return { kind: "ok", text: decoded.text, label: optionName };
}
