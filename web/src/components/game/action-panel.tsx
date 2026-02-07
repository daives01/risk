import { Button } from "@/components/ui/button";
import { NumberStepper } from "@/components/ui/number-stepper";
import { TERRITORY_DISPLAY } from "@/lib/classic-map-layout";
import type { PublicGameState, MyCard } from "@/lib/use-game-controller";
import { cn } from "@/lib/utils";

interface ActionPanelProps {
  state: PublicGameState;
  isMyTurn: boolean;
  phase: string;
  selectedFrom: string | null;
  selectedTo: string | null;
  draftCount: number;
  selectedCardIds: string[];
  myHand: MyCard[] | null;
  submitting: boolean;
  onSetDraftCount: (n: number) => void;
  onSubmitAction: () => void;
  onEndAttack: () => void;
  onEndTurn: () => void;
  onTradeCards: () => void;
  onToggleCard: (cardId: string) => void;
  onResetSelection: () => void;
}

const CARD_KIND_LABELS: Record<string, string> = { A: "Infantry", B: "Cavalry", C: "Artillery", W: "Wild" };

export function ActionPanel({
  state,
  isMyTurn,
  phase,
  selectedFrom,
  selectedTo,
  draftCount,
  selectedCardIds,
  myHand,
  submitting,
  onSetDraftCount,
  onSubmitAction,
  onEndAttack,
  onEndTurn,
  onTradeCards,
  onToggleCard,
  onResetSelection,
}: ActionPanelProps) {
  if (!isMyTurn) {
    return (
      <div className="rounded-lg border bg-card p-3">
        <p className="text-sm text-muted-foreground">Waiting for opponent...</p>
      </div>
    );
  }

  const fromName = selectedFrom ? TERRITORY_DISPLAY[selectedFrom]?.name : null;
  const toName = selectedTo ? TERRITORY_DISPLAY[selectedTo]?.name : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      {phase === "Reinforcement" && (
        <>
          {myHand && myHand.length >= 3 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Trade Cards</p>
              <div className="flex flex-wrap gap-1">
                {myHand.map(card => (
                  <button
                    key={card.cardId}
                    onClick={() => onToggleCard(card.cardId)}
                    className={cn(
                      "rounded border px-2 py-1 text-xs transition-all",
                      selectedCardIds.includes(card.cardId)
                        ? "border-primary bg-primary/10 font-bold"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {CARD_KIND_LABELS[card.kind] ?? card.kind}
                  </button>
                ))}
              </div>
              {selectedCardIds.length === 3 && (
                <Button size="sm" onClick={onTradeCards} disabled={submitting}>
                  Trade Selected
                </Button>
              )}
            </div>
          )}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Place Armies ({state.reinforcements?.remaining ?? 0} left)
            </p>
            {selectedFrom ? (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm">{fromName}</span>
                <NumberStepper
                  value={draftCount}
                  min={1}
                  max={state.reinforcements?.remaining ?? 1}
                  onChange={onSetDraftCount}
                  disabled={submitting}
                  size="sm"
                />
                <Button size="sm" onClick={onSubmitAction} disabled={submitting}>
                  Place
                </Button>
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Click a territory to place armies</p>
            )}
          </div>
        </>
      )}

      {phase === "Attack" && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Attack</p>
          {selectedFrom && !selectedTo && (
            <p className="mt-1 text-sm">From <strong>{fromName}</strong> — select target</p>
          )}
          {selectedFrom && selectedTo && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm">{fromName} → {toName}</span>
              <Button size="sm" onClick={onSubmitAction} disabled={submitting}>
                Attack
              </Button>
              <Button size="sm" variant="ghost" onClick={onResetSelection}>
                Cancel
              </Button>
            </div>
          )}
          {!selectedFrom && (
            <p className="mt-1 text-sm text-muted-foreground">Select a territory with 2+ armies to attack from</p>
          )}
          <Button size="sm" variant="outline" className="mt-2" onClick={onEndAttack} disabled={submitting}>
            End Attack Phase
          </Button>
        </div>
      )}

      {phase === "Occupy" && state.pending && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Occupy Territory</p>
          <p className="mt-1 text-sm">
            Move armies from {TERRITORY_DISPLAY[state.pending.from]?.name} to {TERRITORY_DISPLAY[state.pending.to]?.name}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <NumberStepper
              value={draftCount}
              min={state.pending.minMove}
              max={state.pending.maxMove}
              onChange={onSetDraftCount}
              disabled={submitting}
              size="sm"
            />
            <Button size="sm" onClick={onSubmitAction} disabled={submitting}>
              Move
            </Button>
          </div>
        </div>
      )}

      {phase === "Fortify" && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fortify</p>
          {selectedFrom && !selectedTo && (
            <p className="mt-1 text-sm">From <strong>{fromName}</strong> — select destination</p>
          )}
          {selectedFrom && selectedTo && (
            <div className="mt-2 flex flex-col gap-2">
              <span className="text-sm">{fromName} → {toName}</span>
              <div className="flex items-center gap-2">
                <NumberStepper
                  value={draftCount}
                  min={1}
                  max={(state.territories[selectedFrom]?.armies ?? 2) - 1}
                  onChange={onSetDraftCount}
                  disabled={submitting}
                  size="sm"
                />
                <Button size="sm" onClick={onSubmitAction} disabled={submitting}>
                  Fortify
                </Button>
                <Button size="sm" variant="ghost" onClick={onResetSelection}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {!selectedFrom && (
            <p className="mt-1 text-sm text-muted-foreground">Select a territory to move armies from</p>
          )}
          <Button size="sm" variant="outline" className="mt-2" onClick={onEndTurn} disabled={submitting}>
            End Turn
          </Button>
        </div>
      )}

      {phase === "GameOver" && (
        <div>
          <p className="text-lg font-bold">Game Over</p>
        </div>
      )}
    </div>
  );
}
