import glob
import json
import os
from unittest.mock import MagicMock

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), '..', 'fixtures')


def load_page_texts(fixture_dir: str) -> list[str]:
    files = sorted(glob.glob(os.path.join(fixture_dir, 'page_*.txt')))
    return [open(f, encoding='utf-8').read() for f in files]


def load_page_tables(fixture_dir: str) -> list:
    txt_files = sorted(glob.glob(os.path.join(fixture_dir, 'page_*.txt')))
    result = []
    for txt_file in txt_files:
        tables_file = txt_file.replace('.txt', '_tables.json')
        if os.path.exists(tables_file):
            with open(tables_file, encoding='utf-8') as f:
                result.append(json.load(f))
        else:
            result.append(None)
    return result


def make_mock_pdf(pages_text: list[str], pages_tables: list = None):
    mock_pdf = MagicMock()
    pages = []
    for i, text in enumerate(pages_text):
        page = MagicMock()
        page.extract_text.return_value = text
        page.extract_words.return_value = []
        if pages_tables and i < len(pages_tables) and pages_tables[i] is not None:
            page.extract_tables.return_value = pages_tables[i]
        else:
            page.extract_tables.return_value = []
        pages.append(page)
    mock_pdf.pages = pages
    mock_pdf.__enter__ = MagicMock(return_value=mock_pdf)
    mock_pdf.__exit__ = MagicMock(return_value=False)
    return mock_pdf
