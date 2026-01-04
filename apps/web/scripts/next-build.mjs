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

function findUpstreamNextPackageDir(fromDir) {
  let dir = path.resolve(fromDir);
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, "node_modules", "next", "package.json");
    if (fs.existsSync(candidate)) return path.dirname(candidate);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Workaround (Windows/npm workspaces): sometimes `apps/web/node_modules/next` becomes a broken partial folder
// (missing package.json / dist/shared), which causes `next build` to fail. Remove it so Node resolves to the
// workspace root `node_modules/next` instead.
try {
  const localNextDir = path.resolve(process.cwd(), "node_modules", "next");
  if (fs.existsSync(localNextDir)) {
    const localPkg = path.join(localNextDir, "package.json");
    const localSharedUtils = path.join(localNextDir, "dist", "shared", "lib", "utils.js");
    const broken = !fs.existsSync(localPkg) || !fs.existsSync(localSharedUtils);

    if (broken) {
      const upstream = findUpstreamNextPackageDir(path.resolve(process.cwd(), ".."));
      if (upstream && upstream !== localNextDir) {
        fs.rmSync(localNextDir, { recursive: true, force: true });
        console.warn(
          `[next-build] Removed broken local Next.js folder: ${localNextDir} (using upstream: ${upstream})`
        );
      }
    }
  }
} catch {
  // best-effort only
}

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
