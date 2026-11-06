import { describe, expect, test } from "bun:test";
import { reminderTimes } from "./turnReminderTiming";

const start = Date.parse("2026-11-01T12:00:00Z");
const zone = "America/Denver";
const times = (deadline: string, since = start) => reminderTimes(since, Date.parse(deadline), zone).map(r => new Date(r.at).toISOString());

describe("turn reminder delivery windows", () => {
  test("9am expiry gets reminders the previous morning and evening", () => {
    expect(times("2026-11-03T16:00:00Z")).toEqual(["2026-11-02T16:00:00.000Z", "2026-11-03T03:00:00.000Z"]);
  });
  test("3pm expiry gets 9am and 1pm reminders", () => {
    expect(times("2026-11-03T22:00:00Z")).toEqual(["2026-11-03T16:00:00.000Z", "2026-11-03T20:00:00.000Z"]);
  });
  test("noon expiry merges nearby reminders into the final one", () => {
    expect(times("2026-11-03T19:00:00Z")).toEqual(["2026-11-03T17:00:00.000Z"]);
  });
  test("2am expiry moves both reminders to the prior day", () => {
    expect(times("2026-11-03T09:00:00Z")).toEqual(["2026-11-02T16:00:00.000Z", "2026-11-03T03:00:00.000Z"]);
  });
  test("suppresses reminders within four hours of turn start", () => {
    expect(times("2026-11-03T22:00:00Z", Date.parse("2026-11-03T17:00:00Z"))).toEqual([]);
  });
  test("handles the spring daylight saving transition", () => {
    expect(times("2027-03-14T15:00:00Z")).toEqual(["2027-03-13T16:00:00.000Z", "2027-03-14T03:00:00.000Z"]);
  });
  test("handles the autumn daylight saving transition", () => {
    expect(times("2026-11-01T16:00:00Z", Date.parse("2026-10-29T12:00:00Z"))).toEqual(["2026-10-31T15:00:00.000Z", "2026-11-01T02:00:00.000Z"]);
  });
});
