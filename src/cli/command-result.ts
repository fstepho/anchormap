export interface TextWriter {
	write(chunk: string): unknown;
}

export type AppErrorKind =
	| "UsageError"
	| "ConfigError"
	| "UnsupportedRepoError"
	| "WriteError"
	| "InternalError";

export interface AppError {
	kind: AppErrorKind;
	message?: string;
	cause?: unknown;
}

export interface AnchormapCommandSuccess {
	kind: "success";
	stdout?: string;
	stderr?: string;
	exitCode?: 0 | 5;
}

export type AnchormapCommandResult = AnchormapCommandSuccess | AppError;

export function exitCodeForAppError(error: AppError): number {
	switch (error.kind) {
		case "UsageError":
			return 4;
		case "ConfigError":
			return 2;
		case "UnsupportedRepoError":
			return 3;
		case "WriteError":
		case "InternalError":
			return 1;
	}
}

export function commandSuccess(
	output: Omit<AnchormapCommandSuccess, "kind"> = {},
): AnchormapCommandSuccess {
	return {
		kind: "success",
		...output,
	};
}

export function usageError(message?: string): AppError {
	return appError("UsageError", message);
}

export function configError(message?: string): AppError {
	return appError("ConfigError", message);
}

export function unsupportedRepoError(message?: string): AppError {
	return appError("UnsupportedRepoError", message);
}

export function writeAppError(message?: string): AppError {
	return appError("WriteError", message);
}

export function internalError(message?: string, cause?: unknown): AppError {
	return {
		kind: "InternalError",
		message,
		cause,
	};
}

function appError(kind: Exclude<AppErrorKind, "InternalError">, message?: string): AppError {
	return {
		kind,
		message,
	};
}
