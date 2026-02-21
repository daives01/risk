import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { api } from "@backend/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ShortcutHint } from "@/components/ui/shortcut-hint";
import { Switch } from "@/components/ui/switch";
import { isValidInviteCode, normalizeInviteCode } from "@/lib/invite-codes";
import { hasModifierKey, isTypingTarget } from "@/lib/keyboard-shortcuts";

type HomeTab = "home" | "archive" | "account";
type GamesFilter = "active" | "lobby" | "public";

type MyGame = {
  _id: string;
  name: string;
  status: "lobby" | "active" | "finished";
  result: "won" | "lost" | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};

type PublicGame = {
  _id: string;
  name: string;
  status: "lobby" | "active" | "finished";
  createdAt: number;
};

const PAGE_SIZE = 5;

function gameRecency(game: MyGame): number {
  return game.startedAt ?? game.finishedAt ?? game.createdAt;
}

function gameStatusLabel(status: "active" | "lobby" | "public"): string {
  if (status === "active") return "Active";
  if (status === "lobby") return "Lobby";
  return "Public";
}

export default function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session, isPending } = authClient.useSession();
  const isAuthenticated = Boolean(session);

  const games = useQuery(api.games.listMyGames, isAuthenticated ? {} : "skip") as MyGame[] | undefined;
  const publicGames = useQuery(api.games.listPublicGames, isAuthenticated ? { limit: 24 } : "skip") as PublicGame[] | undefined;
  const isAdmin = useQuery(api.adminMaps.isCurrentUserAdmin, isAuthenticated ? {} : "skip");
  const settings = useQuery(api.userSettings.getMySettings, isAuthenticated ? {} : "skip");
  const setTurnEmailSetting = useMutation(api.userSettings.setEmailTurnNotificationsEnabled);

  const isGamesLoading = games === undefined;

  const [tab, setTab] = useState<HomeTab>("home");
  const [gamesFilter, setGamesFilter] = useState<GamesFilter>("active");
  const [joinCode, setJoinCode] = useState("");
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null);
  const [archiveFilter, setArchiveFilter] = useState("");
  const [gamesPage, setGamesPage] = useState(0);
  const [archivePage, setArchivePage] = useState(0);

  const [profileUsername, setProfileUsername] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [emailSettingSaving, setEmailSettingSaving] = useState(false);
  const [emailSettingError, setEmailSettingError] = useState<string | null>(null);

  const joinRef = useRef<HTMLInputElement>(null);
  const archiveFilterRef = useRef<HTMLInputElement>(null);
  const gamesListSectionRef = useRef<HTMLElement>(null);
  const currentGameButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const sessionUsername = (session?.user as { username?: string | null } | undefined)?.username ?? "";

  useEffect(() => {
    if (!session) return;
    setProfileUsername(sessionUsername || session.user.name || "");
  }, [session, sessionUsername]);

  const sortedGames = useMemo(() => {
    return [...(games ?? [])].sort((a, b) => gameRecency(b) - gameRecency(a));
  }, [games]);

  const myPublicLobbyGames = useMemo(() => {
    const mine = new Set((games ?? []).map((game) => game._id));
    return (publicGames ?? []).filter((game) => game.status === "lobby" && !mine.has(game._id));
  }, [games, publicGames]);

  const continueGame = useMemo(() => {
    return sortedGames.find((game) => game.status === "active") ?? null;
  }, [sortedGames]);

  const filteredHomeGames = useMemo(() => {
    if (gamesFilter === "public") {
      return myPublicLobbyGames.map((game) => ({
        _id: game._id,
        name: game.name,
        status: "public" as const,
      }));
    }

    return sortedGames
      .filter((game) => game.status === gamesFilter)
      .map((game) => ({
        _id: game._id,
        name: game.name,
        status: game.status as "active" | "lobby",
      }));
  }, [gamesFilter, myPublicLobbyGames, sortedGames]);

  const archiveGames = useMemo(() => {
    const q = archiveFilter.trim().toLowerCase();
    const finished = sortedGames.filter((game) => game.status === "finished");
    if (!q) return finished;
    return finished.filter((game) => game.name.toLowerCase().includes(q));
  }, [archiveFilter, sortedGames]);

  const pagedHomeGames = useMemo(() => {
    const start = gamesPage * PAGE_SIZE;
    return filteredHomeGames.slice(start, start + PAGE_SIZE);
  }, [filteredHomeGames, gamesPage]);

  const homePageCount = Math.max(1, Math.ceil(filteredHomeGames.length / PAGE_SIZE));

  const pagedArchiveGames = useMemo(() => {
    const start = archivePage * PAGE_SIZE;
    return archiveGames.slice(start, start + PAGE_SIZE);
  }, [archiveGames, archivePage]);

  const archivePageCount = Math.max(1, Math.ceil(archiveGames.length / PAGE_SIZE));

  const openMyGame = useCallback(
    (game: MyGame) => {
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

  useEffect(() => {
    if (gamesPage >= homePageCount) setGamesPage(Math.max(0, homePageCount - 1));
  }, [gamesPage, homePageCount]);

  useEffect(() => {
    if (archivePage >= archivePageCount) setArchivePage(Math.max(0, archivePageCount - 1));
  }, [archivePage, archivePageCount]);

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
  }, [focusCurrentGames, focusJoin, navigate, session, setGamesFilterAndResetPage]);

  function submitJoinCode(event: React.FormEvent) {
    event.preventDefault();
    const code = normalizeInviteCode(joinCode);
    if (!code) return;
    if (!isValidInviteCode(code)) {
      setJoinCodeError("Enter a valid 6-character invite code.");
      return;
    }
    setJoinCodeError(null);
    navigate(`/join/${code}`);
  }

  async function submitProfile(event: React.FormEvent) {
    event.preventDefault();
    const nextUsername = profileUsername.trim();

    if (nextUsername.length < 3) {
      setProfileError("Username must be at least 3 characters.");
      setProfileSuccess(null);
      return;
    }

    setProfileSaving(true);
    setProfileError(null);
    setProfileSuccess(null);
    try {
      const result = await authClient.updateUser({
        username: nextUsername,
        displayUsername: nextUsername,
        name: nextUsername,
      });
      if (result.error) {
        setProfileError(result.error.message ?? "Unable to update account details.");
        return;
      }
      setProfileSuccess("Account details updated.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();

    if (!currentPassword || !newPassword) {
      setPasswordError("Current and new password are required.");
      setPasswordSuccess(null);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation must match.");
      setPasswordSuccess(null);
      return;
    }

    setPasswordSaving(true);
    setPasswordError(null);
    setPasswordSuccess(null);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
      });
      if (result.error) {
        setPasswordError(result.error.message ?? "Unable to change password.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Password updated.");
    } finally {
      setPasswordSaving(false);
    }
  }

  async function toggleTurnEmails(enabled: boolean) {
    setEmailSettingError(null);
    setEmailSettingSaving(true);
    try {
      await setTurnEmailSetting({ enabled });
    } catch (error) {
      setEmailSettingError(error instanceof Error ? error.message : "Unable to update notifications.");
    } finally {
      setEmailSettingSaving(false);
    }
  }

  if (isPending) {
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
                <span className="text-primary">Legally Distinct Global Domination</span>
              </CardTitle>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setTab("home")}
                className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${tab === "home"
                  ? "border-primary bg-primary/12 text-primary"
                  : "border-border/75 bg-background/70 hover:border-primary/45"
                  }`}
              >
                <span>Home</span>
                <ShortcutHint shortcut="1" />
              </button>
              <button
                type="button"
                onClick={() => setTab("archive")}
                className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${tab === "archive"
                  ? "border-primary bg-primary/12 text-primary"
                  : "border-border/75 bg-background/70 hover:border-primary/45"
                  }`}
              >
                <span>Archive</span>
                <ShortcutHint shortcut="2" />
              </button>
              <button
                type="button"
                onClick={() => setTab("account")}
                className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${tab === "account"
                  ? "border-primary bg-primary/12 text-primary"
                  : "border-border/75 bg-background/70 hover:border-primary/45"
                  }`}
              >
                <span>Account</span>
                <ShortcutHint shortcut="3" />
              </button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 pb-6">
            {tab === "home" && (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]">
                <div className="order-2 space-y-3 lg:order-1">
                  <section className="space-y-3 rounded-lg border bg-background/75 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Quick Actions</p>
                    </div>

                    <Button className="w-full justify-between" onClick={() => navigate("/games/new")}>
                      <span className="inline-flex items-center gap-2">
                        <Plus className="size-4" /> Create game
                      </span>
                      <ShortcutHint shortcut="n" />
                    </Button>

                    <form onSubmit={submitJoinCode} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                      <Input
                        ref={joinRef}
                        value={joinCode}
                        onChange={(event) => {
                          setJoinCode(normalizeInviteCode(event.target.value));
                          if (joinCodeError) setJoinCodeError(null);
                        }}
                        placeholder="Join code"
                        maxLength={6}
                        className="font-mono uppercase"
                      />
                      <Button type="submit" variant="outline" disabled={!isValidInviteCode(joinCode)}>
                        Join code
                      </Button>
                      <Button type="button" variant="ghost" onClick={browsePublicLobbies}>
                        Browse lobbies
                      </Button>
                    </form>
                    {joinCodeError && (
                      <p className="text-sm text-destructive">{joinCodeError}</p>
                    )}
                  </section>

                  <section ref={gamesListSectionRef} tabIndex={-1} className="space-y-2 rounded-lg border bg-background/75 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Games</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setGamesFilterAndResetPage("active")}
                        className={`flex items-center justify-between rounded-md border px-2 py-1 text-xs uppercase tracking-[0.08em] transition ${gamesFilter === "active"
                          ? "border-primary bg-primary/12 text-primary"
                          : "border-border/70 bg-background/60 text-muted-foreground hover:border-primary/45"
                          }`}
                      >
                        <span>Active</span>
                        <ShortcutHint shortcut="a" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setGamesFilterAndResetPage("lobby")}
                        className={`flex items-center justify-between rounded-md border px-2 py-1 text-xs uppercase tracking-[0.08em] transition ${gamesFilter === "lobby"
                          ? "border-primary bg-primary/12 text-primary"
                          : "border-border/70 bg-background/60 text-muted-foreground hover:border-primary/45"
                          }`}
                      >
                        <span>Lobby</span>
                        <ShortcutHint shortcut="l" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setGamesFilterAndResetPage("public")}
                        className={`flex items-center justify-between rounded-md border px-2 py-1 text-xs uppercase tracking-[0.08em] transition ${gamesFilter === "public"
                          ? "border-primary bg-primary/12 text-primary"
                          : "border-border/70 bg-background/60 text-muted-foreground hover:border-primary/45"
                          }`}
                      >
                        <span>Public</span>
                        <ShortcutHint shortcut="p" />
                      </button>
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

                      {!isGamesLoading && sortedGames.length === 0 && (
                        <div className="px-3 py-3">
                          <p className="text-sm text-muted-foreground">No games yet. Use Create game above to start one.</p>
                        </div>
                      )}

                      {!isGamesLoading && sortedGames.length > 0 && filteredHomeGames.length === 0 && (
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

                      {!isGamesLoading && pagedHomeGames.map((game, idx) => (
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
                            navigate(game.status === "lobby" ? `/g/${game._id}` : `/play/${game._id}`);
                          }}
                          className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-border/60 px-3 py-2 text-left text-sm transition last:border-b-0 hover:bg-primary/10 hover:text-primary focus-visible:bg-primary/10 focus-visible:text-primary focus-visible:outline-none"
                        >
                          <span className="truncate">{game.name}</span>
                          <span
                            className={`inline-flex min-w-16 items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] ${game.status === "active"
                              ? "border-emerald-400/45 bg-emerald-500/10 text-emerald-300"
                              : game.status === "lobby"
                                ? "border-blue-400/45 bg-blue-500/10 text-blue-300"
                                : "border-amber-400/45 bg-amber-500/10 text-amber-300"
                              }`}
                          >
                            {gameStatusLabel(game.status)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            View
                          </span>
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
                </div>

                <div className="order-1 space-y-3 lg:order-2">
                  <section className={`space-y-3 rounded-lg border p-4 ${continueGame ? "border-primary/55 bg-primary/10" : "bg-background/75"}`}>
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
                        </div>
                        <Button className="w-full" onClick={() => openMyGame(continueGame)}>
                          View game
                        </Button>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nothing in progress</p>
                    )}
                  </section>
                </div>
              </div>
            )}

            {tab === "archive" && (
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
                        <p className="text-xs text-muted-foreground">Create a game from the Home tab when you are ready.</p>
                      </div>
                    )}
                    {pagedArchiveGames.map((game) => (
                      <button
                        key={game._id}
                        type="button"
                        onClick={() => openMyGame(game)}
                        className="grid w-full grid-cols-[1fr_auto_auto] gap-2 border-b border-border/60 px-3 py-2 text-left text-sm transition last:border-b-0 hover:bg-primary/10 hover:text-primary focus-visible:bg-primary/10 focus-visible:text-primary focus-visible:outline-none"
                      >
                        <span className="truncate">{game.name}</span>
                        <span className="inline-flex min-w-16 items-center justify-center rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                          Archive
                        </span>
                        <span
                          className={`inline-flex min-w-12 items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] ${game.result === "won"
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
            )}

            {tab === "account" && (
              <div className="grid gap-3 lg:grid-cols-2">
                <form onSubmit={submitProfile} className="space-y-3 rounded-lg border bg-background/75 p-3">
                  <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Profile</p>
                  <div className="space-y-2">
                    <label htmlFor="account-username" className="text-xs text-muted-foreground">Username</label>
                    <Input
                      id="account-username"
                      value={profileUsername}
                      onChange={(event) => setProfileUsername(event.target.value)}
                      minLength={3}
                      maxLength={30}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="account-email" className="text-xs text-muted-foreground">Email</label>
                    <Input id="account-email" value={session.user.email} disabled />
                  </div>
                  {profileError && <p className="text-sm text-red-400">{profileError}</p>}
                  {profileSuccess && <p className="text-sm text-emerald-400">{profileSuccess}</p>}
                  <Button type="submit" variant="outline" disabled={profileSaving}>
                    {profileSaving ? "Saving..." : "Save profile"}
                  </Button>
                </form>

                <div className="space-y-3">
                  <form onSubmit={submitPassword} className="space-y-3 rounded-lg border bg-background/75 p-3">
                    <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Password</p>
                    <div className="space-y-2">
                      <label htmlFor="current-password" className="text-xs text-muted-foreground">Current Password</label>
                      <Input
                        id="current-password"
                        type="password"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="new-password" className="text-xs text-muted-foreground">New Password</label>
                      <Input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        minLength={8}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="confirm-password" className="text-xs text-muted-foreground">Confirm New Password</label>
                      <Input
                        id="confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        minLength={8}
                        required
                      />
                    </div>
                    {passwordError && <p className="text-sm text-red-400">{passwordError}</p>}
                    {passwordSuccess && <p className="text-sm text-emerald-400">{passwordSuccess}</p>}
                    <Button type="submit" variant="outline" disabled={passwordSaving}>
                      {passwordSaving ? "Updating..." : "Change password"}
                    </Button>
                  </form>

                  <div className="space-y-3 rounded-lg border bg-background/75 p-3">
                    <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Notifications</p>
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">Email me when it's my turn</span>
                      <Switch
                        checked={settings?.emailTurnNotificationsEnabled ?? false}
                        onCheckedChange={(checked) => {
                          void toggleTurnEmails(checked);
                        }}
                        disabled={emailSettingSaving || settings === undefined}
                      />
                    </label>
                    {emailSettingError && <p className="text-sm text-red-400">{emailSettingError}</p>}
                  </div>

                  <div className="space-y-3 rounded-lg border bg-background/75 p-3">
                    <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Session</p>
                    <Button variant="outline" onClick={() => authClient.signOut()}>
                      Sign out
                    </Button>
                  </div>

                  {isAdmin && (
                    <div className="space-y-3 rounded-lg border bg-background/75 p-3">
                      <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Admin</p>
                      <p className="text-sm text-muted-foreground">Manage map drafts and publishing tools.</p>
                      <Button onClick={() => navigate("/admin/maps")}>Open map editor</Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <a
        href="https://buymeacoffee.com/danielives"
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-4 left-4 text-xs font-medium text-muted-foreground/60 transition hover:text-muted-foreground"
      >
        Support the dev
      </a>
    </div>
  );
}
