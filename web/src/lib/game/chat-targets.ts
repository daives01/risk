import type { ChatChannel } from "./types";
import { normalizeChatMention } from "./chat-mentions";

export interface ChatTargetPlayer {
  displayName: string;
  enginePlayerId: string | null;
}

export interface ChatTargetOption {
  key: string;
  command: string;
  label: string;
  channel: ChatChannel;
  recipientEnginePlayerId: string | null;
  aliases?: string[];
}

export function buildChatTargetOptions(args: {
  players: ChatTargetPlayer[];
  myEnginePlayerId?: string | null;
  teamGameEnabled: boolean;
  teamAvailable: boolean;
}): ChatTargetOption[] {
  const selectablePlayers = args.players.filter((player) =>
    player.enginePlayerId && player.enginePlayerId !== args.myEnginePlayerId
  );
  const options: ChatTargetOption[] = [
    {
      key: "all",
      command: "all",
      label: "All:",
      channel: "all",
      recipientEnginePlayerId: null,
      aliases: ["global"],
    },
    ...(args.teamGameEnabled && args.teamAvailable
      ? [{
          key: "team",
          command: "team",
          label: "Team:",
          channel: "team" as const,
          recipientEnginePlayerId: null,
        }]
      : []),
    ...selectablePlayers.map((player) => ({
      key: `dm:${player.enginePlayerId}`,
      command: normalizeChatMention(player.displayName),
      label: `${player.displayName}:`,
      channel: "dm" as const,
      recipientEnginePlayerId: player.enginePlayerId,
    })),
  ];

  return options.filter((option) => option.command.length > 0);
}

export function findChatTargetOptionMatches(options: ChatTargetOption[], slashToken: string | null) {
  if (slashToken === null) return [];
  return options.filter((option) =>
    option.command.startsWith(slashToken) ||
    option.aliases?.some((alias) => alias.startsWith(slashToken))
  );
}

export function getChatTargetSelectValue(channel: ChatChannel, recipientEnginePlayerId: string | null) {
  return channel === "dm" && recipientEnginePlayerId
    ? `dm:${recipientEnginePlayerId}`
    : channel;
}
