"""initial schema"""

from collections.abc import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    test_type_enum = sa.Enum("single", "cards", "multi", name="test_type")
    test_type_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "tests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("slug", sa.String(length=128), nullable=False, unique=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("type", test_type_enum, nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("test_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("min_score", sa.Integer(), nullable=True),
        sa.Column("max_score", sa.Integer(), nullable=True),
    )

    op.create_table(
        "questions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("test_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_num", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
    )

    op.create_table(
        "user_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("test_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("state", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_score", sa.Integer(), nullable=True),
        sa.Column("result_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("results.id", ondelete="SET NULL"), nullable=True),
    )

    op.create_table(
        "answers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("test_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=True),
        sa.Column("result_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("results.id", ondelete="SET NULL"), nullable=True),
        sa.Column("order_num", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("weight", sa.Integer(), nullable=True),
        sa.Column("is_correct", sa.Boolean(), nullable=True),
    )

    op.create_index("ix_questions_test_id", "questions", ["test_id"])
    op.create_index("ix_answers_test_id", "answers", ["test_id"])
    op.create_index("ix_answers_question_id", "answers", ["question_id"])
    op.create_index("ix_results_test_id", "results", ["test_id"])
    op.create_index("ix_user_sessions_test_id", "user_sessions", ["test_id"])


def downgrade() -> None:
    op.drop_index("ix_user_sessions_test_id", table_name="user_sessions")
    op.drop_index("ix_results_test_id", table_name="results")
    op.drop_index("ix_answers_question_id", table_name="answers")
    op.drop_index("ix_answers_test_id", table_name="answers")
    op.drop_index("ix_questions_test_id", table_name="questions")

    op.drop_table("answers")
    op.drop_table("user_sessions")
    op.drop_table("questions")
    op.drop_table("results")
    op.drop_table("tests")

    test_type_enum = sa.Enum("single", "cards", "multi", name="test_type")
    test_type_enum.drop(op.get_bind(), checkfirst=True)
