import { describe, expect, test } from "bun:test";
import {
  decryptSlackBotToken,
  encryptSlackBotToken,
  readEncryptionKeyFromEnv,
} from "./slackCrypto";

describe("slack crypto", () => {
  test("encrypts and decrypts bot tokens", () => {
    const key = readEncryptionKeyFromEnv({
      SLACK_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    });
    const encrypted = encryptSlackBotToken("xoxb-secret-token", key);
    expect(encrypted.ciphertext.length).toBeGreaterThan(0);
    expect(decryptSlackBotToken(encrypted, key)).toBe("xoxb-secret-token");
  });

  test("rejects tampered payloads", () => {
    const key = readEncryptionKeyFromEnv({
      SLACK_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
    });
    const encrypted = encryptSlackBotToken("xoxb-secret-token", key);
    const tampered = {
      ...encrypted,
      ciphertext: `${encrypted.ciphertext.slice(0, -2)}ab`,
    };
    expect(() => decryptSlackBotToken(tampered, key)).toThrow();
  });
});
