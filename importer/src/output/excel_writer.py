# src/output/excel_writer.py
import logging
import os
from dataclasses import asdict
from datetime import datetime
from typing import List

import xlsxwriter

from src.database import db_handler
from src.processing.transaction_model import CategorizedTransaction

logger = logging.getLogger(__name__)

_FORMULA_PREFIXES = ('=', '+', '-', '@', '\t', '\r')


def _sanitize_cell(value: str) -> str:
    """Prefix spreadsheet formula injection characters with a single quote."""
    if value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return value

def save_to_excel(transactions: List[CategorizedTransaction], output_filepath: str):
    """
    Saves a list of Transaction objects to an Excel file using xlsxwriter.

    Args:
        transactions: A list of Transaction objects.
        output_filepath: The full path to the output Excel file.
    """
    if not transactions:
        logger.info("No transactions to save.")
        return None

    # Collect all unique account_ids and category_ids
    account_ids = list(set([cat_tx.transaction.account_id for cat_tx in transactions]))
    category_ids = list(set([cat_tx.category_id for cat_tx in transactions]))

    # Fetch account and category names in bulk
    account_names_map = db_handler.get_account_names_by_ids_bulk(account_ids)
    category_names_map = db_handler.get_category_names_by_ids_bulk(category_ids)

    # Prepare data
    transactions_data = []
    for cat_tx in transactions:
        tx_dict = asdict(cat_tx.transaction)
        tx_dict['category_id'] = cat_tx.category_id

        # Replace account_id with account_name
        account_name = account_names_map.get(tx_dict['account_id'], 'Unknown Account')
        tx_dict['account_name'] = account_name
        del tx_dict['account_id']

        # Replace category_id with category_name
        category_name = category_names_map.get(tx_dict['category_id'], 'Unknown Category')
        tx_dict['category_name'] = category_name
        del tx_dict['category_id']

        # Handle complex data types that xlsxwriter can't serialize
        # Convert splits list to a more Excel-friendly format
        if 'splits' in tx_dict and isinstance(tx_dict['splits'], list):
            # Create a string representation of splits or just use the total amount
            tx_dict['amount'] = str(cat_tx.transaction.amount)  # Use the computed amount property
            del tx_dict['splits']  # Remove the complex splits field
        
        # Convert any remaining complex objects to strings
        for key, value in tx_dict.items():
            if isinstance(value, (list, dict)):
                tx_dict[key] = str(value)
            elif hasattr(value, '__dict__'):  # Custom objects
                tx_dict[key] = str(value)

        transactions_data.append(tx_dict)

    # Ensure the directory exists
    os.makedirs(os.path.dirname(output_filepath), exist_ok=True)

    # Write to Excel using xlsxwriter
    workbook = xlsxwriter.Workbook(output_filepath)
    worksheet = workbook.add_worksheet('Transactions')
    
    # Add date format
    date_format = workbook.add_format({'num_format': 'yyyy-mm-dd'})
    
    if transactions_data:
        # Write headers
        headers = list(transactions_data[0].keys())
        for col, header in enumerate(headers):
            worksheet.write(0, col, header)
        
        # Write data
        for row, tx_data in enumerate(transactions_data, 1):
            for col, header in enumerate(headers):
                value = tx_data[header]
                # Handle date formatting
                if isinstance(value, datetime) or (hasattr(value, 'strftime')):
                    worksheet.write_datetime(row, col, value, date_format)
                elif isinstance(value, str):
                    worksheet.write(row, col, _sanitize_cell(value))
                else:
                    worksheet.write(row, col, value)
    
    workbook.close()
    logger.info(f"Successfully saved backup to {output_filepath}")
    return output_filepath
