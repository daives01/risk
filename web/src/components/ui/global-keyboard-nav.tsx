import { useEffect } from "react";
import { hasModifierKey, isTypingTarget } from "@/lib/keyboard-shortcuts";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[role='button']",
].join(", ");

function isVisible(element: HTMLElement) {
  if (element.getAttribute("aria-hidden") === "true") return false;
  if (element.hidden) return false;
  if (element.closest("[aria-hidden='true']")) return false;
  return element.getClientRects().length > 0;
}

function getFocusableElements() {
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (!isVisible(element)) return false;
    if (element.getAttribute("tabindex") === "-1") return false;
    return true;
  });
}

function moveFocus(direction: 1 | -1) {
  const elements = getFocusableElements();
  if (elements.length === 0) return false;

  const activeElement = document.activeElement as HTMLElement | null;
  const currentIndex = activeElement ? elements.indexOf(activeElement) : -1;
  const nextIndex =
    currentIndex === -1
      ? direction === 1
        ? 0
        : elements.length - 1
      : (currentIndex + direction + elements.length) % elements.length;

  const next = elements[nextIndex];
  if (!next) return false;

  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}

export function GlobalKeyboardNav() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (hasModifierKey(event)) return;
      if (isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if (key === "arrowdown" || key === "arrowright") {
        if (moveFocus(1)) event.preventDefault();
        return;
      }
      if (key === "arrowup" || key === "arrowleft") {
        if (moveFocus(-1)) event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
