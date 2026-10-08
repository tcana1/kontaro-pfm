from typing import Optional, Tuple

from src.database import db_handler


def resolve_account_id_from_rules(file_info: dict, filename: str = "") -> Tuple[Optional[int], str]:
    """
    Resolve account_id from the user's import rules.
    Returns (account_id, "ok"), (None, "ambiguous"), or (None, "not_found").
    """
    bank = file_info.get("bank", "unknown")
    type_ = file_info.get("type", "unknown")
    text = file_info.get("text", "")
    return db_handler.resolve_account_from_rules(bank, type_, text=text, filename=filename)
