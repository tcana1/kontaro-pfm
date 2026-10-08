import logging
import os


def setup_logging(level=None):
    if level is None:
        log_level_str = os.getenv('LOG_LEVEL', 'INFO').upper()
        level_map = {
            'DEBUG': logging.DEBUG,
            'INFO': logging.INFO,
            'WARNING': logging.WARNING,
            'ERROR': logging.ERROR,
            'CRITICAL': logging.CRITICAL
        }
        level = level_map.get(log_level_str, logging.DEBUG)

    root_logger = logging.getLogger()

    # Clear existing handlers to prevent duplicate logs if called multiple times
    if root_logger.handlers:
        for handler in root_logger.handlers:
            root_logger.removeHandler(handler)
        root_logger.handlers = []

    root_logger.setLevel(level)

    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    root_logger.addHandler(handler)

    # Suppress chardet and pdfminer warnings
    logging.getLogger('chardet').setLevel(logging.WARNING)
    logging.getLogger('pdfminer').setLevel(logging.WARNING)
