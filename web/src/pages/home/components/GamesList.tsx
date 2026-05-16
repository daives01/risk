import { type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShortcutHint } from "@/components/ui/shortcut-hint";
import { PAGE_SIZE, gameStatusLabel } from "../types";
import type { GamesFilter, FilteredGame } from "../types";

type GamesListProps = {
  isGamesLoading: boolean;
  sortedCount: number;
  filteredHomeGames: FilteredGame[];
  pagedHomeGames: FilteredGame[];
  gamesFilter: GamesFilter;
  setGamesFilterAndResetPage: (filter: GamesFilter) => void;
  gamesPage: number;
  setGamesPage: (page: number | ((prev: number) => number)) => void;
  homePageCount: number;
  gamesListSectionRef: RefObject<HTMLElement | null>;
  currentGameButtonRefs: React.MutableRefObject<Array<HTMLButtonElement | null>>;
};

const FILTERS: { key: GamesFilter; shortcut: string }[] = [
  { key: "active", shortcut: "a" },
  { key: "lobby", shortcut: "l" },
  { key: "public", shortcut: "p" },
];

export function GamesList({
  isGamesLoading,
  sortedCount,
  filteredHomeGames,
  pagedHomeGames,
  gamesFilter,
  setGamesFilterAndResetPage,
  gamesPage,
  setGamesPage,
  homePageCount,
  gamesListSectionRef,
  currentGameButtonRefs,
}: GamesListProps) {
  const navigate = useNavigate();

  return (
    <section
      ref={gamesListSectionRef}
      tabIndex={-1}
      className="space-y-2 rounded-lg border bg-background/75 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Games</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {FILTERS.map(({ key, shortcut }) => (
          <button
            key={key}
            type="button"
            onClick={() => setGamesFilterAndResetPage(key)}
            className={`flex items-center justify-between rounded-md border px-2 py-1 text-xs uppercase tracking-[0.08em] transition ${
              gamesFilter === key
                ? "border-primary bg-primary/12 text-primary"
                : "border-border/70 bg-background/60 text-muted-foreground hover:border-primary/45"
            }`}
          >
            <span>{gameStatusLabel(key)}</span>
            <ShortcutHint shortcut={shortcut} />
          </button>
        ))}
      </div>

      <div className="min-h-72 overflow-hidden rounded-md border border-border/75 bg-background/70">
        {isGamesLoading && (
          <div className="space-y-2 px-3 py-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`game-skeleton-${index}`}
                className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-md border border-transparent bg-muted/20 px-2 py-2 animate-pulse"
              >
                <div className="h-3 w-2/3 rounded bg-muted/60" />
                <div className="h-3 w-14 rounded bg-muted/60" />
              </div>
            ))}
          </div>
        )}

        {!isGamesLoading && sortedCount === 0 && (
          <div className="px-3 py-3">
            <p className="text-sm text-muted-foreground">No games yet. Use Create game above to start one.</p>
          </div>
        )}

        {!isGamesLoading && sortedCount > 0 && filteredHomeGames.length === 0 && (
          <div className="px-3 py-3">
            <p className="text-sm text-muted-foreground">
              {gamesFilter === "active"
                ? "Nothing in progress. Create a game to get one going."
                : gamesFilter === "lobby"
                  ? "No lobby games to rejoin yet."
                  : "No public lobbies available right now."}
            </p>
          </div>
        )}

        {!isGamesLoading &&
          pagedHomeGames.map((game, idx) => (
            <button
              key={game._id}
              ref={(element) => {
                currentGameButtonRefs.current[idx] = element;
              }}
              type="button"
              onClick={() => {
                if (game.status === "public") {
                  navigate(`/g/${game._id}`);
                  return;
                }
                navigate(
                  game.status === "lobby" ? `/g/${game._id}` : `/play/${game._id}`,
                );
              }}
              className="grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-2 border-b border-border/60 px-3 py-2 text-left text-sm transition last:border-b-0 hover:bg-primary/10 hover:text-primary focus-visible:bg-primary/10 focus-visible:text-primary focus-visible:outline-none"
            >
              <span className="truncate">{game.name}</span>
              {game.status !== "public" && game.isMyTurn ? (
                <span className="inline-flex min-w-20 items-center justify-center rounded-md border border-primary/50 bg-primary/15 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-primary">
                  Your turn
                </span>
              ) : (
                <span />
              )}
              <span
                className={`inline-flex min-w-16 items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] ${
                  game.status === "active"
                    ? "border-emerald-400/45 bg-emerald-500/10 text-emerald-300"
                    : game.status === "lobby"
                      ? "border-blue-400/45 bg-blue-500/10 text-blue-300"
                      : "border-amber-400/45 bg-amber-500/10 text-amber-300"
                }`}
              >
                {gameStatusLabel(game.status)}
              </span>
              <span className="text-xs text-muted-foreground">View</span>
            </button>
          ))}
      </div>

      {!isGamesLoading && filteredHomeGames.length > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Page {gamesPage + 1} of {homePageCount}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={gamesPage === 0}
              onClick={() => setGamesPage((page) => Math.max(0, page - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={gamesPage >= homePageCount - 1}
              onClick={() => setGamesPage((page) => Math.min(homePageCount - 1, page + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
