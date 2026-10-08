# src/output/json_writer.py
import json
import logging
from dataclasses import asdict
from typing import List

from src.processing.transaction_model import CategorizedTransaction

logger = logging.getLogger(__name__)

def save_to_json(transactions: List[CategorizedTransaction], output_path: str):
    """
    Saves a list of CategorizedTransaction objects to a JSON file.

    Args:
        transactions: A list of CategorizedTransaction objects.
        output_path: The full path to the output JSON file.
    """
    if not transactions:
        logger.info("No transactions to save to JSON.")
        return

    # Convert CategorizedTransaction objects to dictionaries
    # and then to a JSON-serializable format
    json_data = []
    for cat_tx in transactions:
        tx_dict = asdict(cat_tx.transaction)
        tx_dict['category_id'] = cat_tx.category_id
        # Convert Decimal to float for JSON serialization
        tx_dict['splits'] = [{**asdict(split), 'amount': float(split.amount)} for split in cat_tx.transaction.splits]
        # Convert date objects to ISO format strings
        tx_dict['payment_date'] = tx_dict['payment_date'].isoformat()
        tx_dict['purchase_date'] = tx_dict['purchase_date'].isoformat()
        json_data.append(tx_dict)

    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, ensure_ascii=False, indent=4)
        logger.info(f"Successfully saved transactions to {output_path}")
    except IOError as e:
        logger.error(f"Error saving transactions to JSON file {output_path}: {e}")
        raise e
