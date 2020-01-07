from hapic.ext.pyramid import PyramidContext
from pyramid.config import Configurator

from tracim_backend import TracimControllerImporter
from tracim_backend.applications.content_file.file_controller import FileController
from tracim_backend.config import CFG


class ContentFileControllerImporter(TracimControllerImporter):
    def import_controller(
        self,
        configurator: Configurator,
        app_config: CFG,
        route_prefix: str,
        context: PyramidContext,
    ) -> Configurator:
        file_controller = FileController()
        configurator.include(file_controller.bind, route_prefix=route_prefix)
        return configurator
