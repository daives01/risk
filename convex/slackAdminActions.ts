"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireAdminAction } from "./adminAuth";
import { encryptSlackBotToken, readEncryptionKeyFromEnv } from "./slackCrypto";
import { normalizeChannelId, normalizeTeamId } from "./slackValidation";

const SLACK_AUTH_TEST_URL = "https://slack.com/api/auth.test";
const CURRENT_KEY_VERSION = 1;

type SlackAuthTestResponse = {
  ok: boolean;
  error?: string;
  team?: string;
  team_id?: string;
};

async function verifySlackBotToken(token: string): Promise<SlackAuthTestResponse> {
  const response = await fetch(SLACK_AUTH_TEST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "",
  });
  const data = (await response.json()) as SlackAuthTestResponse;
  if (!response.ok) {
    throw new Error(`Slack auth.test failed with HTTP ${response.status}`);
  }
  if (!data.ok) {
    throw new Error(`Slack token validation failed: ${data.error ?? "unknown_error"}`);
  }
  return data;
}

function envRecord(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

export const createWorkspace = action({
  args: {
    teamName: v.string(),
    defaultChannelId: v.string(),
    botToken: v.string(),
  },
  handler: async (ctx, args) => {
    const installedByUserId = await requireAdminAction(ctx as any);
    const normalizedChannelId = normalizeChannelId(args.defaultChannelId);
    const token = args.botToken.trim();
    if (!token) throw new Error("Bot token is required");

    const authInfo = await verifySlackBotToken(token);
    if (!authInfo.team_id) throw new Error("Slack token did not return a workspace/team ID");
    const derivedTeamId = normalizeTeamId(authInfo.team_id);
    const teamName = args.teamName.trim();
    if (!teamName) throw new Error("Team name is required");

    const key = readEncryptionKeyFromEnv(envRecord());
    const encrypted = encryptSlackBotToken(token, key);

    await ctx.runMutation(internal.slackAdmin.upsertWorkspaceSecret, {
      teamId: derivedTeamId,
      teamName,
      defaultChannelId: normalizedChannelId,
      botTokenCiphertext: encrypted.ciphertext,
      botTokenIv: encrypted.iv,
      botTokenTag: encrypted.tag,
      keyVersion: CURRENT_KEY_VERSION,
      installedByUserId,
    });
  },
});

export const rotateWorkspaceToken = action({
  args: {
    teamId: v.string(),
    botToken: v.string(),
  },
  handler: async (ctx, args) => {
    const installedByUserId = await requireAdminAction(ctx as any);
    const normalizedTeamId = normalizeTeamId(args.teamId);
    const token = args.botToken.trim();
    if (!token) throw new Error("Bot token is required");

    const workspace = await ctx.runQuery(internal.slackAdmin.getWorkspaceSecret, {
      teamId: normalizedTeamId,
    });
    if (!workspace) throw new Error("Slack workspace not found");

    const authInfo = await verifySlackBotToken(token);
    if (authInfo.team_id && normalizeTeamId(authInfo.team_id) !== normalizedTeamId) {
      throw new Error("Provided team ID does not match the bot token workspace");
    }

    const key = readEncryptionKeyFromEnv(envRecord());
    const encrypted = encryptSlackBotToken(token, key);

    await ctx.runMutation(internal.slackAdmin.upsertWorkspaceSecret, {
      teamId: normalizedTeamId,
      teamName: workspace.teamName,
      defaultChannelId: workspace.defaultChannelId,
      botTokenCiphertext: encrypted.ciphertext,
      botTokenIv: encrypted.iv,
      botTokenTag: encrypted.tag,
      keyVersion: CURRENT_KEY_VERSION,
      installedByUserId,
    });
  },
});
