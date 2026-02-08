import { describe, expect, test } from "bun:test";
import { sendWithRetry } from "./sendEmail";

describe("sendWithRetry", () => {
  test("retries and succeeds after transient failures", async () => {
    let attempts = 0;
    const waits: number[] = [];

    await sendWithRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("temporary");
        }
      },
      { to: "a@example.com", subject: "Subject" },
      {
        waitFn: async (ms) => {
          waits.push(ms);
        },
      },
    );

    expect(attempts).toBe(3);
    expect(waits).toEqual([500, 1000]);
  });

  test("throws after max retries", async () => {
    let attempts = 0;
    await expect(
      sendWithRetry(
        async () => {
          attempts += 1;
          throw new Error("still failing");
        },
        { to: "a@example.com", subject: "Subject" },
        {
          maxAttempts: 2,
          waitFn: async () => {},
        },
      ),
    ).rejects.toThrow("still failing");
    expect(attempts).toBe(2);
  });
});
