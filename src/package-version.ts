import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadAnchormapPackageVersion(): string {
	const packageJson = JSON.parse(
		readFileSync(resolve(__dirname, "..", "package.json"), "utf8"),
	) as {
		version?: unknown;
	};
	if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
		throw new Error("package.json version is missing");
	}

	return packageJson.version;
}
