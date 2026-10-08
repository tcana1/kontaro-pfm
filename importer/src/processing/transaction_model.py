# src/processing/transaction_model.py
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import List


@dataclass
class TransactionSplit:
    """
    Represents a single split of a financial transaction.
    """
    amount: Decimal
    category_id: int | None = None
    notes: str | None = None

@dataclass
class Transaction:
    """
    A standard representation of a financial transaction.

    This dataclass serves as the common data structure for all parsers,
    ensuring that transaction data is consistent before being processed
    and stored in the database.
    """
    payment_date: date
    purchase_date: date
    payee: str
    account_id: int | None = None
    status_id: int = 1  # Default to 'Pending'
    is_ignored: bool = False  # Excluded from reports, still counted in balances
    source_file: str | None = None
    unique_hash: str | None = None
    statement_identifier: str | None = None  # Used to distinguish transactions across different statements
    import_batch_id: str | None = None  # UUID of the import_batches row this transaction belongs to
    installment_number: int | None = None
    installment_total: int | None = None
    splits: List[TransactionSplit] = field(default_factory=list)

    @property
    def amount(self) -> Decimal:
        """Calculates the total amount of the transaction from its splits."""
        return sum(split.amount for split in self.splits)

@dataclass
class CategorizedTransaction:
    """
    Represents a transaction that has been assigned a category.

    This structure links a Transaction object with its determined category_id,
    preparing it for insertion into the database splits table.
    """
    transaction: Transaction
    category_id: int | None # This will be used for the *initial* categorization of the main split
    category_name: str | None = None
