"""add flashcards.deck_id

Revision ID: 9d7f3f2b7c11
Revises: 3c2e7e6f1a9b
Create Date: 2026-03-06 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "9d7f3f2b7c11"
down_revision = "3c2e7e6f1a9b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("flashcards", sa.Column("deck_id", sa.Integer(), nullable=True))
    op.create_index("flashcards_deck_id_idx", "flashcards", ["deck_id"])
    op.create_foreign_key(
        "flashcards_deck_id_fkey",
        "flashcards",
        "flashcard_decks",
        ["deck_id"],
        ["id"],
        onupdate="CASCADE",
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("flashcards_deck_id_fkey", "flashcards", type_="foreignkey")
    op.drop_index("flashcards_deck_id_idx", table_name="flashcards")
    op.drop_column("flashcards", "deck_id")
