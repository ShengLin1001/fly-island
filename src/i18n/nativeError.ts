import type { ErrorArgs, ErrorCode } from "./sections/errors";
import type { Translations } from "./types";

/**
 * What a native command fails with once it has a code (task D15). Mirrors UserError in
 * src-tauri/src/user_error.rs. Commands not moved over yet fail with a plain string.
 */
export type NativeError = {
  code: string;
  args?: ErrorArgs;
  /** What an outside program or service said, shown as it is. */
  detail?: string;
  /** The same in English, for a code this page does not know. */
  message: string;
};

export function isNativeError(value: unknown): value is NativeError {
  if (!value || typeof value !== "object") return false;
  const { code, message } = value as Record<string, unknown>;
  return typeof code === "string" && typeof message === "string";
}

/** An error to show: a native one worded in the island's language, anything else as it is. */
export function errorText(error: unknown, t: Pick<Translations, "errors">): string {
  if (isNativeError(error)) {
    const wording = (t.errors.codes as Partial<Record<string, (typeof t.errors.codes)[ErrorCode]>>)[error.code];
    const text = wording === undefined ? error.message : typeof wording === "function" ? wording(error.args ?? {}) : wording;
    return error.detail ? t.errors.withDetail(text, error.detail) : text;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
