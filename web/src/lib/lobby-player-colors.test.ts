/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { PLAYER_COLOR_PALETTE } from "risk-engine";
import { canEditLobbyPlayerColor, getLobbyColorOptions } from "./lobby-player-colors";

describe("lobby player color UI helpers", () => {
  test("orders options from cool to warm for lobby scanning", () => {
    const options = getLobbyColorOptions([], "u1", {});

    expect(options.map((option) => option.color)).toEqual([
      "#08008a",
      "#556dff",
      "#00bec2",
      "#005d59",
      "#209600",
      "#88c240",
      "#ffa210",
      "#ca0424",
      "#ff41ff",
      "#710079",
      "#593500",
      "#000000",
    ]);
  });

  test("host can edit every player and non-host can only edit self", () => {
    expect(canEditLobbyPlayerColor(true, "u1", "u2")).toBe(true);
    expect(canEditLobbyPlayerColor(false, "u1", "u1")).toBe(true);
    expect(canEditLobbyPlayerColor(false, "u1", "u2")).toBe(false);
  });

  test("disables colors already taken by other players", () => {
    const options = getLobbyColorOptions(
      [
        { userId: "u1", color: PLAYER_COLOR_PALETTE[0] },
        { userId: "u2", color: PLAYER_COLOR_PALETTE[1] },
      ],
      "u1",
      {},
    );

    const taken = options.find((option) => option.color === PLAYER_COLOR_PALETTE[1]);
    const own = options.find((option) => option.color === PLAYER_COLOR_PALETTE[0]);
    expect(taken?.disabled).toBe(true);
    expect(own?.disabled).toBe(false);
  });

  test("uses pending colors for real-time conflict prevention", () => {
    const options = getLobbyColorOptions(
      [
        { userId: "u1", color: PLAYER_COLOR_PALETTE[0] },
        { userId: "u2", color: PLAYER_COLOR_PALETTE[1] },
      ],
      "u1",
      { u2: PLAYER_COLOR_PALETTE[2] },
    );

    const pendingTaken = options.find((option) => option.color === PLAYER_COLOR_PALETTE[2]);
    const previouslyTaken = options.find((option) => option.color === PLAYER_COLOR_PALETTE[1]);
    expect(pendingTaken?.disabled).toBe(true);
    expect(previouslyTaken?.disabled).toBe(false);
  });
});
