# tests/output/test_json_writer.py
import json
from datetime import date
from decimal import Decimal

import pytest

from src.output.json_writer import save_to_json
from src.processing.transaction_model import (
    CategorizedTransaction,
    Transaction,
    TransactionSplit,
)


@pytest.fixture
def sample_categorized_transactions():
    tx1 = Transaction(
        payment_date=date(2024, 1, 1),
        purchase_date=date(2023, 12, 31),
        payee="Grocery Store",
        splits=[TransactionSplit(amount=Decimal("50.25"), category_id=101, notes="Food")]
    )
    tx2 = Transaction(
        payment_date=date(2024, 1, 5),
        purchase_date=date(2024, 1, 4),
        payee="Online Subscription",
        splits=[TransactionSplit(amount=Decimal("9.99"), category_id=102)]
    )
    tx3 = Transaction(
        payment_date=date(2024, 1, 10),
        purchase_date=date(2024, 1, 10),
        payee="Restaurant",
        splits=[
            TransactionSplit(amount=Decimal("30.00"), category_id=103, notes="Dinner"),
            TransactionSplit(amount=Decimal("5.00"), category_id=104, notes="Tip")
        ]
    )
    return [
        CategorizedTransaction(transaction=tx1, category_id=101),
        CategorizedTransaction(transaction=tx2, category_id=102),
        CategorizedTransaction(transaction=tx3, category_id=103),
    ]

def test_save_to_json_creates_file_and_content(tmp_path, sample_categorized_transactions):
    output_file = tmp_path / "test_output.json"
    save_to_json(sample_categorized_transactions, str(output_file))

    assert output_file.exists()
    
    with open(output_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    assert isinstance(data, list)
    assert len(data) == 3

    # Verify content of the first transaction
    assert data[0]['payee'] == "Grocery Store"
    assert data[0]['payment_date'] == "2024-01-01"
    assert data[0]['purchase_date'] == "2023-12-31"
    assert data[0]['category_id'] == 101
    assert len(data[0]['splits']) == 1
    assert data[0]['splits'][0]['amount'] == 50.25 # Decimal converted to float
    assert data[0]['splits'][0]['notes'] == "Food"

    # Verify content of the third transaction (with multiple splits)
    assert data[2]['payee'] == "Restaurant"
    assert data[2]['category_id'] == 103
    assert len(data[2]['splits']) == 2
    assert data[2]['splits'][0]['amount'] == 30.00
    assert data[2]['splits'][1]['amount'] == 5.00

def test_save_to_json_empty_transactions(tmp_path):
    output_file = tmp_path / "empty_output.json"
    save_to_json([], str(output_file))

    assert not output_file.exists() # File should not be created if no transactions

def test_save_to_json_invalid_path(sample_categorized_transactions):
    # Test with a path that's likely invalid/unwritable
    with pytest.raises(IOError):
        save_to_json(sample_categorized_transactions, "/nonexistent_dir/test.json")
