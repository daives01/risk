import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { authFileFor, type SmokeUserKey } from "./smoke-config";

export type SmokeSession = {
  key: SmokeUserKey;
  context: BrowserContext;
  page: Page;
};

export async function openSmokeSessions(
  browser: Browser,
  origin: string,
  keys: SmokeUserKey[],
): Promise<SmokeSession[]> {
  return await Promise.all(keys.map(async (key) => {
    const context = await browser.newContext({
      baseURL: origin,
      storageState: authFileFor(key),
    });
    const page = await context.newPage();
    await page.goto(`${origin}/home`);
    await expect(page).toHaveURL(/\/home(?:$|[?#])/);
    return { key, context, page };
  }));
}

export async function closeSmokeSessions(sessions: SmokeSession[]) {
  await Promise.allSettled(sessions.map(({ context }) => context.close()));
}

export async function createGame(
  host: Page,
  args: { name: string; playerCount: 2 | 4; teamMode: boolean },
) {
  await host.goto("/games/new");
  await host.getByLabel("Game Name").fill(args.name);

  const mapOption = host.locator("button").filter({ hasText: /\d+ territories/ }).first();
  await expect(mapOption).toBeVisible();
  await mapOption.click();

  await host.locator("#maxPlayers").click();
  await host.getByRole("option", { name: `${args.playerCount} players`, exact: true }).click();

  if (args.teamMode) {
    await host.getByRole("switch", { name: "Enable team mode" }).click();
  }

  await host.getByRole("button", { name: "Create Game" }).click();
  await expect(host).toHaveURL(/\/g\/[^/]+$/);

  const codeText = await host.getByText(/^Code:\s*/).textContent();
  const inviteCode = codeText?.match(/[A-Z2-9]{6}/)?.[0];
  if (!inviteCode) throw new Error(`Could not read invite code from: ${codeText}`);
  return inviteCode;
}

export async function joinGame(page: Page, inviteCode: string) {
  await page.goto(`/join/${inviteCode}`);
  await expect(page).toHaveURL(/\/g\/[^/]+$/);
  await expect(page.getByText(/Waiting for players/)).toBeVisible();
}

export async function startGame(host: Page, expectedPlayers: number) {
  await expect(host.getByText(new RegExp(`Waiting for players \\(${expectedPlayers}/${expectedPlayers}\\)`))).toBeVisible();
  await host.getByRole("button", { name: "Start Game" }).click();
  await expect(host.getByRole("img", { name: "Global Domination map" })).toBeVisible();
}

export async function findTurnSession(sessions: SmokeSession[]): Promise<SmokeSession> {
  await expect.poll(async () => {
    for (const session of sessions) {
      if (await session.page.getByText("Click territory to place", { exact: true }).isVisible()) {
        return session.key;
      }
    }
    return null;
  }).not.toBeNull();

  for (const session of sessions) {
    if (await session.page.getByText("Click territory to place", { exact: true }).isVisible()) {
      return session;
    }
  }
  throw new Error("No Smoke User owns the current turn");
}

export async function queueAllReinforcements(page: Page) {
  const remainingText = await page.getByText(/\d+ left/, { exact: true }).textContent();
  const remaining = Number(remainingText?.match(/\d+/)?.[0]);
  if (!Number.isInteger(remaining) || remaining < 1) {
    throw new Error(`Could not read remaining reinforcements from: ${remainingText}`);
  }

  for (let count = 1; count < remaining; count += 1) {
    await page.getByRole("button", { name: "Increase placement count" }).click();
  }

  const territory = page
    .locator('[data-map-canvas-zone="true"] button:enabled:not([aria-label="Enter fullscreen map"])')
    .filter({ hasNotText: /^(All|Attack|Fortify|Move)$/ })
    .first();
  await territory.click();
  await page.getByRole("button", { name: "Confirm placements" }).click();
  await expect(page.getByRole("button", { name: "End Attack" })).toBeVisible();
}

export async function completeTurnWithoutAttack(page: Page) {
  await page.getByRole("button", { name: "End Attack" }).click();
  await expect(page.getByRole("button", { name: "End Turn" })).toBeVisible();
  await page.getByRole("button", { name: "End Turn" }).click();
  await expect(page.getByRole("button", { name: "End Turn" })).toBeHidden();
}

export async function resign(page: Page) {
  await page.getByRole("button", { name: "Resign game", exact: true }).click();
  const approveResign = page.getByRole("button", { name: "Yes", exact: true });
  await expect(approveResign).toBeVisible();
  const confirmation = page.waitForEvent("dialog").then(async (dialog) => {
    expect(dialog.message()).toBe("Are you sure you want to resign this game?");
    await dialog.accept();
  });
  await approveResign.click();
  await confirmation;
}
