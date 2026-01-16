"""add admins, responses, events, lead fields"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Union
import uuid
import hashlib
import os

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0009_add_admins_and_responses"
down_revision: Union[str, None] = "0008_add_result_order_num"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return f"{salt}${digest.hex()}"


def upgrade() -> None:
    op.add_column("tests", sa.Column("lead_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("tests", sa.Column("lead_collect_name", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("tests", sa.Column("lead_collect_phone", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("tests", sa.Column("lead_collect_email", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("tests", sa.Column("lead_collect_site", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("tests", sa.Column("lead_site_url", sa.Text(), nullable=True))

    op.create_table(
        "admin_users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("username", sa.String(length=64), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("scope", sa.String(length=16), nullable=False, server_default="all"),
        sa.Column("owner_username", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "admin_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("admin_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("admin_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token", sa.String(length=128), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_admin_tokens_admin_id", "admin_tokens", ["admin_id"])

    op.create_table(
        "test_responses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("test_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tests.id", ondelete="SET NULL"), nullable=True),
        sa.Column("test_slug", sa.String(length=128), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("user_username", sa.String(length=255), nullable=True),
        sa.Column("result_title", sa.String(length=255), nullable=True),
        sa.Column("answers", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("lead_name", sa.String(length=64), nullable=True),
        sa.Column("lead_phone", sa.String(length=32), nullable=True),
        sa.Column("lead_email", sa.String(length=64), nullable=True),
        sa.Column("lead_site", sa.String(length=255), nullable=True),
        sa.Column("lead_form_submitted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("lead_site_clicked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_test_responses_test_slug", "test_responses", ["test_slug"])

    op.create_table(
        "test_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("test_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tests.id", ondelete="SET NULL"), nullable=True),
        sa.Column("test_slug", sa.String(length=128), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("question_index", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_test_events_test_slug", "test_events", ["test_slug"])

    default_admin_id = str(uuid.uuid4())
    hashed = _hash_password("12345678")
    op.execute(
        "INSERT INTO admin_users (id, username, password_hash, scope) "
        f"VALUES ('{default_admin_id}', 'Admin', '{hashed}', 'all')"
    )


def downgrade() -> None:
    op.drop_index("ix_test_events_test_slug", table_name="test_events")
    op.drop_table("test_events")

    op.drop_index("ix_test_responses_test_slug", table_name="test_responses")
    op.drop_table("test_responses")

    op.drop_index("ix_admin_tokens_admin_id", table_name="admin_tokens")
    op.drop_table("admin_tokens")
    op.drop_table("admin_users")

    op.drop_column("tests", "lead_site_url")
    op.drop_column("tests", "lead_collect_site")
    op.drop_column("tests", "lead_collect_email")
    op.drop_column("tests", "lead_collect_phone")
    op.drop_column("tests", "lead_collect_name")
    op.drop_column("tests", "lead_enabled")
