import { useCallback, useEffect, useRef, useState } from "react";

interface UseRotatingHintsOptions {
  hints: readonly string[];
  rotationMs: number;
}

export function useRotatingHints({ hints, rotationMs }: UseRotatingHintsOptions) {
  const [hintIndex, setHintIndex] = useState(() => Math.floor(Math.random() * hints.length));
  const hintIntervalRef = useRef<number | null>(null);
  const hintHistoryRef = useRef<number[]>([]);
  const hintCursorRef = useRef(0);

  const getRandomIndex = useCallback(
    (exclude?: number) => {
      if (hints.length <= 1) return 0;
      let next = Math.floor(Math.random() * hints.length);
      if (exclude !== undefined && next === exclude) {
        next = (next + 1) % hints.length;
      }
      return next;
    },
    [hints.length],
  );

  const pushHintIndex = useCallback((nextIndex: number) => {
    if (hintHistoryRef.current.length === 0) {
      hintHistoryRef.current = [nextIndex];
      hintCursorRef.current = 0;
      return;
    }

    if (hintCursorRef.current < hintHistoryRef.current.length - 1) {
      hintHistoryRef.current = hintHistoryRef.current.slice(0, hintCursorRef.current + 1);
    }

    hintHistoryRef.current = [...hintHistoryRef.current, nextIndex];
    hintCursorRef.current = hintHistoryRef.current.length - 1;
  }, []);

  const resetHintInterval = useCallback(() => {
    if (hintIntervalRef.current) {
      window.clearInterval(hintIntervalRef.current);
    }
    if (!hints.length) return;

    hintIntervalRef.current = window.setInterval(() => {
      setHintIndex((prev) => {
        if (hints.length === 1) return prev;
        const next = getRandomIndex(prev);
        pushHintIndex(next);
        return next;
      });
    }, rotationMs);
  }, [getRandomIndex, hints.length, pushHintIndex, rotationMs]);

  const rotateHintForward = useCallback(() => {
    if (!hints.length) return;

    let nextIndex: number;
    if (hintCursorRef.current < hintHistoryRef.current.length - 1) {
      hintCursorRef.current += 1;
      nextIndex = hintHistoryRef.current[hintCursorRef.current] ?? 0;
    } else {
      const previous = hintHistoryRef.current[hintHistoryRef.current.length - 1] ?? hintIndex;
      nextIndex = getRandomIndex(previous);
      pushHintIndex(nextIndex);
    }

    setHintIndex(nextIndex);
    resetHintInterval();
  }, [getRandomIndex, hintIndex, hints.length, pushHintIndex, resetHintInterval]);

  const rotateHintBack = useCallback(() => {
    if (hintHistoryRef.current.length <= 1 || hintCursorRef.current <= 0) return;
    hintCursorRef.current -= 1;
    const nextIndex = hintHistoryRef.current[hintCursorRef.current] ?? 0;
    setHintIndex(nextIndex);
    resetHintInterval();
  }, [resetHintInterval]);

  useEffect(() => {
    if (!hints.length) return undefined;
    if (hintHistoryRef.current.length === 0) {
      hintHistoryRef.current = [hintIndex];
      hintCursorRef.current = 0;
    }
    resetHintInterval();
    return () => {
      if (hintIntervalRef.current) {
        window.clearInterval(hintIntervalRef.current);
      }
    };
  }, [getRandomIndex, hintIndex, hints.length, resetHintInterval]);

  return {
    hintIndex,
    rotateHintForward,
    rotateHintBack,
  };
}
