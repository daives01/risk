import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface GameEventsCardProps {
  events: Array<{ key: string; text: string; index: number }>;
  activeIndex: number | null;
  onSelectEvent?: (index: number) => void;
}

export function GameEventsCard({ events, activeIndex, onSelectEvent }: GameEventsCardProps) {
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!activeItemRef.current) return;
    activeItemRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  return (
    <Card className="glass-panel flex h-full min-h-0 flex-col overflow-hidden border-0 py-0">
      <CardHeader className="py-4">
        <CardTitle className="text-base">Recent Events</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-4 text-sm">
        {events.length === 0 && <p className="text-muted-foreground">No actions yet.</p>}
        {events.map((event) => {
          const isActive = activeIndex === event.index;
          return (
            <button
              key={event.key}
              type="button"
              onClick={() => onSelectEvent?.(event.index)}
              ref={isActive ? activeItemRef : null}
              aria-current={isActive ? "true" : undefined}
              className={`w-full rounded-md border px-3 py-2 text-left transition ${
                isActive
                  ? "border-primary/80 bg-primary/15 text-foreground"
                  : "bg-background/80 text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {event.text}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
