#!/usr/bin/env python3
import argparse
import sqlite3
from pathlib import Path


PRIORITY_SOURCES = (
    "AGENTS.md",
    "WORKSPACE.md",
    "WORKFLOWS.md",
    "docs/journal/2026-04.md",
    "docs/guides/ai/mempalace-project-memory.md",
)


def compact(text: str, limit: int = 600) -> str:
    return " ".join((text or "").split())[:limit]


def load_status(conn: sqlite3.Connection):
    rows = conn.execute(
        """
        SELECT
          MAX(CASE WHEN em.key='source_file' THEN em.string_value END) AS source_file,
          MAX(CASE WHEN em.key='room' THEN em.string_value END) AS room
        FROM embedding_metadata em
        GROUP BY em.id
        """
    ).fetchall()
    source_files = set()
    room_counts = {}
    for source_file, room in rows:
        if source_file:
            source_files.add(source_file)
        room_counts[room or "unknown"] = room_counts.get(room or "unknown", 0) + 1
    return len(rows), len(source_files), room_counts


def pick_priority_snippets(conn: sqlite3.Connection):
    snippets = []
    query = """
    SELECT
      MAX(CASE WHEN em.key='source_file' THEN em.string_value END) AS source_file,
      MAX(CASE WHEN em.key='room' THEN em.string_value END) AS room,
      MAX(CASE WHEN em.key='chroma:document' THEN em.string_value END) AS document
    FROM embedding_metadata em
    GROUP BY em.id
    """
    rows = conn.execute(query).fetchall()
    for pattern in PRIORITY_SOURCES:
      for source_file, room, document in rows:
        if source_file and source_file.replace("\\", "/").endswith(pattern):
          snippets.append((room or "unknown", source_file, compact(document)))
          break
    return snippets


def main() -> int:
    parser = argparse.ArgumentParser(description="SQLite fallback wake-up for project MemPalace.")
    parser.add_argument("--palace", required=True)
    parser.add_argument("--wing")
    args = parser.parse_args()

    db_path = Path(args.palace).expanduser().resolve() / "chroma.sqlite3"
    conn = sqlite3.connect(str(db_path))

    drawer_count, source_file_count, room_counts = load_status(conn)
    snippets = pick_priority_snippets(conn)
    conn.close()

    print("Wake-up text (sqlite fallback):")
    print("==================================================")
    print("## L0 — IDENTITY")
    print("No identity configured. Create ~/.mempalace/identity.txt")
    print("")
    print("## L1 — PROJECT MEMORY SNAPSHOT")
    print(f"- indexed source files: {source_file_count}")
    print(f"- drawers: {drawer_count}")
    print("- rooms:")
    for room, count in sorted(room_counts.items(), key=lambda item: (-item[1], item[0]))[:8]:
      print(f"  - {room}: {count}")
    print("")
    for room, source_file, document in snippets:
      print(f"[{room}] {Path(source_file).name}")
      print(f"  {document}")
    print("")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
