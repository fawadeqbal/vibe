/**
 * An error from the Vibe API, carrying the server's stable `code` (see the
 * backend's `ErrorCode`). Screens switch on the code, never the text.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isInsufficientCoins() {
    return this.code === "INSUFFICIENT_COINS";
  }
  get isUnauthenticated() {
    return this.code === "UNAUTHENTICATED" || this.code === "TOKEN_EXPIRED";
  }
  get isNetwork() {
    return this.code === "NETWORK";
  }

  static network(cause?: unknown): ApiError {
    return new ApiError("NETWORK", "Can't reach Vibe. Check your connection.", 0, { cause: String(cause ?? "") });
  }

  static fromBody(status: number, body: unknown): ApiError {
    if (body && typeof body === "object" && "error" in body) {
      const e = (body as { error?: { code?: string; message?: string; details?: Record<string, unknown> } }).error;
      if (e && typeof e === "object") {
        // "Some fields are invalid" → the first field's own message reads better.
        const fields = Array.isArray(e.details?.fields) ? (e.details.fields as unknown[]).filter((f): f is string => typeof f === "string") : [];
        const message = e.code === "VALIDATION_FAILED" && fields.length ? fields[0] : (e.message ?? "Something went wrong");
        return new ApiError(e.code ?? "INTERNAL", message, status, e.details ?? {});
      }
    }
    return new ApiError("INTERNAL", `Something went wrong (${status})`, status);
  }
}

/** The message to show for anything a call can throw. */
export const errorMessage = (e: unknown, fallback = "Something went wrong") => (e instanceof ApiError ? e.message : e instanceof Error && e.message ? e.message : fallback);
