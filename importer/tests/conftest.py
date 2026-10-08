import base64
import os
from datetime import datetime
from unittest.mock import patch

import pytest

# src.security.crypto raises at import time without this, which aborts collection
# for every test that transitively imports app code. Set a throwaway key before the
# first import so a clean checkout can run the suite with no configuration.
os.environ.setdefault(
    "SECRETS_ENC_KEY",
    base64.urlsafe_b64encode(b"pfm-test-key-not-a-real-secret!!").decode(),
)


@pytest.fixture
def mock_datetime_now():
    """
    Fixture to mock datetime.now() for consistent testing of date-dependent logic.
    Sets the "current" date to July 12, 2025.
    """
    fixed_datetime = datetime(2025, 7, 12, 10, 0, 0)  # July 12, 2025, 10:00:00
    with patch('src.utils.date_utils.datetime', wraps=datetime) as mock_dt_utils, \
         patch('src.parsers.itau_parser.datetime', wraps=datetime) as mock_dt_itau:
        mock_dt_utils.now.return_value = fixed_datetime
        mock_dt_itau.now.return_value = fixed_datetime
        yield

@pytest.fixture
def mock_datetime_03sep2025():
    """
    Fixture to mock datetime.now() for consistent testing of date-dependent logic.
    Sets the "current" date to September 03, 2025.
    """
    fixed_datetime = datetime(2025, 9, 3, 10, 0, 0)  # September 03, 2025, 10:00:00
    with patch('src.utils.date_utils.datetime', wraps=datetime) as mock_dt_utils, \
         patch('src.parsers.itau_parser.datetime', wraps=datetime) as mock_dt_itau:
        mock_dt_utils.now.return_value = fixed_datetime
        mock_dt_itau.now.return_value = fixed_datetime
        yield

@pytest.fixture
def mock_datetime_23apr2026():
    """
    Fixture to mock datetime.now() for consistent testing of date-dependent logic.
    Sets the "current" date to April 23, 2026.
    """
    fixed_datetime = datetime(2026, 4, 23, 10, 0, 0)  # April 23, 2026, 10:00:00
    with patch('src.utils.date_utils.datetime', wraps=datetime) as mock_dt_utils, \
         patch('src.parsers.itau_parser.datetime', wraps=datetime) as mock_dt_itau:
        mock_dt_utils.now.return_value = fixed_datetime
        mock_dt_itau.now.return_value = fixed_datetime
        yield