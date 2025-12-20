"""add test background color"""

from collections.abc import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0005_add_test_bg_color"
down_revision: Union[str, None] = "0004_default_public_tests"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tests", sa.Column("bg_color", sa.String(length=16), nullable=True, server_default="3E8BBF"))
    op.execute("UPDATE tests SET bg_color='3E8BBF' WHERE bg_color IS NULL")


def downgrade() -> None:
    op.drop_column("tests", "bg_color")
