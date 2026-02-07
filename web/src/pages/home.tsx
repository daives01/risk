import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { api } from "@backend/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShortcutHint } from "@/components/ui/shortcut-hint";
import { hasModifierKey, isTypingTarget } from "@/lib/keyboard-shortcuts";

type HomeTab = "overview" | "history" | "account";

type MyGame = {
  _id: string;
  name: string;
  status: "lobby" | "active" | "finished";
  myRole: "host" | "player";
};

export default function HomePage() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const games = useQuery(api.games.listMyGames) as MyGame[] | undefined;

  const [tab, setTab] = useState<HomeTab>("overview");
  const [joinCode, setJoinCode] = useState("");
  const [filter, setFilter] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);

  const joinRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const activeGamesSectionRef = useRef<HTMLElement>(null);
  const activeGameButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const filteredGames = useMemo(() => {
    const all = games ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter((game) => game.name.toLowerCase().includes(q) || game.status.includes(q));
  }, [games, filter]);

  const activeGames = useMemo(
    () => (games ?? []).filter((game) => game.status === "active"),
    [games],
  );

  const counts = useMemo(() => {
    const all = games ?? [];
    return {
      total: all.length,
      active: all.filter((game) => game.status === "active").length,
      lobby: all.filter((game) => game.status === "lobby").length,
      finished: all.filter((game) => game.status === "finished").length,
    };
  }, [games]);

  const openGame = useCallback(
    (game: MyGame) => {
      navigate(game.status === "lobby" ? `/g/${game._id}` : `/play/${game._id}`);
    },
    [navigate],
  );

  const focusActiveGames = useCallback(() => {
    setTab("overview");
    requestAnimationFrame(() => {
      const firstButton = activeGameButtonRefs.current[0];
      if (firstButton) {
        firstButton.focus();
        return;
      }
      activeGamesSectionRef.current?.focus();
    });
  }, []);

  const focusJoin = useCallback(() => {
    setTab("overview");
    requestAnimationFrame(() => joinRef.current?.focus());
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        (document.activeElement as HTMLElement | null)?.blur?.();
        return;
      }

      if (!isTypingTarget(event.target)) {
        if (hasModifierKey(event)) return;
        const key = event.key.toLowerCase();

        if (key === "1") setTab("overview");
        if (key === "2") setTab("history");
        if (key === "3") setTab("account");
        if (key === "n") navigate("/games/new");
        if (key === "g") {
          event.preventDefault();
          focusActiveGames();
        }
        if (key === "j") {
          event.preventDefault();
          focusJoin();
        }
        if (key === "/") {
          event.preventDefault();
          setTab("history");
          filterRef.current?.focus();
        }
        if (key === "?") {
          event.preventDefault();
          setShowShortcuts((prev) => !prev);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusActiveGames, focusJoin, navigate]);

  function submitJoinCode(event: React.FormEvent) {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    navigate(`/join/${code}`);
  }

  if (isPending) {
    return <div className="app-shell flex items-center justify-center">Loading...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar-inner">
          <div className="app-brand">RISK CORE</div>
          <div className="app-meta">{session.user.name}</div>
        </div>
      </header>

      <div className="app-layout">
        <aside className="app-sidebar">
          <div className="app-menu">
            <button
              type="button"
              onClick={() => setTab("overview")}
              className={`app-menu-item flex items-center justify-between ${tab === "overview" ? "is-active" : ""}`}
            >
              <span>OVERVIEW</span>
              <ShortcutHint shortcut="1" />
            </button>
            <button
              type="button"
              onClick={() => setTab("history")}
              className={`app-menu-item flex items-center justify-between ${tab === "history" ? "is-active" : ""}`}
            >
              <span>HISTORY</span>
              <ShortcutHint shortcut="2" />
            </button>
            <button
              type="button"
              onClick={() => setTab("account")}
              className={`app-menu-item flex items-center justify-between ${tab === "account" ? "is-active" : ""}`}
            >
              <span>ACCOUNT</span>
              <ShortcutHint shortcut="3" />
            </button>
          </div>
          <div className="app-sidebar-actions">
            <Button className="w-full justify-between" onClick={() => navigate("/games/new")}>
              <span className="inline-flex items-center gap-2">
                <Plus className="size-4" /> NEW GAME
              </span>
              <ShortcutHint shortcut="n" />
            </Button>
            <Button variant="outline" className="w-full" onClick={() => authClient.signOut()}>
              SIGN OUT
            </Button>
          </div>
        </aside>

        <main className="app-main">
          {tab === "overview" && (
            <div className="home-overview-grid">
              <div className="space-y-3">
                <section ref={activeGamesSectionRef} tabIndex={-1} className="app-panel space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="app-label">ACTIVE GAMES</p>
                    <ShortcutHint shortcut="g" />
                  </div>
                  <div className="app-list">
                    {activeGames.length === 0 && <p className="px-3 py-3 text-sm text-slate-400">No active games right now.</p>}
                    {activeGames.map((game, idx) => (
                      <button
                        key={game._id}
                        ref={(element) => {
                          activeGameButtonRefs.current[idx] = element;
                        }}
                        type="button"
                        onClick={() => openGame(game)}
                        className="app-list-row"
                      >
                        <span className="truncate">{game.name}</span>
                        <span className="app-status-pill status-active">active</span>
                        <span className="app-list-meta">open</span>
                      </button>
                    ))}
                  </div>
                </section>

                <form onSubmit={submitJoinCode} className="app-panel space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="app-label">JOIN GAME</p>
                    <ShortcutHint shortcut="j" />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Input
                    ref={joinRef}
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value)}
                    placeholder="JOIN WITH CODE (ABC123)"
                    maxLength={6}
                    className="font-mono uppercase"
                  />
                  <Button type="submit" variant="outline" disabled={!joinCode.trim()}>
                    JOIN
                  </Button>
                  </div>
                </form>
              </div>
              <div className="app-stats-grid">
                <div className="app-stat"><p className="app-label">TOTAL</p><p className="app-value">{counts.total}</p></div>
                <div className="app-stat"><p className="app-label">ACTIVE</p><p className="app-value">{counts.active}</p></div>
                <div className="app-stat"><p className="app-label">LOBBY</p><p className="app-value">{counts.lobby}</p></div>
                <div className="app-stat"><p className="app-label">FINISHED</p><p className="app-value">{counts.finished}</p></div>
              </div>
            </div>
          )}

          {tab === "history" && (
            <div className="space-y-2">
              <Input
                ref={filterRef}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="FILTER ACTIVE + PREVIOUS GAMES"
                className="font-mono"
              />
              <div className="app-list">
                {filteredGames.length === 0 && <p className="px-3 py-4 text-sm text-slate-400">No games found.</p>}
                {filteredGames.map((game) => (
                  <button
                    key={game._id}
                    type="button"
                    onClick={() => openGame(game)}
                    className="app-list-row"
                  >
                    <span className="truncate">{game.name}</span>
                    <span className={`app-status-pill status-${game.status}`}>{game.status}</span>
                    <span className="app-list-meta">{game.myRole}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === "account" && (
            <div className="app-panel space-y-2">
              <p>NAME: {session.user.name}</p>
              <p>EMAIL: {session.user.email}</p>
              <p className="text-slate-400">Admin maps path: <code>/admin/maps</code></p>
              <p className="text-slate-500">Shortcuts: 1/2/3, n, g, j, /, ?, Esc</p>
            </div>
          )}

          {showShortcuts && (
            <div className="app-panel mt-3">
              <p className="mb-1">SHORTCUTS</p>
              <div className="grid grid-cols-2 gap-1 text-slate-400">
                <span>1/2/3 tabs</span><span>n new game</span>
                <span>g focus active games</span><span>j focus join</span>
                <span>/ history search</span><span>↑↓←→ move focus</span>
                <span>Enter open focused</span><span>Esc unfocus</span>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
