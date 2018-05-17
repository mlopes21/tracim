# -*- coding: utf-8 -*-
import json
import time

from pyramid.config import Configurator
from pyramid.events import NewResponse
from pyramid.authentication import BasicAuthAuthenticationPolicy
from hapic.ext.pyramid import PyramidContext

from tracim.extensions import hapic
from tracim.config import CFG
from tracim.lib.utils.pyramid_events import cors_headers
from tracim.lib.utils.request import TracimRequest
from tracim.lib.utils.authentification import basic_auth_check_credentials
from tracim.lib.utils.authentification import BASIC_AUTH_WEBUI_REALM
from tracim.lib.utils.authorization import AcceptAllAuthorizationPolicy
from tracim.lib.utils.authorization import TRACIM_DEFAULT_PERM
from tracim.views import BASE_API_V2
from tracim.views.core_api.session_controller import SessionController
from tracim.views.errors import ErrorSchema


def main(global_config, **settings):
    """ This function returns a Pyramid WSGI application.
    """
    # set CFG object
    app_config = CFG(settings)
    app_config.configure_filedepot()
    settings['CFG'] = app_config
    configurator = Configurator(settings=settings, autocommit=True)
    # Add BasicAuthPolicy
    authn_policy = BasicAuthAuthenticationPolicy(
        basic_auth_check_credentials,
        realm=BASIC_AUTH_WEBUI_REALM,
    )
    # Default authorization : Accept anything.
    configurator.set_authorization_policy(AcceptAllAuthorizationPolicy())
    configurator.set_authentication_policy(authn_policy)
    # INFO - GM - 11-04-2018 - set default perm
    # setting default perm is needed to force authentification
    # mecanism in all views.
    configurator.set_default_permission(TRACIM_DEFAULT_PERM)
    # Override default request
    configurator.set_request_factory(TracimRequest)
    # Pyramids "plugin" include.
    configurator.include('pyramid_jinja2')
    # Add SqlAlchemy DB
    configurator.include('.models')
    configurator.add_subscriber(cors_headers, NewResponse)
    # set Hapic
    hapic.set_context(
        PyramidContext(
            configurator=configurator,
            default_error_builder=ErrorSchema()
        )
    )
    # Add controllers
    session_api = SessionController()
    configurator.include(session_api.bind, route_prefix=BASE_API_V2)
    hapic.add_documentation_view(
        '/api/v2/doc',
        'Tracim v2 API',
        'API of Tracim v2',
    )
    return configurator.make_wsgi_app()
