import { type AppError, usageError } from "../cli/command-result";
import type { ObservedAnchorSourceView } from "../domain/scan-result";

type JsonObject = Record<string, unknown>;
type ValidationResult<Value> = { kind: "ok"; value: Value } | { kind: "error"; error: AppError };
type ObjectValidationResult =
	| { kind: "ok"; object: JsonObject }
	| { kind: "error"; error: AppError };

const MARKDOWN_SOURCE_KEYS = ["kind", "line", "column", "heading_level"] as const;
const YAML_SOURCE_KEYS = ["kind", "line", "column"] as const;

export function validateObservedAnchorSource(
	value: unknown,
	label: string,
): ValidationResult<ObservedAnchorSourceView> {
	const object = expectOpenObject(value, label);
	if (object.kind === "error") {
		return object;
	}
	const kind = expectString(object.object.kind, `${label}.kind`);
	if (kind.kind === "error") {
		return kind;
	}

	if (kind.value === "markdown_atx_heading") {
		const exact = expectObject(value, label, MARKDOWN_SOURCE_KEYS);
		if (exact.kind === "error") {
			return exact;
		}
		const line = expectPositiveInteger(exact.object.line, `${label}.line`);
		if (line.kind === "error") {
			return line;
		}
		const column = expectPositiveInteger(exact.object.column, `${label}.column`);
		if (column.kind === "error") {
			return column;
		}
		const headingLevel = expectIntegerInRange(
			exact.object.heading_level,
			`${label}.heading_level`,
			1,
			6,
		);
		if (headingLevel.kind === "error") {
			return headingLevel;
		}
		return {
			kind: "ok",
			value: {
				kind: "markdown_atx_heading",
				line: line.value,
				column: column.value,
				heading_level: headingLevel.value,
			},
		};
	}

	if (kind.value === "yaml_root_id") {
		const exact = expectObject(value, label, YAML_SOURCE_KEYS);
		if (exact.kind === "error") {
			return exact;
		}
		const line = expectPositiveInteger(exact.object.line, `${label}.line`);
		if (line.kind === "error") {
			return line;
		}
		const column = expectPositiveInteger(exact.object.column, `${label}.column`);
		if (column.kind === "error") {
			return column;
		}
		return { kind: "ok", value: { kind: "yaml_root_id", line: line.value, column: column.value } };
	}

	return validationError(`${label}.kind is not supported`);
}

function expectObject(
	value: unknown,
	label: string,
	keys: readonly string[],
): ObjectValidationResult {
	const object = expectOpenObject(value, label);
	if (object.kind === "error") {
		return object;
	}
	const actualKeys = Object.keys(object.object);
	if (actualKeys.length !== keys.length || keys.some((key) => !(key in object.object))) {
		return validationError(`${label} has unsupported schema fields`);
	}

	return object;
}

function expectOpenObject(value: unknown, label: string): ObjectValidationResult {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return validationError(`${label} must be an object`);
	}

	return { kind: "ok", object: value as JsonObject };
}

function expectString(value: unknown, label: string): ValidationResult<string> {
	if (typeof value !== "string") {
		return validationError(`${label} must be a string`);
	}

	return { kind: "ok", value };
}

function expectInteger(value: unknown, label: string): ValidationResult<number> {
	if (!Number.isInteger(value)) {
		return validationError(`${label} must be an integer`);
	}

	return { kind: "ok", value: value as number };
}

function expectPositiveInteger(value: unknown, label: string): ValidationResult<number> {
	const integer = expectInteger(value, label);
	if (integer.kind === "error") {
		return integer;
	}
	if (integer.value < 1) {
		return validationError(`${label} must be positive`);
	}

	return integer;
}

function expectIntegerInRange(
	value: unknown,
	label: string,
	minimum: number,
	maximum: number,
): ValidationResult<number> {
	const integer = expectInteger(value, label);
	if (integer.kind === "error") {
		return integer;
	}
	if (integer.value < minimum || integer.value > maximum) {
		return validationError(`${label} is out of range`);
	}

	return integer;
}

function validationError(message: string): { kind: "error"; error: AppError } {
	return { kind: "error", error: usageError(message) };
}
