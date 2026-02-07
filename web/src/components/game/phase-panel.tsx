import { PLAYER_COLORS } from "@/lib/classic-map-layout";
import type { PublicGameState } from "@/lib/use-game-controller";

interface PhasePanelProps {
  state: PublicGameState;
  playerNames: Record<string, string>;
}

const PHASE_LABELS: Record<string, string> = {
  Setup: "Setting Up",
  Reinforcement: "Place",
  Attack: "Attack",
  Occupy: "Occupy Territory",
  Fortify: "Fortify",
  GameOver: "Game Over",
};

export function PhasePanel({ state, playerNames }: PhasePanelProps) {
  const { turn, reinforcements, pending } = state;
  const colors = PLAYER_COLORS[turn.currentPlayerId] ?? PLAYER_COLORS.neutral;
  const playerName = playerNames[turn.currentPlayerId] ?? turn.currentPlayerId;

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`h-3 w-3 rounded-full ${colors.bg}`} />
          <span className="text-sm font-medium">{playerName}'s turn</span>
        </div>
        <span className="text-xs text-muted-foreground">Round {turn.round}</span>
      </div>
      <div className="mt-2 text-lg font-bold">{PHASE_LABELS[turn.phase] ?? turn.phase}</div>
      {turn.phase === "Reinforcement" && reinforcements && (
        <p className="mt-1 text-sm text-muted-foreground">
          {reinforcements.remaining} armies to place
        </p>
      )}
      {turn.phase === "Occupy" && pending && (
        <p className="mt-1 text-sm text-muted-foreground">
          Move {pending.minMove}–{pending.maxMove} armies
        </p>
      )}
    </div>
  );
}
