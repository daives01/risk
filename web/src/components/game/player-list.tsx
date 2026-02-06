import { PLAYER_COLORS } from "@/lib/classic-map-layout";
import { cn } from "@/lib/utils";

interface PlayerInfo {
  enginePlayerId: string | null;
  displayName: string;
  userId: string;
}

interface PlayerListProps {
  players: PlayerInfo[];
  state: {
    players: Record<string, { status: string }>;
    turnOrder: string[];
    territories: Record<string, { ownerId: string; armies: number }>;
    turn: { currentPlayerId: string };
    handSizes: Record<string, number>;
  };
  myEnginePlayerId: string | null;
}

export function PlayerList({ players, state, myEnginePlayerId }: PlayerListProps) {
  const territoryCounts: Record<string, number> = {};
  const armyCounts: Record<string, number> = {};
  for (const [, t] of Object.entries(state.territories)) {
    territoryCounts[t.ownerId] = (territoryCounts[t.ownerId] ?? 0) + 1;
    armyCounts[t.ownerId] = (armyCounts[t.ownerId] ?? 0) + t.armies;
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Players</h3>
      </div>
      <div className="divide-y">
        {state.turnOrder.map(eid => {
          const player = players.find(p => p.enginePlayerId === eid);
          if (!player) return null;

          const pState = state.players[eid];
          const colors = PLAYER_COLORS[eid] ?? PLAYER_COLORS.neutral;
          const isCurrent = state.turn.currentPlayerId === eid;
          const isMe = eid === myEnginePlayerId;
          const isDefeated = pState?.status === "defeated";

          return (
            <div
              key={eid}
              className={cn(
                "flex items-center justify-between px-3 py-2",
                isCurrent && "bg-accent/50",
                isDefeated && "opacity-50",
              )}
            >
              <div className="flex items-center gap-2">
                <div className={cn("h-2.5 w-2.5 rounded-full", colors.bg)} />
                <span className={cn("text-sm font-medium", isDefeated && "line-through")}>
                  {player.displayName}
                </span>
                {isMe && <span className="text-xs text-muted-foreground">(you)</span>}
                {isCurrent && <span className="text-xs text-primary">●</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span title="Territories">{territoryCounts[eid] ?? 0}T</span>
                <span title="Armies">{armyCounts[eid] ?? 0}A</span>
                <span title="Cards">{state.handSizes[eid] ?? 0}C</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
