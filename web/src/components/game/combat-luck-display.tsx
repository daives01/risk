import { Shield, Swords } from "lucide-react";
import { combatLuckScore, type CombatLuckStats } from "risk-engine";
import { formatLuckScore, luckScoreStyle } from "./luck-score-presentation";

function CombatOutcomeTrack({ label, actual, expected, goodWhenHigher }: { label: string; actual: number; expected: number; goodWhenHigher: boolean }) {
  const max = Math.max(actual, expected, 1);
  const expectedLeft = (expected / max) * 88 + 6;
  const actualLeft = (actual / max) * 88 + 6;
  const favorable = goodWhenHigher ? actual >= expected : actual <= expected;
  const dotStyle = {
    left: `${actualLeft}%`,
    "--combat-expected-left": `${expectedLeft}%`,
    "--combat-actual-left": `${actualLeft}%`,
  } as React.CSSProperties;
  return <div><div className="mb-1 flex justify-between text-[10px]"><span className="text-muted-foreground">{label}</span><span className={favorable ? "text-emerald-400" : "text-rose-400"}>{actual} <span className="text-muted-foreground">/ {expected.toFixed(1)}</span></span></div><div className="relative h-4" aria-label={`${label}: ${actual} actual, ${expected.toFixed(1)} expected`}><div className="absolute inset-x-0 top-1/2 h-px bg-border" /><div className="absolute top-1/2 h-0.5 bg-foreground/25" style={{ left: `${Math.min(expectedLeft, actualLeft)}%`, width: `${Math.abs(actualLeft - expectedLeft)}%` }} /><div className="absolute top-0 h-4 border-l border-dashed border-foreground/60" style={{ left: `${expectedLeft}%` }} title="Expected" /><div className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 animate-[combat-outcome-dot-travel_520ms_cubic-bezier(0.22,1,0.36,1)_both] rounded-full motion-reduce:animate-none ${favorable ? "bg-emerald-400" : "bg-rose-400"}`} style={dotStyle} title="Actual" /></div></div>;
}

function CombatRoleStat({ icon, label, stats }: { icon: React.ReactNode; label: string; stats: CombatLuckStats["attack"] }) {
  const score = combatLuckScore(stats);
  return <div className="border border-border/70 bg-background/50 p-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">{icon}{label}<span className="tabular-nums opacity-70">×{stats.battles}</span></div><span className="text-lg font-semibold tabular-nums" style={luckScoreStyle(score)}>{formatLuckScore(score)}</span></div><div className="mt-3 space-y-2"><CombatOutcomeTrack label="Lost" actual={stats.actualOwnLosses} expected={stats.expectedOwnLosses} goodWhenHigher={false} /><CombatOutcomeTrack label="Inflicted" actual={stats.actualEnemyLosses} expected={stats.expectedEnemyLosses} goodWhenHigher /></div></div>;
}

export function CombatLuckDetail({ name, color, score, combat }: { name: string; color: string; score: number | null; combat: CombatLuckStats }) {
  return <div><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-semibold"><span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />{name}</div><div className="text-2xl font-semibold tabular-nums" style={score === null ? undefined : luckScoreStyle(score)}>{score === null ? "—" : formatLuckScore(score)}</div></div><div className="mt-4 grid gap-2 md:grid-cols-2"><CombatRoleStat icon={<Swords className="size-3.5" />} label="Attack" stats={combat.attack} /><CombatRoleStat icon={<Shield className="size-3.5" />} label="Defense" stats={combat.defense} /></div></div>;
}

function CombatDeltaBar({ icon, label, score, battles }: { icon: React.ReactNode; label: string; score: number; battles: number }) {
  const width = Math.min(48, Math.abs(score) * 10);
  return <div title={`${label}: ${formatLuckScore(score)} across ${battles} battles`}><div className="mb-1.5 flex justify-between text-[10px]"><span className="flex items-center gap-1.5 text-muted-foreground">{icon}{label}<span className="tabular-nums opacity-60">×{battles}</span></span><span style={luckScoreStyle(score)}>{formatLuckScore(score)}</span></div><div className="relative h-3 overflow-hidden rounded-full bg-muted"><div className="absolute inset-y-0 left-1/2 w-px bg-foreground/50" /><div className={`absolute inset-y-0 ${score >= 0 ? "left-1/2 bg-emerald-400/80" : "right-1/2 bg-rose-400/80"}`} style={{ width: `${width}%` }} /></div></div>;
}

export function PersonalCombatLuck({ combat }: { combat: CombatLuckStats }) {
  const attack = combatLuckScore(combat.attack);
  const defense = combatLuckScore(combat.defense);
  const score = attack + defense;
  return <div><div className="flex items-center justify-between"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Combat luck</div><div className="text-4xl font-semibold tabular-nums" style={luckScoreStyle(score)}>{formatLuckScore(score)}</div></div><div className="mt-5 space-y-3"><CombatDeltaBar icon={<Swords className="size-3" />} label="Attack" score={attack} battles={combat.attack.battles} /><CombatDeltaBar icon={<Shield className="size-3" />} label="Defense" score={defense} battles={combat.defense.battles} /></div></div>;
}
