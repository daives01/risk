import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicState } from "@/lib/game/types";

interface PlayerSummary {
  playerId: string;
  territories: number;
  armies: number;
  cards: number;
  status: string;
}

interface PlayerRef {
  displayName: string;
  enginePlayerId: string | null;
}

interface PlayersCardProps {
  playerStats: PlayerSummary[];
  displayState: PublicState;
  playerMap: PlayerRef[];
  getPlayerColor: (playerId: string, turnOrder: string[]) => string;
  getPlayerName: (enginePlayerId: string, players: PlayerRef[]) => string;
}

export function GamePlayersCard({
  playerStats,
  displayState,
  playerMap,
  getPlayerColor,
  getPlayerName,
}: PlayersCardProps) {
  return (
    <Card className="glass-panel border-0 py-0">
      <CardHeader className="py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" />
          Players
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
        {playerStats.map((player) => {
          const isCurrent = player.playerId === displayState.turn.currentPlayerId;
          const isDefeated = player.status === "defeated";
          const color = getPlayerColor(player.playerId, displayState.turnOrder);

          return (
            <div
              key={player.playerId}
              className={`rounded-lg border px-3 py-2 ${isCurrent ? "border-primary/70 bg-primary/10" : "bg-background/80"} ${
                isDefeated ? "opacity-55" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className={`text-sm font-semibold ${isDefeated ? "line-through" : ""}`}>
                    {getPlayerName(player.playerId, playerMap)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {player.territories}T / {player.armies}A / {player.cards}C
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
