"""init schema

Revision ID: 3c2e7e6f1a9b
Revises: 
Create Date: 2026-03-05 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector

# revision identifiers, used by Alembic.
revision = "3c2e7e6f1a9b"
down_revision = None
branch_labels = None
depends_on = None

VECTOR_DIM = 384
VECTOR_DIM_CODE = 768
VECTOR_DIM_VERBOSE = 1024


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("token_usage", sa.Integer(), nullable=True),
        sa.Column("embedding_profile", sa.String(length=32), nullable=True),
    )

    op.create_table(
        "notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(length=512), nullable=True),
        sa.Column("content_type", sa.String(length=255), nullable=True),
        sa.Column("raw_content", sa.LargeBinary(), nullable=True),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["sessions.id"],
            onupdate="CASCADE",
            ondelete="CASCADE",
        ),
    )

    op.create_table(
        "embeddings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("files_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(length=512), nullable=False),
        sa.Column("content_type", sa.String(length=255), nullable=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(VECTOR_DIM), nullable=False),
        sa.ForeignKeyConstraint(["files_id"], ["notes.id"]),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"]),
    )

    op.create_table(
        "embeddings_code",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("files_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(length=512), nullable=False),
        sa.Column("content_type", sa.String(length=255), nullable=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(VECTOR_DIM_CODE), nullable=False),
        sa.ForeignKeyConstraint(["files_id"], ["notes.id"]),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"]),
    )

    op.create_table(
        "embeddings_verbose",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("files_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(length=512), nullable=False),
        sa.Column("content_type", sa.String(length=255), nullable=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(VECTOR_DIM_VERBOSE), nullable=False),
        sa.ForeignKeyConstraint(["files_id"], ["notes.id"]),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"]),
    )

    op.create_table(
        "flashcards",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), nullable=True),
        sa.Column("filename", sa.String(length=512), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["sessions.id"],
            onupdate="CASCADE",
            ondelete="CASCADE",
        ),
    )

    op.create_table(
        "flashcard_decks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("source_metadata", postgresql.JSONB(), nullable=False),
        sa.Column("source_label", sa.String(length=512), nullable=True),
        sa.Column("card_count", sa.Integer(), nullable=False),
        sa.Column("note_count", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["sessions.id"],
            onupdate="CASCADE",
            ondelete="CASCADE",
        ),
    )

    op.create_index(
        "flashcards_session_id_idx",
        "flashcards",
        ["session_id"],
    )
    op.create_index(
        "flashcard_decks_session_id_idx",
        "flashcard_decks",
        ["session_id"],
    )
    op.create_index(
        "embeddings_embedding_idx",
        "embeddings",
        ["embedding"],
        postgresql_using="ivfflat",
        postgresql_ops={"embedding": "vector_cosine_ops"},
        postgresql_with={"lists": 100},
    )
    op.create_index(
        "embeddings_code_embedding_idx",
        "embeddings_code",
        ["embedding"],
        postgresql_using="ivfflat",
        postgresql_ops={"embedding": "vector_cosine_ops"},
        postgresql_with={"lists": 100},
    )
    op.create_index(
        "embeddings_verbose_embedding_idx",
        "embeddings_verbose",
        ["embedding"],
        postgresql_using="ivfflat",
        postgresql_ops={"embedding": "vector_cosine_ops"},
        postgresql_with={"lists": 100},
    )


def downgrade() -> None:
    op.drop_index("embeddings_verbose_embedding_idx", table_name="embeddings_verbose")
    op.drop_index("embeddings_code_embedding_idx", table_name="embeddings_code")
    op.drop_index("embeddings_embedding_idx", table_name="embeddings")
    op.drop_index("flashcard_decks_session_id_idx", table_name="flashcard_decks")
    op.drop_index("flashcards_session_id_idx", table_name="flashcards")

    op.drop_table("flashcard_decks")
    op.drop_table("flashcards")
    op.drop_table("embeddings_verbose")
    op.drop_table("embeddings_code")
    op.drop_table("embeddings")
    op.drop_table("notes")
    op.drop_table("sessions")
