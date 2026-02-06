const web = Bun.spawn(["bun", "run", "--filter", "web", "dev"], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

const backend = Bun.spawn(["bun", "run", "dev:backend"], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

const terminate = () => {
  if (web.exitCode === null) web.kill();
  if (backend.exitCode === null) backend.kill();
};

process.on("SIGINT", terminate);
process.on("SIGTERM", terminate);

const [webExit, backendExit] = await Promise.all([web.exited, backend.exited]);

if (webExit !== 0 || backendExit !== 0) {
  process.exit(webExit !== 0 ? webExit : backendExit);
}
