"use node";

import { internalAction } from "./_generated/server.js";
import { v } from "convex/values";
import { Resend } from "resend";

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
    await resend.emails.send({
      from: fromEmail.trim(),
      to: args.to,
      subject: args.subject,
      html: args.html,
    });
    return null;
  },
});
