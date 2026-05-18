import emojiData from "emojibase-data/en/compact.json";
import slackShortcodes from "emojibase-data/en/shortcodes/iamcal.json";

interface EmojibaseEmoji {
  hexcode: string;
  label: string;
  unicode: string;
  order?: number;
  tags?: string[];
}

export interface ChatEmojiOption {
  key: string;
  shortcode: string;
  label: string;
  unicode: string;
  searchText: string;
  order: number;
}

export interface ActiveChatEmojiQuery {
  query: string;
  normalizedQuery: string;
  tokenStart: number;
  cursor: number;
}

type SlackShortcodeDataset = Record<string, string | string[]>;

const EMOJI_QUERY_PATTERN = /(^|\s):([A-Za-z0-9_+-]{1,80})$/;
const MAX_EMOJI_MATCHES = 12;

function normalizeEmojiSearch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function toShortcodeList(value: string | string[]) {
  return Array.isArray(value) ? value : [value];
}

function buildChatEmojiOptions(): ChatEmojiOption[] {
  const emojiByHexcode = new Map(
    (emojiData as EmojibaseEmoji[]).map((emoji) => [emoji.hexcode, emoji]),
  );
  const options: ChatEmojiOption[] = [];
  const optionKeys = new Set<string>();

  for (const [hexcode, shortcodeValue] of Object.entries(slackShortcodes as SlackShortcodeDataset)) {
    const emoji = emojiByHexcode.get(hexcode);
    if (!emoji) continue;

    for (const shortcode of toShortcodeList(shortcodeValue)) {
      const normalizedShortcode = normalizeEmojiSearch(shortcode);
      if (!normalizedShortcode) continue;
      const key = `${emoji.hexcode}:${normalizedShortcode}`;
      if (optionKeys.has(key)) continue;
      optionKeys.add(key);
      options.push({
        key,
        shortcode,
        label: emoji.label,
        unicode: emoji.unicode,
        searchText: `${normalizedShortcode} ${normalizeEmojiSearch(emoji.label)} ${normalizeEmojiSearch(
          emoji.tags?.join(" ") ?? "",
        )}`,
        order: emoji.order ?? Number.MAX_SAFE_INTEGER,
      });
    }
  }

  return options.sort((left, right) => left.order - right.order || left.shortcode.localeCompare(right.shortcode));
}

export const chatEmojiOptions = buildChatEmojiOptions();

export function findActiveChatEmojiQuery(
  draftText: string,
  draftCursor: number,
  editingMessageId: string | null,
): ActiveChatEmojiQuery | null {
  if (editingMessageId) return null;
  const beforeCursor = draftText.slice(0, draftCursor);
  const match = EMOJI_QUERY_PATTERN.exec(beforeCursor);
  if (!match) return null;
  const query = match[2] ?? "";
  return {
    query,
    normalizedQuery: normalizeEmojiSearch(query),
    tokenStart: beforeCursor.length - query.length - 1,
    cursor: draftCursor,
  };
}

export function findChatEmojiMatches(query: ActiveChatEmojiQuery | null) {
  if (!query?.normalizedQuery) return [];
  const exactMatches: ChatEmojiOption[] = [];
  const prefixMatches: ChatEmojiOption[] = [];
  const fuzzyMatches: ChatEmojiOption[] = [];

  for (const option of chatEmojiOptions) {
    const normalizedShortcode = normalizeEmojiSearch(option.shortcode);
    if (normalizedShortcode === query.normalizedQuery) {
      exactMatches.push(option);
    } else if (normalizedShortcode.startsWith(query.normalizedQuery)) {
      prefixMatches.push(option);
    } else if (option.searchText.includes(query.normalizedQuery)) {
      fuzzyMatches.push(option);
    }
    if (exactMatches.length + prefixMatches.length + fuzzyMatches.length >= MAX_EMOJI_MATCHES) break;
  }

  return [...exactMatches, ...prefixMatches, ...fuzzyMatches].slice(0, MAX_EMOJI_MATCHES);
}
