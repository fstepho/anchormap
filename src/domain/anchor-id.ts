const DECIMAL_NO_LEADING_ZERO_PATTERN_SOURCE = "(?:0|[1-9][0-9]*)";
const SHORT_ID_PATTERN_SOURCE = "[A-Z]+-[0-9]{3}";
const DOTTED_ID_PATTERN_SOURCE = "[A-Z][A-Z0-9]*(?:\\.[A-Z][A-Z0-9]*)+";
const TASK_ID_PATTERN_SOURCE = `T${DECIMAL_NO_LEADING_ZERO_PATTERN_SOURCE}\\.${DECIMAL_NO_LEADING_ZERO_PATTERN_SOURCE}(?:[a-z])?`;
const MILESTONE_ID_PATTERN_SOURCE = `M${DECIMAL_NO_LEADING_ZERO_PATTERN_SOURCE}`;
const SPIKE_ID_PATTERN_SOURCE = `S${DECIMAL_NO_LEADING_ZERO_PATTERN_SOURCE}`;
const ADR_ID_PATTERN_SOURCE = "ADR-[0-9]{4}";

export const ANCHOR_ID_PATTERN_SOURCE = [
	SHORT_ID_PATTERN_SOURCE,
	DOTTED_ID_PATTERN_SOURCE,
	TASK_ID_PATTERN_SOURCE,
	MILESTONE_ID_PATTERN_SOURCE,
	SPIKE_ID_PATTERN_SOURCE,
	ADR_ID_PATTERN_SOURCE,
]
	.map((source) => `(?:${source})`)
	.join("|");

const ANCHOR_ID_PATTERN = new RegExp(`^(?:${ANCHOR_ID_PATTERN_SOURCE})$`);

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
	return ANCHOR_ID_PATTERN.test(value);
}
