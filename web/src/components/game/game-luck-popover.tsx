import { Dices, Shield, Swords, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  combineDieFaceCounts,
  combatLuckScore,
  combineCombatLuckStats,
  createEmptyCombatLuckStats,
  createEmptyDiceRollCounts,
  summarizeDieFaceCounts,
  type DiceRollCounts,
  type DieFaceCounts,
  type CombatLuckStats,
} from "risk-engine";
import { Button } from "@/components/ui/button";
import { MagneticPointField, type MagneticPoint } from "@/components/ui/magnetic-point-field";
import { CombatLuckDetail } from "./combat-luck-display";
import { formatLuckScore, luckScoreStyle } from "./luck-score-presentation";
import {
  fromTeamLuckSubjectId,
  resolveLuckComparisonPresentation,
  toTeamLuckSubjectId,
  type TeamLuckSubjectId,
} from "@/lib/game/luck-comparison-transition";

const FACE_KEYS = ["ones", "twos", "threes", "fours", "fives", "sixes"] as const;
const GAME_LUCK_MAGNETIC_TUNING = { reach: 15, separation: 90, responsiveness: 90 } as const;

export interface GameLuckPlayer {
  id: string;
  name: string;
  color: string;
  teamId?: string | null;
  counts?: DiceRollCounts | null;
  combat?: CombatLuckStats | null;
}

interface GameLuckSubject extends GameLuckPlayer {
  counts: DiceRollCounts;
  diceCount: number;
  luckScore: number | null;
  combat: CombatLuckStats;
  battles: number;
}

function getLuckLabel(deviation: number, diceCount: number) {
  const noise = 1.7 / Math.sqrt(Math.max(diceCount, 1));
  if (Math.abs(deviation) < noise * 0.45) return { label: "About even", tone: "text-foreground" };
  if (deviation > noise * 1.35) return { label: "Very lucky", tone: "text-emerald-400" };
  if (deviation > 0) return { label: "A little lucky", tone: "text-emerald-400" };
  if (deviation < -noise * 1.35) return { label: "Very unlucky", tone: "text-rose-400" };
  return { label: "A little unlucky", tone: "text-rose-400" };
}

function summarizeDiceLuck(counts: DieFaceCounts) {
  const summary = summarizeDieFaceCounts(counts);
  return { ...summary, deviation: summary.average === null ? null : summary.average - 3.5 };
}

function toSubject(id: string, name: string, color: string, counts: DiceRollCounts, combat: CombatLuckStats, metric: "dice" | "combat", teamId?: string | null): GameLuckSubject {
  const summary = summarizeDiceLuck(combineDieFaceCounts(counts.attack, counts.defense));
  const battles = combat.attack.battles + combat.defense.battles;
  return { id, name, color, counts, combat, teamId, battles, diceCount: summary.diceCount, luckScore: metric === "dice" ? summary.deviation : battles === 0 ? null : combatLuckScore(combat) };
}

function aggregateCounts(players: GameLuckPlayer[]) {
  return players.reduce((total, player) => {
    if (!player.counts) return total;
    return {
      attack: combineDieFaceCounts(total.attack, player.counts.attack),
      defense: combineDieFaceCounts(total.defense, player.counts.defense),
    };
  }, createEmptyDiceRollCounts());
}

function aggregateCombat(players: GameLuckPlayer[]) {
  return players.reduce((total, player) => player.combat ? combineCombatLuckStats(total, player.combat) : total, createEmptyCombatLuckStats());
}

function FaceChart({ counts, tall = false, color }: { counts: DieFaceCounts; tall?: boolean; color?: string }) {
  const values = FACE_KEYS.map((key) => counts[key]);
  const total = values.reduce((sum, value) => sum + value, 0);
  const max = Math.max(...values, 1);
  const expected = total / 6;
  return (
    <div className="grid grid-cols-6 gap-1.5" aria-label="Rolls by die face">
      {values.map((count, index) => (
        <div key={index} className="flex min-w-0 flex-col items-center gap-1">
          <div className={`relative flex w-full items-end bg-muted/60 ${tall ? "h-24" : "h-10"}`}>
            {total > 0 && <span className="absolute inset-x-0 z-10 border-t border-dashed border-muted-foreground/45" style={{ bottom: `${(expected / max) * 100}%` }} />}
            <span className="w-full origin-bottom animate-[dice-bar-rise_420ms_cubic-bezier(0.22,1,0.36,1)_both] bg-primary/80 motion-reduce:animate-none" style={{ height: total === 0 ? 0 : `${Math.max((count / max) * 100, 3)}%`, backgroundColor: color }} title={`${count} rolls`} />
          </div>
          <span className="text-[10px] font-semibold text-muted-foreground">{index + 1}</span>
          {tall && <span className="text-[10px] tabular-nums">{count}</span>}
        </div>
      ))}
    </div>
  );
}

function RoleStat({ icon, label, counts }: { icon: React.ReactNode; label: string; counts: DieFaceCounts }) {
  const summary = summarizeDiceLuck(counts);
  return (
    <div className="border border-border/70 bg-background/50 p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">{icon}{label}</div>
      <div className="mt-2 flex items-end justify-between">
        <span className="text-xl font-semibold tabular-nums" style={summary.deviation === null ? undefined : luckScoreStyle(summary.deviation)}>{summary.deviation === null ? "—" : formatLuckScore(summary.deviation)}</span>
        <span className="text-[10px] tabular-nums text-muted-foreground">{summary.diceCount} dice</span>
      </div>
    </div>
  );
}

function LuckComparisonField({ players, teams, metric, mode, transitionTarget, selectedId, onSelect, onTransitionComplete }: { players: GameLuckSubject[]; teams: GameLuckSubject[]; metric: "dice" | "combat"; mode: "individual" | "teams"; transitionTarget: "individual" | "teams" | null; selectedId: string; onSelect: (id: string) => void; onTransitionComplete: () => void }) {
  const layout = useMemo(() => {
    const measured = [...players, ...teams].filter((subject) => subject.luckScore !== null);
    const furthest = Math.max(0.5, ...measured.map((subject) => Math.abs(subject.luckScore!)));
    const domain = Math.max(0.5, Math.ceil(furthest * 4) / 4);
    const sampleSize = (subject: GameLuckSubject) => metric === "dice" ? subject.diceCount : subject.battles;
    const maxSampleSize = Math.max(1, ...measured.map(sampleSize));
    const topFor = (subject: GameLuckSubject) => 18 + (1 - sampleSize(subject) / maxSampleSize) * 58;
    const positioned = players.filter((player) => player.luckScore !== null).map((player) => {
      return { player, left: Math.max(8, Math.min(95, ((player.luckScore! + domain) / (domain * 2)) * 100)), top: topFor(player) };
    });
    const teamPositions = teams.filter((team) => team.luckScore !== null).map((team) => {
      const teamId = fromTeamLuckSubjectId(team.id as TeamLuckSubjectId);
      const members = positioned.filter(({ player }) => player.teamId === teamId);
      const left = Math.max(8, Math.min(95, ((team.luckScore! + domain) / (domain * 2)) * 100));
      const colors = members.map(({ player }) => player.color);
      return { team, left, top: topFor(team), colors };
    });
    return { positioned, teamPositions, maxSampleSize };
  }, [metric, players, teams]);
  const transitioning = transitionTarget !== null;
  const sampleLabel = metric === "dice" ? "Dice rolled" : "Engagements";
  const magneticPoints = useMemo<MagneticPoint[]>(() => {
    const playerPoints = layout.positioned.map(({ player, left, top }) => {
      const sampleSize = metric === "dice" ? player.diceCount : player.battles;
      return { id: player.id, x: left, y: top, label: player.name, ariaLabel: `Select ${player.name}: ${sampleSize} ${sampleLabel.toLowerCase()}`, markerStyle: { backgroundColor: player.color } };
    });
    const teamPoints = layout.teamPositions.map(({ team, left, top, colors }) => {
      const stops = colors.map((color, index) => `${color} ${(index / colors.length) * 100}% ${((index + 1) / colors.length) * 100}%`).join(", ");
      const sampleSize = metric === "dice" ? team.diceCount : team.battles;
      return { id: team.id, x: left, y: top, label: team.name, ariaLabel: `Select ${team.name}: ${sampleSize} ${sampleLabel.toLowerCase()}`, size: 20, markerStyle: { background: colors.length > 1 ? `conic-gradient(${stops})` : colors[0] ?? team.color } };
    });
    if (!transitionTarget) return mode === "individual" ? playerPoints : teamPoints;
    const teamsById = new Map(layout.teamPositions.map((position) => [fromTeamLuckSubjectId(position.team.id as TeamLuckSubjectId), position]));
    return layout.positioned.map(({ player }, index) => {
      const point = playerPoints[index]!;
      const team = player.teamId ? teamsById.get(player.teamId) : undefined;
      if (!team) return point;
      return transitionTarget === "teams"
        ? { ...point, x: team.left, y: team.top }
        : { ...point, initialX: team.left, initialY: team.top };
    });
  }, [layout, metric, mode, sampleLabel, transitionTarget]);
  useEffect(() => {
    if (!transitionTarget) return;
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420;
    const timeout = window.setTimeout(onTransitionComplete, duration);
    return () => window.clearTimeout(timeout);
  }, [onTransitionComplete, transitionTarget]);
  return (
    <div className="relative h-44 overflow-hidden border border-border/60 bg-muted/20 [contain:layout_paint]">
      <div className="absolute bottom-[18%] left-1/2 top-[12%] w-px bg-foreground/25" />
      {[18, 47, 76].map((top) => <div key={top} className="absolute left-8 right-3 border-t border-dashed border-border/70" style={{ top: `${top}%` }} />)}
      <span className="absolute left-1 top-[18%] -translate-y-1/2 text-[8px] tabular-nums text-muted-foreground">{layout.maxSampleSize}</span>
      <span className="absolute bottom-[24%] left-1 text-[8px] tabular-nums text-muted-foreground">0</span>
      <span className="absolute left-1 top-1 text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">{sampleLabel}</span>
      <MagneticPointField points={magneticPoints} selectedId={selectedId} onSelect={onSelect} tuning={GAME_LUCK_MAGNETIC_TUNING} interactive={!transitioning} />
      <span className="absolute bottom-2 left-8 text-[9px] uppercase tracking-wider text-muted-foreground">Unlucky</span><span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-foreground/70">0</span><span className="absolute bottom-2 right-3 text-[9px] uppercase tracking-wider text-muted-foreground">Lucky</span>
    </div>
  );
}

function SubjectDetail({ subject, metric }: { subject: GameLuckSubject; metric: "dice" | "combat" }) {
  const combined = combineDieFaceCounts(subject.counts.attack, subject.counts.defense);
  const label = subject.luckScore === null ? null : getLuckLabel(subject.luckScore, subject.diceCount);
  return (
    <div className="grid">
      <div className={`col-start-1 row-start-1 ${metric === "combat" ? "visible" : "invisible"}`} aria-hidden={metric !== "combat"}>
        <CombatLuckDetail name={subject.name} color={subject.color} score={subject.luckScore} combat={subject.combat} />
      </div>
      <div className={`col-start-1 row-start-1 grid gap-4 md:grid-cols-[1fr_1.25fr] ${metric === "dice" ? "visible" : "invisible"}`} aria-hidden={metric !== "dice"}>
        <div>
          <div className="flex items-start justify-between"><div><div className="flex items-center gap-2 text-sm font-semibold"><span className="size-2.5 rounded-full" style={{ backgroundColor: subject.color }} />{subject.name}</div><div className={`mt-1 text-xs ${label?.tone ?? "text-muted-foreground"}`}>{label?.label ?? "No rolls"}</div></div><div className="text-right"><div className="text-2xl font-semibold tabular-nums" style={subject.luckScore === null ? undefined : luckScoreStyle(subject.luckScore)}>{subject.luckScore === null ? "—" : formatLuckScore(subject.luckScore)}</div><div className="text-[9px] uppercase tracking-wider text-muted-foreground">{subject.diceCount} dice</div></div></div>
          <div className="mt-4 grid grid-cols-2 gap-2"><RoleStat icon={<Swords className="size-3.5" />} label="Attacking" counts={subject.counts.attack} /><RoleStat icon={<Shield className="size-3.5" />} label="Defending" counts={subject.counts.defense} /></div>
        </div>
        <div className="border border-border/70 bg-background/50 p-3"><div className="mb-3 text-[10px] uppercase tracking-wider text-muted-foreground">Roll distribution</div><FaceChart counts={combined} tall color={subject.color} /></div>
      </div>
    </div>
  );
}

function GameLuckDialog({ open, onOpenChange, players, teamMode, teamNames }: { open: boolean; onOpenChange: (open: boolean) => void; players: GameLuckPlayer[]; teamMode: boolean; teamNames?: Record<string, string> }) {
  const [luckMetric, setLuckMetric] = useState<"dice" | "combat">("combat");
  const [comparisonMode, setComparisonMode] = useState<"individual" | "teams">("individual");
  const [transitionTarget, setTransitionTarget] = useState<"individual" | "teams" | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const playerSubjects = useMemo(() => players.filter((player) => player.counts).map((player) => toSubject(player.id, player.name, player.color, player.counts!, player.combat ?? createEmptyCombatLuckStats(), luckMetric, player.teamId)), [players, luckMetric]);
  const teamSubjects = useMemo(() => [...new Set(players.map((player) => player.teamId).filter((id): id is string => !!id))].map((id, index) => {
    const members = players.filter((player) => player.teamId === id);
    return toSubject(toTeamLuckSubjectId(id), teamNames?.[id] ?? id, members[0]?.color ?? `hsl(${index * 137} 65% 55%)`, aggregateCounts(members), aggregateCombat(members), luckMetric);
  }), [players, teamNames, luckMetric]);
  const allSubjects = teamMode ? [...playerSubjects, ...teamSubjects] : playerSubjects;
  const resolvedSelectedId = allSubjects.some((subject) => subject.id === selectedId) ? selectedId : playerSubjects[0]?.id ?? teamSubjects[0]?.id ?? "";
  const presentation = resolveLuckComparisonPresentation({ comparisonMode, transitionTarget, selectedId: resolvedSelectedId, players: playerSubjects });
  const selected = allSubjects.find((subject) => subject.id === presentation.selectedId);
  const changeComparisonMode = (next: "individual" | "teams") => {
    if (next === comparisonMode || transitionTarget) return;
    setTransitionTarget(next);
  };
  const completeComparisonTransition = useCallback(() => {
    if (!transitionTarget) return;
    setSelectedId(presentation.selectedId);
    setComparisonMode(transitionTarget);
    setTransitionTarget(null);
  }, [presentation.selectedId, transitionTarget]);
  const activeMode = transitionTarget ?? comparisonMode;
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setTransitionTarget(null);
    onOpenChange(nextOpen);
  };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-[2px]" onClick={(event) => event.stopPropagation()} /><DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[61] max-h-[90vh] w-[min(48rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-border bg-background p-5 shadow-2xl outline-none" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-4"><DialogPrimitive.Title className="text-lg font-semibold">Game luck</DialogPrimitive.Title><div className="flex items-center gap-2">{teamMode && teamSubjects.length > 0 && <div className="flex rounded-md bg-muted p-0.5 text-[10px] font-semibold"><button type="button" disabled={transitionTarget !== null} onClick={() => changeComparisonMode("individual")} className={`rounded px-2.5 py-1 transition ${activeMode === "individual" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>Players</button><button type="button" disabled={transitionTarget !== null} onClick={() => changeComparisonMode("teams")} className={`rounded px-2.5 py-1 transition ${activeMode === "teams" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>Teams</button></div>}<DialogPrimitive.Close className="p-1.5 text-muted-foreground hover:text-foreground" aria-label="Close"><X className="size-4" /></DialogPrimitive.Close></div></div><DialogPrimitive.Description className="sr-only">Luck across the game</DialogPrimitive.Description>
      <div className="mt-4 flex w-fit rounded-md bg-muted p-0.5 text-[10px] font-semibold"><button type="button" onClick={() => setLuckMetric("combat")} className={`rounded px-3 py-1.5 ${luckMetric === "combat" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>Combat luck</button><button type="button" onClick={() => setLuckMetric("dice")} className={`rounded px-3 py-1.5 ${luckMetric === "dice" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>Dice luck</button></div>
      {allSubjects.length === 0 ? <div className="py-16 text-center text-sm text-muted-foreground">No combat rolls yet.</div> : <><div className="mt-5"><LuckComparisonField players={playerSubjects} teams={teamSubjects} metric={luckMetric} mode={presentation.mode} transitionTarget={transitionTarget} selectedId={presentation.selectedId} onSelect={setSelectedId} onTransitionComplete={completeComparisonTransition} /></div>{selected && <div className="mt-5 border-t pt-5"><SubjectDetail key={`${selected.id}:${luckMetric}`} subject={selected} metric={luckMetric} /></div>}</>}
    </DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>
  );
}

interface GameLuckButtonProps { players: GameLuckPlayer[]; teamMode: boolean; teamNames?: Record<string, string>; }

export function GameLuckButton({ players, teamMode, teamNames }: GameLuckButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  return <><Button type="button" size="icon-sm" variant="outline" aria-label="Open game luck" title="Game luck" onClick={() => setDialogOpen(true)} className="enabled:cursor-pointer"><Dices className="size-4" aria-hidden="true" /></Button><GameLuckDialog open={dialogOpen} onOpenChange={setDialogOpen} players={players} teamMode={teamMode} teamNames={teamNames} /></>;
}
