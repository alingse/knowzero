"""Add unique constraint on (session_id, name) for entities

Revision ID: add_session_name_unique
Revises: af42447a0350
Create Date: 2026-02-12 13:30:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_session_name_unique"
down_revision: str | None = "af42447a0350"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # First, remove the unique constraint on name (if exists)
    # SQLite doesn't support dropping unique constraints directly,
    # so we need to recreate the table
    op.execute("""
        CREATE TABLE entities_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR NOT NULL,
            session_id VARCHAR NOT NULL,
            entity_type VARCHAR,
            category VARCHAR,
            status VARCHAR NOT NULL DEFAULT 'active',
            created_at DATETIME NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        )
    """)

    # Copy data from old table
    op.execute("""
        INSERT INTO entities_new (id, name, session_id, entity_type, category, status, created_at)
        SELECT id, name, session_id, entity_type, category, status, created_at FROM entities
    """)

    # Drop old table
    op.execute("DROP TABLE entities")

    # Rename new table
    op.execute("ALTER TABLE entities_new RENAME TO entities")

    # Create unique index on (session_id, name)
    op.create_index("unique_session_entity_name", "entities", ["session_id", "name"], unique=True)


def downgrade() -> None:
    # Remove the composite unique index
    op.drop_index("unique_session_entity_name", table_name="entities")

    # Recreate table with unique name constraint
    op.execute("""
        CREATE TABLE entities_old (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR NOT NULL UNIQUE,
            session_id VARCHAR NOT NULL,
            entity_type VARCHAR,
            category VARCHAR,
            status VARCHAR NOT NULL DEFAULT 'active',
            created_at DATETIME NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        )
    """)

    op.execute("""
        INSERT INTO entities_old (id, name, session_id, entity_type, category, status, created_at)
        SELECT id, name, session_id, entity_type, category, status, created_at FROM entities
    """)

    op.execute("DROP TABLE entities")
    op.execute("ALTER TABLE entities_old RENAME TO entities")
