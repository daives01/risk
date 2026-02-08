const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_CODE_LENGTH = 6;
const MAX_INVITE_CODE_ATTEMPTS = 8;

function secureRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) {
    throw new Error("maxExclusive must be positive");
  }
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0]! % maxExclusive;
}

export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_CHARS[secureRandomInt(INVITE_CODE_CHARS.length)];
  }
  return code;
}

export async function generateUniqueInviteCode(
  codeExists: (code: string) => Promise<boolean>,
  options?: {
    maxAttempts?: number;
    generateCode?: () => string;
  },
): Promise<string> {
  const maxAttempts = options?.maxAttempts ?? MAX_INVITE_CODE_ATTEMPTS;
  const generateCode = options?.generateCode ?? generateInviteCode;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateCode();
    if (!(await codeExists(code))) {
      return code;
    }
  }
  throw new Error("Failed to generate a unique invite code");
}
