export type RuntimeErrorCode =
  | "configuration"
  | "storage"
  | "validation"
  | "session_expired"
  | "access_unavailable"
  | "credentials"
  | "network"
  | "backend";

export class RuntimeError extends Error {
  constructor(
    public readonly code: RuntimeErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "RuntimeError";
  }
}

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function asRuntimeError(error: unknown): RuntimeError {
  if (error instanceof RuntimeError) return error;
  return new RuntimeError("backend", "The workspace could not complete this request. Contact your workspace administrator.");
}

type ServiceError = { status?: number; code?: string; name?: string };

// Never surface raw provider messages, SQL details, tokens, or request payloads.
export function serviceError(error: ServiceError, status?: number): RuntimeError {
  const httpStatus = status ?? error.status;
  if (error.name === "AuthSessionMissingError" || httpStatus === 401) {
    return new RuntimeError("session_expired", "Your session has expired. Sign in again to continue.");
  }
  if (httpStatus === 403) {
    return new RuntimeError("access_unavailable", "Access is unavailable for this login. Contact your workspace administrator.");
  }
  if (httpStatus === 0 || httpStatus === 408 || httpStatus === 429 || (httpStatus !== undefined && httpStatus >= 500) || error.name === "AuthRetryableFetchError") {
    return new RuntimeError("network", "The workspace could not be reached. Check your connection and try again.", true);
  }
  return new RuntimeError("backend", "The workspace could not load this information. Contact your workspace administrator.");
}
