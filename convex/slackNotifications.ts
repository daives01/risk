"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { buildSlackTurnMessage } from "./slackMessage";
import { decryptSlackBotToken, readEncryptionKeyFromEnv } from "./slackCrypto";

const MAX_SLACK_ATTEMPTS = 3;

type SlackPostMessageResponse = {
  ok: boolean;
  error?: string;
  ts?: string;
};

type SlackErrorCategory = "disable_workspace" | "skip" | "retry" | "unknown";

function envRecord(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

function classifySlackError(errorCode: string | undefined): SlackErrorCategory {
  if (!errorCode) return "unknown";
  if (errorCode === "invalid_auth" || errorCode === "token_revoked") return "disable_workspace";
  if (errorCode === "not_in_channel" || errorCode === "channel_not_found") return "skip";
  if (errorCode === "ratelimited") return "retry";
  return "unknown";
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function postSlackMessageWithRetry(args: {
  gameId: string;
  workspaceTeamId: string;
  token: string;
  channelId: string;
  text: string;
}) {
  let attempt = 0;
  let lastError: string | undefined;
  let lastCategory: SlackErrorCategory = "unknown";

  while (attempt < MAX_SLACK_ATTEMPTS) {
    attempt += 1;
    console.info(
      JSON.stringify({
        scope: "slackNotifications",
        event: "post_attempt",
        gameId: args.gameId,
        teamId: args.workspaceTeamId,
        channelId: args.channelId,
        attempt,
      }),
    );

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: args.channelId,
        text: args.text,
      }),
    });

    if (response.status === 429) {
      lastError = "ratelimited";
      lastCategory = "retry";
      const retryAfter = Number(response.headers.get("retry-after") ?? "1");
      console.warn(
        JSON.stringify({
          scope: "slackNotifications",
          event: "rate_limited",
          gameId: args.gameId,
          teamId: args.workspaceTeamId,
          channelId: args.channelId,
          attempt,
          retryAfterSeconds: Math.max(1, retryAfter),
        }),
      );
      await wait(Math.max(1, retryAfter) * 1000);
      continue;
    }

    const payload = (await response.json()) as SlackPostMessageResponse;
    if (response.ok && payload.ok) {
      console.info(
        JSON.stringify({
          scope: "slackNotifications",
          event: "post_success",
          gameId: args.gameId,
          teamId: args.workspaceTeamId,
          channelId: args.channelId,
          attempt,
          ts: payload.ts ?? null,
        }),
      );
      return { ok: true as const, ts: payload.ts };
    }

    lastError = payload.error ?? `http_${response.status}`;
    lastCategory = classifySlackError(payload.error);
    console.warn(
      JSON.stringify({
        scope: "slackNotifications",
        event: "post_error",
        gameId: args.gameId,
        teamId: args.workspaceTeamId,
        channelId: args.channelId,
        attempt,
        httpStatus: response.status,
        error: lastError,
        category: lastCategory,
      }),
    );
    if (lastCategory === "retry" && attempt < MAX_SLACK_ATTEMPTS) {
      await wait(attempt * 500);
      continue;
    }
    return {
      ok: false as const,
      error: lastError,
      category: lastCategory,
    };
  }

  return {
    ok: false as const,
    error: lastError ?? "unknown_error",
    category: lastCategory,
  };
}

function buildGameUrl(gameId: string) {
  const env = envRecord();
  const siteUrl = env.SITE_URL ?? "http://localhost:5173";
  return `${siteUrl}/play/${gameId}`;
}

export const sendYourTurnSlack: any = internalAction({
  args: {
    gameId: v.id("games"),
    expectedPlayerId: v.string(),
    turnStartedAt: v.number(),
  },
  returns: v.object({
    sent: v.boolean(),
    reason: v.optional(v.string()),
    providerTs: v.optional(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, args): Promise<{ sent: boolean; reason?: string; providerTs?: string | null }> => {
    console.info(
      JSON.stringify({
        scope: "slackNotifications",
        event: "send_started",
        gameId: String(args.gameId),
        expectedPlayerId: args.expectedPlayerId,
        turnStartedAt: args.turnStartedAt,
      }),
    );

    const context: any = await ctx.runQuery(
      (internal as any).slackNotificationData.getSlackNotificationContext,
      args,
    );
    if (!context.ok) {
      console.info(
        JSON.stringify({
          scope: "slackNotifications",
          event: "send_skipped",
          gameId: String(args.gameId),
          reason: context.reason,
        }),
      );
      return { sent: false, reason: context.reason };
    }

    const key = readEncryptionKeyFromEnv(envRecord());
    const token = decryptSlackBotToken(context.encryptedToken, key);
    const mentionOrName = context.slackUserId ? `<@${context.slackUserId}>` : context.targetDisplayName;
    const text = buildSlackTurnMessage({
      gameName: context.gameName,
      gameUrl: buildGameUrl(context.gameId),
      mentionOrName,
    });

    const sendResult = await postSlackMessageWithRetry({
      gameId: context.gameId,
      workspaceTeamId: context.workspaceTeamId,
      token,
      channelId: context.channelId,
      text,
    });

    if (sendResult.ok) {
      console.info(
        JSON.stringify({
          scope: "slackNotifications",
          event: "send_completed",
          gameId: context.gameId,
          teamId: context.workspaceTeamId,
          channelId: context.channelId,
          sent: true,
          providerTs: sendResult.ts ?? null,
          mentionedUser: Boolean(context.slackUserId),
        }),
      );
      return { sent: true, providerTs: sendResult.ts ?? null };
    }

    if (sendResult.category === "disable_workspace") {
      await ctx.runMutation(internal.slackAdmin.disableWorkspaceInternal, {
        teamId: context.workspaceTeamId,
      });
    }

    console.warn(
      JSON.stringify({
        scope: "slackNotifications",
        event: "delivery_failed",
        gameId: context.gameId,
        teamId: context.workspaceTeamId,
        channelId: context.channelId,
        error: sendResult.error,
        category: sendResult.category,
      }),
    );

    console.info(
      JSON.stringify({
        scope: "slackNotifications",
        event: "send_completed",
        gameId: context.gameId,
        teamId: context.workspaceTeamId,
        channelId: context.channelId,
        sent: false,
        reason: sendResult.error ?? "unknown_error",
        mentionedUser: Boolean(context.slackUserId),
      }),
    );

    return { sent: false, reason: sendResult.error ?? "unknown_error" };
  },
});
