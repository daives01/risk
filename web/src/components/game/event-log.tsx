import { TERRITORY_DISPLAY } from "@/lib/classic-map-layout";

interface GameAction {
  _id: string;
  index: number;
  playerId: string;
  action: { type: string; [key: string]: unknown };
  events: Array<{ type: string; [key: string]: unknown }>;
  createdAt: number;
}

interface EventLogProps {
  actions: GameAction[];
  playerNames: Record<string, string>;
}

function formatEvent(event: { type: string; [key: string]: unknown }, playerNames: Record<string, string>): string {
  const pName = (id: unknown) => (typeof id === "string" ? playerNames[id] ?? id : "?");
  const tName = (id: unknown) => (typeof id === "string" ? TERRITORY_DISPLAY[id]?.name ?? id : "?");

  switch (event.type) {
    case "ReinforcementsPlaced":
      return `${pName(event.playerId)} placed ${event.count} in ${tName(event.territoryId)}`;
    case "AttackResolved":
      return `Attack ${tName(event.from)} → ${tName(event.to)}: lost ${event.attackerLosses}/${event.defenderLosses}`;
    case "TerritoryCaptured":
      return `${pName(event.newOwnerId)} captured ${tName(event.to)}`;
    case "OccupyResolved":
      return `Moved ${event.moved} armies to ${tName(event.to)}`;
    case "FortifyResolved":
      return `Fortified ${tName(event.from)} → ${tName(event.to)}: ${event.moved}`;
    case "CardsTraded":
      return `${pName(event.playerId)} traded cards for ${event.value} armies`;
    case "CardDrawn":
      return `${pName(event.playerId)} drew a card`;
    case "TurnEnded":
      return `${pName(event.playerId)} ended turn`;
    case "TurnAdvanced":
      return `${pName(event.nextPlayerId)}'s turn (round ${event.round})`;
    case "PlayerEliminated":
      return `${pName(event.eliminatedId)} eliminated`;
    case "GameEnded":
      return `Game over! ${pName(event.winningPlayerId)} wins!`;
    case "ReinforcementsGranted":
      return `${pName(event.playerId)} gets ${event.amount} reinforcements`;
    default:
      return event.type;
  }
}

export function EventLog({ actions, playerNames }: EventLogProps) {
  if (!actions.length) {
    return (
      <div className="rounded-lg border bg-card p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Event Log</h3>
        <p className="mt-2 text-sm text-muted-foreground">No events yet</p>
      </div>
    );
  }

  const recentEvents = actions.flatMap(a =>
    (a.events as Array<{ type: string; [key: string]: unknown }>).map(e => ({
      key: `${a.index}-${e.type}`,
      text: formatEvent(e, playerNames),
    }))
  ).slice(-30);

  return (
    <div className="rounded-lg border bg-card p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Event Log</h3>
      <div className="flex max-h-48 flex-col-reverse gap-0.5 overflow-y-auto">
        {[...recentEvents].reverse().map(e => (
          <p key={e.key} className="text-xs text-muted-foreground">{e.text}</p>
        ))}
      </div>
    </div>
  );
}
