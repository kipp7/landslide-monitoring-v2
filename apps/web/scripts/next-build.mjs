import { spawn } from "node:child_process";

const nodeOptionsRaw = process.env.NODE_OPTIONS ?? "";
const hasMaxOldSpace = /--max-old-space-size=\d+/.test(nodeOptionsRaw);

const env = {
  ...process.env,
  NODE_OPTIONS: hasMaxOldSpace ? nodeOptionsRaw : `${nodeOptionsRaw} --max-old-space-size=8192`.trim()
};

const child =
  process.platform === "win32"
    ? spawn("cmd.exe", ["/d", "/s", "/c", "next", "build"], { stdio: "inherit", env })
    : spawn("next", ["build"], { stdio: "inherit", env });

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
