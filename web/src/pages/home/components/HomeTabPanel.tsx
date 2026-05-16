import { type RefObject } from "react";
import { QuickActions } from "@/pages/home/components/QuickActions";
import { GamesList } from "@/pages/home/components/GamesList";
import { ContinueGame } from "@/pages/home/components/ContinueGame";
import type { MyGame, FilteredGame, GamesFilter } from "../types";

type HomeTabPanelProps = {
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
  continueGame: MyGame | null;
  openMyGame: (game: MyGame) => void;
  joinRef: RefObject<HTMLInputElement | null>;
  browsePublicLobbies: () => void;
};

export function HomeTabPanel({
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
  continueGame,
  openMyGame,
  joinRef,
  browsePublicLobbies,
}: HomeTabPanelProps) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]">
      <div className="order-2 space-y-3 lg:order-1">
        <QuickActions
          joinRef={joinRef}
          browsePublicLobbies={browsePublicLobbies}
        />
        <GamesList
          isGamesLoading={isGamesLoading}
          sortedCount={sortedCount}
          filteredHomeGames={filteredHomeGames}
          pagedHomeGames={pagedHomeGames}
          gamesFilter={gamesFilter}
          setGamesFilterAndResetPage={setGamesFilterAndResetPage}
          gamesPage={gamesPage}
          setGamesPage={setGamesPage}
          homePageCount={homePageCount}
          gamesListSectionRef={gamesListSectionRef}
          currentGameButtonRefs={currentGameButtonRefs}
        />
      </div>
      <div className="order-1 space-y-3 lg:order-2">
        <ContinueGame
          continueGame={continueGame}
          isGamesLoading={isGamesLoading}
          openMyGame={openMyGame}
        />
      </div>
    </div>
  );
}
