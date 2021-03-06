"""change calendar enabled to agenda enabled column

Revision ID: 32e629b17e2e
Revises: f889c2b59759
Create Date: 2019-04-04 17:39:54.241996

"""
# revision identifiers, used by Alembic.
from alembic import op
from sqlalchemy import Boolean

revision = "32e629b17e2e"
down_revision = "f889c2b59759"


def upgrade():
    with op.batch_alter_table("workspaces") as bop:
        bop.alter_column("calendar_enabled", new_column_name="agenda_enabled", type_=Boolean)
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table("workspaces") as bop:
        bop.alter_column("agenda_enabled", new_column_name="calendar_enabled", type_=Boolean)
