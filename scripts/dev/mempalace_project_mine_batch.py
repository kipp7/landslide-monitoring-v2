#!/usr/bin/env python3
import argparse
import fnmatch
import json
import os
import sys
from collections import Counter
from pathlib import Path

import mempalace.miner as mempalace_miner
from mempalace.miner import MIN_CHUNK_SIZE, load_config, process_file, scan_project
from mempalace.palace import get_collection


THREAD_LIMIT_ENV = {
    "OMP_NUM_THREADS": "1",
    "OPENBLAS_NUM_THREADS": "1",
    "MKL_NUM_THREADS": "1",
    "NUMEXPR_NUM_THREADS": "1",
    "ORT_NUM_THREADS": "1",
    "PYTHONIOENCODING": "utf-8",
    "PYTHONUTF8": "1",
}

DEFAULT_EXCLUDE_GLOBS = (
    "apps/web/public/china.json",
    "docs/unified/reports/history/desk-mainline-proof-*.json",
    "docs/unified/reports/desk-mainline-proof-latest.json",
)

DEFAULT_HARD_MAX_FILE_BYTES = 250000
DEFAULT_LARGE_TEXT_CHUNK_SIZE = 2400
DEFAULT_LARGE_TEXT_CHUNK_OVERLAP = 200


def apply_runtime_limits() -> None:
    for key, value in THREAD_LIMIT_ENV.items():
        os.environ.setdefault(key, value)
    # Larger chunks reduce drawer explosion on long journals and reports.
    mempalace_miner.CHUNK_SIZE = DEFAULT_LARGE_TEXT_CHUNK_SIZE
    mempalace_miner.CHUNK_OVERLAP = DEFAULT_LARGE_TEXT_CHUNK_OVERLAP


def safe_text_len(path: Path) -> int:
    try:
        return len(path.read_text(encoding="utf-8", errors="replace").strip())
    except OSError:
        return 0


def safe_file_size(path: Path) -> int:
    try:
        return path.stat().st_size
    except OSError:
        return 0


def relative_posix(filepath: Path, repo_root: Path) -> str:
    try:
        return filepath.relative_to(repo_root).as_posix()
    except ValueError:
        return filepath.as_posix()


def should_exclude_file(filepath: Path, repo_root: Path) -> bool:
    relative = relative_posix(filepath, repo_root)
    lower_relative = relative.lower()

    for pattern in DEFAULT_EXCLUDE_GLOBS:
        if fnmatch.fnmatch(lower_relative, pattern.lower()):
            return True

    file_size = safe_file_size(filepath)
    suffix = filepath.suffix.lower()

    if file_size > DEFAULT_HARD_MAX_FILE_BYTES and suffix in {".json", ".sql"}:
        return True

    return False


def build_source_index(collection) -> dict[str, float | None]:
    total = collection.count()
    if total <= 0:
        return {}

    result = collection.get(limit=total, include=["metadatas"])
    source_index: dict[str, float | None] = {}
    for metadata in result.get("metadatas") or []:
        if not metadata:
            continue
        source_file = metadata.get("source_file")
        if not source_file or source_file in source_index:
            continue
        source_mtime = metadata.get("source_mtime")
        try:
            source_index[source_file] = float(source_mtime) if source_mtime is not None else None
        except (TypeError, ValueError):
            source_index[source_file] = None
    return source_index


def is_current(filepath: Path, source_index: dict[str, float | None]) -> bool:
    source_file = str(filepath)
    if source_file not in source_index:
        return False

    stored_mtime = source_index[source_file]
    if stored_mtime is None:
        return False

    try:
        current_mtime = filepath.stat().st_mtime
    except OSError:
        return False

    return abs(stored_mtime - current_mtime) < 0.001


def is_indexable(filepath: Path) -> bool:
    return safe_text_len(filepath) >= MIN_CHUNK_SIZE


def select_batch(
    files: list[Path],
    source_index: dict[str, float | None],
    max_files: int,
    max_bytes: int,
    repo_root: Path,
):
    selected: list[Path] = []
    selected_bytes = 0
    pending_total = 0

    for filepath in files:
        if should_exclude_file(filepath, repo_root):
            continue
        if not is_indexable(filepath):
            continue
        if is_current(filepath, source_index):
            continue

        pending_total += 1
        file_size = safe_file_size(filepath)
        fits_file_limit = len(selected) < max_files
        fits_byte_limit = selected_bytes + file_size <= max_bytes
        if fits_file_limit and (fits_byte_limit or not selected):
            selected.append(filepath)
            selected_bytes += file_size

    return pending_total, selected, selected_bytes


def top_level_name(filepath: Path, repo_root: Path) -> str:
    try:
        relative = filepath.relative_to(repo_root)
    except ValueError:
        return "."
    return relative.parts[0] if relative.parts else "."


def main() -> int:
    parser = argparse.ArgumentParser(description="Process one stable MemPalace mining batch.")
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--palace", required=True)
    parser.add_argument("--agent", default="codex")
    parser.add_argument("--max-files", type=int, default=8)
    parser.add_argument("--max-bytes", type=int, default=120000)
    args = parser.parse_args()

    apply_runtime_limits()

    repo_root = Path(args.repo_root).expanduser().resolve()
    palace_path = Path(args.palace).expanduser().resolve()
    config = load_config(str(repo_root))
    wing = config["wing"]
    rooms = config.get("rooms", [{"name": "general", "description": "All project files"}])

    collection = get_collection(str(palace_path))
    try:
        source_index = build_source_index(collection)
        files = scan_project(str(repo_root))
        pending_total, selected, selected_bytes = select_batch(
            files=files,
            source_index=source_index,
            max_files=args.max_files,
            max_bytes=args.max_bytes,
            repo_root=repo_root,
        )

        drawers_filed = 0
        room_counts = Counter()
        top_level_counts = Counter()
        current_file = None

        try:
            for filepath in selected:
                current_file = str(filepath)
                drawers, room = process_file(
                    filepath=filepath,
                    project_path=repo_root,
                    collection=collection,
                    wing=wing,
                    rooms=rooms,
                    agent=args.agent,
                    dry_run=False,
                )
                drawers_filed += drawers
                if drawers > 0:
                    room_counts[room] += 1
                    top_level_counts[top_level_name(filepath, repo_root)] += 1
        except Exception as exc:
            failure = {
                "ok": False,
                "repoRoot": str(repo_root),
                "palacePath": str(palace_path),
                "currentFile": current_file,
                "selectedFiles": [str(path) for path in selected],
                "errorType": type(exc).__name__,
                "error": str(exc),
            }
            print(json.dumps(failure, ensure_ascii=False), file=sys.stderr)
            raise

        result = {
            "ok": True,
            "repoRoot": str(repo_root),
            "palacePath": str(palace_path),
            "wing": wing,
            "chunkSize": mempalace_miner.CHUNK_SIZE,
            "chunkOverlap": mempalace_miner.CHUNK_OVERLAP,
            "scannedFiles": len(files),
            "indexedSourceFiles": len(source_index),
            "pendingFilesBeforeBatch": pending_total,
            "selectedFiles": len(selected),
            "selectedBytes": selected_bytes,
            "processedFiles": len(selected),
            "drawersFiled": drawers_filed,
            "roomCounts": dict(sorted(room_counts.items())),
            "topLevelCounts": dict(sorted(top_level_counts.items())),
            "done": pending_total == 0 or pending_total <= len(selected),
        }
        print(json.dumps(result, ensure_ascii=False))
        return 0
    finally:
        if hasattr(collection, "close"):
            collection.close()


if __name__ == "__main__":
    raise SystemExit(main())
