"""lowercase default admin username"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010_admin_username_lowercase"
down_revision: Union[str, None] = "0009_add_admins_and_responses"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE admin_users SET username='admin' WHERE username='Admin'")


def downgrade() -> None:
    op.execute("UPDATE admin_users SET username='Admin' WHERE username='admin'")
