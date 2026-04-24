import { TextDecoder } from "node:util";

export const UTF8_DECODE_ERROR_KIND = "Utf8DecodeError";

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
