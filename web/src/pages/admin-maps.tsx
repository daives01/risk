import { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { readImageDimensions, uploadImage } from "@/lib/map-upload";
import { toast } from "sonner";

export default function AdminMapsPage() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const listAdminMaps = useQuery(api.adminMaps.listAdminMaps);
  const generateUploadUrl = useMutation(api.adminMaps.generateUploadUrl);
  const createDraft = useMutation(api.adminMaps.createDraft);

  const [mapId, setMapId] = useState("");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);

  const sortedMaps = useMemo(() => {
    if (!listAdminMaps) return [];
    return [...listAdminMaps].sort((a, b) => b.createdAt - a.createdAt);
  }, [listAdminMaps]);

  if (sessionPending) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  }

  if (!session) {
    const redirectPath = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirectPath)}`} replace />;
  }

  async function handleCreateDraft(event: React.FormEvent) {
    event.preventDefault();
    if (!mapId.trim() || !name.trim() || !file) {
      toast.error("Map ID, name, and image are required");
      return;
    }

    setCreating(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const storageId = await uploadImage(uploadUrl, file);
      const { width, height } = await readImageDimensions(file);

      await createDraft({
        mapId: mapId.trim(),
        name: name.trim(),
        graphMap: {
          territories: {},
          adjacency: {},
          continents: {},
        },
        visual: {
          imageStorageId: storageId as Id<"_storage">,
          imageWidth: width,
          imageHeight: height,
          territoryAnchors: {},
        },
      });

      toast.success("Draft map created");
      navigate(`/admin/maps/${mapId.trim()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create draft");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Map Admin</h1>
          <Button variant="outline" onClick={() => navigate("/")}>Back</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create Draft Map</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={handleCreateDraft}>
              <Input
                placeholder="map id (kebab-case)"
                value={mapId}
                onChange={(e) => setMapId(e.target.value)}
                required
              />
              <Input
                placeholder="Map name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
              <Button type="submit" disabled={creating}>{creating ? "Creating..." : "Create"}</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Existing Maps</CardTitle>
          </CardHeader>
          <CardContent>
            {listAdminMaps === undefined ? (
              <p className="text-sm text-muted-foreground">Loading maps...</p>
            ) : sortedMaps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No maps yet.</p>
            ) : (
              <div className="grid gap-2">
                {sortedMaps.map((map) => (
                  <button
                    key={map.mapId}
                    type="button"
                    onClick={() => navigate(`/admin/maps/${map.mapId}`)}
                    className="rounded-md border p-3 text-left transition hover:bg-accent"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{map.name}</span>
                      <span className="text-xs uppercase text-muted-foreground">
                        {map.authoring.status}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {map.mapId} · {Object.keys(map.graphMap.territories).length} territories ·{" "}
                      {map.playerLimits.minPlayers}-{map.playerLimits.maxPlayers} players
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
