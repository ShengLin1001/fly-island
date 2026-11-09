/**
 * An error as English text, for logs and places without the island's language. A native error
 * with a code (src/i18n/nativeError.ts) gives its English message and what the service said;
 * pages show errors through useErrorText instead, in the island's language.
 */
export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const { message, detail } = error as Record<string, unknown>;
    if (typeof message === "string") return typeof detail === "string" && detail ? `${message.replace(/\.$/, "")}: ${detail}` : message;
  }
  return String(error);
}
