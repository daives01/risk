import type { PublicState } from "./types";

export type HighlightFilter = "none" | `player:${string}` | `team:${string}`;

function parseHighlightFilter(filter: HighlightFilter): { mode: "none" } | { mode: "player"; id: string } | { mode: "team"; id: string } {
  if (filter === "none") return { mode: "none" };
  if (filter.startsWith("player:")) return { mode: "player", id: filter.slice("player:".length) };
  if (filter.startsWith("team:")) return { mode: "team", id: filter.slice("team:".length) };
  return { mode: "none" };
}

export function togglePlayerHighlight(current: HighlightFilter, playerId: string): HighlightFilter {
  const next = `player:${playerId}` as HighlightFilter;
  return current === next ? "none" : next;
}

export function toggleTeamHighlight(current: HighlightFilter, teamId: string): HighlightFilter {
  const next = `team:${teamId}` as HighlightFilter;
  return current === next ? "none" : next;
}

export function resolveHighlightedTerritoryIds(state: PublicState, filter: HighlightFilter): Set<string> {
  const parsed = parseHighlightFilter(filter);
  if (parsed.mode === "none") return new Set();

  const highlighted = new Set<string>();
  for (const [territoryId, territory] of Object.entries(state.territories)) {
    if (parsed.mode === "player") {
      if (territory.ownerId === parsed.id) highlighted.add(territoryId);
      continue;
    }

    if (territory.ownerId === "neutral") continue;
    if (state.players[territory.ownerId]?.teamId === parsed.id) highlighted.add(territoryId);
  }

  return highlighted;
}

