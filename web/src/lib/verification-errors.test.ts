import { describe, expect, test } from "bun:test";
import { getVerificationErrorMessage } from "./verification-errors";

describe("verification error messages", () => {
  test("retains the supported verification messages", () => {
    expect(getVerificationErrorMessage("token_expired")).toBe(
      "This verification link has expired. Request a new one from sign in.",
    );
    expect(getVerificationErrorMessage("invalid_token")).toBe("This verification link is invalid.");
    expect(getVerificationErrorMessage("user_not_found")).toBe("No account found for this email.");
  });

  test.each(["", "unknown", "constructor", "__proto__", "toString", "INVALID_TOKEN"])(
    "uses the fallback for unsupported URL code %s", (code) => {
      expect(getVerificationErrorMessage(code)).toBe("Something went wrong verifying your email.");
    },
  );
});
