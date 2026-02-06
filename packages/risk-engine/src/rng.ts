import type { RngState } from "./types.js";

// ── Internal: seed hashing + PRNG core ───────────────────────────────

/**
 * cyrb53-style hash — turns an arbitrary string into a 32-bit integer.
 * Used to convert string seeds into a numeric starting point.
 */
function hashSeed(str: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * splitmix32 — a simple, fast 32-bit PRNG with excellent statistical
 * properties. Given the same state it always returns the same output.
 */
function splitmix32(state: number): number {
  state = (state + 0x9e3779b9) | 0;
  let t = state ^ (state >>> 16);
  t = Math.imul(t, 0x21f0aaad);
  t ^= t >>> 15;
  t = Math.imul(t, 0x735a2d97);
  t ^= t >>> 15;
  return (t >>> 0) / 4294967296; // [0, 1)
}

/**
 * Derive a numeric state from seed + index so the same pair always
 * produces the same float.
 */
function valueAt(seed: string | number, index: number): number {
  const base = typeof seed === "string" ? hashSeed(seed) : seed;
  return splitmix32((base + index) | 0);
}

// ── Public API ───────────────────────────────────────────────────────

export interface Rng {
  /** Current state (for serialization into GameState.rng). */
  readonly state: RngState;
  /** Return a float in [0, 1) and advance the index. */
  next(): number;
  /** Return an integer in [min, max] (inclusive) and advance the index. */
  nextInt(min: number, max: number): number;
  /** Fisher-Yates shuffle (returns a new array). */
  shuffle<T>(array: readonly T[]): T[];
  /** Roll `count` six-sided dice, returning sorted descending. */
  rollDice(count: number): number[];
}

/**
 * Create an Rng from an RngState (typically from GameState.rng).
 *
 * The returned object mutates only its own internal index counter —
 * call `rng.state` to snapshot the current state for serialization.
 */
export function createRng(initial: RngState): Rng {
  const seed = initial.seed;
  let index = initial.index;

  return {
    get state(): RngState {
      return { seed, index };
    },

    next(): number {
      return valueAt(seed, index++);
    },

    nextInt(min: number, max: number): number {
      const f = valueAt(seed, index++);
      return min + Math.floor(f * (max - min + 1));
    },

    shuffle<T>(array: readonly T[]): T[] {
      const out = array.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(valueAt(seed, index++) * (i + 1));
        const tmp = out[i];
        out[i] = out[j]!;
        out[j] = tmp!;
      }
      return out;
    },

    rollDice(count: number): number[] {
      const rolls: number[] = [];
      for (let i = 0; i < count; i++) {
        rolls.push(1 + Math.floor(valueAt(seed, index++) * 6));
      }
      return rolls.sort((a, b) => b - a);
    },
  };
}
