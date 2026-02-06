import { describe, expect, it } from "bun:test";
import { createRng } from "./rng.js";
import type { RngState } from "./types.js";

const seed: RngState = { seed: "test-seed", index: 0 };

describe("createRng", () => {
  it("produces deterministic output for the same seed+index", () => {
    const a = createRng(seed);
    const b = createRng(seed);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("different seeds produce different sequences", () => {
    const a = createRng({ seed: "alpha", index: 0 });
    const b = createRng({ seed: "beta", index: 0 });
    // Extremely unlikely all 10 match by chance
    const aVals = Array.from({ length: 10 }, () => a.next());
    const bVals = Array.from({ length: 10 }, () => b.next());
    expect(aVals).not.toEqual(bVals);
  });

  it("numeric seeds work too", () => {
    const a = createRng({ seed: 42, index: 0 });
    const b = createRng({ seed: 42, index: 0 });
    for (let i = 0; i < 50; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("advances index after each call", () => {
    const rng = createRng(seed);
    expect(rng.state.index).toBe(0);
    rng.next();
    expect(rng.state.index).toBe(1);
    rng.next();
    expect(rng.state.index).toBe(2);
  });

  it("state snapshot can recreate same sequence", () => {
    const rng = createRng(seed);
    // Advance a few steps
    rng.next();
    rng.next();
    rng.next();
    const snapshot = rng.state;
    const val1 = rng.next();

    // Recreate from snapshot — should produce same next value
    const rng2 = createRng(snapshot);
    expect(rng2.next()).toBe(val1);
  });
});

describe("nextInt", () => {
  it("returns values within [min, max] inclusive", () => {
    const rng = createRng(seed);
    for (let i = 0; i < 200; i++) {
      const v = rng.nextInt(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it("is deterministic", () => {
    const a = createRng(seed);
    const b = createRng(seed);
    for (let i = 0; i < 50; i++) {
      expect(a.nextInt(0, 100)).toBe(b.nextInt(0, 100));
    }
  });
});

describe("shuffle", () => {
  it("returns a new array with the same elements", () => {
    const rng = createRng(seed);
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = rng.shuffle(arr);
    expect(shuffled).toHaveLength(arr.length);
    expect(shuffled.sort((a, b) => a - b)).toEqual(arr);
  });

  it("does not mutate the input", () => {
    const rng = createRng(seed);
    const arr = [1, 2, 3, 4, 5];
    const copy = [...arr];
    rng.shuffle(arr);
    expect(arr).toEqual(copy);
  });

  it("is deterministic", () => {
    const a = createRng(seed);
    const b = createRng(seed);
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(a.shuffle(arr)).toEqual(b.shuffle(arr));
  });
});

describe("rollDice", () => {
  it("returns values between 1 and 6", () => {
    const rng = createRng(seed);
    for (let i = 0; i < 50; i++) {
      const rolls = rng.rollDice(3);
      for (const r of rolls) {
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(6);
      }
    }
  });

  it("returns the correct count of dice", () => {
    const rng = createRng(seed);
    expect(rng.rollDice(1)).toHaveLength(1);
    expect(rng.rollDice(3)).toHaveLength(3);
    expect(rng.rollDice(5)).toHaveLength(5);
  });

  it("returns dice sorted descending", () => {
    const rng = createRng(seed);
    for (let i = 0; i < 50; i++) {
      const rolls = rng.rollDice(3);
      for (let j = 1; j < rolls.length; j++) {
        expect(rolls[j - 1]).toBeGreaterThanOrEqual(rolls[j]!);
      }
    }
  });

  it("is deterministic", () => {
    const a = createRng(seed);
    const b = createRng(seed);
    for (let i = 0; i < 20; i++) {
      expect(a.rollDice(3)).toEqual(b.rollDice(3));
    }
  });
});
