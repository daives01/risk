import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import type { Anchor, EditorContinent, EditorGraphMap, TerritoryInfo } from "@/lib/map-editor-validation";
import { normalizeAdjacency, useMapEditorValidation } from "@/lib/map-editor-validation";
import { buildMapImportPrompt, parseMapImportJson, type ParsedMapImport } from "@/lib/map-import";
import { useMapPanZoom } from "@/lib/use-map-pan-zoom";
import { readImageDimensions, uploadImage } from "@/lib/map-upload";

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
  playerLimits: {
    minPlayers: number;
    maxPlayers: number;
  };
  authoring: { status: "draft" | "published"; updatedAt: number; publishedAt?: number };
  imageUrl: string | null;
};

type ImportPreview = {
  parsed: ParsedMapImport;
  summary: {
    territoryCount: number;
    continentCount: number;
    edgeCount: number;
    addedTerritories: number;
    removedTerritories: number;
    renamedTerritories: number;
    importedAnchorCount: number;
    playerLimitsIncluded: boolean;
  };
};

function countEdges(adjacency: Record<string, string[]>) {
  return Object.entries(adjacency).reduce(
    (count, [from, neighbors]) => count + neighbors.filter((to) => from < to).length,
    0,
  );
}


export default function AdminMapEditorPage() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const navigate = useNavigate();
  const location = useLocation();
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

  const [name, setName] = useState("");
  const [territories, setTerritories] = useState<Record<string, TerritoryInfo>>({});
  const [adjacency, setAdjacency] = useState<Record<string, string[]>>({});
  const [anchors, setAnchors] = useState<Record<string, Anchor>>({});
  const [continents, setContinents] = useState<Record<string, EditorContinent>>({});
  const [imageStorageId, setImageStorageId] = useState<Id<"_storage"> | null>(null);
  const [imageWidth, setImageWidth] = useState(1);
  const [imageHeight, setImageHeight] = useState(1);
  const [minPlayers, setMinPlayers] = useState(2);
  const [maxPlayers, setMaxPlayers] = useState(6);

  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | null>(null);
  const [linkFromId, setLinkFromId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{
    territoryId: string;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const dragMovedRef = useRef(false);
  const [territoryFilter, setTerritoryFilter] = useState("");
  const [activeContinentId, setActiveContinentId] = useState<string | null>(null);
  const territoryCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [newTerritoryId, setNewTerritoryId] = useState("");
  const [newTerritoryName, setNewTerritoryName] = useState("");
  const [newContinentId, setNewContinentId] = useState("");
  const [newContinentBonus, setNewContinentBonus] = useState(2);

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [replacingImage, setReplacingImage] = useState(false);
  const [importJsonText, setImportJsonText] = useState("");
  const [importParseErrors, setImportParseErrors] = useState<string[]>([]);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);

  useEffect(() => {
    if (!getDraft) return;
    setName(getDraft.name);
    setTerritories({ ...getDraft.graphMap.territories });
    setAdjacency(normalizeAdjacency(getDraft.graphMap));
    setContinents(
      Object.fromEntries(
        Object.entries(getDraft.graphMap.continents ?? {}).map(([continentId, continent]) => [
          continentId,
          {
            bonus: continent.bonus,
            territoryIds: [...continent.territoryIds],
          },
        ]),
      ),
    );
    setAnchors(getDraft.visual.territoryAnchors);
    setImageStorageId(getDraft.visual.imageStorageId as Id<"_storage">);
    setImageWidth(getDraft.visual.imageWidth);
    setImageHeight(getDraft.visual.imageHeight);
    setMinPlayers(getDraft.playerLimits.minPlayers);
    setMaxPlayers(getDraft.playerLimits.maxPlayers);
  }, [getDraft]);

  const graphForPersist = useMemo<EditorGraphMap>(() => {
    const normalizedAdjacency = normalizeAdjacency({
      territories,
      adjacency,
      continents: {},
    });

    const territorySet = new Set(Object.keys(territories));
    const normalizedContinents: Record<string, EditorContinent> = {};
    for (const [continentId, continent] of Object.entries(continents)) {
      const normalizedTerritoryIds = [...new Set(continent.territoryIds)].filter((territoryId) =>
        territorySet.has(territoryId),
      );
      normalizedContinents[continentId] = {
        bonus: Math.max(1, Math.floor(continent.bonus)),
        territoryIds: normalizedTerritoryIds,
      };
    }

    return {
      territories,
      adjacency: normalizedAdjacency,
      continents: normalizedContinents,
    };
  }, [territories, adjacency, continents]);

  const territoryToContinents = useMemo(() => {
    const next: Record<string, string[]> = {};
    for (const territoryId of Object.keys(territories)) next[territoryId] = [];

    for (const [continentId, continent] of Object.entries(continents)) {
      for (const territoryId of continent.territoryIds) {
        if (!next[territoryId]) continue;
        next[territoryId]!.push(continentId);
      }
    }

    for (const territoryId of Object.keys(next)) {
      next[territoryId] = next[territoryId]!.sort();
    }

    return next;
  }, [continents, territories]);

  const validation = useMapEditorValidation({
    graphForPersist,
    imageStorageId,
    imageWidth,
    imageHeight,
    anchors,
    territories,
    continents,
    territoryToContinents,
  });
  const playerLimitsError = useMemo(() => {
    if (!Number.isInteger(minPlayers) || minPlayers < 2) {
      return "minPlayers must be an integer >= 2";
    }
    if (!Number.isInteger(maxPlayers)) {
      return "maxPlayers must be an integer";
    }
    if (maxPlayers < minPlayers) {
      return "maxPlayers must be greater than or equal to minPlayers";
    }
    return null;
  }, [minPlayers, maxPlayers]);

  const territoryIds = useMemo(() => Object.keys(territories).sort(), [territories]);

  const { containerRef, handlers, transformStyle, scale, zoomIn, zoomOut, reset, toNormalized } =
    useMapPanZoom({ minScale: 1, maxScale: 6, zoomStep: 0.25 });

  const setAnchorAt = useCallback(
    (territoryId: string, clientX: number, clientY: number) => {
      const point = toNormalized(clientX, clientY);
      if (!point) return;
      setAnchors((prev) => ({ ...prev, [territoryId]: point }));
    },
    [toNormalized],
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== dragging.pointerId) return;
      if (Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY) > 4) {
        dragMovedRef.current = true;
      }
      setAnchorAt(dragging.territoryId, event.clientX, event.clientY);
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId === dragging.pointerId) setDragging(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, setAnchorAt]);

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

  const toggleTerritoryInContinent = useCallback((continentId: string, territoryId: string) => {
    setContinents((prev) => {
      const continent = prev[continentId] ?? { bonus: 1, territoryIds: [] };
      const territoryIds = new Set(continent.territoryIds);
      if (territoryIds.has(territoryId)) {
        territoryIds.delete(territoryId);
      } else {
        territoryIds.add(territoryId);
      }

      return {
        ...prev,
        [continentId]: {
          ...continent,
          territoryIds: [...territoryIds].sort(),
        },
      };
    });
  }, []);

  const graphEdges = useMemo(() => {
    return Object.entries(adjacency).flatMap(([from, neighbors]) =>
      neighbors.filter((to) => from < to).map((to) => ({ from, to })),
    );
  }, [adjacency]);

  const filteredTerritoryIds = useMemo(() => {
    const search = territoryFilter.trim().toLowerCase();
    if (!search) return territoryIds;
    return territoryIds.filter((territoryId) => {
      const info = territories[territoryId];
      return (
        territoryId.toLowerCase().includes(search) ||
        (info?.name ?? "").toLowerCase().includes(search) ||
        (territoryToContinents[territoryId] ?? []).some((continentId) =>
          continentId.toLowerCase().includes(search),
        )
      );
    });
  }, [territoryFilter, territories, territoryIds, territoryToContinents]);

  useEffect(() => {
    if (activeContinentId && !continents[activeContinentId]) {
      setActiveContinentId(null);
    }
  }, [activeContinentId, continents]);

  useEffect(() => {
    if (!selectedTerritoryId) return;
    const selectedCard = territoryCardRefs.current[selectedTerritoryId];
    if (!selectedCard) return;
    selectedCard.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedTerritoryId, filteredTerritoryIds]);

  if (sessionPending) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  }

  if (!session) {
    const redirectPath = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirectPath)}`} replace />;
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
    if (activeContinentId) {
      setContinents((prev) => ({
        ...prev,
        [activeContinentId]: {
          ...(prev[activeContinentId] ?? { territoryIds: [], bonus: 1 }),
          territoryIds: [...new Set([...(prev[activeContinentId]?.territoryIds ?? []), id])].sort(),
        },
      }));
    }
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
    setContinents((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([continentId, continent]) => [
          continentId,
          {
            ...continent,
            territoryIds: continent.territoryIds.filter((id) => id !== territoryId),
          },
        ]),
      ),
    );

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
    if (playerLimitsError) {
      toast.error(playerLimitsError);
      return;
    }

    setSaving(true);
    try {
      await saveGraph({
        mapId,
        name: name.trim(),
        graphMap: graphForPersist,
        playerLimits: {
          minPlayers,
          maxPlayers,
        },
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

  async function handleImportFile(file: File | null) {
    if (!file) return;
    try {
      const text = await file.text();
      setImportJsonText(text);
      setImportPreview(null);
      setImportParseErrors([]);
    } catch {
      toast.error("Failed to read import file");
    }
  }

  function handlePreviewImport() {
    const trimmed = importJsonText.trim();
    if (!trimmed) {
      setImportPreview(null);
      setImportParseErrors(["Paste JSON or choose a file first"]);
      return;
    }

    const result = parseMapImportJson(trimmed);
    if (!result.value) {
      setImportPreview(null);
      setImportParseErrors(result.errors);
      return;
    }
    const parsed = result.value;

    const importedTerritoryIds = Object.keys(parsed.graphMap.territories);
    const importedTerritoryIdSet = new Set(importedTerritoryIds);
    const currentTerritoryIds = Object.keys(territories);
    const currentTerritoryIdSet = new Set(currentTerritoryIds);

    const renamedTerritories = importedTerritoryIds.filter((territoryId) => {
      if (!currentTerritoryIdSet.has(territoryId)) return false;
      const incomingName = parsed.graphMap.territories[territoryId]?.name?.trim() ?? "";
      const existingName = territories[territoryId]?.name?.trim() ?? "";
      return incomingName !== existingName;
    }).length;

    setImportParseErrors([]);
    setImportPreview({
      parsed: result.value,
      summary: {
        territoryCount: importedTerritoryIds.length,
        continentCount: Object.keys(parsed.graphMap.continents ?? {}).length,
        edgeCount: countEdges(parsed.graphMap.adjacency),
        addedTerritories: importedTerritoryIds.filter((territoryId) => !currentTerritoryIdSet.has(territoryId)).length,
        removedTerritories: currentTerritoryIds.filter((territoryId) => !importedTerritoryIdSet.has(territoryId)).length,
        renamedTerritories,
        importedAnchorCount: Object.keys(parsed.anchors).length,
        playerLimitsIncluded: parsed.playerLimits !== null,
      },
    });
  }

  function handleApplyImport() {
    if (!importPreview) return;
    setTerritories(importPreview.parsed.graphMap.territories);
    setAdjacency(normalizeAdjacency(importPreview.parsed.graphMap));
    setContinents(importPreview.parsed.graphMap.continents ?? {});
    setAnchors(importPreview.parsed.anchors);
    if (importPreview.parsed.playerLimits) {
      setMinPlayers(importPreview.parsed.playerLimits.minPlayers);
      setMaxPlayers(importPreview.parsed.playerLimits.maxPlayers);
    }
    setSelectedTerritoryId(null);
    setLinkFromId(null);
    setActiveContinentId(
      Object.keys(importPreview.parsed.graphMap.continents ?? {}).sort()[0] ?? null,
    );
    setImportPreview(null);
    setImportParseErrors([]);
    toast.success("Import applied locally. Save draft to persist.");
  }

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(buildMapImportPrompt());
      toast.success("Prompt copied");
    } catch {
      toast.error("Failed to copy prompt");
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
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Players</span>
                <Input
                  type="number"
                  min={2}
                  value={minPlayers}
                  onChange={(event) =>
                    setMinPlayers(Number.parseInt(event.target.value, 10) || 0)
                  }
                  className="w-20"
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type="number"
                  min={2}
                  value={maxPlayers}
                  onChange={(event) =>
                    setMaxPlayers(Number.parseInt(event.target.value, 10) || 0)
                  }
                  className="w-20"
                />
              </div>
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

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <p>Pinch/wheel zoom, drag pan, drag marker to reposition.</p>
              <div className="flex items-center gap-1">
                <Button size="xs" variant="outline" onClick={zoomOut}>-</Button>
                <span className="w-12 text-center">{Math.round(scale * 100)}%</span>
                <Button size="xs" variant="outline" onClick={zoomIn}>+</Button>
                <Button size="xs" variant="outline" onClick={reset}>Reset</Button>
              </div>
            </div>

            <div
              ref={containerRef}
              className="relative overflow-hidden rounded-lg border bg-muted touch-none"
              style={{ aspectRatio: `${imageWidth} / ${imageHeight}` }}
              {...handlers}
              onClick={(event) => {
                if (!selectedTerritoryId) return;
                setAnchorAt(selectedTerritoryId, event.clientX, event.clientY);
              }}
            >
              <div className="relative h-full w-full" style={transformStyle}>
                {getDraft.imageUrl ? (
                  <img src={getDraft.imageUrl} alt="Map" className="h-full w-full object-contain" draggable={false} />
                ) : (
                  <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-muted-foreground">
                    Missing map image
                  </div>
                )}

                <svg className="pointer-events-none absolute inset-0 h-full w-full">
                  {graphEdges.map(({ from, to }) => {
                    const fromAnchor = anchors[from];
                    const toAnchor = anchors[to];
                    if (!fromAnchor || !toAnchor) return null;

                    const touchesSelected =
                      selectedTerritoryId === from || selectedTerritoryId === to;
                    const touchesLinkSource = linkFromId === from || linkFromId === to;

                    return (
                      <line
                        key={`${from}-${to}`}
                        x1={`${fromAnchor.x * 100}%`}
                        y1={`${fromAnchor.y * 100}%`}
                        x2={`${toAnchor.x * 100}%`}
                        y2={`${toAnchor.y * 100}%`}
                        stroke={touchesLinkSource ? "rgba(239,68,68,0.95)" : touchesSelected ? "rgba(59,130,246,0.95)" : "rgba(255,255,255,0.3)"}
                        strokeWidth={touchesLinkSource || touchesSelected ? 3 : 1.5}
                      />
                    );
                  })}
                </svg>

                {territoryIds.map((territoryId) => {
                  const anchor = anchors[territoryId];
                  if (!anchor) return null;

                  const isSelected = selectedTerritoryId === territoryId;
                  const isLinkFrom = linkFromId === territoryId;
                  const isInActiveContinent =
                    !!activeContinentId &&
                    (territoryToContinents[territoryId] ?? []).includes(activeContinentId);
                  const showLabel = isSelected || isLinkFrom;

                  return (
                    <button
                      key={territoryId}
                      type="button"
                      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 p-2 text-xs font-semibold text-white ${
                        isLinkFrom
                          ? "border-red-500 bg-red-600"
                          : isSelected
                            ? "border-blue-500 bg-blue-600"
                            : isInActiveContinent
                              ? "border-emerald-400 bg-emerald-700/90"
                            : "border-white/70 bg-black/70"
                      }`}
                      style={{ left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%` }}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setSelectedTerritoryId(territoryId);
                        dragMovedRef.current = false;
                        setDragging({
                          territoryId,
                          pointerId: event.pointerId,
                          startX: event.clientX,
                          startY: event.clientY,
                        });
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (dragMovedRef.current) {
                          dragMovedRef.current = false;
                          return;
                        }

                        if (linkFromId && linkFromId !== territoryId) {
                          toggleAdjacency(linkFromId, territoryId);
                          setLinkFromId(null);
                          return;
                        }

                        if (activeContinentId) {
                          toggleTerritoryInContinent(activeContinentId, territoryId);
                          setSelectedTerritoryId(territoryId);
                          return;
                        }

                        setSelectedTerritoryId(territoryId);
                      }}
                      title={territories[territoryId]?.name ?? territoryId}
                    >
                      <span className="block h-1.5 w-1.5 rounded-full bg-white/90" />
                      {showLabel && (
                        <span className="pointer-events-none absolute left-1/2 top-[-0.45rem] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded border bg-black/80 px-2 py-0.5 text-[10px] leading-none text-white">
                          {territories[territoryId]?.name ?? territoryId}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
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
                  {playerLimitsError && <p className="text-red-600">• {playerLimitsError}</p>}
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
              <CardTitle>Import JSON</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <textarea
                value={importJsonText}
                onChange={(event) => {
                  setImportJsonText(event.target.value);
                  setImportPreview(null);
                  setImportParseErrors([]);
                }}
                placeholder="Paste map seed JSON"
                className="min-h-40 w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="file"
                  accept="application/json,.json,text/plain"
                  className="max-w-56"
                  onChange={(event) => void handleImportFile(event.target.files?.[0] ?? null)}
                />
                <Button size="xs" variant="outline" onClick={handleCopyPrompt}>
                  Copy Prompt
                </Button>
                <Button size="xs" onClick={handlePreviewImport}>
                  Preview
                </Button>
                <Button size="xs" onClick={handleApplyImport} disabled={!importPreview}>
                  Apply Import
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setImportJsonText("");
                    setImportPreview(null);
                    setImportParseErrors([]);
                  }}
                >
                  Clear
                </Button>
              </div>

              {importParseErrors.length > 0 && (
                <div className="rounded-md border border-red-400/60 bg-red-500/10 p-2 text-xs text-red-700">
                  {importParseErrors.map((error) => (
                    <p key={error}>• {error}</p>
                  ))}
                </div>
              )}

              {importPreview && (
                <div className="space-y-1 rounded-md border border-blue-400/50 bg-blue-500/10 p-2 text-xs">
                  <p>
                    {importPreview.summary.territoryCount} territories, {importPreview.summary.edgeCount} edges,{" "}
                    {importPreview.summary.continentCount} continents
                  </p>
                  <p>
                    +{importPreview.summary.addedTerritories} added, -{importPreview.summary.removedTerritories} removed,{" "}
                    {importPreview.summary.renamedTerritories} renamed
                  </p>
                  <p>
                    {importPreview.summary.importedAnchorCount} anchors included
                    {importPreview.summary.playerLimitsIncluded ? ", player limits included" : ", no player limits"}
                  </p>
                  {importPreview.parsed.warnings.map((warning) => (
                    <p key={warning} className="text-amber-700">• {warning}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

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
              <Input
                placeholder="filter territories"
                value={territoryFilter}
                onChange={(event) => setTerritoryFilter(event.target.value)}
              />

              <div className="max-h-[280px] space-y-2 overflow-auto">
                {filteredTerritoryIds.map((territoryId) => (
                  <div
                    key={territoryId}
                    ref={(node) => {
                      territoryCardRefs.current[territoryId] = node;
                    }}
                    className={`rounded-md border p-2 ${
                      selectedTerritoryId === territoryId
                        ? "border-blue-400/80 bg-blue-500/10"
                        : linkFromId === territoryId
                          ? "border-red-400/80 bg-red-500/10"
                          : activeContinentId && (territoryToContinents[territoryId] ?? []).includes(activeContinentId)
                            ? "border-emerald-400/70 bg-emerald-500/10"
                          : ""
                    }`}
                  >
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
                      <Button
                        size="xs"
                        variant={linkFromId === territoryId ? "default" : "outline"}
                        onClick={() => setLinkFromId((current) => (current === territoryId ? null : territoryId))}
                      >
                        {linkFromId === territoryId ? "Cancel Link" : "Link"}
                      </Button>
                      {activeContinentId && (
                        <Button
                          size="xs"
                          variant={
                            (territoryToContinents[territoryId] ?? []).includes(activeContinentId)
                              ? "default"
                              : "outline"
                          }
                          onClick={() => toggleTerritoryInContinent(activeContinentId, territoryId)}
                        >
                          {(territoryToContinents[territoryId] ?? []).includes(activeContinentId)
                            ? `Remove ${activeContinentId}`
                            : `Add ${activeContinentId}`}
                        </Button>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Continents: {(territoryToContinents[territoryId] ?? []).join(", ") || "none"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {anchors[territoryId]
                        ? `x=${anchors[territoryId]!.x.toFixed(3)}, y=${anchors[territoryId]!.y.toFixed(3)}`
                        : "No anchor (select and click map)"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {(adjacency[territoryId] ?? []).length} links
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
                    setContinents((prev) => ({
                      ...prev,
                      [id]: prev[id] ?? { territoryIds: [], bonus: Math.max(1, newContinentBonus) },
                    }));
                    setActiveContinentId(id);
                    setNewContinentId("");
                  }}
                >
                  Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Active continent: <strong>{activeContinentId ?? "none"}</strong>. Click map nodes to add/remove territories.
              </p>

              <div className="space-y-2">
                {Object.entries(continents)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([continentId, continent]) => (
                  <div
                    key={continentId}
                    className={`flex items-center gap-2 rounded-md border p-2 ${
                      activeContinentId === continentId ? "border-emerald-400/80 bg-emerald-500/10" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-sm"
                      onClick={() => setActiveContinentId(continentId)}
                    >
                      {continentId}
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        ({continent.territoryIds.length} territories)
                      </span>
                    </button>
                    <Input
                      className="w-20"
                      type="number"
                      min={1}
                      value={continent.bonus}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        setContinents((prev) => ({
                          ...prev,
                          [continentId]: {
                            ...(prev[continentId] ?? { territoryIds: [], bonus: 1 }),
                            bonus: next,
                          },
                        }));
                      }}
                    />
                    <Button
                      size="xs"
                      variant={activeContinentId === continentId ? "default" : "outline"}
                      onClick={() => setActiveContinentId(continentId)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        setContinents((prev) => {
                          const next = { ...prev };
                          delete next[continentId];
                          return next;
                        });
                        if (activeContinentId === continentId) {
                          setActiveContinentId(null);
                        }
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
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>Click <strong>Link</strong> on a territory, then click another marker to toggle a connection.</p>
              <p>{graphEdges.length} total edges across {territoryIds.length} territories.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
