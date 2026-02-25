import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowLeft } from "lucide-react";
import { api } from "@backend/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type WorkspacesQuery = FunctionReturnType<typeof api.slackAdmin.listWorkspaces>;
type WorkspaceRecord = WorkspacesQuery[number];
type WorkspaceIdentitiesQuery = FunctionReturnType<typeof api.slackAdmin.listWorkspaceIdentities>;
type WorkspaceIdentityRecord = WorkspaceIdentitiesQuery[number];
type UserSearchResultsQuery = FunctionReturnType<typeof api.slackAdmin.searchUsersForMapping>;
type UserSearchResult = UserSearchResultsQuery[number];

export default function AdminSlackPage() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const isAdmin = useQuery(api.adminMaps.isCurrentUserAdmin, session ? {} : "skip");
  const workspaces = useQuery(api.slackAdmin.listWorkspaces, session && isAdmin ? {} : "skip");
  const createWorkspace = useAction(api.slackAdminActions.createWorkspace);
  const rotateWorkspaceToken = useAction(api.slackAdminActions.rotateWorkspaceToken);
  const updateWorkspace = useMutation(api.slackAdmin.updateWorkspace);
  const upsertUserIdentity = useMutation(api.slackAdmin.upsertUserIdentity);
  const removeUserIdentity = useMutation(api.slackAdmin.removeUserIdentity);

  const [createTeamName, setCreateTeamName] = useState("");
  const [createChannelId, setCreateChannelId] = useState("");
  const [createBotToken, setCreateBotToken] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [rotateToken, setRotateToken] = useState("");
  const [workspaceTeamNameDraft, setWorkspaceTeamNameDraft] = useState("");
  const [workspaceChannelDraft, setWorkspaceChannelDraft] = useState("");
  const [workspaceStatusDraft, setWorkspaceStatusDraft] = useState<"active" | "disabled">("active");
  const [mappingUserSearchInput, setMappingUserSearchInput] = useState("");
  const [mappingUserSearchDebounced, setMappingUserSearchDebounced] = useState("");
  const [selectedMappingUser, setSelectedMappingUser] = useState<UserSearchResult | null>(null);
  const [showUserSearchDropdown, setShowUserSearchDropdown] = useState(false);
  const [mappingSlackUserId, setMappingSlackUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeTeamId = selectedTeamId ?? workspaces?.[0]?.teamId ?? null;
  const identities = useQuery(
    api.slackAdmin.listWorkspaceIdentities,
    session && isAdmin && activeTeamId ? { teamId: activeTeamId } : "skip",
  );
  const userSearchResults = useQuery(
    api.slackAdmin.searchUsersForMapping,
    session && isAdmin && mappingUserSearchDebounced.trim().length >= 2
      ? { search: mappingUserSearchDebounced.trim(), limit: 8 }
      : "skip",
  );
  const selectedWorkspace = useMemo(
    () => workspaces?.find((workspace: WorkspaceRecord) => workspace.teamId === activeTeamId) ?? null,
    [workspaces, activeTeamId],
  );

  useEffect(() => {
    if (!selectedWorkspace) return;
    setWorkspaceTeamNameDraft(selectedWorkspace.teamName);
    setWorkspaceChannelDraft(selectedWorkspace.defaultChannelId);
    setWorkspaceStatusDraft(selectedWorkspace.status);
  }, [selectedWorkspace]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setMappingUserSearchDebounced(mappingUserSearchInput.trim());
    }, 250);
    return () => clearTimeout(timeout);
  }, [mappingUserSearchInput]);

  if (sessionPending || isAdmin === undefined) {
    return <div className="page-shell flex items-center justify-center">Loading...</div>;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  async function handleCreateWorkspace(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await createWorkspace({
        teamName: createTeamName,
        defaultChannelId: createChannelId,
        botToken: createBotToken,
      });
      setSuccess("Workspace saved.");
      setCreateBotToken("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setSaving(false);
    }
  }

  async function handleRotateToken(event: React.FormEvent) {
    event.preventDefault();
    if (!activeTeamId || !rotateToken.trim()) return;
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await rotateWorkspaceToken({ teamId: activeTeamId, botToken: rotateToken });
      setRotateToken("");
      setSuccess("Workspace token rotated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rotate token");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveWorkspaceConfig(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedWorkspace) return;
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await updateWorkspace({
        teamId: selectedWorkspace.teamId,
        teamName: workspaceTeamNameDraft,
        defaultChannelId: workspaceChannelDraft,
        status: workspaceStatusDraft,
      });
      setSuccess("Workspace settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update workspace");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpsertMapping(event: React.FormEvent) {
    event.preventDefault();
    if (!activeTeamId) return;
    if (!selectedMappingUser) {
      setError("Select a user from search results.");
      return;
    }
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await upsertUserIdentity({
        teamId: activeTeamId,
        userId: selectedMappingUser.userId,
        slackUserId: mappingSlackUserId,
      });
      setSelectedMappingUser(null);
      setMappingUserSearchInput("");
      setMappingUserSearchDebounced("");
      setMappingSlackUserId("");
      setSuccess("User mapping saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save user mapping");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMapping(userId: string) {
    if (!activeTeamId) return;
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await removeUserIdentity({ teamId: activeTeamId, userId });
      setSuccess("User mapping removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove mapping");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-shell soft-grid">
      <div className="page-container mx-auto max-w-4xl">
        <Card className="glass-panel border-0 py-0">
          <CardHeader className="py-6">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => navigate("/")}>
                <ArrowLeft className="size-4" />
              </Button>
              <CardTitle className="hero-title">Slack Admin</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pb-6">
            {error && <p className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            {success && <p className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{success}</p>}

            <form onSubmit={handleCreateWorkspace} className="space-y-3 rounded-lg border bg-background/75 p-3">
              <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Install Workspace</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="create-team-name">Team Name</Label>
                  <Input id="create-team-name" value={createTeamName} onChange={(event) => setCreateTeamName(event.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="create-channel-id">Default Channel ID</Label>
                  <Input id="create-channel-id" value={createChannelId} onChange={(event) => setCreateChannelId(event.target.value)} required />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="create-bot-token">Bot Token</Label>
                  <Input
                    id="create-bot-token"
                    type="password"
                    value={createBotToken}
                    onChange={(event) => setCreateBotToken(event.target.value)}
                    required
                  />
                </div>
              </div>
              <Button type="submit" disabled={saving}>Save Workspace</Button>
            </form>

            <div className="space-y-3 rounded-lg border bg-background/75 p-3">
              <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Workspace Settings</p>
              {workspaces === undefined && <p className="text-sm text-muted-foreground">Loading workspaces...</p>}
              {workspaces && workspaces.length === 0 && <p className="text-sm text-muted-foreground">No workspaces configured.</p>}
              {workspaces && workspaces.length > 0 && (
                <>
                  <Select value={activeTeamId ?? undefined} onValueChange={setSelectedTeamId}>
                    <SelectTrigger className="h-9 max-w-lg">
                      <SelectValue placeholder="Select workspace" />
                    </SelectTrigger>
                    <SelectContent>
                      {workspaces.map((workspace: WorkspaceRecord) => (
                        <SelectItem key={workspace.teamId} value={workspace.teamId}>
                          {workspace.teamName} ({workspace.teamId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedWorkspace && (
                    <div className="space-y-3 rounded-md border bg-background/65 p-3">
                      <form onSubmit={handleSaveWorkspaceConfig} className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="space-y-1 sm:col-span-2">
                            <Label htmlFor="workspace-team-name">Team Name</Label>
                            <Input
                              id="workspace-team-name"
                              value={workspaceTeamNameDraft}
                              onChange={(event) => setWorkspaceTeamNameDraft(event.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Status</Label>
                            <Select value={workspaceStatusDraft} onValueChange={(value) => setWorkspaceStatusDraft(value as "active" | "disabled")}>
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="active">active</SelectItem>
                                <SelectItem value="disabled">disabled</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label htmlFor="workspace-default-channel">Default Channel ID</Label>
                            <Input
                              id="workspace-default-channel"
                              value={workspaceChannelDraft}
                              onChange={(event) => setWorkspaceChannelDraft(event.target.value)}
                            />
                          </div>
                        </div>
                        <Button type="submit" variant="outline" disabled={saving}>
                          Save Workspace Settings
                        </Button>
                      </form>
                      <form onSubmit={handleRotateToken} className="space-y-2">
                        <Label htmlFor="rotate-token">Rotate Bot Token</Label>
                        <div className="flex flex-wrap gap-2">
                          <Input
                            id="rotate-token"
                            type="password"
                            value={rotateToken}
                            onChange={(event) => setRotateToken(event.target.value)}
                            className="max-w-lg"
                          />
                          <Button type="submit" variant="outline" disabled={saving || !rotateToken.trim()}>
                            Rotate Token
                          </Button>
                        </div>
                      </form>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="space-y-3 rounded-lg border bg-background/75 p-3">
              <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">User Mappings</p>
              {activeTeamId ? (
                <>
                  <form onSubmit={handleUpsertMapping} className="grid gap-3 sm:grid-cols-3">
                    <div className="relative">
                      <Input
                        placeholder="Search user (username or email)"
                        value={mappingUserSearchInput}
                        onChange={(event) => {
                          const next = event.target.value;
                          setMappingUserSearchInput(next);
                          setShowUserSearchDropdown(true);
                          if (selectedMappingUser && next !== `${selectedMappingUser.username ?? selectedMappingUser.name ?? selectedMappingUser.email ?? ""}`) {
                            setSelectedMappingUser(null);
                          }
                        }}
                        onFocus={() => setShowUserSearchDropdown(true)}
                        required
                      />
                      {showUserSearchDropdown && mappingUserSearchDebounced.length >= 2 && (
                        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto border border-border/80 bg-popover shadow-md">
                          {(userSearchResults ?? []).map((user) => (
                            <button
                              key={user.userId}
                              type="button"
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                              onClick={() => {
                                setSelectedMappingUser(user);
                                setMappingUserSearchInput(
                                  user.username ?? user.name ?? user.email ?? "",
                                );
                                setShowUserSearchDropdown(false);
                              }}
                            >
                              <span className="block font-medium">
                                {user.username ?? user.name ?? user.email ?? "User"}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {user.email ?? user.name ?? user.userId}
                              </span>
                            </button>
                          ))}
                          {userSearchResults && userSearchResults.length === 0 && (
                            <p className="px-3 py-2 text-sm text-muted-foreground">No users found.</p>
                          )}
                        </div>
                      )}
                    </div>
                    <Input
                      placeholder="Slack user id (U...)"
                      value={mappingSlackUserId}
                      onChange={(event) => setMappingSlackUserId(event.target.value)}
                      required
                    />
                    <Button type="submit" disabled={saving}>Save Mapping</Button>
                  </form>
                  {selectedMappingUser && (
                    <p className="text-sm text-muted-foreground">
                      Selected: {selectedMappingUser.username ?? selectedMappingUser.name ?? selectedMappingUser.email ?? "User"}
                      {selectedMappingUser.email ? ` (${selectedMappingUser.email})` : ""}
                    </p>
                  )}
                  <div className="space-y-2">
                    {(identities ?? []).map((identity: WorkspaceIdentityRecord) => (
                      <div key={`${identity.userId}-${identity.teamId}`} className="flex items-center justify-between rounded border bg-background/65 px-3 py-2 text-sm">
                        <span>
                          {identity.userId} - {identity.slackUserId} ({identity.status})
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            void handleRemoveMapping(identity.userId);
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    {identities && identities.length === 0 && (
                      <p className="text-sm text-muted-foreground">No mappings yet for this workspace.</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Select a workspace to manage mappings.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
