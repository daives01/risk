import type { CSSProperties } from "react";
import cardArt from "@/assets/card-art/card-art.svg";
import { sortCardsByKind, type GameCardData } from "./game-card-utils";

const artworkCrop = (viewBox: string) => `${cardArt}#svgView(viewBox(${viewBox}))`;

const cardMeta: Record<string, { name: string; color: string; artwork: string }> = {
  A: { name: "Infantry", color: "#c87362", artwork: artworkCrop("60,265,320,320") },
  B: { name: "Cavalry", color: "#6e9eb5", artwork: artworkCrop("430,265,330,320") },
  C: { name: "Artillery", color: "#c5a25b", artwork: artworkCrop("800,265,320,320") },
  W: { name: "Wild", color: "#9a7db3", artwork: artworkCrop("1170,265,300,320") },
};

interface GameCardProps {
  card: GameCardData;
  compact?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function GameCard({ card, compact = false, selected = false, disabled = false, onClick }: GameCardProps) {
  const meta = cardMeta[card.kind] ?? {
    name: card.kind,
    color: "var(--muted-foreground)",
    artwork: cardMeta.W.artwork,
  };
  const style = {
    "--unit-color": meta.color,
    boxShadow: selected
      ? `0 12px 32px color-mix(in srgb, ${meta.color} 28%, transparent)`
      : undefined,
  } as CSSProperties;
  const content = (
    <>
      <div className={`absolute border border-border/70 ${compact ? "inset-1" : "inset-2"}`} />
      <div className={`relative flex h-full flex-col items-center justify-between ${compact ? "p-2" : "p-4"}`}>
        <span className={`self-start font-black leading-none text-[var(--unit-color)] ${compact ? "text-xl" : "text-3xl"}`}>
          {card.kind}
        </span>
        <img
          src={meta.artwork}
          alt=""
          className={compact ? "h-12 w-14 object-contain" : "h-24 w-28 object-contain"}
          draggable={false}
        />
        <span className={`font-bold uppercase tracking-[.12em] text-[var(--unit-color)] ${compact ? "text-[10px]" : "text-sm"}`}>
          {meta.name}
        </span>
      </div>
      {selected && (
        <>
          <span className="absolute inset-x-0 bottom-0 h-1 bg-[var(--unit-color)]" />
          <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-[var(--unit-color)] text-[10px] font-black text-background">
            ✓
          </span>
        </>
      )}
    </>
  );
  const classes = `relative aspect-[5/7] shrink-0 overflow-hidden border border-border bg-card text-card-foreground shadow-xl ${compact ? "w-20" : "w-36 sm:w-40"}`;

  if (compact) {
    return <div style={style} className={classes}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${meta.name} card`}
      aria-pressed={selected}
      style={style}
      className={`${classes} text-left transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${selected ? "-translate-y-3" : "hover:-translate-y-2"}`}
    >
      {content}
    </button>
  );
}

export function CompactCardFan({ cards }: { cards: readonly GameCardData[] }) {
  const sortedCards = sortCardsByKind(cards);
  return (
    <div className="flex justify-center pr-7" aria-label="Teammate cards">
      {sortedCards.map((card, index) => (
        <div
          key={card.cardId}
          className="-mr-7 origin-bottom"
          style={{ transform: `rotate(${(index - (sortedCards.length - 1) / 2) * 6}deg)` }}
        >
          <GameCard compact card={card} />
        </div>
      ))}
    </div>
  );
}
