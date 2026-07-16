import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { authFileFor, readSmokeConfig } from "./support/smoke-config";

setup("authenticate seeded Smoke Users", async ({ browser }) => {
  const config = readSmokeConfig();
  await mkdir(path.dirname(authFileFor("alpha")), { recursive: true });

  for (const user of config.users) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${config.origin}/login`);
    await page.getByLabel("Email or username").fill(user.identifier);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/home(?:$|[?#])/);
    await context.storageState({ path: authFileFor(user.key) });
    await context.close();
  }
});
