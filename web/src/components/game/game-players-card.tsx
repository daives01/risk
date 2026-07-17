import { Flag, Handshake, Users } from "lucide-react";
import { useState } from "react";
import type { KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { HighlightFilter } from "@/lib/game/highlighting";
import type { PlayerPanelStats } from "@/lib/game/player-stats";
import type { HandCard, PlayerRef, PublicState } from "@/lib/game/types";
import { GameLuckPopover, type GameLuckPlayer } from "./game-luck-popover";

interface PlayersCardProps {
  playerStats: PlayerPanelStats[];
  displayState: PublicState;
  playerMap: PlayerRef[];
  teamModeEnabled: boolean;
  teamNames?: Record<string, string>;
  activeHighlight: HighlightFilter;
  onTogglePlayerHighlight: (playerId: string) => void;
  onToggleTeamHighlight: (teamId: string) => void;
  getPlayerColor: (playerId: string, turnOrder: string[]) => string;
  getPlayerName: (enginePlayerId: string, players: PlayerRef[]) => string;
  showTurnTimer: boolean;
  turnTimerLabel?: string | null;
  myPlayerId?: string | null;
  teammateHands?: Record<string, HandCard[]> | null;
  canResign?: boolean;
  onResign?: () => void;
  delegatablePlayerId?: string | null;
  delegatedPlayerId?: string | null;
  onStartDelegation?: (playerId: string) => void;
  onStopDelegation?: () => void;
}

function toTitleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1).toLowerCase();
}

export function GamePlayersCard({
  playerStats,
  displayState,
  playerMap,
  teamModeEnabled,
  teamNames,
  activeHighlight,
  onTogglePlayerHighlight,
  onToggleTeamHighlight,
  getPlayerColor,
  getPlayerName,
  showTurnTimer,
  turnTimerLabel,
  myPlayerId,
  teammateHands,
  canResign = false,
  onResign,
  delegatablePlayerId,
  delegatedPlayerId,
  onStartDelegation,
  onStopDelegation,
}: PlayersCardProps) {
  const [resignOpen, setResignOpen] = useState(false);
  const tableMinWidthClass = teamModeEnabled ? "min-w-[28.5rem]" : "min-w-[21.5rem]";
  const luckPlayers: GameLuckPlayer[] = playerMap.flatMap((player) => player.enginePlayerId
    ? [{
        id: player.enginePlayerId,
        name: getPlayerName(player.enginePlayerId, playerMap),
        color: getPlayerColor(player.enginePlayerId, displayState.turnOrder),
        teamId: player.teamId,
        counts: player.diceRollCounts,
        combat: player.combatLuckStats,
      }]
    : []);

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, playerId: string) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onTogglePlayerHighlight(playerId);
  };

  return (
    <TooltipProvider>
      <Card className="glass-panel gap-2 border-0 py-0" data-player-highlight-zone="true">
        <CardHeader className="flex flex-row items-center justify-between px-3 py-2.5 xl:px-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4" />
            Players
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 space-y-2 px-2.5 pb-3 xl:px-3">
          <div className="min-w-0 overflow-x-auto game-scrollbar">
            <table className={`w-full table-auto border-separate border-spacing-y-2 ${tableMinWidthClass}`}>
              <colgroup>
                <col className="w-[2rem]" />
                <col />
                <col className="w-[1.6rem]" />
                <col className="w-[4.75rem]" />
                {teamModeEnabled && <col className="w-[5.75rem]" />}
                <col className="w-[5.25rem]" />
                <col className="w-[3.25rem]" />
              </colgroup>
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground [@media(max-width:420px)]:text-[9px]">
                  <th className="rounded-l-md border-y border-l border-border/70 bg-background/70 px-1 py-1.5 text-center [@media(max-width:420px)]:py-1" />
                  <th className="border-y border-border/70 bg-background/70 px-1 py-1.5 text-left [@media(max-width:420px)]:py-1">Player</th>
                  <th className="border-y border-border/70 bg-background/70 px-1 py-1.5 text-center [@media(max-width:420px)]:py-1" />
                  <th className="border-y border-border/70 bg-background/70 px-2 py-1.5 text-center [@media(max-width:420px)]:px-2 [@media(max-width:420px)]:py-1"><span className="sm:hidden">Stat</span><span className="hidden sm:inline">Status</span></th>
                  {teamModeEnabled && <th className="border-y border-border/70 bg-background/70 px-2 py-1.5 text-center [@media(max-width:420px)]:px-2 [@media(max-width:420px)]:py-1">Team</th>}
                  <th className="border-y border-border/70 bg-background/70 px-2 py-1.5 text-center [@media(max-width:420px)]:px-2 [@media(max-width:420px)]:py-1"><span className="sm:hidden">R/T</span><span className="hidden sm:inline">Res/Troops</span></th>
                  <th className="rounded-r-md border-y border-r border-border/70 bg-background/70 px-2.5 py-1.5 text-center [@media(max-width:420px)]:px-2.5 [@media(max-width:420px)]:py-1">Cards</th>
                </tr>
              </thead>
              <tbody>
                {playerStats.map((player) => {
                  const isCurrent = player.playerId === displayState.turn.currentPlayerId;
                  const isGameOver = displayState.turn.phase === "GameOver";
                  const isWinner = isGameOver && player.status === "alive";
                  const isDefeated = player.status === "defeated";
                  const teamId = player.teamId;
                  const playerHighlightKey = `player:${player.playerId}` as HighlightFilter;
                  const teamHighlightKey = teamId ? (`team:${teamId}` as HighlightFilter) : null;
                  const isPlayerHighlighted = activeHighlight === playerHighlightKey;
                  const isTeamHighlighted = teamHighlightKey ? activeHighlight === teamHighlightKey : false;
                  const color = getPlayerColor(player.playerId, displayState.turnOrder);
                  const baseStatusLabel = isGameOver
                    ? isWinner
                      ? "Winner"
                      : toTitleCase(player.status)
                    : toTitleCase(player.status);
                  const statusLabel = showTurnTimer && isCurrent
                    ? (turnTimerLabel ?? "Turn")
                    : !showTurnTimer && !isGameOver && isCurrent
                      ? "Turn"
                      : baseStatusLabel;
                  const showResign =
                    canResign &&
                    !!onResign &&
                    player.status === "alive" &&
                    !!myPlayerId &&
                    player.playerId === myPlayerId;
                  const canPlayForPlayer = delegatablePlayerId === player.playerId && !delegatedPlayerId;
                  const isDelegatedPlayer = delegatedPlayerId === player.playerId;
                  const playerName = getPlayerName(player.playerId, playerMap);
                  const playerRef = playerMap.find((candidate) => candidate.enginePlayerId === player.playerId);
                  const visibleHand = teammateHands?.[player.playerId];
                  const rowToneClass = isPlayerHighlighted
                    ? "border-primary/70 bg-primary/10"
                    : "border-border/70 bg-background/80 group-hover:border-primary/50";

                  return (
                    <tr
                      key={player.playerId}
                      role="button"
                      tabIndex={0}
                      onClick={() => onTogglePlayerHighlight(player.playerId)}
                      onKeyDown={(event) => handleRowKeyDown(event, player.playerId)}
                      className={`group cursor-pointer outline-none transition ${isDefeated ? "opacity-55" : ""}`}
                    >
                      <td className={`rounded-l-lg border-y border-l px-1 py-1.5 text-center [@media(max-width:420px)]:py-1 ${rowToneClass}`}>
                        <span className="mx-auto block size-2.5 rounded-full" style={{ backgroundColor: color }} />
                      </td>
                      <td className={`border-y px-1 py-1.5 [@media(max-width:420px)]:py-1 ${rowToneClass}`}>
                        <div className="min-w-0 text-sm [@media(max-width:420px)]:text-[0.72rem]">
                          <span className="flex min-w-0 items-center gap-1">
                            <span className={`block min-w-0 truncate font-semibold ${isDefeated ? "line-through" : ""}`}>
                              {playerName}
                            </span>
                            {player.playerId === myPlayerId && (
                              <GameLuckPopover
                                combat={playerRef?.combatLuckStats}
                                players={luckPlayers}
                                teamMode={teamModeEnabled}
                                teamNames={teamNames}
                              />
                            )}
                          </span>
                        </div>
                      </td>
                      <td className={`border-y px-1 py-1.5 text-center [@media(max-width:420px)]:py-1 ${rowToneClass}`}>
                        {showResign && (
                          <Popover open={resignOpen} onOpenChange={setResignOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                size="icon-xs"
                                variant="ghost"
                                aria-label="Resign game"
                                title="Resign game"
                                className="text-muted-foreground hover:text-foreground"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <Flag className="size-3" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              side="bottom"
                              align="start"
                              className="w-auto rounded-none px-2.5 py-2"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <div className="flex items-center gap-3 text-xs">
                                <span className="uppercase tracking-wide text-muted-foreground">Resign?</span>
                                <div className="flex items-center gap-1.5">
                                  <Button
                                    type="button"
                                    size="xs"
                                    variant="outline"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setResignOpen(false);
                                    }}
                                  >
                                    No
                                  </Button>
                                  <Button
                                    type="button"
                                    size="xs"
                                    variant="destructive"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setResignOpen(false);
                                      onResign();
                                    }}
                                  >
                                    Yes
                                  </Button>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                        {canPlayForPlayer && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="icon-xs"
                                variant="ghost"
                                aria-label={`Play for ${playerName}`}
                                className="text-muted-foreground hover:text-foreground"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onStartDelegation?.(player.playerId);
                                }}
                              >
                                <Handshake className="size-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Play for {playerName}</TooltipContent>
                          </Tooltip>
                        )}
                        {isDelegatedPlayer && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="icon-xs"
                                variant="ghost"
                                aria-label={`Stop playing for ${playerName}`}
                                className="text-amber-500 hover:text-amber-400"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onStopDelegation?.();
                                }}
                              >
                                <Handshake className="size-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Stop playing for {playerName}</TooltipContent>
                          </Tooltip>
                        )}
                      </td>
                      <td className={`border-y px-2 py-1.5 text-center [@media(max-width:420px)]:px-2 [@media(max-width:420px)]:py-1 ${rowToneClass}`}>
                        <span
                          className={`truncate text-xs font-medium ${
                            showTurnTimer && isCurrent
                              ? "font-semibold text-amber-500"
                              : isWinner || (!showTurnTimer && !isGameOver && isCurrent)
                                ? "font-semibold text-primary"
                                : "text-muted-foreground"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </td>
                      {teamModeEnabled && (
                        <td className={`border-y px-2 py-1.5 text-center [@media(max-width:420px)]:px-2 [@media(max-width:420px)]:py-1 ${rowToneClass}`}>
                          {teamId ? (
                            <button
                              type="button"
                              className={`inline-flex max-w-full items-center justify-center truncate rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition ${
                                isTeamHighlighted
                                  ? "border-primary bg-primary/15 text-primary"
                                  : "border-border text-muted-foreground hover:border-primary/50"
                              }`}
                              onClick={(event) => {
                                event.stopPropagation();
                                onToggleTeamHighlight(teamId);
                              }}
                            >
                              {teamNames?.[teamId] ?? teamId}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground/80">-</span>
                          )}
                        </td>
                      )}
                      <td className={`border-y px-2 py-1.5 text-center [@media(max-width:420px)]:px-2 [@media(max-width:420px)]:py-1 ${rowToneClass}`}>
                        <span className="text-xs tabular-nums">{player.reserveTroops} / {player.armies}</span>
                      </td>
                      <td className={`rounded-r-lg border-y border-r px-2.5 py-1.5 text-center [@media(max-width:420px)]:px-2.5 [@media(max-width:420px)]:py-1 ${rowToneClass}`}>
                        {visibleHand ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="rounded px-1 text-xs tabular-nums underline decoration-dotted underline-offset-2 hover:text-primary"
                                aria-label={`View ${playerName}'s ${player.cards} cards`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                {player.cards}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              side="bottom"
                              align="end"
                              className="w-64"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <p className="mb-2 text-xs font-semibold">{playerName}&apos;s cards ({visibleHand.length})</p>
                              {visibleHand.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {visibleHand.map((card) => (
                                    <span key={card.cardId} className="rounded border border-border bg-background px-2 py-1 text-xs font-medium">
                                      {card.kind}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">No cards</p>
                              )}
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <span className="text-xs tabular-nums">{player.cards}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
