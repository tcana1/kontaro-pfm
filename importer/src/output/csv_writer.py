# src/output/csv_writer.py
import csv
import logging
from dataclasses import asdict
from typing import List

from src.processing.transaction_model import CategorizedTransaction

logger = logging.getLogger(__name__)

_FORMULA_PREFIXES = ('=', '+', '-', '@', '\t', '\r')


def _sanitize_cell(value) -> str:
    """Prefix spreadsheet formula injection characters with a single quote."""
    s = str(value)
    if s.startswith(_FORMULA_PREFIXES):
        return "'" + s
    return s

def save_to_csv(transactions: List[CategorizedTransaction], output_path: str):
    """
    Saves a list of CategorizedTransaction objects to a CSV file.

    Args:
        transactions: A list of CategorizedTransaction objects.
        output_path: The full path to the output CSV file.
    """
    if not transactions:
        logger.info("No transactions to save to CSV.")
        return

    # Prepare data for CSV writing
    csv_data = []
    headers = set()

    for cat_tx in transactions:
        tx_dict = asdict(cat_tx.transaction)
        tx_dict['category_id'] = cat_tx.category_id

        # Flatten splits into separate columns if needed, or handle as a string
        # For simplicity, let's just represent splits as a string for now
        tx_dict['splits'] = '; '.join([f"amount: {split.amount}, category_id: {split.category_id}, notes: {split.notes}" for split in cat_tx.transaction.splits])

        # Convert date objects to ISO format strings
        tx_dict['payment_date'] = tx_dict['payment_date'].isoformat()
        tx_dict['purchase_date'] = tx_dict['purchase_date'].isoformat()

        # Guard against formula injection in string fields
        tx_dict = {k: (_sanitize_cell(v) if isinstance(v, str) else v) for k, v in tx_dict.items()}

        csv_data.append(tx_dict)
        headers.update(tx_dict.keys())

    # Ensure consistent order of headers
    ordered_headers = sorted(list(headers))

    try:
        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=ordered_headers)
            writer.writeheader()
            writer.writerows(csv_data)
        logger.info(f"Successfully saved transactions to {output_path}")
    except IOError as e:
        logger.error(f"Error saving transactions to CSV file {output_path}: {e}")
        raise e
