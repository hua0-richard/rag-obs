"""collapse embedding profiles into a single 768-dim embeddings table

The three profiles (default/384, code/768, verbose/1024) never selected
different models in practice: Ollama emits 768 dims for every profile, and the
OpenRouter backend called one model with a different `dimensions` value. This
folds everything into a single `embeddings` table at 768 dims — the native width
of nomic-embed-text — and drops `sessions.embedding_profile`.

Data handling: rows already in `embeddings_code` are 768-dim and are carried
over. Rows in `embeddings` (384) and `embeddings_verbose` (1024) cannot be
re-projected to 768 and are dropped; affected notes are re-embedded lazily on
the next generate (see `_ensure_embeddings`), since `notes.raw_content` is kept.

Revision ID: b4d1f8a05c37
Revises: e7b3a1c9d4f2
Create Date: 2026-08-05 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector


revision = "b4d1f8a05c37"
down_revision = "e7b3a1c9d4f2"
branch_labels = None
depends_on = None

VECTOR_DIM = 768
OLD_VECTOR_DIM = 384
OLD_VECTOR_DIM_VERBOSE = 1024


def upgrade() -> None:
    # 384-dim vectors cannot be widened in place; the source notes survive in
    # `notes.raw_content`, so clear and let the app re-embed on demand.
    op.execute("DELETE FROM embeddings")
    # Safe on an empty table: pgvector's vector->vector cast plans fine and is
    # never executed, so the dimension change goes through unconditionally.
    op.execute(f"ALTER TABLE embeddings ALTER COLUMN embedding TYPE vector({VECTOR_DIM})")

    # embeddings_code is already 768-dim — preserve it as the new canonical data.
    op.execute(
        """
        INSERT INTO embeddings
            (files_id, session_id, filename, content_type, chunk_index, content, embedding)
        SELECT files_id, session_id, filename, content_type, chunk_index, content, embedding
        FROM embeddings_code
        """
    )

    op.drop_table("embeddings_code")
    op.drop_table("embeddings_verbose")
    op.drop_column("sessions", "embedding_profile")


def downgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column("embedding_profile", sa.String(length=32), nullable=True),
    )

    for table, dim in (
        ("embeddings_code", VECTOR_DIM),
        ("embeddings_verbose", OLD_VECTOR_DIM_VERBOSE),
    ):
        op.create_table(
            table,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "files_id",
                sa.Integer(),
                sa.ForeignKey("notes.id"),
                nullable=False,
            ),
            sa.Column(
                "session_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("sessions.id"),
                nullable=False,
            ),
            sa.Column("filename", sa.String(length=512), nullable=False),
            sa.Column("content_type", sa.String(length=255), nullable=True),
            sa.Column("chunk_index", sa.Integer(), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("embedding", Vector(dim), nullable=False),
        )
        op.create_index(f"ix_{table}_id", table, ["id"])

    # The 768-dim rows belong in embeddings_code under the old layout.
    op.execute(
        """
        INSERT INTO embeddings_code
            (files_id, session_id, filename, content_type, chunk_index, content, embedding)
        SELECT files_id, session_id, filename, content_type, chunk_index, content, embedding
        FROM embeddings
        """
    )
    op.execute("DELETE FROM embeddings")
    op.execute(f"ALTER TABLE embeddings ALTER COLUMN embedding TYPE vector({OLD_VECTOR_DIM})")
