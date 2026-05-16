import { Link, Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabNav } from "@/pages/home/components/TabNav";
import { ArchivePanel } from "@/pages/home/components/ArchivePanel";
import { AccountPanel } from "@/pages/home/components/AccountPanel";
import { HomeTabPanel } from "@/pages/home/components/HomeTabPanel";
import { BottomLinks } from "@/pages/home/components/BottomLinks";
import { useHomePageState } from "@/pages/home/useHomePageState";

export default function HomePage() {
  const {
    isPending,
    isConvexAuthLoading,
    session,
    location,
    isAdmin,
    isGamesLoading,
    tab,
    setTab,
    gamesFilter,
    archiveFilter,
    gamesPage,
    setGamesPage,
    archivePage,
    setArchivePage,
    joinRef,
    archiveFilterRef,
    gamesListSectionRef,
    currentGameButtonRefs,
    sortedGames,
    filteredHomeGames,
    pagedHomeGames,
    homePageCount,
    archiveGames,
    pagedArchiveGames,
    archivePageCount,
    continueGame,
    openMyGame,
    setGamesFilterAndResetPage,
    setArchiveFilterAndResetPage,
    browsePublicLobbies,
  } = useHomePageState();

  if (isPending || (session && isConvexAuthLoading)) {
    return <div className="page-shell flex items-center justify-center">Loading...</div>;
  }

  if (!session) {
    const redirectPath = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirectPath)}`} replace />;
  }

  return (
    <div className="page-shell soft-grid">
      <div className="page-container mx-auto max-w-6xl">
        <Card className="glass-panel border-0 py-0">
          <CardHeader className="space-y-4 py-6">
            <div>
              <CardTitle className="hero-title">
                <Link to="/" className="text-primary transition-colors hover:text-primary/85">
                  Legally Distinct Global Domination
                </Link>
              </CardTitle>
            </div>
            <TabNav tab={tab} setTab={setTab} />
          </CardHeader>

          <CardContent className="space-y-4 pb-6">
            {tab === "home" && (
              <HomeTabPanel
                isGamesLoading={isGamesLoading}
                sortedCount={sortedGames.length}
                filteredHomeGames={filteredHomeGames}
                pagedHomeGames={pagedHomeGames}
                gamesFilter={gamesFilter}
                setGamesFilterAndResetPage={setGamesFilterAndResetPage}
                gamesPage={gamesPage}
                setGamesPage={setGamesPage}
                homePageCount={homePageCount}
                gamesListSectionRef={gamesListSectionRef}
                currentGameButtonRefs={currentGameButtonRefs}
                continueGame={continueGame}
                openMyGame={openMyGame}
                joinRef={joinRef}
                browsePublicLobbies={browsePublicLobbies}
              />
            )}

            {tab === "archive" && (
              <ArchivePanel
                archiveFilter={archiveFilter}
                setArchiveFilterAndResetPage={setArchiveFilterAndResetPage}
                archiveGames={archiveGames}
                pagedArchiveGames={pagedArchiveGames}
                archivePage={archivePage}
                setArchivePage={setArchivePage}
                archivePageCount={archivePageCount}
                archiveFilterRef={archiveFilterRef}
              />
            )}

            {tab === "account" && (
              <AccountPanel session={session} isAdmin={isAdmin} />
            )}
          </CardContent>
        </Card>
      </div>
      <BottomLinks />
    </div>
  );
}
