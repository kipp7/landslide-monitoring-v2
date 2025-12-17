from __future__ import annotations

import hashlib
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def main() -> int:
    repo_root = _repo_root()
    openapi_path = repo_root / "docs" / "integrations" / "api" / "openapi.yaml"
    stamp_path = repo_root / "docs" / "integrations" / "api" / "openapi.sha256"

    if not openapi_path.exists():
        print(f"Missing: {openapi_path.as_posix()}")
        return 1

    digest = hashlib.sha256(openapi_path.read_bytes()).hexdigest()
    stamp_path.write_text(digest + "\n", encoding="utf-8")

    print("Updated OpenAPI stamp:")
    print(f"- {stamp_path.as_posix()}")
    print(f"- sha256: {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

