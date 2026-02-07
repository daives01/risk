import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const TOUCH_MEDIA_QUERY = "(hover: none), (pointer: coarse)";

function detectTouchscreen() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(TOUCH_MEDIA_QUERY).matches || navigator.maxTouchPoints > 0;
}

function detectMacOS() {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.userAgentData?.platform ?? navigator.platform;
  return /mac/i.test(platform);
}

function formatShortcut(shortcut: string, isMacOS: boolean) {
  return shortcut
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => {
      if (part === "mod") return isMacOS ? "⌘" : "Ctrl";
      if (part === "enter") return isMacOS ? "↵" : "Enter";
      if (part === "shift") return isMacOS ? "⇧" : "Shift";
      if (part === "alt" || part === "option") return isMacOS ? "⌥" : "Alt";
      return part.length === 1 ? part.toUpperCase() : `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    })
    .join("+");
}

type ShortcutHintProps = {
  shortcut: string;
  className?: string;
};

export function ShortcutHint({ shortcut, className }: ShortcutHintProps) {
  const [isTouchscreen, setIsTouchscreen] = useState(detectTouchscreen);
  const [isMacOS, setIsMacOS] = useState(detectMacOS);

  useEffect(() => {
    const mediaQuery = window.matchMedia(TOUCH_MEDIA_QUERY);
    const refresh = () => setIsTouchscreen(detectTouchscreen());
    const refreshPlatform = () => setIsMacOS(detectMacOS());
    mediaQuery.addEventListener("change", refresh);
    refresh();
    refreshPlatform();
    return () => mediaQuery.removeEventListener("change", refresh);
  }, []);

  if (isTouchscreen) return null;

  return (
    <kbd
      className={cn(
        "inline-flex items-center rounded border border-border/80 bg-background/70 px-1.5 py-0.5 text-[11px] font-medium leading-none text-muted-foreground",
        className,
      )}
    >
      {formatShortcut(shortcut, isMacOS)}
    </kbd>
  );
}
