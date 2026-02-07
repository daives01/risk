import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { api } from "@backend/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShortcutHint } from "@/components/ui/shortcut-hint";

type HomeTab = "overview" | "games" | "account";

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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const joinRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  const filteredGames = useMemo(() => {
    const all = games ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter((game) => game.name.toLowerCase().includes(q) || game.status.includes(q));
  }, [games, filter]);

  const counts = useMemo(() => {
    const all = games ?? [];
    return {
      total: all.length,
      active: all.filter((game) => game.status === "active").length,
      lobby: all.filter((game) => game.status === "lobby").length,
      finished: all.filter((game) => game.status === "finished").length,
    };
  }, [games]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredGames]);

  const openGame = useCallback(
    (game: MyGame) => {
      navigate(game.status === "lobby" ? `/g/${game._id}` : `/play/${game._id}`);
    },
    [navigate],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        (target as HTMLElement | null)?.isContentEditable;

      if (event.key === "Escape") {
        (document.activeElement as HTMLElement | null)?.blur?.();
        return;
      }

      if (!isTyping) {
        const key = event.key.toLowerCase();

        if (key === "1") setTab("overview");
        if (key === "2") setTab("games");
        if (key === "3") setTab("account");
        if (key === "n") navigate("/games/new");
        if (key === "j") {
          event.preventDefault();
          setTab("overview");
          joinRef.current?.focus();
        }
        if (key === "/") {
          event.preventDefault();
          setTab("games");
          filterRef.current?.focus();
        }
        if (key === "?") {
          event.preventDefault();
          setShowShortcuts((prev) => !prev);
        }

        if (tab === "games" && filteredGames.length > 0) {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedIndex((prev) => Math.min(filteredGames.length - 1, prev + 1));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedIndex((prev) => Math.max(0, prev - 1));
          }
          if (event.key === "Home") {
            event.preventDefault();
            setSelectedIndex(0);
          }
          if (event.key === "End") {
            event.preventDefault();
            setSelectedIndex(filteredGames.length - 1);
          }
          if (event.key === "Enter") {
            event.preventDefault();
            openGame(filteredGames[selectedIndex]!);
          }
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredGames, openGame, selectedIndex, tab]);

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
              onClick={() => setTab("games")}
              className={`app-menu-item flex items-center justify-between ${tab === "games" ? "is-active" : ""}`}
            >
              <span>GAMES</span>
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
            <div className="space-y-3">
              <div className="app-stats-grid">
                <div className="app-stat"><p className="app-label">TOTAL</p><p className="app-value">{counts.total}</p></div>
                <div className="app-stat"><p className="app-label">ACTIVE</p><p className="app-value">{counts.active}</p></div>
                <div className="app-stat"><p className="app-label">LOBBY</p><p className="app-value">{counts.lobby}</p></div>
                <div className="app-stat"><p className="app-label">FINISHED</p><p className="app-value">{counts.finished}</p></div>
              </div>
              <form onSubmit={submitJoinCode} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  ref={joinRef}
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value)}
                  placeholder="ABC123"
                  maxLength={6}
                  className="font-mono uppercase"
                />
                <Button type="submit" variant="outline" disabled={!joinCode.trim()}>JOIN</Button>
              </form>
            </div>
          )}

          {tab === "games" && (
            <div className="space-y-2">
              <Input
                ref={filterRef}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="FILTER CURRENT GAMES"
                className="font-mono"
              />
              <div className="app-list">
                {filteredGames.length === 0 && <p className="px-3 py-4 text-sm text-slate-400">No games found.</p>}
                {filteredGames.map((game, idx) => (
                  <button
                    key={game._id}
                    type="button"
                    onClick={() => openGame(game)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`app-list-row ${selectedIndex === idx ? "is-selected" : ""}`}
                  >
                    <span className="truncate">{game.name}</span>
                    <span className="app-list-meta">{game.status}</span>
                    <span className="app-list-meta">{idx + 1}</span>
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
              <p className="text-slate-500">Shortcuts: 1/2/3, n, j, /, ?, Esc, Up/Down, Home/End, Enter</p>
            </div>
          )}

          {showShortcuts && (
            <div className="app-panel mt-3">
              <p className="mb-1">SHORTCUTS</p>
              <div className="grid grid-cols-2 gap-1 text-slate-400">
                <span>1/2/3 tabs</span><span>n new game</span>
                <span>j join code</span><span>/ game search</span>
                <span>↑/↓ select row</span><span>Enter open row</span>
                <span>Home/End jump</span><span>Esc unfocus</span>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
