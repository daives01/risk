export const SMOKE_USER_KEYS = ["alpha", "bravo", "charlie", "delta"] as const;

export type SmokeUserKey = (typeof SMOKE_USER_KEYS)[number];

export type SmokeUser = {
  key: SmokeUserKey;
  identifier: string;
  password: string;
};

export type SmokeConfig = {
  origin: string;
  users: SmokeUser[];
};

export function authFileFor(key: SmokeUserKey): string {
  return `.playwright/auth/${key}.json`;
}

type Environment = Record<string, string | undefined>;

const REQUIRED_VARIABLES = [
  "SMOKE_ORIGIN",
  "SMOKE_USER_ALPHA",
  "SMOKE_USER_BRAVO",
  "SMOKE_USER_CHARLIE",
  "SMOKE_USER_DELTA",
  "SMOKE_USER_PASSWORD",
] as const;

export function readSmokeConfig(environment: Environment = process.env): SmokeConfig {
  const missing = REQUIRED_VARIABLES.filter((name) => !environment[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing Smoke Harness variables: ${missing.join(", ")}`);
  }

  const originUrl = new URL(environment.SMOKE_ORIGIN!);
  if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") {
    throw new Error("SMOKE_ORIGIN must use http or https");
  }
  const origin = originUrl.origin;
  const password = environment.SMOKE_USER_PASSWORD!;
  const users = SMOKE_USER_KEYS.map((key) => ({
    key,
    identifier: environment[`SMOKE_USER_${key.toUpperCase()}`]!,
    password,
  }));

  return { origin, users };
}
