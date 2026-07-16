import { Dices, Shield, Swords, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
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

const FACE_KEYS = ["ones", "twos", "threes", "fours", "fives", "sixes"] as const;

export interface LuckPlayer {
  id: string;
  name: string;
  color: string;
  teamId?: string | null;
  counts?: DiceRollCounts | null;
}

interface LuckSubject {
  id: string;
  name: string;
  color: string;
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

function toSubject(id: string, name: string, color: string, counts: DiceRollCounts): LuckSubject {
  const summary = summarizeDieFaceCounts(combineDieFaceCounts(counts.attack, counts.defense));
  return { id, name, color, counts, diceCount: summary.diceCount, deviation: summary.average === null ? null : summary.average - 3.5 };
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

function FaceChart({ counts, tall = false }: { counts: DieFaceCounts; tall?: boolean }) {
  const values = FACE_KEYS.map((key) => counts[key]);
  const total = values.reduce((sum, value) => sum + value, 0);
  const max = Math.max(...values, 1);
  const expected = total / 6;
  return (
    <div className="grid grid-cols-6 gap-1.5" aria-label="Rolls by die face">
      {values.map((count, index) => (
        <div key={index} className="flex min-w-0 flex-col items-center gap-1">
          <div className={`relative flex w-full items-end bg-muted/70 ${tall ? "h-20" : "h-10"}`}>
            {total > 0 && <span className="absolute inset-x-0 z-10 border-t border-dashed border-muted-foreground/45" style={{ bottom: `${(expected / max) * 100}%` }} />}
            <span className="w-full origin-bottom animate-[dice-bar-rise_420ms_cubic-bezier(0.22,1,0.36,1)_both] bg-primary/80 motion-reduce:animate-none" style={{ height: total === 0 ? 0 : `${Math.max((count / max) * 100, 3)}%` }} title={`${count} rolls`} />
          </div>
          <span className="text-[10px] font-semibold text-muted-foreground">{index + 1}</span>
          {tall && <span className="text-[10px] tabular-nums">{count}</span>}
        </div>
      ))}
    </div>
  );
}

function LuckMeter({ deviation }: { deviation: number }) {
  const position = Math.max(0, Math.min(100, ((deviation + 2.5) / 5) * 100));
  return <div><div className="relative h-1.5 bg-gradient-to-r from-rose-500/60 via-muted-foreground/30 to-emerald-500/60"><span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-popover bg-foreground shadow-[0_0_0_3px_color-mix(in_oklab,var(--foreground),transparent_82%)] transition-[left] duration-500 motion-reduce:transition-none" style={{ left: `${position}%` }} /><span className="absolute left-1/2 top-1/2 h-3 -translate-x-1/2 -translate-y-1/2 border-l border-foreground/50" /></div><div className="mt-1.5 flex justify-between text-[9px] uppercase tracking-wider text-muted-foreground"><span>Unlucky</span><span>0</span><span>Lucky</span></div></div>;
}

function RoleStat({ icon, label, counts }: { icon: React.ReactNode; label: string; counts: DieFaceCounts }) {
  const summary = summarizeDieFaceCounts(counts);
  const deviation = summary.average === null ? null : summary.average - 3.5;
  return <div className="border border-border/70 bg-background/50 p-3"><div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">{icon}{label}</div><div className="mt-2 flex items-end justify-between"><span className="text-xl font-semibold tabular-nums" style={deviation === null ? undefined : luckScoreStyle(deviation)}>{deviation === null ? "—" : formatLuckScore(deviation)}</span><span className="text-[10px] tabular-nums text-muted-foreground">{summary.diceCount} dice</span></div></div>;
}

function LuckField({ subjects, selectedId, onSelect }: { subjects: LuckSubject[]; selectedId: string; onSelect: (id: string) => void }) {
  const measured = subjects.filter((subject) => subject.deviation !== null);
  const furthest = Math.max(0.5, ...measured.map((subject) => Math.abs(subject.deviation!)));
  const domain = Math.min(2.5, Math.ceil(furthest * 4) / 4);
  return (
    <div>
      <div className="relative h-32 border-x border-border/50 bg-gradient-to-r from-rose-500/8 via-transparent to-emerald-500/8">
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        <div className="absolute bottom-0 top-0 left-1/2 border-l border-dashed border-foreground/35" />
        {measured.map((subject, index) => {
          const left = ((subject.deviation! + domain) / (domain * 2)) * 100;
          const selected = subject.id === selectedId;
          return <button key={subject.id} type="button" title={`${subject.name}: ${formatLuckScore(subject.deviation!)}`} aria-label={`Select ${subject.name}, luck ${formatLuckScore(subject.deviation!)}`} onClick={() => onSelect(subject.id)} className={`absolute top-1/2 size-4 -translate-x-1/2 rounded-full border-2 border-background shadow-lg transition-[left,transform,box-shadow] duration-500 hover:scale-125 focus-visible:outline-2 focus-visible:outline-primary ${selected ? "z-10 scale-125 ring-2 ring-foreground/50 ring-offset-2 ring-offset-background" : ""}`} style={{ left: `${Math.max(2, Math.min(98, left))}%`, marginTop: `${((index % 3) - 1) * 13 - 8}px`, backgroundColor: subject.color }} />;
        })}
        <span className="absolute bottom-2 left-2 text-[9px] uppercase tracking-wider text-rose-400/80">Less lucky</span>
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] tabular-nums text-muted-foreground">0</span>
        <span className="absolute bottom-2 right-2 text-[9px] uppercase tracking-wider text-emerald-400/80">More lucky</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[...subjects].sort((a, b) => (b.deviation ?? -99) - (a.deviation ?? -99)).map((subject) => <button key={subject.id} type="button" onClick={() => onSelect(subject.id)} className={`flex items-center gap-1.5 border px-2 py-1 text-[10px] transition ${subject.id === selectedId ? "border-foreground/60 bg-muted text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground"}`}><span className="size-2 rounded-full" style={{ backgroundColor: subject.color }} /><span className="max-w-28 truncate">{subject.name}</span><span className="tabular-nums" style={subject.deviation === null ? undefined : luckScoreStyle(subject.deviation)}>{subject.deviation === null ? "—" : formatLuckScore(subject.deviation)}</span></button>)}
      </div>
    </div>
  );
}

function GameLuckDialog({ open, onOpenChange, players, teamMode, teamNames }: { open: boolean; onOpenChange: (open: boolean) => void; players: LuckPlayer[]; teamMode: boolean; teamNames?: Record<string, string> }) {
  const [view, setView] = useState<"players" | "teams">("players");
  const playerSubjects = useMemo(() => players.filter((player) => player.counts).map((player) => toSubject(player.id, player.name, player.color, player.counts!)), [players]);
  const teamSubjects = useMemo(() => {
    const ids = [...new Set(players.map((player) => player.teamId).filter((id): id is string => !!id))];
    return ids.map((id, index) => { const members = players.filter((player) => player.teamId === id); return toSubject(id, teamNames?.[id] ?? id, members[0]?.color ?? `hsl(${index * 137} 65% 55%)`, aggregateCounts(members)); });
  }, [players, teamNames]);
  const subjects = view === "teams" ? teamSubjects : playerSubjects;
  const [selectedByView, setSelectedByView] = useState<Record<string, string>>({});
  const selectedId = subjects.some((subject) => subject.id === selectedByView[view]) ? selectedByView[view]! : subjects[0]?.id ?? "";
  const selected = subjects.find((subject) => subject.id === selectedId);
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" /><DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[61] max-h-[90vh] w-[min(46rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-border bg-background p-5 shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
    <div className="flex items-start justify-between gap-4"><div><DialogPrimitive.Title className="text-lg font-semibold">Game luck</DialogPrimitive.Title><DialogPrimitive.Description className="sr-only">Luck statistics for every player and team in the game</DialogPrimitive.Description></div><DialogPrimitive.Close className="p-1.5 text-muted-foreground hover:text-foreground" aria-label="Close"><X className="size-4" /></DialogPrimitive.Close></div>
    {teamMode && <div className="mt-4 inline-flex border border-border p-0.5 text-[10px] font-semibold tracking-wider">{(["players", "teams"] as const).map((option) => <button key={option} type="button" className={`px-3 py-1.5 transition ${view === option ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setView(option)}>{option === "players" ? "Players" : "Teams"}</button>)}</div>}
    {subjects.length === 0 ? <div className="mt-8 py-12 text-center text-sm text-muted-foreground">No dice have been rolled yet.</div> : <><div className="mt-5"><LuckField subjects={subjects} selectedId={selectedId} onSelect={(id) => setSelectedByView((current) => ({ ...current, [view]: id }))} /></div>{selected && <div className="mt-5 grid gap-4 border-t pt-5 md:grid-cols-[1fr_1.25fr]"><div><div className="flex items-start justify-between"><div><div className="flex items-center gap-2 text-sm font-semibold"><span className="size-2.5 rounded-full" style={{ backgroundColor: selected.color }} />{selected.name}</div><div className={`mt-1 text-xs ${selected.deviation === null ? "text-muted-foreground" : getLuckLabel(selected.deviation, selected.diceCount).tone}`}>{selected.deviation === null ? "No rolls" : getLuckLabel(selected.deviation, selected.diceCount).label}</div></div><div className="text-right"><div className="text-2xl font-semibold tabular-nums" style={selected.deviation === null ? undefined : luckScoreStyle(selected.deviation)}>{selected.deviation === null ? "—" : formatLuckScore(selected.deviation)}</div><div className="text-[9px] uppercase tracking-wider text-muted-foreground">{selected.diceCount} dice</div></div></div><div className="mt-4 grid grid-cols-2 gap-2"><RoleStat icon={<Swords className="size-3.5" />} label="Attacking" counts={selected.counts.attack} /><RoleStat icon={<Shield className="size-3.5" />} label="Defending" counts={selected.counts.defense} /></div></div><div className="border border-border/70 bg-background/50 p-3"><div className="mb-3 text-[10px] uppercase tracking-wider text-muted-foreground">Roll distribution</div><FaceChart counts={combineDieFaceCounts(selected.counts.attack, selected.counts.defense)} tall /></div></div>}</>}</DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>;
}

interface DiceLuckPopoverProps { counts: DiceRollCounts | null | undefined; players: LuckPlayer[]; teamMode: boolean; teamNames?: Record<string, string>; }

export function DiceLuckPopover({ counts, players, teamMode, teamNames }: DiceLuckPopoverProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const combined = counts ? combineDieFaceCounts(counts.attack, counts.defense) : null;
  const summary = combined ? summarizeDieFaceCounts(combined) : null;
  const deviation = summary?.average === null || summary?.average === undefined ? null : summary.average - 3.5;
  const luck = deviation === null || !summary ? null : getLuckLabel(deviation, summary.diceCount);
  return <><Popover open={popoverOpen} onOpenChange={setPopoverOpen}><PopoverTrigger asChild><Button type="button" size="icon-xs" variant="ghost" aria-label="View your dice luck" title="Your dice luck" className="text-muted-foreground hover:text-foreground" onClick={(event) => event.stopPropagation()}><Dices className="size-3.5" /></Button></PopoverTrigger><PopoverContent align="start" className="w-80 p-4" onClick={(event) => event.stopPropagation()}>{!counts ? <div className="text-xs text-muted-foreground">Luck data unavailable</div> : !summary || summary.diceCount === 0 || !combined || !luck || deviation === null ? <div className="text-xs text-muted-foreground">No dice rolled yet</div> : <div className="space-y-4"><div className="flex items-start justify-between gap-4"><div className={`text-base font-semibold ${luck.tone}`}>{luck.label}</div><div className="text-right"><div className="text-2xl font-semibold tabular-nums" style={luckScoreStyle(deviation)}>{formatLuckScore(deviation)}</div><div className="text-[9px] uppercase tracking-wider text-muted-foreground">{summary.diceCount} dice</div></div></div><LuckMeter deviation={deviation} /><div className="border-t pt-3"><FaceChart counts={combined} /></div><button type="button" className="flex w-full items-center justify-center gap-2 border-t pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition hover:text-foreground" onClick={() => { setPopoverOpen(false); setDialogOpen(true); }}><Users className="size-3.5" />View game luck</button></div>}</PopoverContent></Popover><GameLuckDialog open={dialogOpen} onOpenChange={setDialogOpen} players={players} teamMode={teamMode} teamNames={teamNames} /></>;
}
