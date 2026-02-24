"""add extra_data to messages

Revision ID: 5958bbf9a0f5
Revises: 20250216_roadmap_relations
Create Date: 2026-02-24 00:19:23.491566

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5958bbf9a0f5"
down_revision: str | None = "20250216_roadmap_relations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 添加 extra_data 列到 messages 表
    # SQLite 不支持 ALTER COLUMN，所以只能添加新列
    op.add_column(
        "messages",
        sa.Column(
            "extra_data",
            sa.JSON(),
            nullable=False,
            server_default="{}",
            comment="额外的元数据（如文档卡片的耗时、阶段数等）",
        ),
    )


def downgrade() -> None:
    # 移除 extra_data 列
    op.drop_column("messages", "extra_data")
