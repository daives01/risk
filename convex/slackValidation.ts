const TEAM_ID_RE = /^T[A-Z0-9]{2,}$/;
const CHANNEL_ID_RE = /^[CG][A-Z0-9]{2,}$/;
const USER_ID_RE = /^U[A-Z0-9]{2,}$/;

export function normalizeTeamId(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!TEAM_ID_RE.test(normalized)) {
    throw new Error("Invalid Slack workspace ID");
  }
  return normalized;
}

export function normalizeChannelId(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!CHANNEL_ID_RE.test(normalized)) {
    throw new Error("Invalid Slack channel ID");
  }
  return normalized;
}

export function normalizeSlackUserId(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!USER_ID_RE.test(normalized)) {
    throw new Error("Invalid Slack user ID");
  }
  return normalized;
}
