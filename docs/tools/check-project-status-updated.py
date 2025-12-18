from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


REQUIRED_FILE = Path("docs/guides/roadmap/project-status.md")

SIGNIFICANT_PREFIXES = (
    "services/",
    "infra/",
    "libs/",
    "apps/",
    "docs/integrations/",
    "docs/architecture/",
)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=_repo_root(),
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )


def _is_pr_context() -> bool:
    # GitHub Actions provides GITHUB_EVENT_NAME=pull_request
    return os.getenv("GITHUB_EVENT_NAME", "").lower() == "pull_request"


def _git_changed_files(base_ref: str) -> list[str]:
    fetch = _run(["git", "fetch", "--no-tags", "--prune", "origin", base_ref])
    if fetch.returncode != 0:
        raise RuntimeError(f"git fetch failed for {base_ref}:\n{fetch.stdout}")

    diff = _run(
        [
            "git",
            "diff",
            "--name-only",
            "--diff-filter=ACMRTUXB",
            f"origin/{base_ref}...HEAD",
        ]
    )
    if diff.returncode != 0:
        raise RuntimeError(f"git diff failed:\n{diff.stdout}")

    return [line.strip() for line in diff.stdout.splitlines() if line.strip()]


def main() -> int:
    if not _is_pr_context():
        print("SKIP: project-status gate runs only in pull_request context.")
        return 0

    base = os.getenv("GITHUB_BASE_REF", "").strip()
    if not base:
        print("SKIP: missing GITHUB_BASE_REF; cannot determine base branch.")
        return 0

    changed = _git_changed_files(base)
    if not changed:
        print("OK: no changed files detected.")
        return 0

    needs_status = any(p.startswith(SIGNIFICANT_PREFIXES) for p in changed)
    if not needs_status:
        print("OK: change is not in significant paths; project-status update not required.")
        return 0

    required = str(REQUIRED_FILE).replace("\\", "/")
    if required in changed:
        print("OK: project-status updated.")
        return 0

    print("FAILED: project-status update required but missing.")
    print(f"- Required: update `{required}`")
    print("- Reason: PR touches significant paths that affect progress/architecture/contracts.")
    print("- Fix: add a short, factual update (current stage, what changed, next actions).")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

