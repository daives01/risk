import { ArrowUp, Check, Flag, Handshake, Pencil, Trash2, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChatHoverTag, HighlightFilter } from "@/lib/game/highlighting";
import type { ChatChannel, ChatMessage, PublicState } from "@/lib/game/types";

interface PlayerSummary {
  playerId: string;
  territories: number;
  armies: number;
  reserveTroops: number;
  cards: number;
  status: string;
  teamId?: string;
}

interface PlayerRef {
  userId?: string;
  displayName: string;
  enginePlayerId: string | null;
  teamId?: string | null;
}

interface ChatTargetOption {
  key: string;
  command: string;
  label: string;
  channel: ChatChannel;
  recipientEnginePlayerId: string | null;
  aliases?: string[];
}

interface GraphMapRef {
  territories: Record<string, { name?: string }>;
}

interface ChatMentionOption {
  key: string;
  label: string;
  token: string;
  searchText: string;
  resolved: ResolvedChatMention;
}

type ResolvedChatMention =
  | { kind: "player"; playerId: string }
  | { kind: "team"; teamId: string }
  | { kind: "territory"; territoryId: string };

interface ChatMentionResolver {
  resolve: (token: string) => ResolvedChatMention | null;
  options: ChatMentionOption[];
}

function normalizeChatMention(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "");
}

function normalizeMentionSearch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function formatBracketMentionToken(label: string) {
  return `@[${label.replace(/]/g, "")}]`;
}

function getMentionDisplayLabel(token: string) {
  if (token.startsWith("@[") && token.endsWith("]")) return `@${token.slice(2, -1)}`;
  return token;
}

function addUniqueMention<T extends ResolvedChatMention>(
  index: Map<string, T | null>,
  key: string,
  value: T,
) {
  if (!key) return;
  const existing = index.get(key);
  if (existing === undefined) {
    index.set(key, value);
    return;
  }
  if (existing && JSON.stringify(existing) === JSON.stringify(value)) return;
  index.set(key, null);
}

function buildChatMentionResolver(
  playerOptions: PlayerRef[],
  teamNames: Record<string, string>,
  graphMap: GraphMapRef,
): ChatMentionResolver {
  const mentionIndex = new Map<string, ResolvedChatMention | null>();
  const options: ChatMentionOption[] = [];
  const optionKeys = new Set<string>();

  const addOption = (label: string, resolved: ResolvedChatMention, group: string) => {
    const searchText = normalizeMentionSearch(label);
    if (!searchText) return;
    const key = `${group}:${searchText}:${JSON.stringify(resolved)}`;
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
    addUniqueMention(mentionIndex, normalizeChatMention(player.displayName), {
      kind: "player",
      playerId: player.enginePlayerId,
    });
    addOption(player.displayName, resolved, "player");
  }

  const teamIds = [...new Set([
    ...playerOptions.map((player) => player.teamId).filter((teamId): teamId is string => !!teamId),
    ...Object.keys(teamNames),
  ])].sort((a, b) => a.localeCompare(b));

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
    addUniqueMention(mentionIndex, normalizeChatMention(territory.name ?? territoryId), {
      kind: "territory",
      territoryId,
    });
    addOption(territory.name ?? territoryId, resolved, "territory");
  }

  return {
    resolve: (token) => mentionIndex.get(normalizeChatMention(token)) ?? null,
    options: options.sort((a, b) => a.label.localeCompare(b.label)),
  };
}

function ChatMessageText({
  text,
  resolver,
  onHoverTag,
  onLeaveTag,
  onClickTag,
}: {
  text: string;
  resolver: ChatMentionResolver;
  onHoverTag: (tag: ChatHoverTag) => void;
  onLeaveTag: () => void;
  onClickTag: (tag: Exclude<ChatHoverTag, null>) => void;
}) {
  const mentionPattern = /(^|[^A-Za-z0-9_@])(?:@\[([^\]\n]{1,80})\]|@([A-Za-z0-9][A-Za-z0-9_-]*))/g;
  const parts: Array<string | { token: string; resolved: ResolvedChatMention }> = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(text)) !== null) {
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

  if (cursor === 0) return <>{text}</>;
  if (cursor < text.length) parts.push(text.slice(cursor));

  return (
    <>
      {parts.map((part, index) => {
        if (typeof part === "string") return <span key={index}>{part}</span>;
        return (
          <button
            key={`${part.token}-${index}`}
            type="button"
            data-chat-tag="true"
            className="inline rounded border border-primary/35 bg-primary/10 px-1 font-semibold not-italic text-primary underline-offset-2 transition hover:border-primary/70 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/70"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerEnter={() => onHoverTag(part.resolved)}
            onPointerLeave={onLeaveTag}
            onFocus={() => onHoverTag(part.resolved)}
            onBlur={onLeaveTag}
            onClick={() => onClickTag(part.resolved)}
          >
            {getMentionDisplayLabel(part.token)}
          </button>
        );
      })}
    </>
  );
}

function tokenizeChatText(text: string, resolver: ChatMentionResolver) {
  const mentionPattern = /(^|[^A-Za-z0-9_@])(?:@\[([^\]\n]{1,80})\]|@([A-Za-z0-9][A-Za-z0-9_-]*))/g;
  const parts: Array<string | { token: string; resolved: ResolvedChatMention }> = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(text)) !== null) {
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

function serializeComposerNode(root: HTMLElement) {
  let text = "";
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const token = node.dataset.mentionToken;
    if (token) {
      text += token;
      return;
    }
    for (const child of Array.from(node.childNodes)) visit(child);
  };
  for (const child of Array.from(root.childNodes)) visit(child);
  return text.replace(/\u00a0/g, " ");
}

function getComposerCursor(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return serializeComposerNode(root).length;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return serializeComposerNode(root).length;

  let cursor = 0;
  let found = false;
  const walk = (node: Node) => {
    if (found) return;
    if (node === range.startContainer) {
      cursor += range.startOffset;
      found = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      cursor += (node.textContent ?? "").length;
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const token = node.dataset.mentionToken;
    if (token) {
      cursor += token.length;
      return;
    }
    const children = Array.from(node.childNodes);
    if (node === range.startContainer) {
      for (let index = 0; index < range.startOffset; index += 1) walk(children[index]!);
      found = true;
      return;
    }
    for (const child of children) walk(child);
  };

  for (const child of Array.from(root.childNodes)) walk(child);
  return cursor;
}

function setComposerCursor(root: HTMLElement, offset: number) {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  let cursor = 0;
  let placed = false;
  const placeIn = (node: Node) => {
    if (placed) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const textLength = (node.textContent ?? "").length;
      if (cursor + textLength >= offset) {
        range.setStart(node, Math.max(0, offset - cursor));
        range.collapse(true);
        placed = true;
      }
      cursor += textLength;
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const token = node.dataset.mentionToken;
    if (token) {
      if (cursor + token.length >= offset) {
        range.setStartAfter(node);
        range.collapse(true);
        placed = true;
      }
      cursor += token.length;
      return;
    }
    for (const child of Array.from(node.childNodes)) placeIn(child);
  };

  for (const child of Array.from(root.childNodes)) placeIn(child);
  if (!placed) {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

interface PlayersCardProps {
  playerStats: PlayerSummary[];
  displayState: PublicState;
  playerMap: PlayerRef[];
  teamModeEnabled: boolean;
  teamNames?: Record<string, string>;
  activeHighlight: HighlightFilter;
  onTogglePlayerHighlight: (playerId: string) => void;
  onToggleTeamHighlight: (teamId: string) => void;
  getPlayerColor: (playerId: string, turnOrder: string[]) => string;
  getPlayerName: (enginePlayerId: string, players: PlayerRef[]) => string;
  showTurnTimer: boolean;
  turnTimerLabel?: string | null;
  myPlayerId?: string | null;
  canResign?: boolean;
  onResign?: () => void;
  delegatablePlayerId?: string | null;
  delegatedPlayerId?: string | null;
  onStartDelegation?: (playerId: string) => void;
  onStopDelegation?: () => void;
}

export function GamePlayersCard({
  playerStats,
  displayState,
  playerMap,
  teamModeEnabled,
  teamNames,
  activeHighlight,
  onTogglePlayerHighlight,
  onToggleTeamHighlight,
  getPlayerColor,
  getPlayerName,
  showTurnTimer,
  turnTimerLabel,
  myPlayerId,
  canResign = false,
  onResign,
  delegatablePlayerId,
  delegatedPlayerId,
  onStartDelegation,
  onStopDelegation,
}: PlayersCardProps) {
  const [resignOpen, setResignOpen] = useState(false);
  const tableMinWidthClass = teamModeEnabled ? "min-w-[28.5rem]" : "min-w-[21.5rem]";
  const toTitleCase = (value: string) => value.slice(0, 1).toUpperCase() + value.slice(1).toLowerCase();

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, playerId: string) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onTogglePlayerHighlight(playerId);
  };

  return (
    <Card className="glass-panel gap-2 border-0 py-0" data-player-highlight-zone="true">
      <CardHeader className="flex flex-row items-center justify-between px-3 py-2.5 xl:px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" />
          Players
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 space-y-2 px-2.5 pb-3 xl:px-3">
        <div className="min-w-0 overflow-x-auto game-scrollbar">
          <table className={`w-full table-auto border-separate border-spacing-y-2 ${tableMinWidthClass}`}>
            <colgroup>
              <col className="w-[2rem]" />
              <col />
              <col className="w-[1.6rem]" />
              <col className="w-[4.75rem]" />
              {teamModeEnabled && <col className="w-[5.75rem]" />}
              <col className="w-[5.25rem]" />
              <col className="w-[3.25rem]" />
            </colgroup>
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground [@media(max-width:420px)]:text-[9px]">
                <th className="rounded-l-md border-y border-l border-border/70 bg-background/70 px-1 py-1.5 text-center [@media(max-width:420px)]:py-1" />
                <th className="border-y border-border/70 bg-background/70 px-1 py-1.5 text-left [@media(max-width:420px)]:py-1">Player</th>
                <th className="border-y border-border/70 bg-background/70 px-1 py-1.5 text-center [@media(max-width:420px)]:py-1" />
                <th className="border-y border-border/70 bg-background/70 px-2 py-1.5 text-center [@media(max-width:420px)]:px-2 [@media(max-width:420px)]:py-1"><span className="sm:hidden">Stat</span><span className="hidden sm:inline">Status</span></th>
                {teamModeEnabled && <th className="border-y border-border/70 bg-background/70 px-2 py-1.5 text-center [@media(max-width:420px)]:px-2 [@media(max-width:420px)]:py-1">Team</th>}
                <th className="border-y border-border/70 bg-background/70 px-2 py-1.5 text-center [@media(max-width:420px)]:px-2 [@media(max-width:420px)]:py-1"><span className="sm:hidden">R/T</span><span className="hidden sm:inline">Res/Troops</span></th>
                <th className="rounded-r-md border-y border-r border-border/70 bg-background/70 px-2.5 py-1.5 text-center [@media(max-width:420px)]:px-2.5 [@media(max-width:420px)]:py-1">Cards</th>
              </tr>
            </thead>
            <tbody>
              {playerStats.map((player) => {
                const isCurrent = player.playerId === displayState.turn.currentPlayerId;
                const isGameOver = displayState.turn.phase === "GameOver";
                const isWinner = isGameOver && player.status === "alive";
                const isDefeated = player.status === "defeated";
                const teamId = player.teamId;
                const playerHighlightKey = `player:${player.playerId}` as HighlightFilter;
                const teamHighlightKey = teamId ? (`team:${teamId}` as HighlightFilter) : null;
                const isPlayerHighlighted = activeHighlight === playerHighlightKey;
                const isTeamHighlighted = teamHighlightKey ? activeHighlight === teamHighlightKey : false;
                const color = getPlayerColor(player.playerId, displayState.turnOrder);
                const baseStatusLabel = isGameOver
                  ? isWinner
                    ? "Winner"
                    : toTitleCase(player.status)
                  : toTitleCase(player.status);
                const statusLabel = showTurnTimer && isCurrent
                  ? (turnTimerLabel ?? "Turn")
                  : !showTurnTimer && !isGameOver && isCurrent
                    ? "Turn"
                    : baseStatusLabel;
                const showResign =
                  canResign &&
                  !!onResign &&
                  player.status === "alive" &&
                  !!myPlayerId &&
                  player.playerId === myPlayerId;
                const canPlayForPlayer = delegatablePlayerId === player.playerId && !delegatedPlayerId;
                const isDelegatedPlayer = delegatedPlayerId === player.playerId;
                const playerName = getPlayerName(player.playerId, playerMap);
                const rowToneClass = isPlayerHighlighted
                  ? "border-primary/70 bg-primary/10"
                  : "border-border/70 bg-background/80 group-hover:border-primary/50";

                return (
                  <tr
                    key={player.playerId}
                    role="button"
                    tabIndex={0}
                    onClick={() => onTogglePlayerHighlight(player.playerId)}
                    onKeyDown={(event) => handleRowKeyDown(event, player.playerId)}
                    className={`group cursor-pointer outline-none transition ${isDefeated ? "opacity-55" : ""}`}
                  >
                    <td className={`rounded-l-lg border-y border-l px-1 py-1.5 text-center [@media(max-width:420px)]:py-1 ${rowToneClass}`}>
                      <span className="mx-auto block size-2.5 rounded-full" style={{ backgroundColor: color }} />
                    </td>
                    <td className={`border-y px-1 py-1.5 [@media(max-width:420px)]:py-1 ${rowToneClass}`}>
                      <div className="min-w-0 text-sm [@media(max-width:420px)]:text-[0.72rem]">
                        <span className={`block min-w-0 truncate font-semibold ${isDefeated ? "line-through" : ""}`}>
                          {playerName}
                        </span>
                      </div>
                    </td>
                    <td className={`border-y px-1 py-1.5 text-center [@media(max-width:420px)]:py-1 ${rowToneClass}`}>
                      {showResign && (
                        <Popover open={resignOpen} onOpenChange={setResignOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              aria-label="Resign game"
                              title="Resign game"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Flag className="size-3" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            side="bottom"
                            align="start"
                            className="w-auto rounded-none px-2.5 py-2"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="flex items-center gap-3 text-xs">
                              <span className="uppercase tracking-wide text-muted-foreground">Resign?</span>
                              <div className="flex items-center gap-1.5">
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="outline"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setResignOpen(false);
                                  }}
                                >
                                  No
                                </Button>
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="destructive"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setResignOpen(false);
                                    onResign();
                                  }}
                                >
                                  Yes
                                </Button>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                      {canPlayForPlayer && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="icon-xs"
                                variant="ghost"
                                aria-label={`Play for ${playerName}`}
                                className="text-muted-foreground hover:text-foreground"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onStartDelegation?.(player.playerId);
                                }}
                              >
                                <Handshake className="size-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Play for {playerName}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {isDelegatedPlayer && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="icon-xs"
                                variant="ghost"
                                aria-label={`Stop playing for ${playerName}`}
                                className="text-amber-500 hover:text-amber-400"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onStopDelegation?.();
                                }}
                              >
                                <Handshake className="size-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Stop playing for {playerName}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </td>
                    <td className={`border-y px-2 py-1.5 text-center [@media(max-width:420px)]:px-2 [@media(max-width:420px)]:py-1 ${rowToneClass}`}>
                      <span
                        className={`truncate text-xs font-medium ${
                          showTurnTimer && isCurrent
                            ? "font-semibold text-amber-500"
                            : isWinner || (!showTurnTimer && !isGameOver && isCurrent)
                              ? "font-semibold text-primary"
                              : "text-muted-foreground"
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </td>
                    {teamModeEnabled && (
                      <td className={`border-y px-2 py-1.5 text-center [@media(max-width:420px)]:px-2 [@media(max-width:420px)]:py-1 ${rowToneClass}`}>
                        {teamId ? (
                          <button
                            type="button"
                            className={`inline-flex max-w-full items-center justify-center truncate rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition ${
                              isTeamHighlighted
                                ? "border-primary bg-primary/15 text-primary"
                                : "border-border text-muted-foreground hover:border-primary/50"
                            }`}
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggleTeamHighlight(teamId);
                            }}
                          >
                            {teamNames?.[teamId] ?? teamId}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground/80">-</span>
                        )}
                      </td>
                    )}
                    <td className={`border-y px-2 py-1.5 text-center [@media(max-width:420px)]:px-2 [@media(max-width:420px)]:py-1 ${rowToneClass}`}>
                      <span className="text-xs tabular-nums">{player.reserveTroops} / {player.armies}</span>
                    </td>
                    <td className={`rounded-r-lg border-y border-r px-2.5 py-1.5 text-center [@media(max-width:420px)]:px-2.5 [@media(max-width:420px)]:py-1 ${rowToneClass}`}>
                      <span className="text-xs tabular-nums">{player.cards}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

interface GameEventsCardProps {
  events: Array<{ key: string; text: string; index: number }>;
  activeIndex: number | null;
  onSelectEvent?: (index: number) => void;
}

export function GameEventsCard({ events, activeIndex, onSelectEvent }: GameEventsCardProps) {
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!activeItemRef.current) return;
    activeItemRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  return (
    <Card className="glass-panel flex h-full min-h-0 flex-col overflow-hidden border-0 py-0">
      <CardHeader className="py-4">
        <CardTitle className="text-base">Recent Events</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-4 text-sm">
        {events.length === 0 && <p className="text-muted-foreground">No actions yet.</p>}
        {events.map((event) => {
          const isActive = activeIndex === event.index;
          return (
            <button
              key={event.key}
              type="button"
              onClick={() => onSelectEvent?.(event.index)}
              ref={isActive ? activeItemRef : null}
              aria-current={isActive ? "true" : undefined}
              className={`w-full rounded-md border px-3 py-2 text-left transition ${
                isActive
                  ? "border-primary/80 bg-primary/15 text-foreground"
                  : "bg-background/80 text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {event.text}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

interface GameChatCardProps {
  messages: ChatMessage[];
  activeChannel: ChatChannel;
  activeRecipientEnginePlayerId: string | null;
  playerOptions: PlayerRef[];
  teamNames: Record<string, string>;
  graphMap: GraphMapRef;
  myEnginePlayerId?: string | null;
  teamGameEnabled: boolean;
  teamAvailable: boolean;
  canSend: boolean;
  draftText: string;
  editingMessageId: string | null;
  editingChannel: ChatChannel | null;
  onSetDraftText: (value: string) => void;
  onSelectChannel: (channel: ChatChannel, recipientEnginePlayerId?: string | null) => void;
  onToggleChannel: () => void;
  onStartEditMessage: (message: ChatMessage) => void;
  onCancelEditMessage: () => void;
  onDeleteMessage: (messageId: string) => void;
  onSend: () => void;
  onHoverTag: (tag: ChatHoverTag) => void;
  onLeaveTag: () => void;
  onClickTag: (tag: Exclude<ChatHoverTag, null>) => void;
}

export function GameChatCard({
  messages,
  activeChannel,
  activeRecipientEnginePlayerId,
  playerOptions,
  teamNames,
  graphMap,
  myEnginePlayerId,
  teamGameEnabled,
  teamAvailable,
  canSend,
  draftText,
  editingMessageId,
  editingChannel,
  onSetDraftText,
  onSelectChannel,
  onToggleChannel,
  onStartEditMessage,
  onCancelEditMessage,
  onDeleteMessage,
  onSend,
  onHoverTag,
  onLeaveTag,
  onClickTag,
}: GameChatCardProps) {
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLDivElement | null>(null);
  const [slashSelectionIndex, setSlashSelectionIndex] = useState(0);
  const [mentionSelectionIndex, setMentionSelectionIndex] = useState(0);
  const [draftCursor, setDraftCursor] = useState(draftText.length);

  const messagesWithTimestamps = useMemo(() => {
    const today = new Date();

    const formatChatTimestamp = (timestamp: number) => {
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return "";

      if (date.toDateString() !== today.toDateString()) {
        return date.toLocaleDateString("en-US", {
          month: "2-digit",
          day: "2-digit",
          year: "2-digit",
        });
      }

      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    return messages.map((message) => ({
      ...message,
      timestampLabel: formatChatTimestamp(message.createdAt),
    }));
  }, [messages]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSend();
  };
  const currentInputChannel = editingChannel ?? activeChannel;
  const dmTarget = currentInputChannel === "dm"
    ? playerOptions.find((player) => player.enginePlayerId === activeRecipientEnginePlayerId) ?? null
    : null;
  const selectablePlayers = useMemo(
    () => playerOptions.filter((player) => player.enginePlayerId && player.enginePlayerId !== myEnginePlayerId),
    [myEnginePlayerId, playerOptions],
  );
  const chatTargetOptions = useMemo<ChatTargetOption[]>(() => {
    const options: ChatTargetOption[] = [
      {
        key: "all",
        command: "all",
        label: "All:",
        channel: "all",
        recipientEnginePlayerId: null,
        aliases: ["global"],
      },
      ...(teamGameEnabled && teamAvailable
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
  }, [selectablePlayers, teamAvailable, teamGameEnabled]);
  const chatMentionResolver = useMemo(
    () => buildChatMentionResolver(playerOptions, teamNames, graphMap),
    [graphMap, playerOptions, teamNames],
  );
  const targetLabel = currentInputChannel === "dm" && dmTarget
    ? `${dmTarget.displayName}:`
    : currentInputChannel === "team" && teamAvailable
      ? "Team:"
      : "All:";
  const isSpecialInputTarget = currentInputChannel === "team" || currentInputChannel === "dm";
  const selectValue = activeChannel === "dm" && activeRecipientEnginePlayerId
    ? `dm:${activeRecipientEnginePlayerId}`
    : activeChannel;
  const canSubmitToSelectedTarget = activeChannel !== "dm" || !!activeRecipientEnginePlayerId;
  const slashToken = !editingMessageId && draftText.startsWith("/") && !/\s/.test(draftText)
    ? draftText.slice(1).toLowerCase()
    : null;
  const slashMatches = useMemo(() => {
    if (slashToken === null) return [];
    return chatTargetOptions.filter((option) =>
      option.command.startsWith(slashToken) ||
      option.aliases?.some((alias) => alias.startsWith(slashToken))
    );
  }, [chatTargetOptions, slashToken]);
  const showSlashMenu = slashMatches.length > 0 && slashToken !== null;
  const selectedSlashOption = slashMatches[Math.min(slashSelectionIndex, Math.max(0, slashMatches.length - 1))] ?? null;
  const activeMentionQuery = useMemo(() => {
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
  }, [draftCursor, draftText, editingMessageId]);
  const mentionMatches = useMemo(() => {
    if (!activeMentionQuery || !activeMentionQuery.normalizedQuery) return [];
    return chatMentionResolver.options
      .filter((option) => option.searchText.includes(activeMentionQuery.normalizedQuery))
      .slice(0, 12);
  }, [activeMentionQuery, chatMentionResolver]);
  const showMentionMenu = mentionMatches.length > 0 && !!activeMentionQuery;
  const selectedMentionOption =
    mentionMatches[Math.min(mentionSelectionIndex, Math.max(0, mentionMatches.length - 1))] ?? null;

  const applyChatTargetOption = (option: ChatTargetOption) => {
    onSelectChannel(option.channel, option.recipientEnginePlayerId);
    onSetDraftText("");
    setSlashSelectionIndex(0);
  };

  const completeSlashOption = (option: ChatTargetOption) => {
    onSetDraftText(`/${option.command}`);
    setSlashSelectionIndex(0);
  };

  const renderComposerDraft = useCallback((text: string, cursorOffset = text.length) => {
    const input = inputRef.current;
    if (!input) return;
    input.replaceChildren();
    for (const part of tokenizeChatText(text, chatMentionResolver)) {
      if (typeof part === "string") {
        input.append(document.createTextNode(part));
        continue;
      }
      const tag = document.createElement("button");
      tag.type = "button";
      tag.contentEditable = "false";
      tag.dataset.chatTag = "true";
      tag.dataset.mentionToken = part.token;
      tag.className = "inline rounded border border-primary/35 bg-primary/10 px-1 font-semibold not-italic text-primary underline-offset-2 transition hover:border-primary/70 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/70";
      tag.textContent = getMentionDisplayLabel(part.token);
      tag.addEventListener("pointerdown", (event) => event.stopPropagation());
      tag.addEventListener("pointerenter", () => onHoverTag(part.resolved));
      tag.addEventListener("pointerleave", onLeaveTag);
      tag.addEventListener("focus", () => onHoverTag(part.resolved));
      tag.addEventListener("blur", onLeaveTag);
      tag.addEventListener("click", () => onClickTag(part.resolved));
      input.append(tag);
    }
    setComposerCursor(input, cursorOffset);
  }, [chatMentionResolver, onClickTag, onHoverTag, onLeaveTag]);

  const applyMentionOption = (option: ChatMentionOption) => {
    if (!activeMentionQuery) return;
    const nextText = `${draftText.slice(0, activeMentionQuery.tokenStart)}${option.token} ${draftText.slice(activeMentionQuery.cursor)}`;
    const nextCursor = activeMentionQuery.tokenStart + option.token.length + 1;
    onSetDraftText(nextText);
    setMentionSelectionIndex(0);
    setDraftCursor(nextCursor);
    window.requestAnimationFrame(() => {
      renderComposerDraft(nextText, nextCursor);
      inputRef.current?.focus();
    });
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Backspace" && draftCursor > 0) {
      const selection = window.getSelection();
      const input = inputRef.current;
      if (selection && input && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const previousElement =
          range.startContainer === input && range.startOffset > 0
            ? input.childNodes[range.startOffset - 1]
            : null;
        if (previousElement instanceof HTMLElement && previousElement.dataset.mentionToken) {
          event.preventDefault();
          previousElement.remove();
          syncDraftFromComposer(input);
          return;
        }
      }
      const beforeCursor = draftText.slice(0, draftCursor);
      const afterCursor = draftText.slice(draftCursor);
      const mentionAtCursor = /@\[([^\]\n]{1,80})\]\s?$/.exec(beforeCursor);
      if (mentionAtCursor) {
        event.preventDefault();
        const nextCursor = beforeCursor.length - mentionAtCursor[0].length;
        const nextText = `${draftText.slice(0, nextCursor)}${afterCursor}`;
        onSetDraftText(nextText);
        setDraftCursor(nextCursor);
        window.requestAnimationFrame(() => {
          renderComposerDraft(nextText, nextCursor);
          inputRef.current?.focus();
        });
        return;
      }
    }
    if (showMentionMenu && event.key === "ArrowDown") {
      event.preventDefault();
      setMentionSelectionIndex((index) => (index + 1) % mentionMatches.length);
      return;
    }
    if (showMentionMenu && event.key === "ArrowUp") {
      event.preventDefault();
      setMentionSelectionIndex((index) => (index - 1 + mentionMatches.length) % mentionMatches.length);
      return;
    }
    if (showMentionMenu && event.key === "Tab") {
      event.preventDefault();
      if (mentionMatches.length > 1) {
        setMentionSelectionIndex((index) => (index + 1) % mentionMatches.length);
        return;
      }
      if (selectedMentionOption) applyMentionOption(selectedMentionOption);
      return;
    }
    if (showMentionMenu && (event.key === "Enter" || event.key === " ") && selectedMentionOption) {
      event.preventDefault();
      applyMentionOption(selectedMentionOption);
      return;
    }
    if (showSlashMenu && event.key === "ArrowDown") {
      event.preventDefault();
      setSlashSelectionIndex((index) => (index + 1) % slashMatches.length);
      return;
    }
    if (showSlashMenu && event.key === "ArrowUp") {
      event.preventDefault();
      setSlashSelectionIndex((index) => (index - 1 + slashMatches.length) % slashMatches.length);
      return;
    }
    if (showSlashMenu && event.key === "Tab" && selectedSlashOption) {
      event.preventDefault();
      if (slashMatches.length > 1) {
        setSlashSelectionIndex((index) => (index + 1) % slashMatches.length);
        return;
      }
      completeSlashOption(selectedSlashOption);
      return;
    }
    if (showSlashMenu && (event.key === " " || event.key === "Enter") && selectedSlashOption) {
      const exactMatch = selectedSlashOption.command === slashToken ||
        selectedSlashOption.aliases?.includes(slashToken ?? "");
      event.preventDefault();
      if (exactMatch || slashMatches.length === 1 || event.key === "Enter") {
        applyChatTargetOption(selectedSlashOption);
        return;
      }
      completeSlashOption(selectedSlashOption);
      return;
    }
    if (event.key === "Tab" && teamAvailable && !editingMessageId && !event.shiftKey) {
      event.preventDefault();
      onToggleChannel();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  const syncDraftFromComposer = (input: HTMLDivElement) => {
    const nextText = serializeComposerNode(input);
    setDraftCursor(getComposerCursor(input));
    onSetDraftText(nextText);
  };

  const updateDraftCursorFromInput = (input: HTMLDivElement) => {
    setDraftCursor(getComposerCursor(input));
  };

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    if (serializeComposerNode(input) === draftText) return;
    renderComposerDraft(draftText, draftText.length);
  }, [draftText, renderComposerDraft]);

  return (
    <Card className="glass-panel h-[min(30rem,50vh)] gap-2 border-0 py-0 xl:h-[min(34rem,50vh)]">
      <CardHeader className="flex flex-row items-center gap-2 pb-0 pt-3">
        <CardTitle className="text-base">Chat</CardTitle>
      </CardHeader>
      <CardContent className="flex h-[calc(100%-3rem)] flex-col space-y-1.5 pb-3 pt-0">
        <div
          ref={messagesContainerRef}
          className="game-scrollbar flex-1 overflow-y-auto px-0.5 py-2 font-mono text-[0.8125rem] leading-snug"
        >
          <div className="mt-auto space-y-1">
            {messages.length === 0 && <p className="text-muted-foreground">No messages yet.</p>}
            {messagesWithTimestamps.map((message) => {
              const timestampLabel = message.timestampLabel;
              const isTeamMessage = message.channel === "team";
              const isDmMessage = message.channel === "dm";
              const isSpecialMessage = isTeamMessage || isDmMessage;
              const displaySender = message.isMine ? "You" : message.senderDisplayName;
              const scopeLabel = isTeamMessage
                ? "[team]"
                : isDmMessage
                  ? message.isMine
                    ? `[to ${message.recipientDisplayName ?? "player"}]`
                    : "[to you]"
                  : null;

              return (
                <div
                  key={message._id}
                  className={`group relative text-left ${
                    isSpecialMessage ? "text-amber-400 italic" : "text-foreground"
                  }`}
                >
                  {message.isMine && canSend && (
                    <span className="absolute left-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-0.5 bg-background/95 pr-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      <Button
                        type="button"
                        size="icon-xs"
                        variant={editingMessageId === message._id ? "default" : "ghost"}
                        aria-label="Edit message"
                        onClick={() => onStartEditMessage(message)}
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Delete message"
                        onClick={() => onDeleteMessage(message._id)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </span>
                  )}
                  <p className="break-normal [overflow-wrap:anywhere]">
                    {timestampLabel ? <span className="inline-block w-[4.75rem]">{timestampLabel}</span> : null}
                    {scopeLabel ? <>{scopeLabel} </> : null}
                    <span className="font-semibold">{displaySender}:</span>{" "}
                    <ChatMessageText
                      text={message.text}
                      resolver={chatMentionResolver}
                      onHoverTag={onHoverTag}
                      onLeaveTag={onLeaveTag}
                      onClickTag={onClickTag}
                    />
                    {message.editedAt ? <span className="ml-1 text-[0.72rem] text-muted-foreground">(edited)</span> : null}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <form className="flex gap-2" onSubmit={handleSubmit}>
          <div className="relative flex min-w-0 flex-1 items-center gap-1">
            {showSlashMenu && (
              <div className="absolute bottom-[calc(100%+0.35rem)] left-0 z-20 w-[min(22rem,100%)] border border-border/80 bg-popover p-1 text-xs text-popover-foreground shadow-md">
                {slashMatches.map((option, index) => {
                  const isSelected = index === Math.min(slashSelectionIndex, slashMatches.length - 1);
                  return (
                    <button
                      key={option.key}
                      type="button"
                      className={`flex w-full items-center justify-between px-2 py-1.5 text-left outline-none ${
                        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/70"
                      }`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        applyChatTargetOption(option);
                      }}
                    >
                      <span>{option.label}</span>
                      <span className="font-mono text-[0.7rem] text-muted-foreground">/{option.command}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {showMentionMenu && activeMentionQuery && (
              <div className="absolute bottom-[calc(100%+0.35rem)] left-0 z-20 max-h-64 w-[min(24rem,100%)] overflow-y-auto border border-border/80 bg-popover p-1 text-xs text-popover-foreground shadow-md game-scrollbar">
                {mentionMatches.map((option, index) => {
                  const isSelected = index === Math.min(mentionSelectionIndex, mentionMatches.length - 1);
                  const kindLabel =
                    option.resolved.kind === "player"
                      ? "player"
                      : option.resolved.kind === "team"
                        ? "team"
                        : "territory";
                  return (
                    <button
                      key={option.key}
                      type="button"
                      className={`flex w-full items-center justify-between gap-3 px-2 py-1.5 text-left outline-none ${
                        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/70"
                      }`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        applyMentionOption(option);
                      }}
                    >
                      <span className="min-w-0 truncate">{option.label}</span>
                      <span className="shrink-0 font-mono text-[0.7rem] text-muted-foreground">{kindLabel}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {canSend && !editingMessageId ? (
              <Select
                value={selectValue}
                onValueChange={(value) => {
                  if (value.startsWith("dm:")) {
                    onSelectChannel("dm", value.slice("dm:".length));
                    return;
                  }
                  onSelectChannel(value as ChatChannel, null);
                }}
              >
                <SelectTrigger
                  aria-label="Chat target"
                  className={`h-9 w-auto shrink-0 justify-start gap-1 border-0 bg-transparent px-0.5 text-xs font-semibold shadow-none hover:bg-background/35 focus-visible:ring-1 [&>svg]:order-first [&>svg]:size-3 ${
                    activeChannel === "team" ? "text-amber-400 [&>svg]:text-amber-400" : ""
                  } ${
                    activeChannel === "dm" ? "text-amber-400 [&>svg]:text-amber-400" : ""
                  }`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" className="min-w-[11rem]">
                  <SelectItem value="all">All:</SelectItem>
                  {teamGameEnabled && teamAvailable && (
                    <SelectItem value="team" className="text-amber-400 focus:text-amber-300">Team:</SelectItem>
                  )}
                  {selectablePlayers.map((player) => (
                    <SelectItem
                      key={player.enginePlayerId}
                      value={`dm:${player.enginePlayerId}`}
                      className="text-amber-400 focus:text-amber-300"
                    >
                      {player.displayName}:
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div
                className={`flex h-9 w-auto shrink-0 items-center truncate px-0.5 text-xs font-semibold ${
                  isSpecialInputTarget ? "text-amber-400" : "text-muted-foreground"
                }`}
              >
                {targetLabel}
              </div>
            )}
            <div
              ref={inputRef}
              role="textbox"
              aria-label="Chat message"
              aria-disabled={!canSend}
              contentEditable={canSend}
              suppressContentEditableWarning
              data-placeholder={
                canSend
                  ? editingMessageId
                    ? "Edit your message and press Enter..."
                    : "Send a message..."
                  : "Chat is read-only"
              }
              className={`relative flex h-9 min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-pre rounded-none border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] focus-visible:border-input focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50 md:text-sm ${
                isSpecialInputTarget ? "text-amber-400 italic empty:before:text-amber-400/55" : ""
              }`}
              onInput={(event) => {
                setSlashSelectionIndex(0);
                setMentionSelectionIndex(0);
                syncDraftFromComposer(event.currentTarget);
              }}
              onClick={(event) => updateDraftCursorFromInput(event.currentTarget)}
              onKeyUp={(event) => updateDraftCursorFromInput(event.currentTarget)}
              onSelect={(event) => updateDraftCursorFromInput(event.currentTarget)}
              onKeyDown={handleInputKeyDown}
            />
          </div>
          {editingMessageId && (
            <Button type="button" size="icon" variant="outline" disabled={!canSend} onClick={onCancelEditMessage}>
              <X className="size-3.5" />
            </Button>
          )}
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            aria-label={editingMessageId ? "Save message edit" : "Send message"}
            title={editingMessageId ? "Save edit" : "Send message"}
            className={`h-9 w-8 border border-transparent bg-transparent text-muted-foreground shadow-none hover:border-border/70 hover:bg-background/45 hover:text-foreground focus-visible:border-input focus-visible:ring-0 disabled:opacity-30 ${
              isSpecialInputTarget ? "text-amber-400 hover:text-amber-300" : ""
            } ${
              editingMessageId ? "border-amber-500/35 text-amber-400 hover:border-amber-500/60 hover:text-amber-300" : ""
            }`}
            disabled={!canSend || !canSubmitToSelectedTarget || !draftText.trim()}
          >
            {editingMessageId ? <Check className="size-3.5" /> : <ArrowUp className="size-4" />}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
