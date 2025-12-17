from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path
import subprocess


@dataclass(frozen=True)
class Finding:
    path: Path
    line: int
    kind: str
    excerpt: str


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _is_binary(path: Path) -> bool:
    try:
        chunk = path.read_bytes()[:4096]
    except OSError:
        return True
    return b"\x00" in chunk


def _should_ignore(path: Path) -> bool:
    rel = path.relative_to(_repo_root()).as_posix()

    # Large/irrelevant directories
    if rel.startswith(".git/"):
        return True
    if rel.startswith(".cursor/"):
        return True
    if rel.startswith(".playwright-mcp/"):
        return True
    if rel.startswith("landslide-monitor.rar"):
        return True

    # Dependencies/build outputs
    if "/node_modules/" in f"/{rel}/":
        return True
    if "/.next/" in f"/{rel}/":
        return True
    if "/dist/" in f"/{rel}/" or "/build/" in f"/{rel}/":
        return True
    if rel.endswith(".map"):
        return True

    # Legacy/third-party folders that are not part of v2 implementation plan
    # (still kept in repo, but we don't enforce secrets scanning here to avoid noise)
    if rel.startswith("txsmartropenharmony/"):
        return True

    # Binary assets
    if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".pdf", ".zip", ".rar"}:
        return True

    return False


def _compile_patterns() -> list[tuple[str, re.Pattern[str]]]:
    # Allow placeholders already used in repo
    allow = r"(REDACTED_|example\.local|<token>|<secret>|YOUR_|CHANGE_ME)"

    patterns: list[tuple[str, re.Pattern[str]]] = [
        # Generic “looks like secret”
        ("aws_access_key_id", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
        ("aws_secret_access_key", re.compile(r"\baws_secret_access_key\s*[:=]\s*['\"]?(?!"+allow+r")[A-Za-z0-9/+=]{30,}")),
        ("jwt_like", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
        ("private_key_pem", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
        # Key/value style leaks (require string literal-like values to reduce false positives)
        (
            "kv_secret_literal",
            re.compile(
                r"(?i)\b(api[_-]?key|secret|token|password)\b\s*[:=]\s*['\"](?!"
                + allow
                + r")[^'\"]{12,}['\"]"
            ),
        ),
        (
            "kv_mqtt_password_literal",
            re.compile(r"(?i)\bmqtt(_|-)?password\b\s*[:=]\s*['\"](?!"+allow+r")[^'\"]{8,}['\"]"),
        ),
        # Supabase style
        ("supabase_key", re.compile(r"\b(anon|service)_key\\b\\s*[:=]\\s*['\"]?(?!"+allow+r")[A-Za-z0-9._-]{20,}")),
    ]
    return patterns


def _scan_file(path: Path, patterns: list[tuple[str, re.Pattern[str]]]) -> list[Finding]:
    findings: list[Finding] = []

    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return findings

    for idx, line in enumerate(text.splitlines(), start=1):
        for kind, pattern in patterns:
            if pattern.search(line):
                excerpt = line.strip()
                if len(excerpt) > 240:
                    excerpt = excerpt[:240] + "..."
                findings.append(Finding(path=path, line=idx, kind=kind, excerpt=excerpt))

    return findings


def _check_env_files(path: Path) -> list[Finding]:
    # Block committing real env files by convention; keep examples only.
    name = path.name.lower()
    if not name.startswith(".env"):
        return []
    if name in {".env.example", ".env.template"}:
        return []
    return [Finding(path=path, line=1, kind="env_file", excerpt="Do not commit real .env files; use .env.example")]

def _tracked_files(repo_root: Path) -> list[Path]:
    """
    Scan only tracked files.

    Rationale:
    - Local developers often have `.env` and other untracked files.
    - Secrets gate should enforce what can be pushed to GitHub (tracked content).
    """
    try:
        proc = subprocess.run(
            ["git", "ls-files", "-z"],
            cwd=repo_root,
            check=True,
            capture_output=True,
        )
    except Exception:  # noqa: BLE001
        return []

    raw = proc.stdout
    parts = [p for p in raw.split(b"\x00") if p]
    return [repo_root / p.decode("utf-8", errors="replace") for p in parts]


def main() -> int:
    repo_root = _repo_root()
    patterns = _compile_patterns()
    findings: list[Finding] = []

    tracked = _tracked_files(repo_root)
    if not tracked:
        print("Warning: could not list tracked files (git ls-files). Falling back to full scan.")
        tracked = []
        for path in repo_root.rglob("*"):
            try:
                if path.is_file():
                    tracked.append(path)
            except OSError:
                continue

    for path in tracked:
        if _should_ignore(path):
            continue
        if _is_binary(path):
            continue

        findings.extend(_check_env_files(path))
        findings.extend(_scan_file(path, patterns))

    if findings:
        print("Secrets scan failed:\n")
        for f in findings[:200]:
            rel = f.path.relative_to(repo_root).as_posix()
            print(f"- [{f.kind}] {rel}:{f.line} {f.excerpt}")
        if len(findings) > 200:
            print(f"\n... and {len(findings) - 200} more findings")
        print("\nFix suggestions:")
        print("- Remove secrets from repo history if already leaked (rotate keys).")
        print("- Replace with placeholders like REDACTED_SECRET or use .env.example.")
        return 1

    print("Secrets scan passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
