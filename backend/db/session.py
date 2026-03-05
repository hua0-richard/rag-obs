import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from db.models import Base

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is not set")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE notes "
                "ADD COLUMN IF NOT EXISTS filename VARCHAR(512)"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE notes "
                "ADD COLUMN IF NOT EXISTS content_type VARCHAR(255)"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE notes "
                "ADD COLUMN IF NOT EXISTS raw_content BYTEA"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE flashcards "
                "ADD COLUMN IF NOT EXISTS session_id INTEGER"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS flashcards_session_id_idx "
                "ON flashcards (session_id)"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE flashcard_decks "
                "ADD COLUMN IF NOT EXISTS session_id INTEGER"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE flashcard_decks "
                "ADD COLUMN IF NOT EXISTS title VARCHAR(512)"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE flashcard_decks "
                "ADD COLUMN IF NOT EXISTS source_metadata JSONB"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE flashcard_decks "
                "ADD COLUMN IF NOT EXISTS source_label VARCHAR(512)"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE flashcard_decks "
                "ADD COLUMN IF NOT EXISTS card_count INTEGER"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE flashcard_decks "
                "ADD COLUMN IF NOT EXISTS note_count INTEGER"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE flashcard_decks "
                "ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS flashcard_decks_session_id_idx "
                "ON flashcard_decks (session_id)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS embeddings_embedding_idx "
                "ON embeddings USING ivfflat (embedding vector_cosine_ops) "
                "WITH (lists = 100)"
            )
        )


def launch_db() -> None:
    init_db()
