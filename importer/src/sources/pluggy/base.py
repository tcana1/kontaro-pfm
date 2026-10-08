from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Optional


@dataclass
class PfmTransaction:
    payment_date: date
    purchase_date: date
    payee: str
    amount: Decimal        # negative = expense, positive = credit/refund
    status_id: int         # 1=Pending (review axis; bank lifecycle is not tracked as status)
    statement_identifier: str
    installment_number: Optional[int] = None
    installment_total: Optional[int] = None


class BaseProvider(ABC):
    @abstractmethod
    def fetch_transactions(
        self,
        account_id: str,
        date_from: Optional[date] = None,
        account_type: str = "credit_card",
        created_at_from: Optional[datetime] = None,
    ) -> list[PfmTransaction]:
        """Return transactions for the given account, filtered by transaction date or creation time."""
        ...
