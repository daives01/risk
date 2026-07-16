import { Dices, Shield, Swords, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  combineDieFaceCounts,
  createEmptyDiceRollCounts,
  summarizeDieFaceCounts,
  type DiceRollCounts,
  type DieFaceCounts,
} from "risk-engine";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  fromTeamLuckSubjectId,
  resolveLuckComparisonPresentation,
  toTeamLuckSubjectId,
  type TeamLuckSubjectId,
} from "@/lib/game/luck-comparison-transition";
import { assignLuckLabelRows } from "@/lib/game/luck-comparison-layout";

const FACE_KEYS = ["ones", "twos", "threes", "fours", "fives", "sixes"] as const;

export interface LuckPlayer {
  id: string;
  name: string;
  color: string;
  teamId?: string | null;
  counts?: DiceRollCounts | null;
}

interface LuckSubject extends LuckPlayer {
  counts: DiceRollCounts;
  diceCount: number;
  deviation: number | null;
}

function getLuckLabel(deviation: number, diceCount: number) {
  const noise = 1.7 / Math.sqrt(Math.max(diceCount, 1));
  if (Math.abs(deviation) < noise * 0.45) return { label: "About even", tone: "text-foreground" };
  if (deviation > noise * 1.35) return { label: "Very lucky", tone: "text-emerald-400" };
  if (deviation > 0) return { label: "A little lucky", tone: "text-emerald-400" };
  if (deviation < -noise * 1.35) return { label: "Very unlucky", tone: "text-rose-400" };
  return { label: "A little unlucky", tone: "text-rose-400" };
}

function formatLuckScore(deviation: number) {
  const rounded = Number(deviation.toFixed(2));
  if (rounded === 0) return "0.00";
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)}`;
}

function luckScoreStyle(deviation: number) {
  const rounded = Number(deviation.toFixed(2));
  if (rounded === 0) return { color: "var(--foreground)" };
  const strength = Math.round(22 + Math.min(Math.abs(rounded) / 1.25, 1) * 78);
  const target = rounded > 0 ? "#34d399" : "#fb7185";
  return { color: `color-mix(in oklab, var(--foreground), ${target} ${strength}%)` };
}

function summarize(counts: DieFaceCounts) {
  const summary = summarizeDieFaceCounts(counts);
  return { ...summary, deviation: summary.average === null ? null : summary.average - 3.5 };
}

function toSubject(id: string, name: string, color: string, counts: DiceRollCounts, teamId?: string | null): LuckSubject {
  const summary = summarize(combineDieFaceCounts(counts.attack, counts.defense));
  return { id, name, color, counts, teamId, diceCount: summary.diceCount, deviation: summary.deviation };
}

function aggregateCounts(players: LuckPlayer[]) {
  return players.reduce((total, player) => {
    if (!player.counts) return total;
    return {
      attack: combineDieFaceCounts(total.attack, player.counts.attack),
      defense: combineDieFaceCounts(total.defense, player.counts.defense),
    };
  }, createEmptyDiceRollCounts());
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

function LuckMeter({ deviation, color }: { deviation: number; color: string }) {
  const position = Math.max(0, Math.min(100, ((deviation + 2.5) / 5) * 100));
  return (
    <div>
      <div className="relative h-1.5 rounded-full bg-foreground/15">
        <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-popover shadow-[0_0_0_3px_color-mix(in_oklab,var(--foreground),transparent_82%)]" style={{ left: `${position}%`, backgroundColor: color }} />
        <span className="absolute left-1/2 top-1/2 h-3 -translate-x-1/2 -translate-y-1/2 border-l border-foreground/50" />
      </div>
      <div className="mt-1.5 flex justify-between text-[9px] uppercase tracking-wider text-muted-foreground"><span>Below</span><span>3.50</span><span>Above</span></div>
    </div>
  );
}

function RoleStat({ icon, label, counts }: { icon: React.ReactNode; label: string; counts: DieFaceCounts }) {
  const summary = summarize(counts);
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

interface TransitionDot {
  id: string;
  color: string;
  startLeft: number;
  startTop: number;
  endLeft: number;
  endTop: number;
}

function MergeTransition({ dots, merging, onComplete }: { dots: TransitionDot[]; merging: boolean; onComplete: () => void }) {
  const layerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onComplete();
      return;
    }
    let cancelled = false;
    const animations = [...layer.querySelectorAll<HTMLElement>("[data-transition-dot]")].map((element, index) => {
      const dot = dots[index]!;
      const dx = ((dot.endLeft - dot.startLeft) / 100) * layer.clientWidth;
      const dy = ((dot.endTop - dot.startTop) / 100) * layer.clientHeight;
      return element.animate([
        { transform: "translate3d(-50%, -50%, 0)", opacity: merging ? 1 : 0.2 },
        { transform: `translate3d(calc(-50% + ${dx}px), calc(-50% + ${dy}px), 0)`, opacity: merging ? 0.2 : 1 },
      ], { duration: 360, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "forwards" });
    });
    Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(() => {
      if (!cancelled) onComplete();
    });
    return () => {
      cancelled = true;
      animations.forEach((animation) => animation.cancel());
    };
  }, [dots, merging, onComplete]);
  return <div ref={layerRef} className="pointer-events-none absolute inset-0 z-30">{dots.map((dot) => <span key={dot.id} data-transition-dot className="absolute size-4 rounded-full border-2 border-background shadow-md [will-change:transform,opacity]" style={{ left: `${dot.startLeft}%`, top: `${dot.startTop}%`, backgroundColor: dot.color }} />)}</div>;
}

function LuckComparisonField({ players, teams, mode, transitionTarget, selectedId, onSelect, onTransitionComplete }: { players: LuckSubject[]; teams: LuckSubject[]; mode: "individual" | "teams"; transitionTarget: "individual" | "teams" | null; selectedId: string; onSelect: (id: string) => void; onTransitionComplete: () => void }) {
  const layout = useMemo(() => {
    const measured = [...players, ...teams].filter((subject) => subject.deviation !== null);
    const furthest = Math.max(0.5, ...measured.map((subject) => Math.abs(subject.deviation!)));
    const domain = Math.min(2.5, Math.ceil(furthest * 4) / 4);
    const positioned = players.filter((player) => player.deviation !== null).map((player) => {
      return { player, left: Math.max(5, Math.min(95, ((player.deviation! + domain) / (domain * 2)) * 100)) };
    });
    const rows = new Map<string, number>();
    [...positioned].sort((a, b) => a.left - b.left).forEach((item, index, sorted) => {
      const nearby = sorted.slice(0, index).filter((previous) => item.left - previous.left < 18);
      const used = new Set(nearby.map((previous) => rows.get(previous.player.id) ?? 0));
      rows.set(item.player.id, [0, 1, 2].find((row) => !used.has(row)) ?? index % 3);
    });
    const teamPositions = teams.filter((team) => team.deviation !== null).map((team) => {
      const teamId = fromTeamLuckSubjectId(team.id as TeamLuckSubjectId);
      const members = positioned.filter(({ player }) => player.teamId === teamId);
      const left = Math.max(5, Math.min(95, ((team.deviation! + domain) / (domain * 2)) * 100));
      const colors = members.map(({ player }) => player.color);
      return { team, left, colors };
    });
    const teamLabelRows = assignLuckLabelRows(teamPositions.map(({ team, left }) => ({ id: team.id, left })));
    return { positioned, rows, teamPositions, teamLabelRows };
  }, [players, teams]);
  const transitionDots = useMemo<TransitionDot[]>(() => {
    if (!transitionTarget) return [];
    const teamsById = new Map(layout.teamPositions.map((position) => [fromTeamLuckSubjectId(position.team.id as TeamLuckSubjectId), position]));
    return layout.positioned.flatMap(({ player, left }) => {
      const team = player.teamId ? teamsById.get(player.teamId) : undefined;
      if (!team) return [];
      const row = layout.rows.get(player.id) ?? 0;
      const playerTop = 25 + row * 30;
      const merging = transitionTarget === "teams";
      return [{ id: player.id, color: player.color, startLeft: merging ? left : team.left, startTop: merging ? playerTop : 58, endLeft: merging ? team.left : left, endTop: merging ? 58 : playerTop }];
    });
  }, [layout, transitionTarget]);
  const transitioning = transitionTarget !== null;
  const destinationClass = transitioning
    ? "animate-[luck-destination-reveal_360ms_ease-out_both] motion-reduce:animate-none"
    : "";
  return (
    <div className="relative h-44 overflow-hidden border border-border/60 bg-muted/20 [contain:layout_paint]">
      <div className="absolute inset-x-4 top-[58%] h-1 -translate-y-1/2 rounded-full bg-foreground/15" />
      {[25, 50, 75].map((left) => <div key={left} className="absolute bottom-0 top-0 border-l border-dashed border-border/70" style={{ left: `${left}%` }} />)}
      {mode === "individual" && layout.positioned.map(({ player, left }) => {
        const row = layout.rows.get(player.id) ?? 0;
        return <button key={player.id} type="button" onClick={() => onSelect(player.id)} className={`absolute z-10 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-md ${destinationClass} ${selectedId === player.id ? "ring-2 ring-foreground/50 ring-offset-2 ring-offset-background" : ""}`} style={{ left: `${left}%`, top: `${25 + row * 30}%`, backgroundColor: player.color }} aria-label={`Select ${player.name}`} />;
      })}
      {mode === "individual" && layout.positioned.map(({ player, left }) => {
        const row = layout.rows.get(player.id) ?? 0;
        return <span key={`label:${player.id}`} className={`pointer-events-none absolute z-20 max-w-28 -translate-x-1/2 truncate rounded-sm bg-background/90 px-1.5 py-0.5 text-[10px] font-medium shadow-sm ${destinationClass}`} style={{ left: `${left}%`, top: `${8 + row * 30}%` }} title={player.name}>{player.name}</span>;
      })}
      {mode === "teams" && layout.teamPositions.map(({ team, left, colors }) => {
        const stops = colors.map((color, index) => `${color} ${(index / colors.length) * 100}% ${((index + 1) / colors.length) * 100}%`).join(", ");
        return <button key={team.id} type="button" onClick={() => onSelect(team.id)} className={`absolute top-[58%] z-20 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-md ${destinationClass} ${selectedId === team.id ? "ring-2 ring-foreground/50 ring-offset-2 ring-offset-background" : ""}`} style={{ left: `${left}%`, background: colors.length > 1 ? `conic-gradient(${stops})` : colors[0] ?? team.color }} aria-label={`Select ${team.name}`} />;
      })}
      {mode === "teams" && layout.teamPositions.map(({ team, left }) => {
        const row = layout.teamLabelRows.get(team.id) ?? 0;
        return <span key={`label:${team.id}`} className={`pointer-events-none absolute z-20 max-w-32 -translate-x-1/2 rounded-sm bg-background/90 px-2 py-1 text-[10px] font-semibold shadow-sm ${destinationClass}`} style={{ left: `${left}%`, top: `${17 + row * 24}%` }}>{team.name}</span>;
      })}
      {transitioning && <MergeTransition dots={transitionDots} merging={transitionTarget === "teams"} onComplete={onTransitionComplete} />}
      <span className="absolute bottom-2 left-3 text-[9px] uppercase tracking-wider text-muted-foreground">Below</span><span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-foreground/70">3.50</span><span className="absolute bottom-2 right-3 text-[9px] uppercase tracking-wider text-muted-foreground">Above</span>
    </div>
  );
}

function SubjectDetail({ subject }: { subject: LuckSubject }) {
  const combined = combineDieFaceCounts(subject.counts.attack, subject.counts.defense);
  const label = subject.deviation === null ? null : getLuckLabel(subject.deviation, subject.diceCount);
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_1.25fr]">
      <div>
        <div className="flex items-start justify-between"><div><div className="flex items-center gap-2 text-sm font-semibold"><span className="size-2.5 rounded-full" style={{ backgroundColor: subject.color }} />{subject.name}</div><div className={`mt-1 text-xs ${label?.tone ?? "text-muted-foreground"}`}>{label?.label ?? "No rolls"}</div></div><div className="text-right"><div className="text-2xl font-semibold tabular-nums" style={subject.deviation === null ? undefined : luckScoreStyle(subject.deviation)}>{subject.deviation === null ? "—" : formatLuckScore(subject.deviation)}</div><div className="text-[9px] uppercase tracking-wider text-muted-foreground">{subject.diceCount} dice</div></div></div>
        <div className="mt-4 grid grid-cols-2 gap-2"><RoleStat icon={<Swords className="size-3.5" />} label="Attacking" counts={subject.counts.attack} /><RoleStat icon={<Shield className="size-3.5" />} label="Defending" counts={subject.counts.defense} /></div>
      </div>
      <div className="border border-border/70 bg-background/50 p-3"><div className="mb-3 text-[10px] uppercase tracking-wider text-muted-foreground">Roll distribution</div><FaceChart counts={combined} tall color={subject.color} /></div>
    </div>
  );
}

function GameLuckDialog({ open, onOpenChange, players, teamMode, teamNames }: { open: boolean; onOpenChange: (open: boolean) => void; players: LuckPlayer[]; teamMode: boolean; teamNames?: Record<string, string> }) {
  const [comparisonMode, setComparisonMode] = useState<"individual" | "teams">("individual");
  const [transitionTarget, setTransitionTarget] = useState<"individual" | "teams" | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const playerSubjects = useMemo(() => players.filter((player) => player.counts).map((player) => toSubject(player.id, player.name, player.color, player.counts!, player.teamId)), [players]);
  const teamSubjects = useMemo(() => [...new Set(players.map((player) => player.teamId).filter((id): id is string => !!id))].map((id, index) => {
    const members = players.filter((player) => player.teamId === id);
    return toSubject(toTeamLuckSubjectId(id), teamNames?.[id] ?? id, members[0]?.color ?? `hsl(${index * 137} 65% 55%)`, aggregateCounts(members));
  }), [players, teamNames]);
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
      <div className="flex items-center justify-between gap-4"><DialogPrimitive.Title className="text-lg font-semibold">Game luck</DialogPrimitive.Title><div className="flex items-center gap-2">{teamMode && teamSubjects.length > 0 && <div className="flex rounded-md bg-muted p-0.5 text-[10px] font-semibold"><button type="button" disabled={transitionTarget !== null} onClick={() => changeComparisonMode("individual")} className={`rounded px-2.5 py-1 transition ${activeMode === "individual" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>Players</button><button type="button" disabled={transitionTarget !== null} onClick={() => changeComparisonMode("teams")} className={`rounded px-2.5 py-1 transition ${activeMode === "teams" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>Teams</button></div>}<DialogPrimitive.Close className="p-1.5 text-muted-foreground hover:text-foreground" aria-label="Close"><X className="size-4" /></DialogPrimitive.Close></div></div><DialogPrimitive.Description className="sr-only">Dice luck across the game</DialogPrimitive.Description>
      {allSubjects.length === 0 ? <div className="py-16 text-center text-sm text-muted-foreground">No dice have been rolled yet.</div> : <><div className="mt-5"><LuckComparisonField players={playerSubjects} teams={teamSubjects} mode={presentation.mode} transitionTarget={transitionTarget} selectedId={presentation.selectedId} onSelect={setSelectedId} onTransitionComplete={completeComparisonTransition} /></div>{selected && <div className="mt-5 border-t pt-5"><SubjectDetail subject={selected} /></div>}</>}
    </DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>
  );
}

function PersonalLuck({ counts, combined, deviation, diceCount, color }: { counts: DiceRollCounts; combined: DieFaceCounts; deviation: number; diceCount: number; color: string }) {
  const luck = getLuckLabel(deviation, diceCount);
  return <div><div className="flex items-start justify-between gap-4"><div className={`text-base font-semibold ${luck.tone}`}>{luck.label}</div><div className="text-right"><div className="text-2xl font-semibold tabular-nums" style={luckScoreStyle(deviation)}>{formatLuckScore(deviation)}</div><div className="text-[9px] uppercase tracking-wider text-muted-foreground">{diceCount} dice</div></div></div><div className="mt-4"><LuckMeter deviation={deviation} color={color} /></div><div className="mt-4 border-t pt-3"><FaceChart counts={combined} color={color} /></div><div className="mt-4 grid grid-cols-2 gap-2"><RoleStat icon={<Swords className="size-3" />} label="Attack" counts={counts.attack} /><RoleStat icon={<Shield className="size-3" />} label="Defense" counts={counts.defense} /></div></div>;
}

interface DiceLuckPopoverProps { counts: DiceRollCounts | null | undefined; color: string; players: LuckPlayer[]; teamMode: boolean; teamNames?: Record<string, string>; }

export function DiceLuckPopover({ counts, color, players, teamMode, teamNames }: DiceLuckPopoverProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const combined = counts ? combineDieFaceCounts(counts.attack, counts.defense) : null;
  const summary = combined ? summarize(combined) : null;
  return <><Popover open={popoverOpen} onOpenChange={setPopoverOpen}><PopoverTrigger asChild><Button type="button" size="icon-xs" variant="ghost" aria-label="View your dice luck" title="Your dice luck" className="text-muted-foreground hover:text-foreground" onClick={(event) => event.stopPropagation()}><Dices className="size-3.5" /></Button></PopoverTrigger><PopoverContent align="start" className="w-80 p-4" onClick={(event) => event.stopPropagation()}>{!counts ? <div className="text-xs text-muted-foreground">Luck data unavailable</div> : !summary || summary.diceCount === 0 || !combined || summary.deviation === null ? <div className="text-xs text-muted-foreground">No dice rolled yet</div> : <><PersonalLuck counts={counts} combined={combined} deviation={summary.deviation} diceCount={summary.diceCount} color={color} /><button type="button" className="mt-4 flex w-full items-center justify-center gap-2 border-t pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition hover:text-foreground" onClick={() => { setPopoverOpen(false); setDialogOpen(true); }}><Users className="size-3.5" />View game luck</button></>}</PopoverContent></Popover><GameLuckDialog open={dialogOpen} onOpenChange={setDialogOpen} players={players} teamMode={teamMode} teamNames={teamNames} /></>;
}
