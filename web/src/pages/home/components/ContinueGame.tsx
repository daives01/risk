import { Button } from "@/components/ui/button";
import type { MyGame } from "../types";
import { isMyTurn } from "../types";

type ContinueGameProps = {
  continueGame: MyGame | null;
  isGamesLoading: boolean;
  openMyGame: (game: MyGame) => void;
};

export function ContinueGame({ continueGame, isGamesLoading, openMyGame }: ContinueGameProps) {
  return (
    <section
      className={`space-y-3 rounded-lg border p-4 ${
        continueGame ? "border-primary/55 bg-primary/10" : "bg-background/75"
      }`}
    >
      <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Continue</p>
      {isGamesLoading ? (
        <div className="space-y-3 animate-pulse">
          <div className="space-y-2">
            <div className="h-3 w-36 rounded bg-muted/60" />
            <div className="h-6 w-52 rounded bg-muted/60" />
          </div>
          <div className="h-9 w-full rounded bg-muted/60" />
        </div>
      ) : continueGame ? (
        <>
          <div>
            <p className="text-sm text-muted-foreground">Current active game</p>
            <p className="mt-1 text-xl font-semibold">{continueGame.name}</p>
            {isMyTurn(continueGame) && (
              <p className="mt-1 text-sm font-medium text-primary">It&apos;s your turn</p>
            )}
          </div>
          <Button className="w-full" onClick={() => openMyGame(continueGame)}>
            View game
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing in progress</p>
      )}
    </section>
  );
}
