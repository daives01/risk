import { type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShortcutHint } from "@/components/ui/shortcut-hint";
import { PAGE_SIZE } from "../types";
import type { MyGame } from "../types";

type ArchivePanelProps = {
  archiveFilter: string;
  setArchiveFilterAndResetPage: (filter: string) => void;
  archiveGames: MyGame[];
  pagedArchiveGames: MyGame[];
  archivePage: number;
  setArchivePage: (page: number | ((prev: number) => number)) => void;
  archivePageCount: number;
  archiveFilterRef: RefObject<HTMLInputElement | null>;
};

export function ArchivePanel({
  archiveFilter,
  setArchiveFilterAndResetPage,
  archiveGames,
  pagedArchiveGames,
  archivePage,
  setArchivePage,
  archivePageCount,
  archiveFilterRef,
}: ArchivePanelProps) {
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-lg border bg-background/75 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Search Archive</p>
          <ShortcutHint shortcut="/" />
        </div>
        <Input
          ref={archiveFilterRef}
          value={archiveFilter}
          onChange={(event) => setArchiveFilterAndResetPage(event.target.value)}
          placeholder="FILTER FINISHED GAMES"
          className="font-mono"
        />
      </div>

      <section className="space-y-2 rounded-lg border bg-background/75 p-3">
        <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Finished Games</p>
        <div className="overflow-hidden rounded-md border border-border/75 bg-background/70">
          {archiveGames.length === 0 && (
            <div className="space-y-2 px-3 py-3">
              <p className="text-sm text-muted-foreground">No archived games found.</p>
              <p className="text-xs text-muted-foreground">
                Create a game from the Home tab when you are ready.
              </p>
            </div>
          )}
          {pagedArchiveGames.map((game) => (
            <button
              key={game._id}
              type="button"
              onClick={() =>
                navigate(
                  game.status === "lobby" ? `/g/${game._id}` : `/play/${game._id}`,
                )
              }
              className="grid w-full grid-cols-[1fr_auto_auto] gap-2 border-b border-border/60 px-3 py-2 text-left text-sm transition last:border-b-0 hover:bg-primary/10 hover:text-primary focus-visible:bg-primary/10 focus-visible:text-primary focus-visible:outline-none"
            >
              <span className="truncate">{game.name}</span>
              <span className="inline-flex min-w-16 items-center justify-center rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Archive
              </span>
              <span
                className={`inline-flex min-w-12 items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] ${
                  game.result === "won"
                    ? "border-emerald-400/45 bg-emerald-500/10 text-emerald-300"
                    : game.result === "lost"
                      ? "border-red-400/45 bg-red-500/10 text-red-300"
                      : "border-border/70 bg-muted/40 text-muted-foreground"
                }`}
              >
                {game.result ?? "final"}
              </span>
            </button>
          ))}
        </div>
        {archiveGames.length > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              Page {archivePage + 1} of {archivePageCount}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={archivePage === 0}
                onClick={() => setArchivePage((page) => Math.max(0, page - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={archivePage >= archivePageCount - 1}
                onClick={() => setArchivePage((page) => Math.min(archivePageCount - 1, page + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
