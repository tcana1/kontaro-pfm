from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

import psycopg2  # Import psycopg2 to mock its errors
import pytest

from src import context
from src.database import db_handler
from src.processing.transaction_model import (
    CategorizedTransaction,
    Transaction,
    TransactionSplit,
)

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture(autouse=True)
def set_test_user_id():
    context.set_user_id(TEST_USER_ID)
    yield


def create_categorized_transactions(count, start_hash=1, account_id=1):
    categorized_transactions = []
    for i in range(count):
        # Create a single split for each transaction for testing purposes
        split_amount = Decimal(str(-(100 + i)))
        split_notes = f"Note {start_hash + i}"
        category_id = (i % 5) + 1 # Assign a category ID

        tx_split = TransactionSplit(amount=split_amount, notes=split_notes, category_id=category_id)

        tx = Transaction(
            payment_date=date(2025, 7, 10 + (i % 20)),
            purchase_date=date(2025, 7, 10 + (i % 20)), # For simplicity, same as payment_date
            payee=f'Payee {start_hash + i}',
            account_id=account_id,
            unique_hash=f'hash_{start_hash + i}',
            splits=[tx_split] # Pass the list of splits
        )
        # The category_id in CategorizedTransaction is now primarily for the initial categorization
        # of the main split, as per the updated plan.
        categorized_transactions.append(CategorizedTransaction(transaction=tx, category_id=category_id))
    return categorized_transactions

# Mock setup for common database interactions
@pytest.fixture
def mock_db_connection():
    with patch('src.database.connection.get_db_connection') as mock_get_connection:
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_get_connection.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cur
        yield mock_conn, mock_cur

@patch('src.database.connection.psycopg2')
def test_get_db_connection(mock_psycopg2):
    """
    Tests that get_db_connection calls psycopg2.connect with the correct parameters.
    """
    db_handler.get_db_connection()
    mock_psycopg2.connect.assert_called_once()

@patch('src.database.connection.get_db_connection')
def test_get_categorization_rules(mock_get_connection):
    """
    Tests that get_categorization_rules fetches and returns rules from the database.
    """
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_get_connection.return_value = mock_conn
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur
    mock_cur.fetchall.return_value = [('test_keyword', 1), ('another_keyword', 2)]
    
    rules = db_handler.get_categorization_rules()
    
    assert rules == {'test_keyword': 1, 'another_keyword': 2}
    # Since USER_ID is now dynamic, we can't predict its value in tests
    mock_cur.execute.assert_called_once()
    call_args = mock_cur.execute.call_args[0]
    assert call_args[0] == "SELECT payee_keyword, category_id FROM categorization_rules WHERE user_id = %s"
    assert len(call_args[1]) == 1  # Ensure user_id parameter is passed

@patch('src.database.connection.get_db_connection')
def test_get_account_id_by_name(mock_get_connection):
    """
    Tests that get_account_id_by_name retrieves the correct account ID.
    """
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_get_connection.return_value = mock_conn
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur
    mock_cur.fetchone.return_value = (1,)
    
    account_id = db_handler.get_account_id_by_name('Test Account')
    
    assert account_id == 1
    # Since USER_ID is now dynamic, we can't predict its value in tests
    mock_cur.execute.assert_called_once()
    call_args = mock_cur.execute.call_args[0]
    assert call_args[0] == "SELECT id FROM accounts WHERE name = %s AND user_id = %s"
    assert call_args[1][0] == 'Test Account'  # First parameter should be account name
    assert len(call_args[1]) == 2  # Ensure user_id parameter is passed

@patch('src.database.connection.get_db_connection')
def test_get_account_id_by_slug(mock_get_connection):
    """
    Tests that get_account_id_by_slug retrieves the correct account ID.
    """
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_get_connection.return_value = mock_conn
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur
    mock_cur.fetchone.return_value = (1,)
    
    account_id = db_handler.get_account_id_by_slug('test-account')
    
    assert account_id == 1
    mock_cur.execute.assert_called_once()
    call_args = mock_cur.execute.call_args[0]
    assert call_args[0] == "SELECT id FROM accounts WHERE slug = %s AND user_id = %s"
    assert call_args[1][0] == 'test-account'  # First parameter should be account slug
    assert len(call_args[1]) == 2  # Ensure user_id parameter is passed

@patch('src.database.connection.get_db_connection')
def test_get_account_id_by_slug_or_fail_success(mock_get_connection):
    """
    Tests that get_account_id_by_slug_or_fail returns account ID when found.
    """
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_get_connection.return_value = mock_conn
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur
    mock_cur.fetchone.return_value = (1,)
    
    account_id = db_handler.get_account_id_by_slug_or_fail('test-account')
    
    assert account_id == 1

@patch('src.database.connection.get_db_connection')
def test_get_account_id_by_slug_or_fail_not_found(mock_get_connection):
    """
    Tests that get_account_id_by_slug_or_fail raises ValueError when account not found.
    """
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_get_connection.return_value = mock_conn
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur
    mock_cur.fetchone.return_value = None
    
    with pytest.raises(ValueError, match="Account with slug 'nonexistent-account' not found"):
        db_handler.get_account_id_by_slug_or_fail('nonexistent-account')

# Test Case 1: Insert 30 transactions
# Scenario A: Batch OK
@patch('psycopg2.extras.execute_values')
def test_insert_30_transactions_batch_ok(mock_execute_values, mock_db_connection):
    mock_conn, mock_cur = mock_db_connection
    transactions = create_categorized_transactions(30)

    # Simulate successful batch insert. The tx insert uses fetch=True/RETURNING, so
    # execute_values must yield one (unique_hash,) row per newly inserted transaction.
    mock_execute_values.return_value = [(f'hash_{i + 1}',) for i in range(30)]
    mock_cur.fetchall.return_value = [(i + 1, f'hash_{i + 1}') for i in range(30)] # For SELECT id, unique_hash

    db_handler.insert_transactions(transactions)

    # Assertions
    assert mock_execute_values.call_count == 2 # One for transactions, one for splits
    assert mock_conn.commit.call_count == 1 # One commit for the successful batch
    assert mock_conn.rollback.call_count == 0
    # Ensure individual insert function was NOT called
    individual_insert_calls = [
        call for call in mock_cur.execute.call_args_list
        if 'INSERT INTO transactions' in call.args[0] and 'RETURNING id' in call.args[0]
    ]
    assert len(individual_insert_calls) == 0


# Scenario B: Batch Fail, then individual success
@patch('psycopg2.extras.execute_values')
def test_insert_30_transactions_batch_fail_individual_ok(mock_execute_values, mock_db_connection):
    mock_conn, mock_cur = mock_db_connection
    transactions = create_categorized_transactions(30)

    # Simulate batch insert failure for transactions
    mock_execute_values.side_effect = [
        psycopg2.Error("Batch insert failed"), # First call (transactions) fails
        # Subsequent calls for individual splits will succeed
        *[None] * 30 # For 30 individual split inserts
    ]

    # Simulate individual transaction inserts succeeding
    # For each individual transaction insert, cur.execute is called with RETURNING id.
    # We need to return an ID for each of the 30 individual inserts.
    mock_cur.fetchone.side_effect = [(i + 1,) for i in range(30)]

    db_handler.insert_transactions(transactions)

    # Assertions
    assert mock_conn.rollback.call_count == 1 # One rollback for the failed batch
    assert mock_conn.commit.call_count == 30 # 30 commits for individual successful inserts
    # Check that individual insert logic was triggered
    # We expect 30 calls to cur.execute for individual transaction inserts
    individual_insert_calls = [
        call for call in mock_cur.execute.call_args_list
        if 'INSERT INTO transactions' in call.args[0] and 'RETURNING id' in call.args[0]
    ]
    assert len(individual_insert_calls) == 30
    # We expect 30 calls to execute_values for individual split inserts
    # The mock_execute_values.call_count will be 1 (for the failed batch) + 30 (for individual splits)
    assert mock_execute_values.call_count == 1 + 30

# Test Case 2: Insert 101 transactions: one batch ok, one batch fail
@patch('psycopg2.extras.execute_values')
def test_insert_101_transactions_mixed_failure(mock_execute_values, mock_db_connection):
    mock_conn, mock_cur = mock_db_connection
    transactions = create_categorized_transactions(101) # 50, 50, 1

    # Simulate behavior:
    # 1. First batch (50 transactions) succeeds.
    #    - execute_values (transactions) -> None
    #    - cur.fetchall (select ids) -> returns 50 ids
    #    - execute_values (splits) -> None
    # 2. Second batch (50 transactions) fails.
    #    - execute_values (transactions) -> psycopg2.Error
    #    - conn.rollback()
    # 3. Individual retries for the 50 failed transactions succeed.
    #    - cur.execute (individual transaction) -> returns id
    #    - execute_values (individual split) -> None (50 times)
    # 4. Third batch (1 transaction) succeeds.
    #    - execute_values (transactions) -> None
    #    - cur.fetchall (select ids) -> returns 1 id
    #    - execute_values (splits) -> None

    # Mock for execute_values. The batch phase processes ALL batches before any
    # individual retry, so batch 3 runs before the failed batch 2 is retried.
    # Tx inserts use fetch=True/RETURNING, so they must return (unique_hash,) rows.
    # Call 1 (batch 1 transactions): 50 inserted hashes
    # Call 2 (batch 1 splits): None
    # Call 3 (batch 2 transactions): Fail
    # Call 4 (batch 3 transactions): 1 inserted hash
    # Call 5 (batch 3 splits): None
    # Call 6-55 (individual splits for retried batch 2): None (50 times)
    mock_execute_values.side_effect = [
        [(f'hash_{i + 1}',) for i in range(50)], # Batch 1 transactions
        None, # Batch 1 splits
        psycopg2.Error("Batch 2 failed"), # Batch 2 transactions
        [('hash_101',)], # Batch 3 transactions
        None, # Batch 3 splits
        *[None] * 50, # Individual splits for retried batch 2 (50 times)
    ]

    # Mock for cur.fetchall (for SELECT id, unique_hash after batch inserts):
    # Call 1 (batch 1): returns 50 ids
    # Call 2 (batch 3): returns 1 id
    mock_cur.fetchall.side_effect = [
        [(i + 1, f'hash_{i + 1}') for i in range(50)], # For first batch (50)
        [(101, 'hash_101')] # For third batch (1)
    ]

    # Mock for cur.fetchone (for individual transaction inserts):
    # Called 50 times for the individual retries of batch 2
    mock_cur.fetchone.side_effect = [(i + 51,) for i in range(50)] # IDs for transactions 51-100

    with patch('src.database.transactions.get_existing_transaction_hashes') as mock_get_existing_hashes:
        mock_get_existing_hashes.return_value = set() # No existing hashes for this test
        db_handler.insert_transactions(transactions)

    # Assertions
    # Total commits: 1 (batch 1) + 50 (individual for batch 2) + 1 (batch 3) = 52
    assert mock_conn.commit.call_count == 1 + 50 + 1
    # Total rollbacks: 1 (for batch 2 failure)
    assert mock_conn.rollback.call_count == 1

    # Check execute_values calls:
    # 2 for batch 1 (tx, splits)
    # 1 for batch 2 (tx, fails)
    # 50 for individual splits of batch 2
    # 2 for batch 3 (tx, splits)
    assert mock_execute_values.call_count == 2 + 1 + 50 + 2

    # Check individual transaction insert calls (cur.execute with RETURNING id)
    individual_insert_calls = [
        call for call in mock_cur.execute.call_args_list
        if 'INSERT INTO transactions' in call.args[0] and 'RETURNING id' in call.args[0]
    ]
    assert len(individual_insert_calls) == 50 # 50 individual retries

# Test Case 3: Insert 160 transactions: all batches ok
@patch('psycopg2.extras.execute_values')
def test_insert_160_transactions_all_batches_ok(mock_execute_values, mock_db_connection):
    mock_conn, mock_cur = mock_db_connection
    transactions = create_categorized_transactions(160) # 50, 50, 50, 10

    # Simulate successful batch inserts. Each batch calls execute_values twice:
    # tx insert (fetch=True/RETURNING → (unique_hash,) rows) then splits insert (None).
    mock_execute_values.side_effect = [
        [(f'hash_{i + 1}',) for i in range(50)],   None,  # Batch 1 (tx, splits)
        [(f'hash_{i + 51}',) for i in range(50)],  None,  # Batch 2
        [(f'hash_{i + 101}',) for i in range(50)], None,  # Batch 3
        [(f'hash_{i + 151}',) for i in range(10)], None,  # Batch 4
    ]

    # For each batch, cur.fetchall needs to return IDs
    mock_cur.fetchall.side_effect = [
        [(i + 1, f'hash_{i + 1}') for i in range(50)],    # Batch 1 (0-49)
        [(i + 51, f'hash_{i + 51}') for i in range(50)],  # Batch 2 (50-99)
        [(i + 101, f'hash_{i + 101}') for i in range(50)], # Batch 3 (100-149)
        [(i + 151, f'hash_{i + 151}') for i in range(10)]  # Batch 4 (150-159)
    ]

    with patch('src.database.transactions.get_existing_transaction_hashes') as mock_get_existing_hashes:
        mock_get_existing_hashes.return_value = set() # No existing hashes for this test
        db_handler.insert_transactions(transactions)

    # Assertions
    assert mock_execute_values.call_count == 8 # 4 batches * (tx + splits)
    assert mock_conn.commit.call_count == 4 # 4 successful batches
    assert mock_conn.rollback.call_count == 0
    # Ensure individual insert function was NOT called
    individual_insert_calls = [
        call for call in mock_cur.execute.call_args_list
        if 'INSERT INTO transactions' in call.args[0] and 'RETURNING id' in call.args[0]
    ]
    assert len(individual_insert_calls) == 0

# Test Case 4: Insert 60 transactions: both batches fail, then individual fail
@patch('psycopg2.extras.execute_values')
def test_insert_60_transactions_all_fail(mock_execute_values, mock_db_connection):
    mock_conn, mock_cur = mock_db_connection
    transactions = create_categorized_transactions(60) # 50, 10

    # Simulate batch insert failure for transactions for both batches
    # Then simulate individual insert failure for all 60 transactions
    mock_execute_values.side_effect = [
        psycopg2.Error("Batch 1 failed"), # Batch 1 transactions
        psycopg2.Error("Batch 2 failed"), # Batch 2 transactions
        *[psycopg2.Error("Individual split failed")] * 60 # 60 individual split failures
    ]

    # Simulate individual transaction inserts succeeding (cur.execute for RETURNING id)
    # but the subsequent split insert fails.
    mock_cur.fetchone.side_effect = [(i + 1,) for i in range(60)] # Individual transaction inserts succeed

    db_handler.insert_transactions(transactions)

    # Assertions
    assert mock_conn.rollback.call_count == 2 + 60 # 2 for batch failures + 60 for individual failures
    assert mock_conn.commit.call_count == 0 # No successful commits

    # Check execute_values calls:
    # 1 for batch 1 (tx, fails)
    # 1 for batch 2 (tx, fails)
    # 60 for individual splits (all fail)
    assert mock_execute_values.call_count == 1 + 1 + 60

    # Check individual transaction insert calls (cur.execute with RETURNING id)
    individual_insert_calls = [
        call for call in mock_cur.execute.call_args_list
        if 'INSERT INTO transactions' in call.args[0] and 'RETURNING id' in call.args[0]
    ]
    assert len(individual_insert_calls) == 60 # 60 individual retries

@patch('psycopg2.extras.execute_values')
def test_insert_duplicate_transaction_split(mock_execute_values, mock_db_connection):
    mock_conn, mock_cur = mock_db_connection
    transactions = create_categorized_transactions(1) # Create one transaction
    unique_hash = transactions[0].transaction.unique_hash

    # First run: fresh insert. Tx insert (fetch=True/RETURNING) returns the new hash,
    # so its split is inserted too.
    mock_execute_values.return_value = [(unique_hash,)]
    mock_cur.fetchall.side_effect = [[(1, unique_hash)]] # For SELECT id, unique_hash

    with patch('src.database.transactions.get_existing_transaction_hashes') as mock_get_existing_hashes:
        mock_get_existing_hashes.return_value = set() # For the first run, no existing hashes
        db_handler.insert_transactions(transactions)

        # Reset mocks to check calls for the second insert
        mock_execute_values.reset_mock()
        mock_conn.reset_mock()
        mock_cur.reset_mock()

        # Second run: same transaction. ON CONFLICT (unique_hash) DO NOTHING means the
        # tx insert returns no rows, so newly_inserted_hashes is empty and the split
        # insert is skipped entirely (avoids re-inserting stale, user-editable splits).
        mock_execute_values.return_value = []
        mock_cur.fetchall.side_effect = [[(1, unique_hash)]] # existing id still resolvable
        mock_get_existing_hashes.return_value = {unique_hash}

        db_handler.insert_transactions(transactions)

    # Only the tx insert runs on the duplicate; the split insert is skipped.
    assert mock_execute_values.call_count == 1

    tx_insert_sql = mock_execute_values.call_args_list[0].args[1]
    assert "INSERT INTO transactions" in tx_insert_sql
    assert "ON CONFLICT (unique_hash) DO NOTHING" in tx_insert_sql
    assert mock_conn.commit.call_count == 1 # batch still commits even with nothing new
    assert mock_conn.rollback.call_count == 0


# ── Multi-split batch insert tests ─────────────────────────────────────────

@patch('psycopg2.extras.execute_values')
def test_batch_insert_all_splits_are_inserted(mock_execute_values, mock_db_connection):
    """Batch path inserts all splits for each transaction, not just splits[0]."""
    mock_conn, mock_cur = mock_db_connection

    splits = [
        TransactionSplit(amount=Decimal("-2500"), notes="Condomínio"),
        TransactionSplit(amount=Decimal("-260"),  notes="Fundo de Reserva"),
        TransactionSplit(amount=Decimal("-192"),  notes="Férias/13o"),
    ]
    tx = Transaction(
        payment_date=date(2026, 7, 11),
        purchase_date=date(2026, 7, 11),
        payee="Condomínio Residencial",
        account_id=1,
        unique_hash="hash_condo_batch",
        splits=splits,
    )
    cat_tx = CategorizedTransaction(transaction=tx, category_id=5)

    # First execute_values call (tx batch insert) returns newly inserted hashes via RETURNING
    # Second call (splits insert) returns None
    mock_execute_values.side_effect = [[("hash_condo_batch",)], None]
    mock_cur.fetchall.return_value = [(99, "hash_condo_batch")]

    with patch('src.database.transactions.get_existing_transaction_hashes', return_value=set()):
        db_handler.insert_transactions([cat_tx])

    assert mock_execute_values.call_count == 2  # tx batch + splits batch
    splits_data = mock_execute_values.call_args_list[1].args[2]
    assert len(splits_data) == 3
    assert splits_data[0] == (99, 5, Decimal("-2500"), "Condomínio")
    assert splits_data[1] == (99, 5, Decimal("-260"),  "Fundo de Reserva")
    assert splits_data[2] == (99, 5, Decimal("-192"),  "Férias/13o")


@patch('psycopg2.extras.execute_values')
def test_batch_insert_split_category_id_takes_priority(mock_execute_values, mock_db_connection):
    """In batch path, split's own category_id takes priority over cat_tx.category_id."""
    mock_conn, mock_cur = mock_db_connection

    splits = [
        TransactionSplit(amount=Decimal("-100"), category_id=10, notes="Has own category"),
        TransactionSplit(amount=Decimal("-50"),  category_id=None, notes="Falls back to cat_tx"),
    ]
    tx = Transaction(
        payment_date=date(2026, 7, 11),
        purchase_date=date(2026, 7, 11),
        payee="Test Payee",
        account_id=1,
        unique_hash="hash_cat_batch",
        splits=splits,
    )
    cat_tx = CategorizedTransaction(transaction=tx, category_id=99)

    mock_execute_values.side_effect = [[("hash_cat_batch",)], None]
    mock_cur.fetchall.return_value = [(42, "hash_cat_batch")]

    with patch('src.database.transactions.get_existing_transaction_hashes', return_value=set()):
        db_handler.insert_transactions([cat_tx])

    splits_data = mock_execute_values.call_args_list[1].args[2]
    assert len(splits_data) == 2
    assert splits_data[0][1] == 10   # split's own category_id
    assert splits_data[1][1] == 99   # fallback to cat_tx.category_id


# ── Multi-split individual insert tests ────────────────────────────────────

@patch('psycopg2.extras.execute_values')
def test_individual_insert_all_splits_are_inserted(mock_execute_values, mock_db_connection):
    """All splits of a transaction are inserted, not just the first one."""
    mock_conn, mock_cur = mock_db_connection

    splits = [
        TransactionSplit(amount=Decimal("-2500"), notes="Condomínio"),
        TransactionSplit(amount=Decimal("-260"),  notes="Fundo de Reserva"),
        TransactionSplit(amount=Decimal("-192"),  notes="Férias/13o"),
    ]
    tx = Transaction(
        payment_date=date(2026, 7, 11),
        purchase_date=date(2026, 7, 11),
        payee="Condomínio Residencial",
        account_id=1,
        unique_hash="hash_condo",
        splits=splits,
    )
    cat_tx = CategorizedTransaction(transaction=tx, category_id=5)

    # Force individual path by failing the batch
    mock_execute_values.side_effect = [psycopg2.Error("Batch failed"), None]
    mock_cur.fetchone.return_value = (99,)

    db_handler.insert_transactions([cat_tx])

    assert mock_execute_values.call_count == 2  # 1 failed batch + 1 splits insert
    splits_data = mock_execute_values.call_args_list[1].args[2]
    assert len(splits_data) == 3
    assert splits_data[0] == (99, 5, Decimal("-2500"), "Condomínio")
    assert splits_data[1] == (99, 5, Decimal("-260"),  "Fundo de Reserva")
    assert splits_data[2] == (99, 5, Decimal("-192"),  "Férias/13o")


@patch('psycopg2.extras.execute_values')
def test_individual_insert_split_category_id_takes_priority(mock_execute_values, mock_db_connection):
    """Split's own category_id is used when set; falls back to cat_tx.category_id otherwise."""
    mock_conn, mock_cur = mock_db_connection

    splits = [
        TransactionSplit(amount=Decimal("-100"), category_id=10, notes="Has own category"),
        TransactionSplit(amount=Decimal("-50"),  category_id=None, notes="Falls back to cat_tx"),
    ]
    tx = Transaction(
        payment_date=date(2026, 7, 11),
        purchase_date=date(2026, 7, 11),
        payee="Test Payee",
        account_id=1,
        unique_hash="hash_cat_priority",
        splits=splits,
    )
    cat_tx = CategorizedTransaction(transaction=tx, category_id=99)

    mock_execute_values.side_effect = [psycopg2.Error("Batch failed"), None]
    mock_cur.fetchone.return_value = (42,)

    db_handler.insert_transactions([cat_tx])

    splits_data = mock_execute_values.call_args_list[1].args[2]
    assert len(splits_data) == 2
    assert splits_data[0][1] == 10   # split's own category_id
    assert splits_data[1][1] == 99   # fallback to cat_tx.category_id
