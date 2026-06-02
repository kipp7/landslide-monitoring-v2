#!/usr/bin/env python3
import argparse
import json
import sqlite3
from collections import Counter
from pathlib import Path


def read_status_from_sqlite(db_path: Path):
    conn = sqlite3.connect(str(db_path))
    try:
        rows = conn.execute(
            """
            SELECT e.embedding_id, em.key, em.string_value
            FROM embedding_metadata em
            JOIN embeddings e ON e.id = em.id
            WHERE em.key IN ('source_file', 'room')
            """
        )
        room_counts = Counter()
        source_files = set()
        drawer_ids = set()
        current = {}

        for drawer_id, key, string_value in rows:
            drawer_ids.add(drawer_id)
            data = current.setdefault(drawer_id, {})
            data[key] = string_value

        for data in current.values():
            source_file = data.get("source_file")
            room = data.get("room", "unknown")
            if source_file:
                source_files.add(source_file)
            room_counts[room] += 1

        return {
            "drawerCount": len(drawer_ids),
            "indexedSourceFiles": len(source_files),
            "roomCounts": dict(sorted(room_counts.items())),
            "mode": "sqlite-fallback",
        }
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Read quick MemPalace project status.")
    parser.add_argument("--palace", required=True)
    args = parser.parse_args()

    palace_path = Path(args.palace).expanduser().resolve()
    db_path = palace_path / "chroma.sqlite3"

    if not db_path.exists():
        raise FileNotFoundError(f"MemPalace database not found: {db_path}")

    payload = read_status_from_sqlite(db_path)
    payload["mode"] = "sqlite-metadata"
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
