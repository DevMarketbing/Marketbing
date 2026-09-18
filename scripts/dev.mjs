// Runs the API server (tsx watch) and the Vite dev server together.
import { spawn } from "node:child_process";

const procs = [
  spawn("npx", ["tsx", "watch", "server/index.ts"], { stdio: "inherit" }),
  spawn("npx", ["vite"], { stdio: "inherit" }),
];

const stop = () => {
  for (const p of procs) p.kill("SIGINT");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const p of procs) p.on("exit", (code) => {
  if (code && code !== 0) stop();
});
