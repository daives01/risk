import { useEffect, useRef, useState } from "react";

interface UseRotatingHintsOptions {
  hints: readonly string[];
  rotationMs: number;
}

export function useRotatingHints({ hints, rotationMs }: UseRotatingHintsOptions) {
  const [hintIndex, setHintIndex] = useState(() => Math.floor(Math.random() * hints.length));
  const hintIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!hints.length) return undefined;
    if (hintIntervalRef.current) {
      window.clearInterval(hintIntervalRef.current);
    }
    hintIntervalRef.current = window.setInterval(() => {
      setHintIndex((prev) => {
        if (hints.length === 1) return prev;
        let next = Math.floor(Math.random() * hints.length);
        if (next === prev) {
          next = (next + 1) % hints.length;
        }
        return next;
      });
    }, rotationMs);
    return () => {
      if (hintIntervalRef.current) {
        window.clearInterval(hintIntervalRef.current);
      }
    };
  }, [hints, rotationMs]);

  return {
    hintIndex,
    setHintIndex,
  };
}
