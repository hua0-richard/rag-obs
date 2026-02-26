import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from models import Base

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
                "CREATE INDEX IF NOT EXISTS embeddings_embedding_idx "
                "ON embeddings USING ivfflat (embedding vector_cosine_ops) "
                "WITH (lists = 100)"
            )
        )

def launch_db() -> None:
    init_db()
