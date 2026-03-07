"""use uuid ids for sessions and flashcards

Revision ID: e7b3a1c9d4f2
Revises: 9d7f3f2b7c11
Create Date: 2026-03-07 00:00:00.000000
"""
from __future__ import annotations

import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "e7b3a1c9d4f2"
down_revision = "9d7f3f2b7c11"
branch_labels = None
depends_on = None


SESSION_TABLES = {
    "notes": False,
    "embeddings": False,
    "embeddings_code": False,
    "embeddings_verbose": False,
    "flashcards": True,
    "flashcard_decks": False,
}


def _backfill_session_uuids(conn) -> None:
    rows = conn.execute(sa.text("SELECT id FROM sessions")).fetchall()
    for row in rows:
        conn.execute(
            sa.text("UPDATE sessions SET id_uuid = :new_id WHERE id = :old_id"),
            {"new_id": uuid.uuid4(), "old_id": row.id},
        )


def _backfill_flashcard_uuids(conn) -> None:
    rows = conn.execute(sa.text("SELECT id FROM flashcards")).fetchall()
    for row in rows:
        conn.execute(
            sa.text("UPDATE flashcards SET id_uuid = :new_id WHERE id = :old_id"),
            {"new_id": uuid.uuid4(), "old_id": row.id},
        )


def upgrade() -> None:
    conn = op.get_bind()

    op.add_column(
        "sessions",
        sa.Column("id_uuid", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "flashcards",
        sa.Column("id_uuid", postgresql.UUID(as_uuid=True), nullable=True),
    )
    for table in SESSION_TABLES:
        op.add_column(
            table,
            sa.Column("session_id_uuid", postgresql.UUID(as_uuid=True), nullable=True),
        )

    _backfill_session_uuids(conn)
    for table in SESSION_TABLES:
        conn.execute(
            sa.text(
                f"UPDATE {table} "
                "SET session_id_uuid = sessions.id_uuid "
                "FROM sessions "
                f"WHERE {table}.session_id = sessions.id"
            )
        )
    _backfill_flashcard_uuids(conn)

    op.drop_constraint("notes_session_id_fkey", "notes", type_="foreignkey")
    op.drop_constraint("embeddings_session_id_fkey", "embeddings", type_="foreignkey")
    op.drop_constraint("embeddings_code_session_id_fkey", "embeddings_code", type_="foreignkey")
    op.drop_constraint("embeddings_verbose_session_id_fkey", "embeddings_verbose", type_="foreignkey")
    op.drop_constraint("flashcards_session_id_fkey", "flashcards", type_="foreignkey")
    op.drop_constraint("flashcard_decks_session_id_fkey", "flashcard_decks", type_="foreignkey")

    op.drop_index("flashcards_session_id_idx", table_name="flashcards")
    op.drop_index("flashcard_decks_session_id_idx", table_name="flashcard_decks")

    op.drop_constraint("sessions_pkey", "sessions", type_="primary")
    op.drop_constraint("flashcards_pkey", "flashcards", type_="primary")

    for table in SESSION_TABLES:
        op.drop_column(table, "session_id")

    op.drop_column("sessions", "id")
    op.drop_column("flashcards", "id")

    op.alter_column(
        "sessions",
        "id_uuid",
        new_column_name="id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )
    op.alter_column(
        "flashcards",
        "id_uuid",
        new_column_name="id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )

    for table, nullable in SESSION_TABLES.items():
        op.alter_column(
            table,
            "session_id_uuid",
            new_column_name="session_id",
            existing_type=postgresql.UUID(as_uuid=True),
            nullable=nullable,
        )

    op.create_primary_key("sessions_pkey", "sessions", ["id"])
    op.create_primary_key("flashcards_pkey", "flashcards", ["id"])

    op.create_foreign_key(
        "notes_session_id_fkey",
        "notes",
        "sessions",
        ["session_id"],
        ["id"],
        onupdate="CASCADE",
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "embeddings_session_id_fkey",
        "embeddings",
        "sessions",
        ["session_id"],
        ["id"],
    )
    op.create_foreign_key(
        "embeddings_code_session_id_fkey",
        "embeddings_code",
        "sessions",
        ["session_id"],
        ["id"],
    )
    op.create_foreign_key(
        "embeddings_verbose_session_id_fkey",
        "embeddings_verbose",
        "sessions",
        ["session_id"],
        ["id"],
    )
    op.create_foreign_key(
        "flashcards_session_id_fkey",
        "flashcards",
        "sessions",
        ["session_id"],
        ["id"],
        onupdate="CASCADE",
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "flashcard_decks_session_id_fkey",
        "flashcard_decks",
        "sessions",
        ["session_id"],
        ["id"],
        onupdate="CASCADE",
        ondelete="CASCADE",
    )

    op.create_index("flashcards_session_id_idx", "flashcards", ["session_id"])
    op.create_index("flashcard_decks_session_id_idx", "flashcard_decks", ["session_id"])


def downgrade() -> None:
    conn = op.get_bind()

    op.add_column("sessions", sa.Column("id_int", sa.Integer(), nullable=True))
    op.add_column("flashcards", sa.Column("id_int", sa.Integer(), nullable=True))
    for table in SESSION_TABLES:
        op.add_column(table, sa.Column("session_id_int", sa.Integer(), nullable=True))

    conn.execute(
        sa.text(
            "WITH ordered AS ("
            "  SELECT id, row_number() OVER (ORDER BY id) AS new_id "
            "  FROM sessions"
            ") "
            "UPDATE sessions "
            "SET id_int = ordered.new_id "
            "FROM ordered "
            "WHERE sessions.id = ordered.id"
        )
    )
    for table in SESSION_TABLES:
        conn.execute(
            sa.text(
                f"UPDATE {table} "
                "SET session_id_int = sessions.id_int "
                "FROM sessions "
                f"WHERE {table}.session_id = sessions.id"
            )
        )
    conn.execute(
        sa.text(
            "WITH ordered AS ("
            "  SELECT id, row_number() OVER (ORDER BY id) AS new_id "
            "  FROM flashcards"
            ") "
            "UPDATE flashcards "
            "SET id_int = ordered.new_id "
            "FROM ordered "
            "WHERE flashcards.id = ordered.id"
        )
    )

    op.drop_constraint("notes_session_id_fkey", "notes", type_="foreignkey")
    op.drop_constraint("embeddings_session_id_fkey", "embeddings", type_="foreignkey")
    op.drop_constraint("embeddings_code_session_id_fkey", "embeddings_code", type_="foreignkey")
    op.drop_constraint("embeddings_verbose_session_id_fkey", "embeddings_verbose", type_="foreignkey")
    op.drop_constraint("flashcards_session_id_fkey", "flashcards", type_="foreignkey")
    op.drop_constraint("flashcard_decks_session_id_fkey", "flashcard_decks", type_="foreignkey")

    op.drop_index("flashcards_session_id_idx", table_name="flashcards")
    op.drop_index("flashcard_decks_session_id_idx", table_name="flashcard_decks")

    op.drop_constraint("sessions_pkey", "sessions", type_="primary")
    op.drop_constraint("flashcards_pkey", "flashcards", type_="primary")

    for table in SESSION_TABLES:
        op.drop_column(table, "session_id")

    op.drop_column("sessions", "id")
    op.drop_column("flashcards", "id")

    op.alter_column(
        "sessions",
        "id_int",
        new_column_name="id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.alter_column(
        "flashcards",
        "id_int",
        new_column_name="id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    for table, nullable in SESSION_TABLES.items():
        op.alter_column(
            table,
            "session_id_int",
            new_column_name="session_id",
            existing_type=sa.Integer(),
            nullable=nullable,
        )

    op.create_primary_key("sessions_pkey", "sessions", ["id"])
    op.create_primary_key("flashcards_pkey", "flashcards", ["id"])

    op.create_foreign_key(
        "notes_session_id_fkey",
        "notes",
        "sessions",
        ["session_id"],
        ["id"],
        onupdate="CASCADE",
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "embeddings_session_id_fkey",
        "embeddings",
        "sessions",
        ["session_id"],
        ["id"],
    )
    op.create_foreign_key(
        "embeddings_code_session_id_fkey",
        "embeddings_code",
        "sessions",
        ["session_id"],
        ["id"],
    )
    op.create_foreign_key(
        "embeddings_verbose_session_id_fkey",
        "embeddings_verbose",
        "sessions",
        ["session_id"],
        ["id"],
    )
    op.create_foreign_key(
        "flashcards_session_id_fkey",
        "flashcards",
        "sessions",
        ["session_id"],
        ["id"],
        onupdate="CASCADE",
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "flashcard_decks_session_id_fkey",
        "flashcard_decks",
        "sessions",
        ["session_id"],
        ["id"],
        onupdate="CASCADE",
        ondelete="CASCADE",
    )

    op.create_index("flashcards_session_id_idx", "flashcards", ["session_id"])
    op.create_index("flashcard_decks_session_id_idx", "flashcard_decks", ["session_id"])

    op.execute("CREATE SEQUENCE IF NOT EXISTS sessions_id_seq OWNED BY sessions.id")
    op.execute("CREATE SEQUENCE IF NOT EXISTS flashcards_id_seq OWNED BY flashcards.id")
    op.execute(
        "SELECT setval('sessions_id_seq', COALESCE((SELECT MAX(id) FROM sessions), 1))"
    )
    op.execute(
        "SELECT setval('flashcards_id_seq', COALESCE((SELECT MAX(id) FROM flashcards), 1))"
    )
    op.execute(
        "ALTER TABLE sessions ALTER COLUMN id SET DEFAULT nextval('sessions_id_seq')"
    )
    op.execute(
        "ALTER TABLE flashcards ALTER COLUMN id SET DEFAULT nextval('flashcards_id_seq')"
    )
