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
import { hasModifierKey, isTypingTarget } from "@/lib/keyboard-shortcuts";

type HomeTab = "overview" | "history" | "account";

type MyGame = {
  _id: string;
  name: string;
  status: "lobby" | "active" | "finished";
  result: "won" | "lost" | null;
};

export default function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session, isPending } = authClient.useSession();
  const isAuthenticated = Boolean(session);
  const games = useQuery(api.games.listMyGames, isAuthenticated ? {} : "skip") as MyGame[] | undefined;
  const isAdmin = useQuery(api.adminMaps.isCurrentUserAdmin, isAuthenticated ? {} : "skip");
  const settings = useQuery(api.userSettings.getMySettings, isAuthenticated ? {} : "skip");
  const setTurnEmailSetting = useMutation(api.userSettings.setEmailTurnNotificationsEnabled);

  const [tab, setTab] = useState<HomeTab>("overview");
  const [joinCode, setJoinCode] = useState("");
  const [filter, setFilter] = useState("");

  const [profileName, setProfileName] = useState("");
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
  const filterRef = useRef<HTMLInputElement>(null);
  const currentGamesSectionRef = useRef<HTMLElement>(null);
  const currentGameButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const sessionUsername = (session?.user as { username?: string | null } | undefined)?.username ?? "";

  useEffect(() => {
    if (!session) return;
    setProfileName(session.user.name ?? "");
    setProfileUsername(sessionUsername);
  }, [session, sessionUsername]);

  const filteredGames = useMemo(() => {
    const all = games ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter((game) => game.name.toLowerCase().includes(q) || game.status.includes(q));
  }, [games, filter]);

  const currentGames = useMemo(
    () => (games ?? []).filter((game) => game.status === "active" || game.status === "lobby"),
    [games],
  );

  const filteredCurrentGames = useMemo(
    () => filteredGames.filter((game) => game.status === "active" || game.status === "lobby"),
    [filteredGames],
  );

  const filteredPreviousGames = useMemo(
    () => filteredGames.filter((game) => game.status === "finished"),
    [filteredGames],
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

  const focusCurrentGames = useCallback(() => {
    setTab("overview");
    requestAnimationFrame(() => {
      const firstButton = currentGameButtonRefs.current[0];
      if (firstButton) {
        firstButton.focus();
        return;
      }
      currentGamesSectionRef.current?.focus();
    });
  }, []);

  const focusJoin = useCallback(() => {
    setTab("overview");
    requestAnimationFrame(() => joinRef.current?.focus());
  }, []);

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

        if (key === "1") setTab("overview");
        if (key === "2") setTab("history");
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
        if (key === "/") {
          event.preventDefault();
          setTab("history");
          filterRef.current?.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusCurrentGames, focusJoin, navigate, session]);

  function submitJoinCode(event: React.FormEvent) {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    navigate(`/join/${code}`);
  }

  async function submitProfile(event: React.FormEvent) {
    event.preventDefault();
    const nextName = profileName.trim();
    const nextUsername = profileUsername.trim();

    if (!nextName || nextUsername.length < 3) {
      setProfileError("Name is required and username must be at least 3 characters.");
      setProfileSuccess(null);
      return;
    }

    setProfileSaving(true);
    setProfileError(null);
    setProfileSuccess(null);
    try {
      const result = await authClient.updateUser({
        name: nextName,
        username: nextUsername,
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
      <div className="page-container mx-auto max-w-5xl">
        <Card className="glass-panel border-0 py-0">
          <CardHeader className="space-y-4 py-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="hero-title">
                  <span className="text-primary">Legally Distinct Global Domination</span>
                </CardTitle>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <Button className="justify-between sm:min-w-40" onClick={() => navigate("/games/new")}>
                  <span className="inline-flex items-center gap-2">
                    <Plus className="size-4" /> New Game
                  </span>
                  <ShortcutHint shortcut="n" />
                </Button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setTab("overview")}
                className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${
                  tab === "overview"
                    ? "border-primary bg-primary/12 text-primary"
                    : "border-border/75 bg-background/70 hover:border-primary/45"
                }`}
              >
                <span>Overview</span>
                <ShortcutHint shortcut="1" />
              </button>
              <button
                type="button"
                onClick={() => setTab("history")}
                className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${
                  tab === "history"
                    ? "border-primary bg-primary/12 text-primary"
                    : "border-border/75 bg-background/70 hover:border-primary/45"
                }`}
              >
                <span>History</span>
                <ShortcutHint shortcut="2" />
              </button>
              <button
                type="button"
                onClick={() => setTab("account")}
                className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${
                  tab === "account"
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
            {tab === "overview" && (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,1fr)]">
                <div className="space-y-3">
                  <section ref={currentGamesSectionRef} tabIndex={-1} className="space-y-2 rounded-lg border bg-background/75 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Active + Lobby</p>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex min-w-8 justify-center rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                          {currentGames.length}
                        </span>
                        <ShortcutHint shortcut="g" />
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-md border border-border/75 bg-background/70">
                      {currentGames.length === 0 && (
                        <p className="px-3 py-3 text-sm text-muted-foreground">No active or lobby games right now.</p>
                      )}
                      {currentGames.map((game, idx) => (
                        <button
                          key={game._id}
                          ref={(element) => {
                            currentGameButtonRefs.current[idx] = element;
                          }}
                          type="button"
                          onClick={() => openGame(game)}
                          className="grid w-full grid-cols-[1fr_auto] gap-2 border-b border-border/60 px-3 py-2 text-left text-sm transition last:border-b-0 hover:bg-primary/10 hover:text-primary focus-visible:bg-primary/10 focus-visible:text-primary focus-visible:outline-none"
                        >
                          <span className="truncate">{game.name}</span>
                          <span
                            className={`inline-flex min-w-16 items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] ${
                              game.status === "active"
                                ? "border-emerald-400/45 bg-emerald-500/10 text-emerald-300"
                                : "border-blue-400/45 bg-blue-500/10 text-blue-300"
                            }`}
                          >
                            {game.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <form onSubmit={submitJoinCode} className="space-y-2 rounded-lg border bg-background/75 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Join Game</p>
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
                        Join
                      </Button>
                    </div>
                  </form>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="rounded-lg border bg-background/75 p-3">
                    <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Total</p>
                    <p className="mt-1 text-3xl">{counts.total}</p>
                  </div>
                  <div className="rounded-lg border bg-background/75 p-3">
                    <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Active</p>
                    <p className="mt-1 text-3xl">{counts.active}</p>
                  </div>
                  <div className="rounded-lg border bg-background/75 p-3">
                    <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Lobby</p>
                    <p className="mt-1 text-3xl">{counts.lobby}</p>
                  </div>
                  <div className="rounded-lg border bg-background/75 p-3">
                    <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Finished</p>
                    <p className="mt-1 text-3xl">{counts.finished}</p>
                  </div>
                </div>
              </div>
            )}

            {tab === "history" && (
              <div className="space-y-3">
                <div className="space-y-2 rounded-lg border bg-background/75 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Search</p>
                    <ShortcutHint shortcut="/" />
                  </div>
                  <Input
                    ref={filterRef}
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="FILTER ALL GAMES"
                    className="font-mono"
                  />
                </div>

                <section className="space-y-2 rounded-lg border bg-background/75 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Active + Lobby</p>
                    <span className="inline-flex min-w-8 justify-center rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                      {filteredCurrentGames.length}
                    </span>
                  </div>
                  <div className="overflow-hidden rounded-md border border-border/75 bg-background/70">
                    {filteredCurrentGames.length === 0 && (
                      <p className="px-3 py-3 text-sm text-muted-foreground">No active or lobby games found.</p>
                    )}
                    {filteredCurrentGames.map((game) => (
                      <button
                        key={game._id}
                        type="button"
                        onClick={() => openGame(game)}
                        className="grid w-full grid-cols-[1fr_auto] gap-2 border-b border-border/60 px-3 py-2 text-left text-sm transition last:border-b-0 hover:bg-primary/10 hover:text-primary focus-visible:bg-primary/10 focus-visible:text-primary focus-visible:outline-none"
                      >
                        <span className="truncate">{game.name}</span>
                        <span
                          className={`inline-flex min-w-16 items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] ${
                            game.status === "active"
                              ? "border-emerald-400/45 bg-emerald-500/10 text-emerald-300"
                              : "border-blue-400/45 bg-blue-500/10 text-blue-300"
                          }`}
                        >
                          {game.status}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="space-y-2 rounded-lg border bg-background/75 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Previous Games</p>
                    <span className="inline-flex min-w-8 justify-center rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                      {filteredPreviousGames.length}
                    </span>
                  </div>
                  <div className="overflow-hidden rounded-md border border-border/75 bg-background/70">
                    {filteredPreviousGames.length === 0 && (
                      <p className="px-3 py-3 text-sm text-muted-foreground">No previous games found.</p>
                    )}
                    {filteredPreviousGames.map((game) => (
                      <button
                        key={game._id}
                        type="button"
                        onClick={() => openGame(game)}
                        className="grid w-full grid-cols-[1fr_auto_auto] gap-2 border-b border-border/60 px-3 py-2 text-left text-sm transition last:border-b-0 hover:bg-primary/10 hover:text-primary focus-visible:bg-primary/10 focus-visible:text-primary focus-visible:outline-none"
                      >
                        <span className="truncate">{game.name}</span>
                        <span className="inline-flex min-w-16 items-center justify-center rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                          {game.status}
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
                </section>
              </div>
            )}

            {tab === "account" && (
              <div className="grid gap-3 lg:grid-cols-2">
                <form onSubmit={submitProfile} className="space-y-3 rounded-lg border bg-background/75 p-3">
                  <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Profile</p>
                  <div className="space-y-2">
                    <label htmlFor="account-name" className="text-xs text-muted-foreground">Display Name</label>
                    <Input
                      id="account-name"
                      value={profileName}
                      onChange={(event) => setProfileName(event.target.value)}
                      maxLength={60}
                      required
                    />
                  </div>
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
                    <label htmlFor="account-email" className="text-xs text-muted-foreground">Email (read-only)</label>
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
                        checked={settings?.emailTurnNotificationsEnabled ?? true}
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
    </div>
  );
}
