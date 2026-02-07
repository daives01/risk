import { Users } from "lucide-react";
import type { FormEvent } from "react";
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
  onClearHighlight: () => void;
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
  onClearHighlight,
  getPlayerColor,
  getPlayerName,
}: PlayersCardProps) {
  const highlightActive = activeHighlight !== "none";

  return (
    <Card className="glass-panel border-0 py-0">
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" />
          Players
        </CardTitle>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={!highlightActive}
          onClick={onClearHighlight}
        >
          Clear (X)
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
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
              className={`rounded-lg border px-3 py-2 ${isCurrent ? "border-primary/70 bg-primary/10" : "bg-background/80"} ${
                isDefeated ? "opacity-55" : ""
              } ${isPlayerHighlighted ? "ring-2 ring-primary/80" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <button
                    type="button"
                    className={`text-sm font-semibold hover:text-primary ${isDefeated ? "line-through" : ""}`}
                    onClick={() => onTogglePlayerHighlight(player.playerId)}
                  >
                    {getPlayerName(player.playerId, playerMap)}
                  </button>
                  {teamModeEnabled && teamId && (
                    <button
                      type="button"
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        isTeamHighlighted
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                      onClick={() => onToggleTeamHighlight(teamId)}
                    >
                      {teamId}
                    </button>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground">Click name/team</span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px]">
                <span className="rounded border bg-background/70 px-1 py-0.5">T {player.territories}</span>
                <span className="rounded border bg-background/70 px-1 py-0.5">A {player.armies}</span>
                <span className="rounded border bg-background/70 px-1 py-0.5">R {player.reserveTroops}</span>
                <span className="rounded border bg-background/70 px-1 py-0.5">C {player.cards}</span>
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
  teamAvailable: boolean;
  canSend: boolean;
  draftText: string;
  onSetDraftText: (value: string) => void;
  onSelectChannel: (channel: ChatChannel) => void;
  onSend: () => void;
}

export function GameChatCard({
  messages,
  activeChannel,
  teamAvailable,
  canSend,
  draftText,
  onSetDraftText,
  onSelectChannel,
  onSend,
}: GameChatCardProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSend();
  };

  return (
    <Card className="glass-panel border-0 py-0">
      <CardHeader className="py-4">
        <CardTitle className="text-base">Chat</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        <div className="flex gap-2">
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

        <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border bg-background/60 p-2 text-sm">
          {messages.length === 0 && <p className="text-muted-foreground">No messages yet.</p>}
          {messages.map((message) => (
            <div key={message._id} className="rounded border bg-background/80 px-2 py-1.5">
              <div className="mb-1 text-xs text-muted-foreground">
                {message.senderDisplayName}
              </div>
              <p className="break-words text-sm leading-tight">{message.text}</p>
            </div>
          ))}
        </div>

        <form className="flex gap-2" onSubmit={handleSubmit}>
          <Input
            value={draftText}
            maxLength={300}
            disabled={!canSend}
            placeholder={canSend ? "Type a message..." : "Chat is read-only"}
            onChange={(event) => onSetDraftText(event.target.value)}
          />
          <Button type="submit" size="xs" disabled={!canSend || !draftText.trim()}>
            Send
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
