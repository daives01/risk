import { useCallback, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@backend/_generated/api";
import { authClient } from "@/lib/auth-client";
import { useHomeKeyboardShortcuts } from "@/pages/home/useHomeKeyboardShortcuts";
import type { HomeTab, GamesFilter, MyGame as MyGameType, PublicGame as PublicGameType } from "@/pages/home/types";
import { gameRecency, isMyTurn, PAGE_SIZE } from "@/pages/home/types";

export function useHomePageState() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session, isPending } = authClient.useSession();
  const isAuthenticated = Boolean(session);

  const games = useQuery(api.games.listMyGames, isAuthenticated ? {} : "skip") as MyGameType[] | undefined;
  const publicGames = useQuery(api.games.listPublicGames, isAuthenticated ? { limit: 24 } : "skip") as PublicGameType[] | undefined;
  const isAdmin = useQuery(api.adminMaps.isCurrentUserAdmin, isAuthenticated ? {} : "skip");

  const isGamesLoading = games === undefined;

  const [tab, setTab] = useState<HomeTab>("home");
  const [gamesFilter, setGamesFilter] = useState<GamesFilter>("active");
  const [archiveFilter, setArchiveFilter] = useState("");
  const [gamesPage, setGamesPage] = useState(0);
  const [archivePage, setArchivePage] = useState(0);

  const joinRef = useRef<HTMLInputElement>(null);
  const archiveFilterRef = useRef<HTMLInputElement>(null);
  const gamesListSectionRef = useRef<HTMLElement>(null);
  const currentGameButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const sortedGames = useMemo(() => {
    return [...(games ?? [])].sort((a, b) => gameRecency(b) - gameRecency(a));
  }, [games]);

  const myPublicLobbyGames = useMemo(() => {
    const mine = new Set((games ?? []).map((game) => game._id));
    return (publicGames ?? []).filter((game) => game.status === "lobby" && !mine.has(game._id));
  }, [games, publicGames]);

  const prioritizedActiveGames = useMemo(() => {
    return sortedGames
      .filter((game) => game.status === "active")
      .sort((a, b) => Number(isMyTurn(b)) - Number(isMyTurn(a)));
  }, [sortedGames]);

  const continueGame = useMemo(() => {
    return prioritizedActiveGames[0] ?? null;
  }, [prioritizedActiveGames]);

  const filteredHomeGames = useMemo(() => {
    if (gamesFilter === "public") {
      return myPublicLobbyGames.map((game) => ({
        _id: game._id,
        name: game.name,
        status: "public" as const,
        isMyTurn: false,
      }));
    }

    if (gamesFilter === "active") {
      return prioritizedActiveGames.map((game) => ({
        _id: game._id,
        name: game.name,
        status: "active" as const,
        isMyTurn: isMyTurn(game),
      }));
    }

    return sortedGames
      .filter((game) => game.status === "lobby")
      .map((game) => ({
        _id: game._id,
        name: game.name,
        status: "lobby" as const,
        isMyTurn: false,
      }));
  }, [gamesFilter, myPublicLobbyGames, prioritizedActiveGames, sortedGames]);

  const archiveGames = useMemo(() => {
    const q = archiveFilter.trim().toLowerCase();
    const finished = sortedGames.filter((game) => game.status === "finished");
    if (!q) return finished;
    return finished.filter((game) => game.name.toLowerCase().includes(q));
  }, [archiveFilter, sortedGames]);

  const homePageCount = Math.max(1, Math.ceil(filteredHomeGames.length / PAGE_SIZE));
  const archivePageCount = Math.max(1, Math.ceil(archiveGames.length / PAGE_SIZE));

  const displayGamesPage = Math.min(gamesPage, Math.max(0, homePageCount - 1));
  const displayArchivePage = Math.min(archivePage, Math.max(0, archivePageCount - 1));

  const pagedHomeGames = useMemo(() => {
    const start = displayGamesPage * PAGE_SIZE;
    return filteredHomeGames.slice(start, start + PAGE_SIZE);
  }, [filteredHomeGames, displayGamesPage]);

  const pagedArchiveGames = useMemo(() => {
    const start = displayArchivePage * PAGE_SIZE;
    return archiveGames.slice(start, start + PAGE_SIZE);
  }, [archiveGames, displayArchivePage]);

  const openMyGame = useCallback(
    (game: MyGameType) => {
      navigate(game.status === "lobby" ? `/g/${game._id}` : `/play/${game._id}`);
    },
    [navigate],
  );

  const focusCurrentGames = useCallback(() => {
    setTab("home");
    requestAnimationFrame(() => {
      const firstButton = currentGameButtonRefs.current[0];
      if (firstButton) {
        firstButton.focus();
        return;
      }
      gamesListSectionRef.current?.focus();
    });
  }, []);

  const focusJoin = useCallback(() => {
    setTab("home");
    requestAnimationFrame(() => joinRef.current?.focus());
  }, []);

  const setGamesFilterAndResetPage = useCallback((nextFilter: GamesFilter) => {
    setGamesFilter(nextFilter);
    setGamesPage(0);
  }, []);

  const setArchiveFilterAndResetPage = useCallback((nextFilter: string) => {
    setArchiveFilter(nextFilter);
    setArchivePage(0);
  }, []);

  const browsePublicLobbies = useCallback(() => {
    setTab("home");
    setGamesFilterAndResetPage("public");
    requestAnimationFrame(() => {
      gamesListSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [setGamesFilterAndResetPage]);

  useHomeKeyboardShortcuts({
    session,
    navigate,
    setTab,
    focusCurrentGames,
    focusJoin,
    setGamesFilterAndResetPage,
    archiveFilterRef,
  });

  return {
    isPending,
    session,
    location,
    isAdmin,
    isGamesLoading,
    tab,
    setTab,
    gamesFilter,
    archiveFilter,
    gamesPage: displayGamesPage,
    setGamesPage,
    archivePage: displayArchivePage,
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
  };
}
