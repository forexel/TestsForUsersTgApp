"""update default admin password"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Union
import os
import hashlib

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0011_update_admin_password"
down_revision: Union[str, None] = "0010_admin_username_lowercase"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return f"{salt}${digest.hex()}"


def upgrade() -> None:
    hashed = _hash_password("Showme!@#")
    op.execute(f"UPDATE admin_users SET password_hash='{hashed}' WHERE username='admin'")


def downgrade() -> None:
    pass
