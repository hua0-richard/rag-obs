"""Seed the fixed eval corpus into a known session.

Idempotent: wipes the eval session's notes + embeddings, then loads every file
under ``benchmarks/corpus/`` into the ``notes`` table. Embeddings are generated
lazily on the first runner call (by ``_ensure_embeddings_for_profile``) using
whichever EMBEDDING_BACKEND the profile selected, so the seed is backend-agnostic.

Usage (from backend/):  python -m benchmarks.seed --profile dev
"""

from __future__ import annotations

import argparse
import mimetypes
from pathlib import Path

from benchmarks.config import EVAL_SESSION_ID, apply_profile

CORPUS_DIR = Path(__file__).parent / "corpus"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", default="dev")
    args = parser.parse_args()
    apply_profile(args.profile)

    # Imported after apply_profile so engine/backends pick up the env.
    from sqlalchemy import text as sql_text
    from db.session import SessionLocal
    from db.models import Files, Sessions

    files = sorted(CORPUS_DIR.glob("*"))
    files = [f for f in files if f.is_file() and not f.name.startswith(".")]
    if not files:
        raise SystemExit(f"No corpus files found in {CORPUS_DIR}")

    db = SessionLocal()
    try:
        # Ensure the session row exists.
        if db.get(Sessions, EVAL_SESSION_ID) is None:
            db.add(Sessions(id=EVAL_SESSION_ID, token_usage=0))
            db.commit()

        # Wipe prior seed (embeddings first — they reference the session).
        for table in ("embeddings", "embeddings_code", "embeddings_verbose"):
            db.execute(
                sql_text(f"DELETE FROM {table} WHERE session_id = :sid"),
                {"sid": EVAL_SESSION_ID},
            )
        db.execute(
            sql_text("DELETE FROM notes WHERE session_id = :sid"),
            {"sid": EVAL_SESSION_ID},
        )
        db.commit()

        for path in files:
            content_type = mimetypes.guess_type(path.name)[0] or "text/markdown"
            db.add(
                Files(
                    session_id=EVAL_SESSION_ID,
                    filename=path.name,
                    content_type=content_type,
                    raw_content=path.read_bytes(),
                )
            )
        db.commit()
        print(f"Seeded {len(files)} file(s) into session {EVAL_SESSION_ID}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
