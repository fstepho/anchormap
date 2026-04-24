const SHORT_ID_PATTERN = /^[A-Z]+-[0-9]{3}$/;
const DOTTED_ID_PATTERN = /^[A-Z][A-Z0-9]*(\.[A-Z][A-Z0-9]*)+$/;

declare const anchorIdBrand: unique symbol;

export type AnchorId = string & { readonly [anchorIdBrand]: true };

export interface AnchorIdValidationFailure {
	kind: "InvalidAnchorId";
	value: string;
}

export type AnchorIdValidationResult =
	| { kind: "ok"; anchorId: AnchorId }
	| { kind: "validation_failure"; failure: AnchorIdValidationFailure };

export function validateAnchorId(value: string): AnchorIdValidationResult {
	if (isSupportedAnchorIdText(value)) {
		return {
			kind: "ok",
			anchorId: value as AnchorId,
		};
	}

	return {
		kind: "validation_failure",
		failure: {
			kind: "InvalidAnchorId",
			value,
		},
	};
}

export function anchorIdToString(anchorId: AnchorId): string {
	return anchorId;
}

function isSupportedAnchorIdText(value: string): boolean {
	return SHORT_ID_PATTERN.test(value) || DOTTED_ID_PATTERN.test(value);
}
