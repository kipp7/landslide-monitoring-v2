from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _run(cmd: list[str]) -> int:
    proc = subprocess.run(cmd, cwd=_repo_root(), check=False)
    return int(proc.returncode)


def main() -> int:
    steps: list[tuple[str, list[str]]] = [
        ("openapi stamp", [sys.executable, "docs/tools/check-openapi-stamp.py"]),
        ("contract validation", [sys.executable, "docs/tools/validate-contracts.py"]),
        ("secrets scan", [sys.executable, "docs/tools/scan-secrets.py"]),
    ]

    for name, cmd in steps:
        print(f"\n== {name} ==", flush=True)
        code = _run(cmd)
        if code != 0:
            print(f"\nFAILED: {name}")
            return code

    print("\nAll quality gates passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
