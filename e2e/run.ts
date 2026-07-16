export {};

const playwright = Bun.spawn(
  ["bun", "x", "playwright", "test", ...process.argv.slice(2)],
  {
    env: { ...process.env },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  },
);

process.exit(await playwright.exited);
