/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import {
  resolveReplayFrameCommand,
  resolveSinceLastTurnStep,
  shouldRequestMissingHistoryFrame,
} from "../replay-mode-policy";

describe("Replay Mode policy", () => {
  test("resolves frame navigation commands without leaving the Replay Timeline", () => {
    expect(resolveReplayFrameCommand("previous-frame", { frameIndex: 0, historyMaxIndex: 5 })).toBe(0);
    expect(resolveReplayFrameCommand("previous-frame", { frameIndex: 3, historyMaxIndex: 5 })).toBe(2);
    expect(resolveReplayFrameCommand("next-frame", { frameIndex: 5, historyMaxIndex: 5 })).toBe(5);
    expect(resolveReplayFrameCommand("next-frame", { frameIndex: 3, historyMaxIndex: 5 })).toBe(4);
    expect(resolveReplayFrameCommand("reset-to-latest", { frameIndex: 1, historyMaxIndex: 5 })).toBe(5);
  });

  test("Since-My-Last-Turn jumps immediately when the target History Frame is loaded", () => {
    expect(resolveSinceLastTurnStep({
      canLoadOlderHistory: true,
      historyLoadingOlder: false,
      lastTurnEndIndex: 12,
      lastTurnEndLoaded: true,
    })).toEqual({
      frameIndex: 12,
      pending: false,
      shouldLoadOlderHistory: false,
    });
  });

  test("Since-My-Last-Turn requests one older Recent Replay Window while searching", () => {
    expect(resolveSinceLastTurnStep({
      canLoadOlderHistory: true,
      historyLoadingOlder: false,
      lastTurnEndIndex: 4,
      lastTurnEndLoaded: false,
    })).toEqual({
      frameIndex: null,
      pending: true,
      shouldLoadOlderHistory: true,
    });
  });

  test("Since-My-Last-Turn does not duplicate an older-window request already in flight", () => {
    expect(resolveSinceLastTurnStep({
      canLoadOlderHistory: true,
      historyLoadingOlder: true,
      lastTurnEndIndex: 4,
      lastTurnEndLoaded: false,
    })).toEqual({
      frameIndex: null,
      pending: true,
      shouldLoadOlderHistory: false,
    });
  });

  test("Since-My-Last-Turn stops searching when older windows are exhausted", () => {
    expect(resolveSinceLastTurnStep({
      canLoadOlderHistory: false,
      historyLoadingOlder: false,
      lastTurnEndIndex: 0,
      lastTurnEndLoaded: false,
    })).toEqual({
      frameIndex: 0,
      pending: false,
      shouldLoadOlderHistory: false,
    });
  });

  test("missing History Frame loading only happens while Replay Mode is open", () => {
    expect(shouldRequestMissingHistoryFrame({
      historyOpen: true,
      activeHistoryFrameLoaded: false,
    })).toBe(true);
    expect(shouldRequestMissingHistoryFrame({
      historyOpen: false,
      activeHistoryFrameLoaded: false,
    })).toBe(false);
    expect(shouldRequestMissingHistoryFrame({
      historyOpen: true,
      activeHistoryFrameLoaded: true,
    })).toBe(false);
  });
});
