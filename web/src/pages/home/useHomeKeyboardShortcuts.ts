import { useEffect, type RefObject } from "react";
import { type NavigateFunction } from "react-router-dom";
import { hasModifierKey, isTypingTarget } from "@/lib/keyboard-shortcuts";
import type { HomeTab, GamesFilter } from "@/pages/home/types";

type UseHomeKeyboardShortcutsOptions = {
  session: unknown;
  navigate: NavigateFunction;
  setTab: (tab: HomeTab) => void;
  focusCurrentGames: () => void;
  focusJoin: () => void;
  setGamesFilterAndResetPage: (filter: GamesFilter) => void;
  archiveFilterRef: RefObject<HTMLInputElement | null>;
};

export function useHomeKeyboardShortcuts({
  session,
  navigate,
  setTab,
  focusCurrentGames,
  focusJoin,
  setGamesFilterAndResetPage,
  archiveFilterRef,
}: UseHomeKeyboardShortcutsOptions) {
  useEffect(() => {
    if (!session) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        (document.activeElement as HTMLElement | null)?.blur?.();
        return;
      }

      if (!isTypingTarget(event.target)) {
        if (hasModifierKey(event)) return;
        const key = event.key.toLowerCase();

        if (key === "1") setTab("home");
        if (key === "2") setTab("archive");
        if (key === "3") setTab("account");
        if (key === "n") navigate("/games/new");
        if (key === "g") {
          event.preventDefault();
          focusCurrentGames();
        }
        if (key === "j") {
          event.preventDefault();
          focusJoin();
        }
        if (key === "a") {
          event.preventDefault();
          setTab("home");
          setGamesFilterAndResetPage("active");
          focusCurrentGames();
        }
        if (key === "l") {
          event.preventDefault();
          setTab("home");
          setGamesFilterAndResetPage("lobby");
          focusCurrentGames();
        }
        if (key === "p") {
          event.preventDefault();
          setTab("home");
          setGamesFilterAndResetPage("public");
          focusCurrentGames();
        }
        if (key === "/") {
          event.preventDefault();
          setTab("archive");
          archiveFilterRef.current?.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusCurrentGames, focusJoin, navigate, session, setGamesFilterAndResetPage, setTab, archiveFilterRef]);
}
