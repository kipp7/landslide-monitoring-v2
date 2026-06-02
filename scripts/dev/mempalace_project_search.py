#!/usr/bin/env python3
import argparse
import sqlite3
from pathlib import Path


def build_search_query() -> str:
    return """
    WITH matched AS (
      SELECT
        f.rowid AS doc_id,
        f.string_value AS document,
        bm25(embedding_fulltext_search) AS rank
      FROM embedding_fulltext_search f
      WHERE embedding_fulltext_search MATCH ?
      ORDER BY rank
      LIMIT ?
    )
    SELECT
      m.doc_id,
      m.rank,
      MAX(CASE WHEN em.key='wing' THEN em.string_value END) AS wing,
      MAX(CASE WHEN em.key='room' THEN em.string_value END) AS room,
      MAX(CASE WHEN em.key='source_file' THEN em.string_value END) AS source_file,
      m.document
    FROM matched m
    JOIN embedding_metadata em ON em.id = m.doc_id
    GROUP BY m.doc_id, m.rank, m.document
    ORDER BY m.rank
    LIMIT ?
    """


def normalize_excerpt(text: str, limit: int = 1200) -> str:
    compact = " ".join((text or "").split())
    return compact[:limit]


def main() -> int:
    parser = argparse.ArgumentParser(description="SQLite fallback search for project MemPalace.")
    parser.add_argument("--palace", required=True)
    parser.add_argument("--query", required=True)
    parser.add_argument("--results", type=int, default=8)
    parser.add_argument("--wing")
    parser.add_argument("--room")
    args = parser.parse_args()

    db_path = Path(args.palace).expanduser().resolve() / "chroma.sqlite3"
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    rows = conn.execute(build_search_query(), (args.query, max(args.results * 5, 20), args.results * 5)).fetchall()
    conn.close()

    filtered = []
    for row in rows:
        wing = row["wing"] or ""
        room = row["room"] or ""
        if args.wing and wing != args.wing:
            continue
        if args.room and room != args.room:
            continue
        filtered.append(row)
        if len(filtered) >= args.results:
            break

    print("")
    print("============================================================")
    print(f'  SQLite Fallback Results for: "{args.query}"')
    if args.wing:
        print(f"  Wing: {args.wing}")
    print("============================================================")
    print("")

    if not filtered:
        print("  No results.")
        print("")
        return 0

    for index, row in enumerate(filtered, 1):
        source_name = Path(row["source_file"] or "").name or "(unknown)"
        print(f'  [{index}] {row["wing"] or "?"} / {row["room"] or "?"}')
        print(f"      Source: {source_name}")
        print(f"      Rank:   {row['rank']}")
        print("")
        print(f"      {normalize_excerpt(row['document'])}")
        print("")
        print("  ────────────────────────────────────────────────────────")
        print("")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
