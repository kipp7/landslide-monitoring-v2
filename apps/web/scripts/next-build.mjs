import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const nodeOptionsRaw = process.env.NODE_OPTIONS ?? "";
const hasMaxOldSpace = /--max-old-space-size=\d+/.test(nodeOptionsRaw);

const defaultDistDir = ".next_web";
const nextDistDir = (process.env.NEXT_DIST_DIR || defaultDistDir).trim() || defaultDistDir;

const env = {
  ...process.env,
  NEXT_DIST_DIR: nextDistDir,
  NODE_OPTIONS: hasMaxOldSpace ? nodeOptionsRaw : `${nodeOptionsRaw} --max-old-space-size=8192`.trim()
};

// Workaround (Windows): remove previous distDir to avoid `.next*/trace` lock issues that can hang `next build`.
try {
  const distDirPath = path.resolve(process.cwd(), nextDistDir);
  if (fs.existsSync(distDirPath)) {
    fs.rmSync(distDirPath, { recursive: true, force: true });
  }
} catch {
  // best-effort only
}

const child =
  process.platform === "win32"
    ? spawn("cmd.exe", ["/d", "/s", "/c", "next", "build"], { stdio: "inherit", env })
    : spawn("next", ["build"], { stdio: "inherit", env });

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
