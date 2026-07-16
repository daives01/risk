import { expect, test } from "@playwright/test";
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
} from "./support/game-journey";
import { readSmokeConfig } from "./support/smoke-config";

test("individual Game can be created, played, finished, and replayed", async ({ browser }) => {
  const { origin } = readSmokeConfig();
  const sessions = await openSmokeSessions(browser, origin, ["alpha", "bravo"]);
  const [host, guest] = sessions;

  try {
    const name = `Smoke Individual ${Date.now()}`;
    const inviteCode = await createGame(host.page, { name, playerCount: 2, teamMode: false });
    await joinGame(guest.page, inviteCode);
    await startGame(host.page, 2);
    await expect(guest.page.getByRole("img", { name: "Global Domination map" })).toBeVisible();

    const turnOwner = await findTurnSession(sessions);
    await queueAllReinforcements(turnOwner.page);
    await completeTurnWithoutAttack(turnOwner.page);

    const resigning = sessions.find((session) => session.key !== turnOwner.key)!;
    await resign(resigning.page);
    await expect(turnOwner.page.getByText("You won!", { exact: true })).toBeVisible();

    await turnOwner.page.getByRole("button", { name: "Close" }).click();
    await turnOwner.page.getByRole("button", { name: "Toggle history" }).click();
    await expect(turnOwner.page.getByRole("slider", { name: "Replay timeline frame" })).toBeVisible();
  } finally {
    await closeSmokeSessions(sessions);
  }
});
