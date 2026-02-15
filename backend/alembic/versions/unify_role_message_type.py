"""Unify role and message_type values

Revision ID: unify_role_message_type
Revises: add_session_name_unique
Create Date: 2026-02-13 10:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "unify_role_message_type"
down_revision: str | None = "add_session_name_unique"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "UPDATE messages SET message_type = 'document_card' WHERE message_type = 'document_status'"
    )
    op.execute("UPDATE messages SET message_type = 'document_ref' WHERE message_type = 'document'")
    op.execute("UPDATE messages SET message_type = 'notification' WHERE message_type = 'system'")
    op.execute("UPDATE messages SET message_type = 'chat' WHERE message_type = 'chitchat'")
    # Fix role: document cards should show bot avatar, not system
    op.execute(
        "UPDATE messages SET role = 'assistant' WHERE message_type = 'document_card' AND role = 'system'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE messages SET role = 'system' WHERE message_type = 'document_card' AND role = 'assistant'"
    )
    op.execute("UPDATE messages SET message_type = 'chitchat' WHERE message_type = 'chat'")
    op.execute("UPDATE messages SET message_type = 'system' WHERE message_type = 'notification'")
    op.execute("UPDATE messages SET message_type = 'document' WHERE message_type = 'document_ref'")
    op.execute(
        "UPDATE messages SET message_type = 'document_status' WHERE message_type = 'document_card'"
    )
