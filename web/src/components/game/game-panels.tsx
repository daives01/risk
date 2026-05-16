import { ArrowUp, Check, Flag, Handshake, Pencil, Trash2, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { HighlightFilter } from "@/lib/game/highlighting";
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
}

interface ChatTargetOption {
  key: string;
  command: string;
  label: string;
  channel: ChatChannel;
  recipientEnginePlayerId: string | null;
  aliases?: string[];
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
}

export function GameChatCard({
  messages,
  activeChannel,
  activeRecipientEnginePlayerId,
  playerOptions,
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
}: GameChatCardProps) {
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [slashSelectionIndex, setSlashSelectionIndex] = useState(0);

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
    const normalizeCommand = (value: string) =>
      value.toLowerCase().replace(/[^a-z0-9_-]+/g, "");

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
        command: normalizeCommand(player.displayName),
        label: `${player.displayName}:`,
        channel: "dm" as const,
        recipientEnginePlayerId: player.enginePlayerId,
      })),
    ];

    return options.filter((option) => option.command.length > 0);
  }, [selectablePlayers, teamAvailable, teamGameEnabled]);
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

  const applyChatTargetOption = (option: ChatTargetOption) => {
    onSelectChannel(option.channel, option.recipientEnginePlayerId);
    onSetDraftText("");
    setSlashSelectionIndex(0);
  };

  const completeSlashOption = (option: ChatTargetOption) => {
    onSetDraftText(`/${option.command}`);
    setSlashSelectionIndex(0);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages.length]);

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
                    {message.text}
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
            <Input
              value={draftText}
              maxLength={300}
              disabled={!canSend}
              placeholder={
                canSend
                  ? editingMessageId
                    ? "Edit your message and press Enter..."
                    : "Send a message..."
                  : "Chat is read-only"
              }
              className={`min-w-0 focus-visible:border-input focus-visible:ring-0 ${isSpecialInputTarget ? "text-amber-400 italic placeholder:text-amber-400/55" : ""}`}
              onChange={(event) => {
                setSlashSelectionIndex(0);
                onSetDraftText(event.target.value);
              }}
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
