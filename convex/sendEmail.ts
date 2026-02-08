"use node";

import { internalAction } from "./_generated/server.js";
import { v } from "convex/values";
import { Resend } from "resend";

const MAX_SEND_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function sendWithRetry(
  sendOnce: () => Promise<void>,
  metadata: { to: string; subject: string },
  options?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    waitFn?: (ms: number) => Promise<void>;
  },
) {
  const maxAttempts = options?.maxAttempts ?? MAX_SEND_ATTEMPTS;
  const baseDelayMs = options?.baseDelayMs ?? RETRY_BASE_DELAY_MS;
  const waitFn = options?.waitFn ?? wait;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await sendOnce();
      if (attempt > 1) {
        console.info(
          JSON.stringify({
            scope: "sendEmail",
            event: "retry_success",
            attempt,
            to: metadata.to,
            subject: metadata.subject,
          }),
        );
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;

      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      console.warn(
        JSON.stringify({
          scope: "sendEmail",
          event: "retry_scheduled",
          attempt,
          delayMs,
          to: metadata.to,
          subject: metadata.subject,
          error: toErrorMessage(error),
        }),
      );
      await waitFn(delayMs);
    }
  }

  console.error(
    JSON.stringify({
      scope: "sendEmail",
      event: "delivery_failed",
      attempts: maxAttempts,
      to: metadata.to,
      subject: metadata.subject,
      error: toErrorMessage(lastError),
    }),
  );
  throw lastError instanceof Error ? lastError : new Error("Email send failed");
}

export const sendEmail = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const env =
      (globalThis as { process?: { env?: Record<string, string | undefined> } })
        .process?.env ?? {};
    const resendApiKey = env.RESEND_API_KEY;
    const fromEmail = env.EMAIL_FROM;

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is required to send emails.");
    }

    if (!fromEmail || !fromEmail.trim()) {
      throw new Error("EMAIL_FROM is required to send emails.");
    }

    const resend = new Resend(resendApiKey);
    await sendWithRetry(async () => {
      await resend.emails.send({
        from: fromEmail.trim(),
        to: args.to,
        subject: args.subject,
        html: args.html,
      });
    }, {
      to: args.to,
      subject: args.subject,
    });
    return null;
  },
});
