# tests/output/test_csv_writer.py
import csv
from datetime import date
from decimal import Decimal

import pytest

from src.output.csv_writer import save_to_csv
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

def test_save_to_csv_creates_file_and_content(tmp_path, sample_categorized_transactions):
    output_file = tmp_path / "test_output.csv"
    save_to_csv(sample_categorized_transactions, str(output_file))

    assert output_file.exists()
    
    with open(output_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    assert len(rows) == 3

    # Verify headers (order might vary, so check presence)
    expected_headers = {'payment_date', 'purchase_date', 'payee', 'account_id',
                        'status_id', 'is_ignored', 'source_file', 'unique_hash', 'statement_identifier',
                        'installment_number',
                        'installment_total', 'splits', 'category_id', 'import_batch_id'}
    assert set(reader.fieldnames) == expected_headers

    # Verify content of the first transaction
    assert rows[0]['payee'] == "Grocery Store"
    assert rows[0]['payment_date'] == "2024-01-01"
    assert rows[0]['purchase_date'] == "2023-12-31"
    assert rows[0]['category_id'] == "101"
    assert "amount: 50.25" in rows[0]['splits']

    # Verify content of the third transaction (with multiple splits)
    assert rows[2]['payee'] == "Restaurant"
    assert rows[2]['category_id'] == "103"
    assert "amount: 30.00" in rows[2]['splits']
    assert "amount: 5.00" in rows[2]['splits']

def test_save_to_csv_empty_transactions(tmp_path):
    output_file = tmp_path / "empty_output.csv"
    save_to_csv([], str(output_file))

    assert not output_file.exists() # File should not be created if no transactions

def test_save_to_csv_invalid_path(sample_categorized_transactions):
    # Test with a path that's likely invalid/unwritable
    with pytest.raises(IOError):
        save_to_csv(sample_categorized_transactions, "/nonexistent_dir/test.csv")
