"""add result order number"""

from collections.abc import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0008_add_result_order_num"
down_revision: Union[str, None] = "0007_add_result_image_url"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("results", sa.Column("order_num", sa.Integer(), nullable=True, server_default="1"))
    op.execute(
        """
        WITH ranked AS (
            SELECT id, test_id,
                   ROW_NUMBER() OVER (PARTITION BY test_id ORDER BY id) AS rn
            FROM results
        )
        UPDATE results r
        SET order_num = ranked.rn
        FROM ranked
        WHERE r.id = ranked.id
        """
    )
    op.alter_column("results", "order_num", nullable=False, server_default=None)


def downgrade() -> None:
    op.drop_column("results", "order_num")
