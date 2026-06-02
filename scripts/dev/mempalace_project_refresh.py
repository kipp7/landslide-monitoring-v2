#!/usr/bin/env python3
import atexit
import argparse
import gc
import json
import os
from pathlib import Path

try:
    import msvcrt
except ImportError:  # pragma: no cover - non-Windows fallback is unused here
    msvcrt = None

from mempalace.miner import load_config, process_file, scan_project
from mempalace.palace import get_collection

from mempalace_project_mine_batch import (
    apply_runtime_limits,
    build_source_index,
    is_indexable,
    select_batch,
    should_exclude_file,
)

_LOCK_HANDLE = None


def acquire_single_writer_lock(repo_root: Path) -> Path:
    global _LOCK_HANDLE
    lock_dir = repo_root / ".tmp" / "mempalace"
    lock_dir.mkdir(parents=True, exist_ok=True)
    lock_path = lock_dir / "refresh.helper.lock"

    handle = open(lock_path, "a+", encoding="utf-8")
    if msvcrt is None:
        _LOCK_HANDLE = handle
        return lock_path

    try:
        handle.seek(0)
        msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        handle.close()
        raise RuntimeError(f"refresh already running; lock held at {lock_path}")

    handle.seek(0)
    handle.truncate()
    handle.write(
        json.dumps(
            {
                "pid": os.getpid(),
                "repoRoot": str(repo_root),
            },
            ensure_ascii=False,
        )
    )
    handle.flush()
    _LOCK_HANDLE = handle
    return lock_path


def release_single_writer_lock() -> None:
    global _LOCK_HANDLE
    if _LOCK_HANDLE is None:
        return
    try:
        if msvcrt is not None:
            _LOCK_HANDLE.seek(0)
            msvcrt.locking(_LOCK_HANDLE.fileno(), msvcrt.LK_UNLCK, 1)
    except OSError:
        pass
    try:
        lock_path = Path(_LOCK_HANDLE.name)
        _LOCK_HANDLE.close()
        if lock_path.exists():
            lock_path.unlink()
    except OSError:
        pass
    finally:
        _LOCK_HANDLE = None


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a stable single-process MemPalace refresh.")
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--palace", required=True)
    parser.add_argument("--agent", default="codex")
    parser.add_argument("--max-files", type=int, default=20)
    parser.add_argument("--max-bytes", type=int, default=200000)
    parser.add_argument("--max-passes", type=int, default=400)
    args = parser.parse_args()

    apply_runtime_limits()

    repo_root = Path(args.repo_root).expanduser().resolve()
    palace_path = Path(args.palace).expanduser().resolve()
    acquire_single_writer_lock(repo_root)
    atexit.register(release_single_writer_lock)
    config = load_config(str(repo_root))
    wing = config["wing"]
    rooms = config.get("rooms", [{"name": "general", "description": "All project files"}])

    collection = get_collection(str(palace_path))
    try:
        source_index = build_source_index(collection)
        files = [
            path
            for path in scan_project(str(repo_root))
            if is_indexable(path) and not should_exclude_file(path, repo_root)
        ]

        for batch in range(1, args.max_passes + 1):
            pending_total, selected, selected_bytes = select_batch(
                files=files,
                source_index=source_index,
                max_files=args.max_files,
                max_bytes=args.max_bytes,
                repo_root=repo_root,
            )

            drawers_filed = 0
            for filepath in selected:
                drawers, _room = process_file(
                    filepath=filepath,
                    project_path=repo_root,
                    collection=collection,
                    wing=wing,
                    rooms=rooms,
                    agent=args.agent,
                    dry_run=False,
                )
                drawers_filed += drawers
                source_index[str(filepath)] = filepath.stat().st_mtime

            payload = {
                "batch": batch,
                "repoRoot": str(repo_root),
                "palacePath": str(palace_path),
                "indexedSourceFiles": len(source_index),
                "pendingFilesBeforeBatch": pending_total,
                "selectedFiles": len(selected),
                "selectedBytes": selected_bytes,
                "drawersFiled": drawers_filed,
                "done": pending_total == 0 or pending_total <= len(selected),
            }
            print(json.dumps(payload, ensure_ascii=False), flush=True)

            gc.collect()

            if pending_total == 0 or pending_total <= len(selected):
                break
    finally:
        if hasattr(collection, "close"):
            collection.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
