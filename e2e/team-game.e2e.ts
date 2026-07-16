import { expect, test, type Page } from "@playwright/test";
import {
  closeSmokeSessions,
  completeTurnWithoutAttack,
  createGame,
  findTurnSession,
  joinGame,
  openSmokeSessions,
  queueAllReinforcements,
  resign,
  startGame,
  type SmokeSession,
} from "./support/game-journey";
import { readSmokeConfig } from "./support/smoke-config";

async function ownTeamLabel(page: Page, username: string) {
  const ownRow = page.getByRole("cell", { name: username, exact: true }).locator("xpath=ancestor::tr");
  await expect(ownRow).toBeVisible();
  return (await ownRow.locator("td").nth(4).textContent())?.trim() ?? "";
}

async function sessionsByTeam(sessions: SmokeSession[], usernames: Map<string, string>) {
  const groups = new Map<string, SmokeSession[]>();
  for (const session of sessions) {
    const label = await ownTeamLabel(session.page, usernames.get(session.key)!);
    groups.set(label, [...(groups.get(label) ?? []), session]);
  }
  return [...groups.values()];
}

test("team Game supports delegated play and finishes with a winning team", async ({ browser }) => {
  const { origin, users } = readSmokeConfig();
  const usernames = new Map(users.map((user) => [user.key, user.identifier]));
  const sessions = await openSmokeSessions(browser, origin, ["alpha", "bravo", "charlie", "delta"]);
  const [host, ...guests] = sessions;

  try {
    const name = `Smoke Teams ${Date.now()}`;
    const inviteCode = await createGame(host.page, { name, playerCount: 4, teamMode: true });
    await Promise.all(guests.map(({ page }) => joinGame(page, inviteCode)));
    await host.page.getByRole("button", { name: "Auto rebalance" }).click();
    await expect(host.page.getByRole("button", { name: "Start Game" })).toBeVisible();
    await startGame(host.page, 4);
    await Promise.all(guests.map(({ page }) => expect(page.getByRole("img", { name: "Global Domination map" })).toBeVisible()));

    const turnOwner = await findTurnSession(sessions);
    await turnOwner.page.getByRole("button", { name: "Open game rules" }).click();
    await turnOwner.page.getByRole("switch", { name: "Allow teammates to play my turns" }).click();
    await turnOwner.page.getByRole("button", { name: "Close" }).click();

    const delegated = await expect.poll(async () => {
      for (const session of sessions) {
        if (session.key === turnOwner.key) continue;
        if (await session.page.locator('button[aria-label^="Play for "]').isVisible()) return session.key;
      }
      return null;
    }).not.toBeNull().then(async () => {
      for (const session of sessions) {
        if (await session.page.locator('button[aria-label^="Play for "]').isVisible()) return session;
      }
      throw new Error("No teammate could take the delegated turn");
    });

    await delegated.page.locator('button[aria-label^="Play for "]').click();
    await expect(delegated.page.getByText("Click territory to place", { exact: true })).toBeVisible();
    await queueAllReinforcements(delegated.page);
    await completeTurnWithoutAttack(delegated.page);

    const teamGroups = await sessionsByTeam(sessions, usernames);
    expect(teamGroups.map((group) => group.length).sort()).toEqual([2, 2]);
    const losingTeam = teamGroups.find((group) => !group.some((session) => session.key === turnOwner.key))!;

    await resign(losingTeam[0]!.page);
    const firstLosingUsername = usernames.get(losingTeam[0]!.key)!;
    const firstLosingRow = losingTeam[0]!.page
      .getByRole("cell", { name: firstLosingUsername, exact: true })
      .locator("xpath=ancestor::tr");
    await expect(firstLosingRow).toContainText("Defeated");
    await resign(losingTeam[1]!.page);

    const winner = sessions.find((session) => !losingTeam.includes(session))!;
    await expect(losingTeam[0]!.page.getByText("You have been eliminated", { exact: true })).toBeVisible();
    await expect(losingTeam[1]!.page.getByText("You have been eliminated", { exact: true })).toBeVisible();
    await expect(winner.page.getByText("You won!", { exact: true })).toBeVisible();
  } finally {
    await closeSmokeSessions(sessions);
  }
});
