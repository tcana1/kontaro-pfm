from datetime import date
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


class TransactionSplitInput(BaseModel):
    amount: Decimal
    category_id: Optional[int] = None
    notes: Optional[str] = None


class TransactionInput(BaseModel):
    payment_date: date
    purchase_date: date
    payee: str
    status_id: int = 1
    installment_number: Optional[int] = None
    installment_total: Optional[int] = None
    statement_identifier: Optional[str] = None
    import_batch_id: Optional[str] = None
    splits: List[TransactionSplitInput] = Field(..., min_length=1)


class ImportRequest(BaseModel):
    account_slug: str
    dry_run: bool = False
    source: Optional[str] = None
    transactions: List[TransactionInput] = Field(..., min_length=1)


class StatusUpdateRequest(BaseModel):
    status_id: int


class StatusUpdateResponse(BaseModel):
    success: bool
    updated: bool


class SkipDetail(BaseModel):
    row: int
    reason: str


class PreviewTransaction(BaseModel):
    purchase_date: date
    payee: str
    amount: float
    category: Optional[str] = None


class CreatedAccount(BaseModel):
    id: int
    name: str


class ImportResponse(BaseModel):
    success: bool
    transaction_count: int
    inserted: int
    duplicates: int
    skipped: int = 0
    skip_details: List[SkipDetail] = []
    failed: int
    total_amount: float
    dry_run: bool
    transactions: Optional[List[PreviewTransaction]] = None
    accounts_created: List[CreatedAccount] = []
