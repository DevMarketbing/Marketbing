// Runs the API server (tsx watch) and the Vite dev server together.
import { spawn } from "node:child_process";

// Run through a shell: on Windows npx is npx.cmd, which needs one. Commands
// are passed as whole strings (not an args array) to avoid Node's DEP0190.
const opts = { stdio: "inherit", shell: true };
const procs = [
  spawn("npx tsx watch server/index.ts", opts),
  spawn("npx vite", opts),
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
