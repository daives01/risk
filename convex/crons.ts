import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "process async turn timeouts",
  { minutes: 1 },
  internal.asyncTurns.processExpiredTurns,
  {},
);

export default crons;
