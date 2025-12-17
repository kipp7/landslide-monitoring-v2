from __future__ import annotations

import hashlib
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _sha256(path: Path) -> str:
    # Normalize CRLF/LF to avoid cross-platform mismatch.
    data = path.read_bytes().replace(b"\r\n", b"\n")
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    repo_root = _repo_root()
    openapi_path = repo_root / "docs" / "integrations" / "api" / "openapi.yaml"
    stamp_path = repo_root / "docs" / "integrations" / "api" / "openapi.sha256"

    if not openapi_path.exists():
        print(f"Missing: {openapi_path.as_posix()}")
        return 1
    if not stamp_path.exists():
        print("Missing OpenAPI stamp file.")
        print(f"Expected: {stamp_path.as_posix()}")
        print("Fix: run `python docs/tools/update-openapi-stamp.py`")
        return 1

    expected = stamp_path.read_text(encoding="utf-8").strip()
    actual = _sha256(openapi_path)

    if expected != actual:
        print("OpenAPI codegen stamp mismatch.\n")
        print(f"- openapi.yaml sha256:  {actual}")
        print(f"- openapi.sha256 value: {expected}")
        print("\nFix:")
        print("- Run `python docs/tools/update-openapi-stamp.py` after updating OpenAPI.")
        print("- This is a placeholder gate for API client/DTO codegen; later it will be replaced by real generators.")
        return 1

    print("OpenAPI stamp check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
