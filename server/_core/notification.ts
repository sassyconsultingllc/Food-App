import { TRPCError } from "@trpc/server";
import { ENV } from "./env";

export type NotificationPayload = {
  title: string;
  content: string;
};

// Tightened from 1200 to 200 — typical UI title fields are <100 chars, and
// over-large titles make truncation confusing in downstream consumers.
const TITLE_MAX_LENGTH = 200;
const CONTENT_MAX_LENGTH = 20000;
// Cap how much of an upstream error body we ever write to logs. Some
// notification providers echo request fields (including auth headers in
// older versions) in their error responses, which is a recurring source of
// secret leakage. Keep just enough for diagnostic context.
const MAX_LOGGED_DETAIL_CHARS = 200;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const buildEndpointUrl = (baseUrl: string): string => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("webdevtoken.v1.WebDevService/SendNotification", normalizedBase).toString();
};

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

/**
 * Dispatches a project-owner notification through the Manus Notification Service.
 * Returns `true` if the request was accepted, `false` when the upstream service
 * cannot be reached (callers can fall back to email/slack). Validation errors
 * bubble up as TRPC errors so callers can fix the payload.
 */
export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured.",
    });
  }

  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured.",
    });
  }

  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);

  // 10 s timeout — without one, a hanging notify call can block the calling
  // request handler indefinitely.
  const controller = new AbortController();
  const timeoutMs = Number(process.env.NOTIFICATION_TIMEOUT_MS) || 10_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1",
      },
      body: JSON.stringify({ title, content }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Truncate the upstream body before logging — some providers echo
      // request fields (including auth headers) in error responses.
      const detail = (await response.text().catch(() => "")).slice(
        0,
        MAX_LOGGED_DETAIL_CHARS
      );
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${
          detail ? `: ${detail}${detail.length === MAX_LOGGED_DETAIL_CHARS ? "…(truncated)" : ""}` : ""
        }`,
      );
      return false;
    }

    return true;
  } catch (error) {
    // Don't dump the full error object — a wrapped fetch error can carry
    // request fields. Log just the error name + message.
    const msg =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn("[Notification] Error calling notification service:", msg);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
