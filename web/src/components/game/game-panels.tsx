import { ArrowUp, Check, Flag, Pencil, Trash2, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  displayName: string;
  enginePlayerId: string | null;
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
}: PlayersCardProps) {
  const [resignOpen, setResignOpen] = useState(false);
  const columnsClass = showTurnTimer
    ? teamModeEnabled
      ? "grid-cols-[minmax(4.25rem,1.2fr)_minmax(2.25rem,0.65fr)_repeat(4,minmax(1.85rem,0.5fr))_minmax(2.5rem,0.65fr)_minmax(2.25rem,0.6fr)] sm:grid-cols-[minmax(8rem,1.7fr)_minmax(4rem,0.9fr)_repeat(4,minmax(3.25rem,0.7fr))_minmax(4.5rem,0.9fr)_minmax(4.25rem,0.85fr)]"
      : "grid-cols-[minmax(4.25rem,1.2fr)_repeat(4,minmax(1.85rem,0.5fr))_minmax(2.5rem,0.65fr)_minmax(2.25rem,0.6fr)] sm:grid-cols-[minmax(8rem,1.7fr)_repeat(4,minmax(3.25rem,0.7fr))_minmax(4.5rem,0.9fr)_minmax(4.25rem,0.85fr)]"
    : teamModeEnabled
      ? "grid-cols-[minmax(4.25rem,1.2fr)_minmax(2.25rem,0.65fr)_repeat(4,minmax(1.85rem,0.5fr))_minmax(2.25rem,0.6fr)] sm:grid-cols-[minmax(8rem,1.7fr)_minmax(4rem,0.9fr)_repeat(4,minmax(3.25rem,0.7fr))_minmax(4.25rem,0.85fr)]"
      : "grid-cols-[minmax(4.25rem,1.2fr)_repeat(4,minmax(1.85rem,0.5fr))_minmax(2.25rem,0.6fr)] sm:grid-cols-[minmax(8rem,1.7fr)_repeat(4,minmax(3.25rem,0.7fr))_minmax(4.25rem,0.85fr)]";

  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, playerId: string) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onTogglePlayerHighlight(playerId);
  };

  return (
    <Card className="glass-panel border-0 py-0" data-player-highlight-zone="true">
      <CardHeader className="flex flex-row items-center justify-between py-2.5">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" />
          Players
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 space-y-2 pb-3">
        <div className="min-w-0 overflow-x-auto game-scrollbar">
          <div className="w-max min-w-full space-y-2">
            <div
              className={`grid w-full min-w-0 items-center gap-2 rounded-md border border-border/70 bg-background/70 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground [@media(max-width:420px)]:gap-1 [@media(max-width:420px)]:px-2 [@media(max-width:420px)]:py-1 [@media(max-width:420px)]:text-[9px] ${columnsClass}`}
            >
              <span className="truncate">Player</span>
              {teamModeEnabled && <span className="truncate">Team</span>}
              <span className="text-center">Terr.</span>
              <span className="text-center truncate">Arm.</span>
              <span className="text-center truncate"><span className="sm:hidden">Res.</span><span className="hidden sm:inline">Reserve</span></span>
              <span className="text-center">Cards</span>
              {showTurnTimer && <span className="text-center truncate"><span className="sm:hidden">Tmr</span><span className="hidden sm:inline">Timer</span></span>}
              <span className="text-center truncate"><span className="sm:hidden">Stat</span><span className="hidden sm:inline">Status</span></span>
            </div>
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
              const statusLabel = isGameOver
                ? isWinner
                  ? "Winner"
                  : player.status
                : isCurrent
                  ? "Turn"
                  : player.status;
              const showResign =
                canResign &&
                !!onResign &&
                player.status === "alive" &&
                !!myPlayerId &&
                player.playerId === myPlayerId;

              return (
                <div
                  key={player.playerId}
                  role="button"
                  tabIndex={0}
                  onClick={() => onTogglePlayerHighlight(player.playerId)}
                  onKeyDown={(event) => handleRowKeyDown(event, player.playerId)}
                  className={`w-full cursor-pointer rounded-lg border bg-background/80 px-2.5 py-1.5 transition hover:border-primary/50 [@media(max-width:420px)]:px-2 [@media(max-width:420px)]:py-1 ${
                    isDefeated ? "opacity-55" : ""
                  } ${isPlayerHighlighted ? "border-primary/70 bg-primary/10" : ""}`}
                >
                  <div
                    className={`grid w-full min-w-0 items-center gap-2 text-sm [@media(max-width:420px)]:gap-1 [@media(max-width:420px)]:text-[0.72rem] ${columnsClass}`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                      <span className={`min-w-0 truncate font-semibold ${isDefeated ? "line-through" : ""}`}>
                        {getPlayerName(player.playerId, playerMap)}
                      </span>
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
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
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
                    </div>
                    {teamModeEnabled && (
                      <div className="min-w-0">
                        {teamId ? (
                          <button
                            type="button"
                            className={`w-full truncate rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition ${
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
                      </div>
                    )}
                    <span className="text-center text-xs tabular-nums">{player.territories}</span>
                    <span className="text-center text-xs tabular-nums">{player.armies}</span>
                    <span className="text-center text-xs tabular-nums">{player.reserveTroops}</span>
                    <span className="text-center text-xs tabular-nums">{player.cards}</span>
                    {showTurnTimer && (
                      <span className="truncate text-center text-xs tabular-nums text-muted-foreground">
                        {isCurrent ? (turnTimerLabel ?? "-") : "-"}
                      </span>
                    )}
                    <span
                      className={`truncate text-center text-xs font-medium capitalize ${
                        isWinner || (!isGameOver && isCurrent) ? "font-semibold text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
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
  teamGameEnabled: boolean;
  teamAvailable: boolean;
  activeTeamName?: string | null;
  canSend: boolean;
  draftText: string;
  editingMessageId: string | null;
  onSetDraftText: (value: string) => void;
  onSelectChannel: (channel: ChatChannel) => void;
  onStartEditMessage: (message: ChatMessage) => void;
  onCancelEditMessage: () => void;
  onDeleteMessage: (messageId: string) => void;
  onSend: () => void;
}

export function GameChatCard({
  messages,
  activeChannel,
  teamGameEnabled,
  teamAvailable,
  activeTeamName,
  canSend,
  draftText,
  editingMessageId,
  onSetDraftText,
  onSelectChannel,
  onStartEditMessage,
  onCancelEditMessage,
  onDeleteMessage,
  onSend,
}: GameChatCardProps) {
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const messagesWithTimestamps = useMemo(() => {
    const currentYear = new Date(now).getFullYear();

    const formatChatTimestamp = (timestamp: number) => {
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return "";

      const diffMs = Math.max(0, now - timestamp);
      const diffMinutes = Math.floor(diffMs / 60000);

      if (diffMinutes < 1) return "just now";
      if (diffMinutes < 60) return `${diffMinutes}m`;

      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours}h`;

      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return "yesterday";
      if (diffDays < 7) return `${diffDays}d`;

      const monthLabel = date.toLocaleString("en-US", { month: "short" });
      const dayLabel = date.getDate();
      if (date.getFullYear() === currentYear) {
        return `${monthLabel} ${dayLabel}`;
      }

      return `${monthLabel} ${dayLabel}, ${date.getFullYear()}`;
    };

    return messages.map((message) => ({
      ...message,
      timestampLabel: formatChatTimestamp(message.createdAt),
    }));
  }, [messages, now]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSend();
  };
  const showChannelPicker = teamGameEnabled;

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [activeChannel, messages.length]);

  return (
    <Card className="glass-panel h-[22rem] gap-2 border-0 py-0 xl:h-[24rem]">
      <CardHeader className="flex flex-row items-center gap-2 pb-1 pt-3">
        <CardTitle className="text-base">Chat</CardTitle>
        {showChannelPicker && (
          <div className="ml-auto flex gap-1.5">
            <Button
              type="button"
              size="xs"
              variant={activeChannel === "global" ? "default" : "outline"}
              onClick={() => onSelectChannel("global")}
            >
              Global
            </Button>
            {teamAvailable && (
              <Button
                type="button"
                size="xs"
                variant={activeChannel === "team" ? "default" : "outline"}
                onClick={() => onSelectChannel("team")}
              >
                {activeTeamName ?? "Team"}
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="flex h-[calc(100%-3.25rem)] flex-col space-y-2 pb-4 pt-0">
        <div
          ref={messagesContainerRef}
          className="game-scrollbar flex-1 overflow-y-auto rounded-md border bg-background/45 p-2 pt-2.5 text-sm"
        >
          <div className="mt-auto space-y-2">
            {messages.length === 0 && <p className="text-muted-foreground">No messages yet.</p>}
            {messagesWithTimestamps.map((message) => {
              const timestampLabel = message.timestampLabel;
              return (
                <div key={message._id} className={`group flex ${message.isMine ? "justify-end" : "justify-start"}`}>
                  <div className={`flex max-w-[85%] flex-col gap-1 ${message.isMine ? "items-end" : "items-start"}`}>
                    <div className="flex flex-wrap items-baseline gap-2 text-xs text-muted-foreground">
                      <span>{message.isMine ? "You" : message.senderDisplayName}</span>
                      {timestampLabel ? <span className="text-[0.7rem] tracking-wide">{timestampLabel}</span> : null}
                      {message.editedAt ? <span className="text-[0.7rem] tracking-wide">edited</span> : null}
                    </div>
                  <div
                    className={`rounded-none px-3 py-2 ${
                      message.isMine
                        ? "bg-primary text-primary-foreground"
                        : "bg-background/80"
                    }`}
                  >
                    <p className="break-words text-sm leading-tight">{message.text}</p>
                  </div>
                  {message.isMine && canSend && (
                    <div className="flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant={editingMessageId === message._id ? "default" : "ghost"}
                        aria-label="Edit message"
                        onClick={() => onStartEditMessage(message)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Delete message"
                        onClick={() => onDeleteMessage(message._id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <form className="flex gap-2" onSubmit={handleSubmit}>
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
            onChange={(event) => onSetDraftText(event.target.value)}
            onKeyDown={handleInputKeyDown}
          />
          {editingMessageId && (
            <Button type="button" size="xs" variant="outline" disabled={!canSend} onClick={onCancelEditMessage}>
              <X className="size-3.5" />
            </Button>
          )}
          <Button
            type="submit"
            size="xs"
            className="inline-flex items-center justify-center"
            disabled={!canSend || !draftText.trim()}
          >
            {editingMessageId ? <Check className="size-3.5" /> : <ArrowUp className="size-3.5" />}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
