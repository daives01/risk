import type { ChatHoverTag } from "./highlighting";

export type ChatMentionTag = Exclude<ChatHoverTag, null>;

export interface ChatMentionPlayer {
  displayName: string;
  enginePlayerId: string | null;
  teamId?: string | null;
}

export interface ChatMentionMap {
  territories: Record<string, { name?: string }>;
}

export interface ChatMentionOption {
  key: string;
  label: string;
  token: string;
  searchText: string;
  resolved: ChatMentionTag;
}

export type ChatTextToken = string | { token: string; resolved: ChatMentionTag };

export interface ChatMentionResolver {
  resolve: (token: string) => ChatMentionTag | null;
  options: ChatMentionOption[];
}

export interface ActiveChatMentionQuery {
  query: string;
  normalizedQuery: string;
  tokenStart: number;
  cursor: number;
}

const MENTION_PATTERN = /(^|[^A-Za-z0-9_@])(?:@\[([^\]\n]{1,80})\]|@([A-Za-z0-9][A-Za-z0-9_-]*))/g;

export function normalizeChatMention(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "");
}

export function normalizeMentionSearch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function formatBracketMentionToken(label: string) {
  return `@[${label.replace(/]/g, "")}]`;
}

export function getMentionDisplayLabel(token: string) {
  if (token.startsWith("@[") && token.endsWith("]")) return `@${token.slice(2, -1)}`;
  return token;
}

function isSameMention(left: ChatMentionTag, right: ChatMentionTag) {
  if (left.kind !== right.kind) return false;
  if (left.kind === "player" && right.kind === "player") return left.playerId === right.playerId;
  if (left.kind === "team" && right.kind === "team") return left.teamId === right.teamId;
  if (left.kind === "territory" && right.kind === "territory") return left.territoryId === right.territoryId;
  return false;
}

function addUniqueMention(index: Map<string, ChatMentionTag | null>, key: string, value: ChatMentionTag) {
  if (!key) return;
  const existing = index.get(key);
  if (existing === undefined) {
    index.set(key, value);
    return;
  }
  if (existing && isSameMention(existing, value)) return;
  index.set(key, null);
}

export function buildChatMentionResolver(
  playerOptions: ChatMentionPlayer[],
  teamNames: Record<string, string>,
  graphMap: ChatMentionMap,
): ChatMentionResolver {
  const mentionIndex = new Map<string, ChatMentionTag | null>();
  const options: ChatMentionOption[] = [];
  const optionKeys = new Set<string>();

  const addOption = (label: string, resolved: ChatMentionTag, group: string) => {
    const searchText = normalizeMentionSearch(label);
    if (!searchText) return;
    const key = `${group}:${searchText}:${resolved.kind}:${
      resolved.kind === "player"
        ? resolved.playerId
        : resolved.kind === "team"
          ? resolved.teamId
          : resolved.territoryId
    }`;
    if (optionKeys.has(key)) return;
    optionKeys.add(key);
    options.push({
      key,
      label,
      token: formatBracketMentionToken(label),
      searchText,
      resolved,
    });
  };

  for (const player of playerOptions) {
    if (!player.enginePlayerId) continue;
    const resolved = {
      kind: "player",
      playerId: player.enginePlayerId,
    } as const;
    addUniqueMention(mentionIndex, normalizeChatMention(player.displayName), resolved);
    addOption(player.displayName, resolved, "player");
  }

  const teamIds = [
    ...new Set([
      ...playerOptions.map((player) => player.teamId).filter((teamId): teamId is string => !!teamId),
      ...Object.keys(teamNames),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  teamIds.forEach((teamId, index) => {
    const mention = { kind: "team", teamId } as const;
    addUniqueMention(mentionIndex, normalizeChatMention(teamId), mention);
    addUniqueMention(mentionIndex, `team${index + 1}`, mention);
    if (teamIds.length === 1) addUniqueMention(mentionIndex, "team", mention);
    const teamName = teamNames[teamId];
    if (teamName) addUniqueMention(mentionIndex, normalizeChatMention(teamName), mention);
    addOption(teamName ?? teamId, mention, "team");
  });

  for (const [territoryId, territory] of Object.entries(graphMap.territories)) {
    const resolved = {
      kind: "territory",
      territoryId,
    } as const;
    addUniqueMention(mentionIndex, normalizeChatMention(territory.name ?? territoryId), resolved);
    addOption(territory.name ?? territoryId, resolved, "territory");
  }

  return {
    resolve: (token) => mentionIndex.get(normalizeChatMention(token)) ?? null,
    options: options.sort((a, b) => a.label.localeCompare(b.label)),
  };
}

export function tokenizeChatText(text: string, resolver: ChatMentionResolver): ChatTextToken[] {
  const parts: ChatTextToken[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  MENTION_PATTERN.lastIndex = 0;
  while ((match = MENTION_PATTERN.exec(text)) !== null) {
    const prefix = match[1] ?? "";
    const bracketToken = match[2] ?? "";
    const bareToken = match[3] ?? "";
    const token = bracketToken || bareToken;
    const tokenStart = match.index + prefix.length;
    const tokenEnd = tokenStart + (bracketToken ? bracketToken.length + 3 : bareToken.length + 1);
    const resolved = resolver.resolve(token);
    if (!resolved) continue;

    if (tokenStart > cursor) parts.push(text.slice(cursor, tokenStart));
    parts.push({ token: text.slice(tokenStart, tokenEnd), resolved });
    cursor = tokenEnd;
  }

  if (cursor === 0) return [text];
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

export function findActiveChatMentionQuery(
  draftText: string,
  draftCursor: number,
  editingMessageId: string | null,
): ActiveChatMentionQuery | null {
  if (editingMessageId) return null;
  const beforeCursor = draftText.slice(0, draftCursor);
  const match = /(^|\s)@\[?([^\]@\s]{2,})$/.exec(beforeCursor);
  if (!match) return null;
  const query = match[2] ?? "";
  return {
    query,
    normalizedQuery: normalizeMentionSearch(query),
    tokenStart: beforeCursor.length - query.length - (match[0].includes("@[") ? 2 : 1),
    cursor: draftCursor,
  };
}
