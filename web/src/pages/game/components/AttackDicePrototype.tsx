import { useEffect, useState, type CSSProperties } from "react";
import { Shield, Swords, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { getReadableTextColor } from "@/lib/color-contrast";
import { Button } from "@/components/ui/button";
import type { AttackDiceResult } from "@/lib/game/attack-dice-result";

// PROTOTYPE: One stable dice surface for choosing attack dice and reading the result.
interface AttackDicePrototypeProps {
  result: AttackDiceResult | null;
  attackDice?: number;
  maxDice?: number;
  disabled?: boolean;
  rolling?: boolean;
  onSetAttackDice?: (dice: number) => void;
  attackerColor?: string;
  defenderColor?: string;
  defenderDiceCount?: number;
}

function ResultDie({
  value,
  tone,
  winner,
  unpaired = false,
  color,
}: {
  value: number;
  tone: "attack" | "defend";
  winner: boolean;
  unpaired?: boolean;
  color: string;
}) {
  return (
    <span className="relative inline-flex">
      <span
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-md border text-base font-black shadow-sm",
          (!winner || unpaired) && "opacity-45 grayscale",
        )}
        style={{ backgroundColor: color, borderColor: color, color: getReadableTextColor(color) }}
        aria-label={`${tone === "attack" ? "Attacker" : "Defender"} rolled ${value}${winner ? " and won" : ""}`}
      >
        {value}
      </span>
      {winner && !unpaired && (
        <span
          className="absolute -right-2 -top-2 inline-flex size-5 items-center justify-center rounded-full border shadow-sm"
          style={{ backgroundColor: color, borderColor: color, color: getReadableTextColor(color) }}
          aria-hidden="true"
        >
          <Trophy className="size-3" />
        </span>
      )}
    </span>
  );
}

export function AttackDicePrototype({
  result,
  attackDice = 0,
  maxDice = 0,
  disabled = false,
  rolling = false,
  onSetAttackDice,
  attackerColor = result?.attackerColor ?? "#ef4444",
  defenderColor = result?.defenderColor ?? "#bae6fd",
  defenderDiceCount = result?.defendRolls.length ?? 0,
}: AttackDicePrototypeProps) {
  const comparisonCount = result ? Math.min(result.attackRolls.length, result.defendRolls.length) : 0;
  const sliderMin = 1;
  const sliderMax = Math.max(1, maxDice);
  const sliderValue = Math.max(1, Math.min(attackDice, sliderMax));
  const sliderRowCount = Math.max(1, maxDice);
  const visibleRowCount = Math.max(1, maxDice, defenderDiceCount, result?.attackRolls.length ?? 0);
  const diceGridHeight = visibleRowCount * 36 + (visibleRowCount - 1) * 6;
  const sliderLength = sliderRowCount === 3 ? 104 : sliderRowCount === 2 ? 66 : 16;
  const [rollingFace, setRollingFace] = useState(1);

  useEffect(() => {
    if (!rolling) return;
    const interval = window.setInterval(() => {
      setRollingFace((face) => face % 6 + 1);
    }, 85);
    return () => window.clearInterval(interval);
  }, [rolling]);

  return (
    <div className="mt-2 border-t border-border/70 pt-2">
      <div className="mx-auto grid w-fit grid-cols-[22px_36px_24px_36px] items-end gap-x-2 text-muted-foreground">
        <span className="text-center text-[9px] font-bold uppercase tracking-wide">Roll</span>
        <span className="inline-flex items-center justify-center" aria-label="Attacker">
          <Swords className="size-3.5" />
        </span>
        <span aria-hidden="true" />
        <span className="inline-flex items-center justify-center text-[10px] font-bold uppercase tracking-wide" aria-label="Defender">
          <Shield className="size-3.5" />
        </span>
      </div>

      <div
        className="relative mx-auto mt-1.5 grid w-fit grid-cols-[22px_36px_24px_36px] gap-x-2 gap-y-1.5"
        style={{ height: diceGridHeight, gridTemplateRows: `repeat(${visibleRowCount}, 36px)` }}
      >
        {!!onSetAttackDice && maxDice > 1 && (
          <div className="col-start-1 flex items-center justify-center" style={{ gridRow: `1 / span ${sliderRowCount}` }}>
            <input
              type="range"
              min={sliderMin}
              max={sliderMax}
              step={1}
              value={sliderValue}
              onChange={(event) => onSetAttackDice(Number(event.target.value))}
              disabled={disabled || sliderMin === sliderMax}
              aria-label="Number of attack dice"
              className="player-slider h-4 rotate-90 cursor-pointer transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50"
              style={{ "--player-slider-color": attackerColor, width: sliderLength } as CSSProperties}
            />
          </div>
        )}
        {Array.from({ length: visibleRowCount }, (_, index) => {
          const attackRoll = result?.attackRolls[index];
          const defendRoll = result?.defendRolls[index];
          const isCompared = index < comparisonCount;
          const attackerWins = isCompared && attackRoll! > defendRoll!;
          const selectable = !!onSetAttackDice && index < maxDice;
          const selected = index < attackDice;
          const showRollingAttack = rolling && selected;
          const showRollingDefend = rolling && index < defenderDiceCount;
          const showConnector = (rolling && index < Math.min(attackDice, defenderDiceCount)) || isCompared;

          return (
            <div key={index} className="contents">
              <div className="col-start-2 flex items-center justify-center">
                {showRollingAttack ? (
                  <span className="animate-pulse"><ResultDie value={(rollingFace + index * 2 - 1) % 6 + 1} tone="attack" winner={false} color={attackerColor} /></span>
                ) : !rolling && attackRoll !== undefined ? (
                  <ResultDie value={attackRoll} tone="attack" winner={attackerWins} unpaired={!isCompared} color={attackerColor} />
                ) : selectable ? (
                  <span
                    className={cn(
                      "inline-flex size-9 items-center justify-center rounded-md border text-sm font-black transition-colors",
                      selected ? "shadow-sm" : "border-border bg-background text-muted-foreground opacity-45",
                    )}
                    style={selected ? { backgroundColor: attackerColor, borderColor: attackerColor, color: getReadableTextColor(attackerColor) } : undefined}
                  >
                    {index + 1}
                  </span>
                ) : (
                  <span className="size-9" />
                )}
              </div>

              <span className={cn(
                "col-start-3 self-center",
                "h-px w-full bg-border",
                !showConnector && "opacity-0",
              )} aria-hidden="true" />

              <div className="col-start-4 flex items-center justify-center">
                {showRollingDefend ? (
                  <span className="animate-pulse"><ResultDie value={(rollingFace + index * 3 + 2) % 6 + 1} tone="defend" winner={false} color={defenderColor} /></span>
                ) : !rolling && defendRoll !== undefined ? (
                  <ResultDie value={defendRoll} tone="defend" winner={isCompared && !attackerWins} color={defenderColor} />
                ) : !result && index < defenderDiceCount ? (
                  <span className="inline-flex size-9 items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/20 text-xs text-muted-foreground/50">?</span>
                ) : (
                  <span className="size-9" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface OccupyMovePrototypeProps {
  result: AttackDiceResult;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
  onMove: () => void;
}

function CompactDice({ result, className }: { result: AttackDiceResult; className?: string }) {
  const comparisons = Math.min(result.attackRolls.length, result.defendRolls.length);
  return (
    <div className={cn("grid gap-1", className)}>
      {result.attackRolls.map((attack, index) => {
        const defend = result.defendRolls[index];
        const compared = index < comparisons;
        const attackerWins = compared && attack > defend!;
        return (
          <div key={index} className="grid grid-cols-[32px_14px_32px] items-center gap-1">
            <ResultDie value={attack} tone="attack" winner={attackerWins} unpaired={!compared} color={result.attackerColor} />
            <span className={cn("h-px bg-border", !compared && "opacity-0")} />
            {defend !== undefined ? <ResultDie value={defend} tone="defend" winner={!attackerWins} color={result.defenderColor} /> : <span />}
          </div>
        );
      })}
    </div>
  );
}

function MoveSlider({ value, min, max, color, disabled, onChange, label = "Move troops" }: Pick<OccupyMovePrototypeProps, "value" | "min" | "max" | "disabled" | "onChange"> & { color: string; label?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        <span>{label}</span><span className="text-sm text-foreground">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            const delta = event.key === "ArrowLeft" ? -1 : 1;
            onChange(Math.max(min, Math.min(max, value + delta)));
          } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
          }
        }}
        disabled={disabled || min === max}
        className="player-slider mt-2 h-4 w-full cursor-pointer transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50"
        style={{ "--player-slider-color": color } as CSSProperties}
      />
      <div className="flex justify-between text-[9px] text-muted-foreground"><span>{min}</span><span>{max}</span></div>
    </div>
  );
}

function MoveActions({ result, value, disabled, onMove }: OccupyMovePrototypeProps) {
  return (
    <div className="flex justify-end gap-1.5">
      <Button type="button" size="xs" onClick={onMove} disabled={disabled} style={{ backgroundColor: result.attackerColor, borderColor: result.attackerColor, color: getReadableTextColor(result.attackerColor) }}>Move {value}</Button>
    </div>
  );
}

export function OccupyMovePrototype(props: OccupyMovePrototypeProps) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="relative mt-2 h-[128px] overflow-hidden border-t border-border/70 pt-2">
      <CompactDice result={props.result} className={cn("absolute top-3 transition-all duration-300", entered ? "left-2" : "left-1/2 -translate-x-1/2")} />
      <div className={cn("absolute right-0 top-3 w-[52%] transition-all delay-100 duration-300", entered ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0")}>
        <MoveSlider {...props} color={props.result.attackerColor} />
        <div className="mt-5"><MoveActions {...props} /></div>
      </div>
    </div>
  );
}

interface FortifyMovePrototypeProps {
  value: number;
  min: number;
  max: number;
  color: string;
  disabled: boolean;
  onChange: (value: number) => void;
  onFortify: () => void;
}

export function FortifyMovePrototype(props: FortifyMovePrototypeProps) {
  return (
    <div className="mt-2 border-t border-border/70 pt-3">
      <MoveSlider {...props} label="Fortify troops" />
      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          size="xs"
          onClick={props.onFortify}
          disabled={props.disabled}
          style={{
            backgroundColor: props.color,
            borderColor: props.color,
            color: getReadableTextColor(props.color),
          }}
        >
          Fortify {props.value}
        </Button>
      </div>
    </div>
  );
}
