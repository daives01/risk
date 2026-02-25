"use node";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_LENGTH = 12;
const ALGORITHM = "aes-256-gcm";

export type EncryptedToken = {
  ciphertext: string;
  iv: string;
  tag: string;
};

function toBase64(value: Buffer): string {
  return value.toString("base64");
}

function fromBase64(value: string): Buffer {
  return Buffer.from(value, "base64");
}

export function readEncryptionKeyFromEnv(env: Record<string, string | undefined>): Buffer {
  const raw = env.SLACK_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("SLACK_TOKEN_ENCRYPTION_KEY is required");
  }
  const key = fromBase64(raw);
  if (key.length !== 32) {
    throw new Error("SLACK_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

export function encryptSlackBotToken(token: string, key: Buffer): EncryptedToken {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: toBase64(ciphertext),
    iv: toBase64(iv),
    tag: toBase64(tag),
  };
}

export function decryptSlackBotToken(payload: EncryptedToken, key: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, key, fromBase64(payload.iv));
  decipher.setAuthTag(fromBase64(payload.tag));
  const plaintext = Buffer.concat([
    decipher.update(fromBase64(payload.ciphertext)),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
