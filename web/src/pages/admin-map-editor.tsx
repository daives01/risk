import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { validateMap, validateVisual } from "risk-engine";

type TerritoryInfo = { name?: string; continentId?: string; tags?: string[] };
type Anchor = { x: number; y: number };
type EditorGraphMap = {
  territories: Record<string, TerritoryInfo>;
  adjacency: Record<string, string[]>;
  continents?: Record<string, { territoryIds: string[]; bonus: number }>;
};

type EditorMap = {
  _id: string;
  mapId: string;
  name: string;
  graphMap: EditorGraphMap;
  visual: {
    imageStorageId: string;
    imageWidth: number;
    imageHeight: number;
    territoryAnchors: Record<string, Anchor>;
  };
  authoring: { status: "draft" | "published"; updatedAt: number; publishedAt?: number };
  imageUrl: string | null;
};

async function uploadImage(uploadUrl: string, file: File) {
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!response.ok) throw new Error("Image upload failed");
  const body = (await response.json()) as { storageId: string };
  return body.storageId;
}

async function readImageDimensions(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to read image dimensions"));
      img.src = objectUrl;
    });
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function normalizeAdjacency(graph: EditorGraphMap): Record<string, string[]> {
  const territoryIds = new Set(Object.keys(graph.territories));
  const normalized: Record<string, string[]> = {};

  for (const territoryId of territoryIds) {
    normalized[territoryId] = [];
  }

  for (const [territoryId, neighbors] of Object.entries(graph.adjacency)) {
    if (!territoryIds.has(territoryId)) continue;
    for (const neighborId of neighbors) {
      if (!territoryIds.has(neighborId)) continue;
      if (!normalized[territoryId]!.includes(neighborId)) {
        normalized[territoryId]!.push(neighborId);
      }
      if (!normalized[neighborId]!.includes(territoryId)) {
        normalized[neighborId]!.push(territoryId);
      }
    }
  }

  return normalized;
}

function graphConnectedTerritories(graph: EditorGraphMap) {
  const territoryIds = Object.keys(graph.territories);
  if (territoryIds.length <= 1) return { disconnected: [] as string[] };

  const visited = new Set<string>();
  const queue: string[] = [territoryIds[0]!];
  visited.add(territoryIds[0]!);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of graph.adjacency[current] ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return {
    disconnected: territoryIds.filter((territoryId) => !visited.has(territoryId)),
  };
}

export default function AdminMapEditorPage() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const navigate = useNavigate();
  const params = useParams<{ mapId: string }>();
  const mapId = params.mapId ?? "";

  const getDraft = useQuery(api.adminMaps.getDraft, mapId ? { mapId } : "skip") as
    | EditorMap
    | null
    | undefined;
  const saveGraph = useMutation(api.adminMaps.saveGraph);
  const saveAnchors = useMutation(api.adminMaps.saveAnchors);
  const publish = useMutation(api.adminMaps.publish);
  const generateUploadUrl = useMutation(api.adminMaps.generateUploadUrl);

  const mapRef = useRef<HTMLDivElement | null>(null);

  const [name, setName] = useState("");
  const [territories, setTerritories] = useState<Record<string, TerritoryInfo>>({});
  const [adjacency, setAdjacency] = useState<Record<string, string[]>>({});
  const [anchors, setAnchors] = useState<Record<string, Anchor>>({});
  const [continentBonuses, setContinentBonuses] = useState<Record<string, number>>({});
  const [imageStorageId, setImageStorageId] = useState<Id<"_storage"> | null>(null);
  const [imageWidth, setImageWidth] = useState(1);
  const [imageHeight, setImageHeight] = useState(1);

  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | null>(null);
  const [linkFromId, setLinkFromId] = useState<string | null>(null);
  const [draggingTerritoryId, setDraggingTerritoryId] = useState<string | null>(null);

  const [newTerritoryId, setNewTerritoryId] = useState("");
  const [newTerritoryName, setNewTerritoryName] = useState("");
  const [newContinentId, setNewContinentId] = useState("");
  const [newContinentBonus, setNewContinentBonus] = useState(2);

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [replacingImage, setReplacingImage] = useState(false);

  useEffect(() => {
    if (!getDraft) return;
    setName(getDraft.name);

    const hydratedTerritories: Record<string, TerritoryInfo> = { ...getDraft.graphMap.territories };
    const hydratedBonuses: Record<string, number> = {};

    for (const [continentId, continent] of Object.entries(getDraft.graphMap.continents ?? {})) {
      hydratedBonuses[continentId] = continent.bonus;
      for (const territoryId of continent.territoryIds) {
        hydratedTerritories[territoryId] = {
          ...(hydratedTerritories[territoryId] ?? {}),
          continentId,
        };
      }
    }

    setTerritories(hydratedTerritories);
    setAdjacency(normalizeAdjacency(getDraft.graphMap));
    setAnchors(getDraft.visual.territoryAnchors);
    setContinentBonuses(hydratedBonuses);
    setImageStorageId(getDraft.visual.imageStorageId as Id<"_storage">);
    setImageWidth(getDraft.visual.imageWidth);
    setImageHeight(getDraft.visual.imageHeight);
  }, [getDraft]);

  const graphForPersist = useMemo<EditorGraphMap>(() => {
    const normalizedAdjacency = normalizeAdjacency({
      territories,
      adjacency,
      continents: {},
    });

    const continents: Record<string, { territoryIds: string[]; bonus: number }> = {};
    for (const [continentId, bonus] of Object.entries(continentBonuses)) {
      continents[continentId] = {
        territoryIds: [],
        bonus,
      };
    }

    for (const [territoryId, info] of Object.entries(territories)) {
      const continentId = info.continentId;
      if (!continentId) continue;
      if (!continents[continentId]) {
        continents[continentId] = { territoryIds: [], bonus: 1 };
      }
      continents[continentId]!.territoryIds.push(territoryId);
    }

    return {
      territories,
      adjacency: normalizedAdjacency,
      continents,
    };
  }, [territories, adjacency, continentBonuses]);

  const validation = useMemo(() => {
    const mapValidation = validateMap(graphForPersist as any);
    const visualValidation = validateVisual(graphForPersist as any, {
      imageStorageId: imageStorageId || "missing",
      imageWidth,
      imageHeight,
      territoryAnchors: anchors,
    });
    const connection = graphConnectedTerritories(graphForPersist);

    const continentErrors: string[] = [];
    for (const territoryId of Object.keys(territories)) {
      const continentId = territories[territoryId]?.continentId;
      if (!continentId) {
        continentErrors.push(`Territory \"${territoryId}\" has no continent assignment`);
      }
    }
    for (const [continentId, bonus] of Object.entries(continentBonuses)) {
      if (!Number.isInteger(bonus) || bonus <= 0) {
        continentErrors.push(`Continent \"${continentId}\" bonus must be a positive integer`);
      }
    }

    return {
      errors: [...mapValidation.errors, ...visualValidation.errors, ...continentErrors],
      warnings:
        connection.disconnected.length > 0
          ? [`Disconnected territories: ${connection.disconnected.join(", ")}`]
          : [],
    };
  }, [graphForPersist, imageStorageId, imageWidth, imageHeight, anchors, territories, continentBonuses]);

  const territoryIds = useMemo(() => Object.keys(territories).sort(), [territories]);

  const getNormalizedPoint = useCallback((clientX: number, clientY: number) => {
    const node = mapRef.current;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  }, []);

  const setAnchorAt = useCallback(
    (territoryId: string, clientX: number, clientY: number) => {
      const point = getNormalizedPoint(clientX, clientY);
      if (!point) return;
      setAnchors((prev) => ({ ...prev, [territoryId]: point }));
    },
    [getNormalizedPoint],
  );

  useEffect(() => {
    if (!draggingTerritoryId) return;

    const onMove = (event: MouseEvent) => {
      setAnchorAt(draggingTerritoryId, event.clientX, event.clientY);
    };
    const onUp = () => setDraggingTerritoryId(null);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingTerritoryId, setAnchorAt]);

  const toggleAdjacency = useCallback((a: string, b: string) => {
    if (a === b) return;

    setAdjacency((prev) => {
      const next: Record<string, string[]> = { ...prev };
      const aNeighbors = new Set(next[a] ?? []);
      const bNeighbors = new Set(next[b] ?? []);

      if (aNeighbors.has(b)) {
        aNeighbors.delete(b);
        bNeighbors.delete(a);
      } else {
        aNeighbors.add(b);
        bNeighbors.add(a);
      }

      next[a] = [...aNeighbors];
      next[b] = [...bNeighbors];
      return next;
    });
  }, []);

  if (sessionPending) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!mapId) {
    return <div className="flex min-h-screen items-center justify-center">Invalid map id</div>;
  }

  if (getDraft === undefined) {
    return <div className="flex min-h-screen items-center justify-center">Loading map...</div>;
  }

  if (getDraft === null) {
    return <div className="flex min-h-screen items-center justify-center">Map not found</div>;
  }

  async function handleAddTerritory() {
    const id = newTerritoryId.trim();
    if (!id) return;
    if (territories[id]) {
      toast.error("Territory ID already exists");
      return;
    }

    setTerritories((prev) => ({
      ...prev,
      [id]: {
        name: newTerritoryName.trim() || id,
      },
    }));
    setAdjacency((prev) => ({ ...prev, [id]: [] }));
    setNewTerritoryId("");
    setNewTerritoryName("");
    setSelectedTerritoryId(id);
  }

  function handleRemoveTerritory(territoryId: string) {
    setTerritories((prev) => {
      const next = { ...prev };
      delete next[territoryId];
      return next;
    });

    setAdjacency((prev) => {
      const next: Record<string, string[]> = {};
      for (const [id, neighbors] of Object.entries(prev)) {
        if (id === territoryId) continue;
        next[id] = neighbors.filter((neighborId) => neighborId !== territoryId);
      }
      return next;
    });

    setAnchors((prev) => {
      const next = { ...prev };
      delete next[territoryId];
      return next;
    });

    if (selectedTerritoryId === territoryId) setSelectedTerritoryId(null);
    if (linkFromId === territoryId) setLinkFromId(null);
  }

  async function handleReplaceImage(file: File | null) {
    if (!file) return;

    setReplacingImage(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const storageId = await uploadImage(uploadUrl, file);
      const dimensions = await readImageDimensions(file);

      await saveAnchors({
        mapId,
        imageStorageId: storageId as Id<"_storage">,
        imageWidth: dimensions.width,
        imageHeight: dimensions.height,
        territoryAnchors: anchors,
      });

      setImageStorageId(storageId as Id<"_storage">);
      setImageWidth(dimensions.width);
      setImageHeight(dimensions.height);
      toast.success("Map image replaced");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to replace image");
    } finally {
      setReplacingImage(false);
    }
  }

  async function handleSaveDraft() {
    setSaving(true);
    try {
      await saveGraph({
        mapId,
        name: name.trim(),
        graphMap: graphForPersist,
      });
      await saveAnchors({
        mapId,
        imageStorageId: imageStorageId ?? undefined,
        imageWidth,
        imageHeight,
        territoryAnchors: anchors,
      });
      toast.success("Draft saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      await handleSaveDraft();
      await publish({ mapId });
      toast.success("Map published");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <div className="mx-auto grid w-full max-w-7xl gap-4 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => navigate("/admin/maps")}>Back</Button>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="w-80" />
              <span className="text-xs uppercase text-muted-foreground">{getDraft.authoring.status}</span>
            </div>
            <div className="flex gap-2">
              <Input
                type="file"
                accept="image/*"
                className="w-56"
                onChange={(e) => void handleReplaceImage(e.target.files?.[0] ?? null)}
                disabled={replacingImage}
              />
              <Button onClick={handleSaveDraft} disabled={saving || publishing}>
                {saving ? "Saving..." : "Save Draft"}
              </Button>
              <Button onClick={handlePublish} disabled={publishing || saving}>
                {publishing ? "Publishing..." : "Publish"}
              </Button>
            </div>
          </div>

          <div
            ref={mapRef}
            className="relative overflow-hidden rounded-lg border bg-muted"
            style={{ aspectRatio: `${imageWidth} / ${imageHeight}` }}
            onClick={(event) => {
              if (!selectedTerritoryId) return;
              setAnchorAt(selectedTerritoryId, event.clientX, event.clientY);
            }}
          >
            {getDraft.imageUrl ? (
              <img src={getDraft.imageUrl} alt="Map" className="h-full w-full object-contain" draggable={false} />
            ) : (
              <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-muted-foreground">
                Missing map image
              </div>
            )}

            {territoryIds.map((territoryId) => {
              const anchor = anchors[territoryId];
              if (!anchor) return null;

              const isSelected = selectedTerritoryId === territoryId;
              const isLinkFrom = linkFromId === territoryId;

              return (
                <button
                  key={territoryId}
                  type="button"
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 px-2 py-1 text-xs font-semibold text-white ${
                    isLinkFrom
                      ? "border-red-500 bg-red-600"
                      : isSelected
                        ? "border-blue-500 bg-blue-600"
                        : "border-white/70 bg-black/70"
                  }`}
                  style={{ left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%` }}
                  onClick={(event) => {
                    event.stopPropagation();

                    if (linkFromId && linkFromId !== territoryId) {
                      toggleAdjacency(linkFromId, territoryId);
                      setLinkFromId(null);
                      return;
                    }

                    setSelectedTerritoryId(territoryId);
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setSelectedTerritoryId(territoryId);
                    setDraggingTerritoryId(territoryId);
                  }}
                >
                  {territories[territoryId]?.name ?? territoryId}
                </button>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Validation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {validation.errors.length === 0 && validation.warnings.length === 0 ? (
                <p className="text-green-600">No validation issues.</p>
              ) : (
                <>
                  {validation.errors.map((error) => (
                    <p key={error} className="text-red-600">• {error}</p>
                  ))}
                  {validation.warnings.map((warning) => (
                    <p key={warning} className="text-amber-600">• {warning}</p>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <Card>
            <CardHeader>
              <CardTitle>Territories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input placeholder="territory id" value={newTerritoryId} onChange={(e) => setNewTerritoryId(e.target.value)} />
                <Input placeholder="name" value={newTerritoryName} onChange={(e) => setNewTerritoryName(e.target.value)} />
                <Button onClick={handleAddTerritory}>Add</Button>
              </div>

              <div className="max-h-[280px] space-y-2 overflow-auto">
                {territoryIds.map((territoryId) => (
                  <div key={territoryId} className="rounded-md border p-2">
                    <div className="mb-2 flex items-center justify-between">
                      <button
                        type="button"
                        className={`text-left text-sm ${selectedTerritoryId === territoryId ? "font-semibold" : ""}`}
                        onClick={() => setSelectedTerritoryId(territoryId)}
                      >
                        {territoryId}
                      </button>
                      <Button size="xs" variant="ghost" onClick={() => handleRemoveTerritory(territoryId)}>Remove</Button>
                    </div>
                    <Input
                      value={territories[territoryId]?.name ?? ""}
                      onChange={(e) =>
                        setTerritories((prev) => ({
                          ...prev,
                          [territoryId]: { ...prev[territoryId], name: e.target.value },
                        }))
                      }
                      placeholder="Name"
                    />
                    <div className="mt-2 flex gap-2">
                      <Input
                        placeholder="continent id"
                        value={territories[territoryId]?.continentId ?? ""}
                        onChange={(e) =>
                          setTerritories((prev) => ({
                            ...prev,
                            [territoryId]: {
                              ...prev[territoryId],
                              continentId: e.target.value.trim() || undefined,
                            },
                          }))
                        }
                      />
                      <Button
                        size="xs"
                        variant={linkFromId === territoryId ? "default" : "outline"}
                        onClick={() => setLinkFromId((current) => (current === territoryId ? null : territoryId))}
                      >
                        {linkFromId === territoryId ? "Cancel Link" : "Link"}
                      </Button>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {anchors[territoryId]
                        ? `x=${anchors[territoryId]!.x.toFixed(3)}, y=${anchors[territoryId]!.y.toFixed(3)}`
                        : "No anchor (select and click map)"}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Continents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-[1fr_100px_auto] gap-2">
                <Input
                  placeholder="continent id"
                  value={newContinentId}
                  onChange={(e) => setNewContinentId(e.target.value)}
                />
                <Input
                  type="number"
                  min={1}
                  value={newContinentBonus}
                  onChange={(e) => setNewContinentBonus(Number(e.target.value))}
                />
                <Button
                  onClick={() => {
                    const id = newContinentId.trim();
                    if (!id) return;
                    setContinentBonuses((prev) => ({ ...prev, [id]: Math.max(1, newContinentBonus) }));
                    setNewContinentId("");
                  }}
                >
                  Add
                </Button>
              </div>

              <div className="space-y-2">
                {Object.entries(continentBonuses).map(([continentId, bonus]) => (
                  <div key={continentId} className="flex items-center gap-2 rounded-md border p-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{continentId}</span>
                    <Input
                      className="w-20"
                      type="number"
                      min={1}
                      value={bonus}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        setContinentBonuses((prev) => ({ ...prev, [continentId]: next }));
                      }}
                    />
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        setContinentBonuses((prev) => {
                          const next = { ...prev };
                          delete next[continentId];
                          return next;
                        });
                        setTerritories((prev) => {
                          const next: Record<string, TerritoryInfo> = { ...prev };
                          for (const territoryId of Object.keys(next)) {
                            if (next[territoryId]?.continentId === continentId) {
                              next[territoryId] = {
                                ...next[territoryId],
                                continentId: undefined,
                              };
                            }
                          }
                          return next;
                        });
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Adjacency</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Click <strong>Link</strong> on a territory, then click another territory marker on the map to toggle a connection.
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
