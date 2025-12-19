"""add event_type to test_run_logs"""

from collections.abc import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0003_add_log_event_type"
down_revision: Union[str, None] = "0002_add_owner_username_and_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "test_run_logs",
        sa.Column("event_type", sa.String(length=16), nullable=False, server_default="complete"),
    )
    op.execute("UPDATE test_run_logs SET event_type='complete' WHERE event_type IS NULL")


def downgrade() -> None:
    op.drop_column("test_run_logs", "event_type")
