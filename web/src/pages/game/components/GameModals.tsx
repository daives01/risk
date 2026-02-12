import { Link } from "react-router-dom";
import type { CardId } from "risk-engine";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface GameModalsProps {
  shortcutsOpen: boolean;
  onToggleShortcuts: () => void;
  onCloseShortcuts: () => void;
  cardsOpen: boolean;
  myHand: Array<{ cardId: string; kind: string }> | null | undefined;
  myCardCount: number;
  selectedCardIds: Set<string>;
  onToggleCard: (cardId: string) => void;
  mustTradeNow: boolean;
  forcedTradeHandSize: number;
  tradeValues: number[];
  tradeValueOverflow: "repeatLast" | "continueByFive";
  tradesCompleted: number;
  onCloseCards: () => void;
  controlsDisabled: boolean;
  phase: string;
  submitting: boolean;
  autoTradeCardIds: string[] | null;
  onTrade: () => void;
  onAutoTrade: (cardIds: CardId[]) => void;
  endgameModal: "won" | "lost" | null;
  onDismissEndgame: () => void;
}

export function GameModals({
  shortcutsOpen,
  onToggleShortcuts,
  onCloseShortcuts,
  cardsOpen,
  myHand,
  myCardCount,
  selectedCardIds,
  onToggleCard,
  mustTradeNow,
  forcedTradeHandSize,
  tradeValues,
  tradeValueOverflow,
  tradesCompleted,
  onCloseCards,
  controlsDisabled,
  phase,
  submitting,
  autoTradeCardIds,
  onTrade,
  onAutoTrade,
  endgameModal,
  onDismissEndgame,
}: GameModalsProps) {
  const tradeIndex = tradesCompleted;
  const tradeValuesLabel =
    tradeValues.length === 0
      ? ""
      : tradeValueOverflow === "continueByFive"
        ? `${tradeValues.join(", ")}, +5`
        : `${tradeValues.join(", ")}, repeat`;
  const nextTradeValue =
    tradeValues.length === 0
      ? 0
      : tradeIndex < tradeValues.length
        ? tradeValues[tradeIndex]!
        : tradeValueOverflow === "continueByFive"
          ? tradeValues[tradeValues.length - 1]! + (tradeIndex - tradeValues.length + 1) * 5
          : tradeValues[tradeValues.length - 1]!;

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={shortcutsOpen ? "default" : "outline"}
                size="icon-sm"
                type="button"
                aria-label="Toggle keyboard shortcuts"
                onClick={onToggleShortcuts}
              >
                ?
              </Button>
            </TooltipTrigger>
            <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {shortcutsOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/65 p-4 backdrop-blur-[1px]">
          <Card className="glass-panel w-full max-w-md border border-border/70 py-0 shadow-xl">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-base font-semibold">Keyboard Shortcuts</p>
                  <p className="text-sm text-muted-foreground">Quick controls for your turn.</p>
                </div>
                <Button size="xs" variant="outline" type="button" onClick={onCloseShortcuts}>
                  Close
                </Button>
              </div>
              <div className="space-y-1.5 text-sm">
                <p><span className="font-semibold">1-9</span>: Set active troop/dice count</p>
                <p><span className="font-semibold">↑/↓</span>: Increase or decrease troop/dice counts</p>
                <p><span className="font-semibold">U</span>: Undo last placement</p>
                <p><span className="font-semibold">C</span>: Open cards</p>
                <p><span className="font-semibold">I</span>: Toggle map info</p>
                <p><span className="font-semibold">?</span>: Toggle this help</p>
                <p><span className="font-semibold">H</span>: Toggle history</p>
                <p><span className="font-semibold">Cmd/Ctrl + Enter</span>: Confirm or end phase</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {cardsOpen && myHand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/65 p-4 backdrop-blur-[1px]">
          <Card className="glass-panel w-full max-w-lg border border-border/70 py-0 shadow-xl">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-base font-semibold">Cards ({myCardCount})</p>
                  <p className="text-sm text-muted-foreground">Select 3 to trade.</p>
                  {mustTradeNow && (
                    <p className="text-xs uppercase tracking-wide text-destructive">
                      Trade required at {forcedTradeHandSize}+ cards
                    </p>
                  )}
                </div>
                <Button size="xs" variant="outline" type="button" onClick={onCloseCards}>
                  Close
                </Button>
              </div>

              <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">Card increment</span>
                  <span className="font-semibold text-foreground">Next trade: {nextTradeValue}</span>
                </div>
                {tradeValuesLabel && (
                  <p className="mt-1 text-[11px] text-muted-foreground">{tradeValuesLabel}</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {myHand.map((card) => {
                  const selected = selectedCardIds.has(card.cardId);
                  return (
                    <button
                      key={card.cardId}
                      type="button"
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${selected
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

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="xs"
                  disabled={controlsDisabled || phase !== "Reinforcement" || selectedCardIds.size !== 3}
                  onClick={onTrade}
                >
                  Trade 3
                </Button>
                {autoTradeCardIds && (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={controlsDisabled || submitting}
                    onClick={() => onAutoTrade(autoTradeCardIds as CardId[])}
                  >
                    Auto Trade
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {endgameModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/70 p-4 backdrop-blur-[2px]">
          <Card className="glass-panel w-full max-w-sm border border-border/70 py-0 shadow-xl">
            <CardContent className="space-y-4 p-5">
              <div className="space-y-1">
                <p className="text-base font-semibold">
                  {endgameModal === "won" ? "You won!" : "You have been eliminated"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {endgameModal === "won" ? "Victory is yours." : "You are out of the match."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {endgameModal === "won" ? (
                  <Button asChild size="sm">
                    <Link to="/">Go Home</Link>
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" type="button" onClick={onDismissEndgame}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
