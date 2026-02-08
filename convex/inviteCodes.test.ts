import { describe, expect, test } from "bun:test";
import { generateInviteCode, generateUniqueInviteCode } from "./inviteCodes";

describe("invite codes", () => {
  test("generates a six-character code from allowed characters", () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });

  test("retries on collisions and returns first unique code", async () => {
    const generatedCodes = ["AAAAAA", "AAAAAA", "BBBBBB"];
    const seen = new Set<string>(["AAAAAA"]);

    const code = await generateUniqueInviteCode(
      async (candidate) => seen.has(candidate),
      {
        generateCode: () => generatedCodes.shift() ?? "ZZZZZZ",
        maxAttempts: 5,
      },
    );

    expect(code).toBe("BBBBBB");
  });

  test("throws when all attempts collide", async () => {
    await expect(
      generateUniqueInviteCode(async () => true, {
        generateCode: () => "AAAAAA",
        maxAttempts: 2,
      }),
    ).rejects.toThrow("Failed to generate a unique invite code");
  });
});
