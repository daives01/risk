import { ArrowUp, Check, Pencil, Trash2, Users, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  activeHighlight: HighlightFilter;
  onTogglePlayerHighlight: (playerId: string) => void;
  onToggleTeamHighlight: (teamId: string) => void;
  getPlayerColor: (playerId: string, turnOrder: string[]) => string;
  getPlayerName: (enginePlayerId: string, players: PlayerRef[]) => string;
}

export function GamePlayersCard({
  playerStats,
  displayState,
  playerMap,
  teamModeEnabled,
  activeHighlight,
  onTogglePlayerHighlight,
  onToggleTeamHighlight,
  getPlayerColor,
  getPlayerName,
}: PlayersCardProps) {
  const columnsClass = teamModeEnabled
    ? "grid-cols-[minmax(9rem,2fr)_minmax(4.5rem,1fr)_repeat(4,minmax(3.5rem,0.75fr))_minmax(4.5rem,0.9fr)]"
    : "grid-cols-[minmax(9rem,2fr)_repeat(4,minmax(3.5rem,0.75fr))_minmax(4.5rem,0.9fr)]";

  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, playerId: string) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onTogglePlayerHighlight(playerId);
  };

  return (
    <Card className="glass-panel border-0 py-0">
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" />
          Players
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
        <div
          className={`grid items-center gap-2 rounded-md border border-border/70 bg-background/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground ${columnsClass}`}
        >
          <span>Player</span>
          {teamModeEnabled && <span>Team</span>}
          <span className="text-center">Terr.</span>
          <span className="text-center">Armies</span>
          <span className="text-center">Reserve</span>
          <span className="text-center">Cards</span>
          <span className="text-center">Status</span>
        </div>
        {playerStats.map((player) => {
          const isCurrent = player.playerId === displayState.turn.currentPlayerId;
          const isDefeated = player.status === "defeated";
          const teamId = player.teamId;
          const playerHighlightKey = `player:${player.playerId}` as HighlightFilter;
          const teamHighlightKey = teamId ? (`team:${teamId}` as HighlightFilter) : null;
          const isPlayerHighlighted = activeHighlight === playerHighlightKey;
          const isTeamHighlighted = teamHighlightKey ? activeHighlight === teamHighlightKey : false;
          const color = getPlayerColor(player.playerId, displayState.turnOrder);

          return (
            <div
              key={player.playerId}
              role="button"
              tabIndex={0}
              onClick={() => onTogglePlayerHighlight(player.playerId)}
              onKeyDown={(event) => handleRowKeyDown(event, player.playerId)}
              className={`cursor-pointer rounded-lg border px-3 py-2 transition hover:border-primary/50 ${
                isCurrent ? "border-primary/70 bg-primary/10" : "bg-background/80"
              } ${isDefeated ? "opacity-55" : ""} ${isPlayerHighlighted ? "ring-2 ring-primary/80" : ""}`}
            >
              <div className={`grid items-center gap-2 text-sm ${columnsClass}`}>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  <span className={`truncate font-semibold ${isDefeated ? "line-through" : ""}`}>
                    {getPlayerName(player.playerId, playerMap)}
                  </span>
                </div>
                {teamModeEnabled && (
                  <div>
                    {teamId ? (
                      <button
                        type="button"
                        className={`w-full rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition ${
                          isTeamHighlighted
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        }`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleTeamHighlight(teamId);
                        }}
                      >
                        {teamId}
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
                <span className="text-center text-xs font-medium capitalize text-muted-foreground">
                  {isCurrent ? "Turn" : player.status}
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

interface GameEventsCardProps {
  flattenedEvents: Array<{ key: string; text: string }>;
}

export function GameEventsCard({ flattenedEvents }: GameEventsCardProps) {
  return (
    <Card className="glass-panel border-0 py-0">
      <CardHeader className="py-4">
        <CardTitle className="text-base">Recent Events</CardTitle>
      </CardHeader>
      <CardContent className="max-h-64 space-y-2 overflow-y-auto pb-4 text-sm">
        {flattenedEvents.length === 0 && <p className="text-muted-foreground">No actions yet.</p>}
        {flattenedEvents.map((event) => (
          <p key={event.key} className="rounded-md border bg-background/80 px-3 py-2 text-muted-foreground">
            {event.text}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}

interface GameHandCardProps {
  myHand: Array<{ cardId: string; kind: string }>;
  selectedCardIds: Set<string>;
  onToggleCard: (cardId: string) => void;
  onTrade: () => void;
  controlsDisabled: boolean;
  phase: string;
  isMyTurn: boolean;
  phaseLabel: string;
}

export function GameHandCard({
  myHand,
  selectedCardIds,
  onToggleCard,
  onTrade,
  controlsDisabled,
  phase,
  isMyTurn,
  phaseLabel,
}: GameHandCardProps) {
  return (
    <Card className="glass-panel border-0 py-0">
      <CardHeader className="py-4">
        <CardTitle className="text-base">Cards ({myHand.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        <div className="flex flex-wrap gap-2">
          {myHand.map((card) => {
            const selected = selectedCardIds.has(card.cardId);
            return (
              <button
                key={card.cardId}
                type="button"
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  selected
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-background/80 hover:border-primary/50"
                }`}
                onClick={() => onToggleCard(card.cardId)}
              >
                {card.kind}
              </button>
            );
          })}
        </div>
        <Button
          className="w-full"
          disabled={controlsDisabled || phase !== "Reinforcement" || selectedCardIds.size !== 3}
          onClick={onTrade}
        >
          Trade Selected Cards
        </Button>
        {isMyTurn && (
          <div className="px-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {phaseLabel}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface GameChatCardProps {
  messages: ChatMessage[];
  activeChannel: ChatChannel;
  teamGameEnabled: boolean;
  teamAvailable: boolean;
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
  const previousMessageCountRef = useRef(messages.length);

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
    const previousCount = previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;
    if (messages.length <= previousCount) return;

    const newestMessage = messages[messages.length - 1];
    if (!newestMessage?.isMine) return;

    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  return (
    <Card className="glass-panel gap-2 border-0 py-0">
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
                Team
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2 pb-4 pt-0">
        <div
          ref={messagesContainerRef}
          className="max-h-64 space-y-2 overflow-y-auto rounded-md border bg-background/45 p-2 pt-2.5 text-sm"
        >
          {messages.length === 0 && <p className="text-muted-foreground">No messages yet.</p>}
          {messages.map((message) => (
            <div key={message._id} className={`group flex ${message.isMine ? "justify-end" : "justify-start"}`}>
              <div className={`flex max-w-[85%] flex-col gap-1 ${message.isMine ? "items-end" : "items-start"}`}>
                <div className="text-xs text-muted-foreground">
                  {message.isMine ? "You" : message.senderDisplayName}
                  {message.editedAt ? " (edited)" : ""}
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
          ))}
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
