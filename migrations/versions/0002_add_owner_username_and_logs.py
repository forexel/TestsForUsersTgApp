"""add creator username and test run logs"""

from collections.abc import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0002_add_owner_username_and_logs"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tests", sa.Column("created_by_username", sa.String(length=255), nullable=True))

    op.create_table(
        "test_run_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("test_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tests.id", ondelete="SET NULL"), nullable=True),
        sa.Column("test_slug", sa.String(length=128), nullable=False),
        sa.Column("link", sa.Text(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("user_username", sa.String(length=255), nullable=True),
        sa.Column("source_chat_id", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("source_chat_type", sa.String(length=32), nullable=True),
        sa.Column("test_owner_username", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_test_run_logs_test_slug", "test_run_logs", ["test_slug"])
    op.create_index("ix_test_run_logs_user_id", "test_run_logs", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_test_run_logs_user_id", table_name="test_run_logs")
    op.drop_index("ix_test_run_logs_test_slug", table_name="test_run_logs")
    op.drop_table("test_run_logs")
    op.drop_column("tests", "created_by_username")
