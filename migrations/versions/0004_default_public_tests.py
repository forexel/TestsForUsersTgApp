"""default tests to public"""

from collections.abc import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0004_default_public_tests"
down_revision: Union[str, None] = "0003_add_log_event_type"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE tests SET is_public = TRUE WHERE is_public IS NOT TRUE")
    op.alter_column("tests", "is_public", server_default=sa.text("true"))


def downgrade() -> None:
    op.alter_column("tests", "is_public", server_default=sa.text("false"))
