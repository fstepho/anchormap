import type { AnchorId } from "./anchor-id";
import type { RepoPath } from "./repo-path";

export function compareCanonicalTextByUtf8(left: string, right: string): number {
	const leftBytes = canonicalComparisonBytes(left);
	const rightBytes = canonicalComparisonBytes(right);
	const length = Math.min(leftBytes.length, rightBytes.length);

	for (let index = 0; index < length; index += 1) {
		const difference = leftBytes[index] - rightBytes[index];
		if (difference !== 0) {
			return difference;
		}
	}

	return leftBytes.length - rightBytes.length;
}

export function sortAnchorIdsByUtf8(anchorIds: readonly AnchorId[]): AnchorId[] {
	return sortCanonicalTextByUtf8(anchorIds);
}

export function sortRepoPathsByUtf8(repoPaths: readonly RepoPath[]): RepoPath[] {
	return sortCanonicalTextByUtf8(repoPaths);
}

export function normalizeAnchorIdsByUtf8(anchorIds: readonly AnchorId[]): AnchorId[] {
	return sortCanonicalTextByUtf8(uniqueByExactText(anchorIds));
}

export function normalizeRepoPathsByUtf8(repoPaths: readonly RepoPath[]): RepoPath[] {
	return sortCanonicalTextByUtf8(uniqueByExactText(repoPaths));
}

function uniqueByExactText<T extends string>(values: readonly T[]): T[] {
	const deduplicated = new Map<string, T>();

	for (const value of values) {
		if (!deduplicated.has(value)) {
			deduplicated.set(value, value);
		}
	}

	return [...deduplicated.values()];
}

function sortCanonicalTextByUtf8<T extends string>(values: readonly T[]): T[] {
	const bytesByValue = new Map<string, readonly number[]>();

	function bytes(value: string): readonly number[] {
		const cached = bytesByValue.get(value);
		if (cached !== undefined) {
			return cached;
		}
		const computed = canonicalComparisonBytes(value);
		bytesByValue.set(value, computed);
		return computed;
	}

	return [...values].sort((left, right) => compareCanonicalBytes(bytes(left), bytes(right)));
}

function compareCanonicalBytes(leftBytes: readonly number[], rightBytes: readonly number[]): number {
	const length = Math.min(leftBytes.length, rightBytes.length);

	for (let index = 0; index < length; index += 1) {
		const difference = leftBytes[index] - rightBytes[index];
		if (difference !== 0) {
			return difference;
		}
	}

	return leftBytes.length - rightBytes.length;
}

function canonicalComparisonBytes(value: string): number[] {
	const bytes: number[] = [];

	for (let index = 0; index < value.length; index += 1) {
		const codeUnit = value.charCodeAt(index);

		if (isHighSurrogate(codeUnit) && index + 1 < value.length) {
			const nextCodeUnit = value.charCodeAt(index + 1);
			if (isLowSurrogate(nextCodeUnit)) {
				appendUtf8Bytes(bytes, surrogatePairToCodePoint(codeUnit, nextCodeUnit));
				index += 1;
				continue;
			}
		}

		appendUtf8Bytes(bytes, codeUnit);
	}

	return bytes;
}

function appendUtf8Bytes(bytes: number[], codePoint: number): void {
	if (codePoint <= 0x7f) {
		bytes.push(codePoint);
		return;
	}

	if (codePoint <= 0x7ff) {
		bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
		return;
	}

	if (codePoint <= 0xffff) {
		bytes.push(
			0xe0 | (codePoint >> 12),
			0x80 | ((codePoint >> 6) & 0x3f),
			0x80 | (codePoint & 0x3f),
		);
		return;
	}

	bytes.push(
		0xf0 | (codePoint >> 18),
		0x80 | ((codePoint >> 12) & 0x3f),
		0x80 | ((codePoint >> 6) & 0x3f),
		0x80 | (codePoint & 0x3f),
	);
}

function isHighSurrogate(codeUnit: number): boolean {
	return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
	return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

function surrogatePairToCodePoint(highSurrogate: number, lowSurrogate: number): number {
	return 0x10000 + ((highSurrogate - 0xd800) << 10) + (lowSurrogate - 0xdc00);
}
