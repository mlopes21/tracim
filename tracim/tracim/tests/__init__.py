# -*- coding: utf-8 -*-
"""Unit and functional test suite for tracim."""
import argparse
import os
from os import getcwd

import ldap3
import tg
import time
import transaction
from gearbox.commands.setup_app import SetupAppCommand
from ldap_test import LdapServer
from nose.tools import ok_
from paste.deploy import loadapp
from sqlalchemy.engine import reflection
from sqlalchemy.schema import DropConstraint
from sqlalchemy.schema import DropSequence
from sqlalchemy.schema import DropTable
from sqlalchemy.schema import ForeignKeyConstraint
from sqlalchemy.schema import MetaData
from sqlalchemy.schema import Sequence
from sqlalchemy.schema import Table
from tg import config
from tg.util import Bunch
from webtest import TestApp as BaseTestApp, AppError
from who_ldap import make_connection

from tracim.fixtures import FixturesLoader
from tracim.fixtures.users_and_groups import Base as BaseFixture
from tracim.lib.base import logger
from tracim.model import DBSession

__all__ = ['setup_app', 'setup_db', 'teardown_db', 'TestController']

application_name = 'main_without_authn'


class TestApp(BaseTestApp):
    def _check_status(self, status, res):
        """ Simple override to print html content when error"""
        try:
            super()._check_status(status, res)
        except AppError as exc:
            dump_file_path = "/tmp/debug_%d_%s.html" % (time.time() * 1000, res.request.path_qs[1:])
            if os.path.exists("/tmp"):
                with open(dump_file_path, 'w') as dump_file:
                    print(res.ubody, file=dump_file)
                # Update exception message with info about this dumped file
                exc.args = ('%s html error file dump in %s' % (exc.args[0], dump_file_path), ) + exc.args[1:]
            raise exc


def load_app(name=application_name):
    """Load the test application."""
    return TestApp(loadapp('config:test.ini#%s' % name, relative_to=getcwd()))


def setup_app(section_name=None):
    """Setup the application."""

    engine = config['tg.app_globals'].sa_engine
    inspector = reflection.Inspector.from_engine(engine)
    metadata = MetaData()

    logger.debug(setup_app, 'Before setup...')

    cmd = SetupAppCommand(Bunch(options=Bunch(verbose_level=1)), Bunch())
    logger.debug(setup_app, 'After setup, before run...')

    cmd.run(Bunch(config_file='config:test.ini', section_name=section_name))
    logger.debug(setup_app, 'After run...')



def setup_db():
    """Create the database schema (not needed when you run setup_app)."""

    engine = config['tg.app_globals'].sa_engine
    # model.init_model(engine)
    # model.metadata.create_all(engine)



def teardown_db():
    """Destroy the database schema."""
    engine = config['tg.app_globals'].sa_engine
    connection = engine.connect()

    # INFO - D.A. - 2014-12-04
    # Recipe taken from bitbucket:
    # https://bitbucket.org/zzzeek/sqlalchemy/wiki/UsageRecipes/DropEverything

    inspector = reflection.Inspector.from_engine(engine)
    metadata = MetaData()

    tbs = []
    all_fks = []
    views = []

    # INFO - D.A. - 2014-12-04
    # Sequences are hard defined here because SQLA does not allow to reflect them from existing schema
    seqs = [
        Sequence('seq__groups__group_id'),
        Sequence('seq__contents__content_id'),
        Sequence('seq__content_revisions__revision_id'),
        Sequence('seq__permissions__permission_id'),
        Sequence('seq__users__user_id'),
        Sequence('seq__workspaces__workspace_id')
    ]

    for view_name in inspector.get_view_names():
        v = Table(view_name,metadata)
        views.append(v)

    for table_name in inspector.get_table_names():

        fks = []
        for fk in inspector.get_foreign_keys(table_name):
            if not fk['name']:
                continue
            fks.append(
                ForeignKeyConstraint((),(),name=fk['name'])
                )
        t = Table(table_name,metadata,*fks)
        tbs.append(t)
        all_fks.extend(fks)

    for fkc in all_fks:
        connection.execute(DropConstraint(fkc))

    for view in views:
        drop_statement = 'DROP VIEW {}'.format(view.name)
        # engine.execute(drop_statement)
        connection.execute(drop_statement)

    for table in tbs:
        connection.execute(DropTable(table))


    for sequence in seqs:
        try:
            connection.execute(DropSequence(sequence))
        except Exception as e:
            logger.debug(teardown_db, 'Exception while trying to remove sequence {}'.format(sequence.name))

    transaction.commit()
    engine.dispose()


class TestStandard(object):

    application_under_test = application_name
    fixtures = [BaseFixture, ]

    def setUp(self):
        self.app = load_app(self.application_under_test)

        logger.debug(self, 'Start setUp() by trying to clean database...')
        try:
            teardown_db()
        except Exception as e:
            logger.debug(self, 'teardown() throwed an exception {}'.format(e.__str__()))
        logger.debug(self, 'Start setUp() by trying to clean database... -> done')

        logger.debug(self, 'Start Application Setup...')
        setup_app()
        logger.debug(self, 'Start Application Setup... -> done')

        logger.debug(self, 'Start Database Setup...')
        setup_db()
        logger.debug(self, 'Start Database Setup... -> done')

        logger.debug(self, 'Load extra fixtures...')
        fixtures_loader = FixturesLoader([BaseFixture])  # BaseFixture is already loaded in bootstrap
        fixtures_loader.loads(self.fixtures)
        logger.debug(self, 'Load extra fixtures... -> done')

        self.app.get('/_test_vars')  # Allow to create fake context
        tg.i18n.set_lang('en')  # Set a default lang

    def tearDown(self):
        transaction.commit()


class TestCommand(TestStandard):
    def _execute_command(self, command_class, command_name, sub_argv):
        parser = argparse.ArgumentParser()
        command = command_class(self.app, parser)
        command.auto_setup_app = False
        cmd_parser = command.get_parser(command_name)
        parsed_args = cmd_parser.parse_args(sub_argv)
        return command.run(parsed_args)

    def setUp(self):
        super().setUp()
        # Ensure app config is loaded
        self.app.get('/_test_vars')


class TestController(object):
    """Base functional test case for the controllers.

    The tracim application instance (``self.app``) set up in this test
    case (and descendants) has authentication disabled, so that developers can
    test the protected areas independently of the :mod:`repoze.who` plugins
    used initially. This way, authentication can be tested once and separately.

    Check tracim.tests.functional.test_authentication for the repoze.who
    integration tests.

    This is the officially supported way to test protected areas with
    repoze.who-testutil (http://code.gustavonarea.net/repoze.who-testutil/).

    """

    application_under_test = application_name
    fixtures = [BaseFixture, ]

    def setUp(self):
        """Setup test fixture for each functional test method."""
        self.app = load_app(self.application_under_test)

        try:
            teardown_db()
        except Exception as e:
            print('-> err ({})'.format(e.__str__()))

        setup_app(section_name=self.application_under_test)
        setup_db()

        fixtures_loader = FixturesLoader([BaseFixture])  # BaseFixture is already loaded in bootstrap
        fixtures_loader.loads(self.fixtures)


    def tearDown(self):
        """Tear down test fixture for each functional test method."""
        DBSession.close()
        teardown_db()


class TracimTestController(TestController):

    def _connect_user(self, login, password):
        # Going to the login form voluntarily:
        resp = self.app.get('/', status=200)
        form = resp.form
        # Submitting the login form:
        form['login'] = login
        form['password'] = password
        return form.submit(status=302)


class LDAPTest(object):

    """
    Server fixtures, see https://github.com/zoldar/python-ldap-test
    """
    ldap_server_data = NotImplemented

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._ldap_test_server = None
        self._ldap_connection = None

    def setUp(self):
        super().setUp()
        self._ldap_test_server = LdapServer(self.ldap_server_data)
        self._ldap_test_server.start()
        ldap3_server = ldap3.Server('localhost', port=self._ldap_test_server.config['port'])
        self._ldap_connection = ldap3.Connection(
            ldap3_server,
            user=self._ldap_test_server.config['bind_dn'],
            password=self._ldap_test_server.config['password'],
            auto_bind=True
        )

    def tearDown(self):
        super().tearDown()
        self._ldap_test_server.stop()

    def test_ldap_connectivity(self):
        with make_connection(
                'ldap://%s:%d' % ('localhost', self._ldap_test_server.config['port']),
                self._ldap_test_server.config['bind_dn'],
                'toor'
        ) as conn:
            if not conn.bind():
                ok_(False, "Cannot establish connection with LDAP test server")
            else:
                ok_(True)


class ArgumentParser(argparse.ArgumentParser):
    def exit(self, status=0, message=None):
        raise Exception(message)
