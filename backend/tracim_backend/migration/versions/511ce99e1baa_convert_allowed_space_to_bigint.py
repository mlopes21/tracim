"""convert allowed_space to bigint

Revision ID: 511ce99e1baa
Revises: 5a4962fb875f
Create Date: 2019-10-15 13:29:36.434480

"""
# revision identifiers, used by Alembic.
from alembic import op
from sqlalchemy import BigInteger
from sqlalchemy import Integer

revision = "511ce99e1baa"
down_revision = "5a4962fb875f"


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("allowed_space", type_=BigInteger)
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("allowed_space", type_=Integer)
    # ### end Alembic commands ###
