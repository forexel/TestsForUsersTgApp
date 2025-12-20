"""add question image url"""

from collections.abc import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0006_add_question_image_url"
down_revision: Union[str, None] = "0005_add_test_bg_color"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("questions", sa.Column("image_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("questions", "image_url")
