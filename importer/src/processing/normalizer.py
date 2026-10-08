# src/processing/normalizer.py
import hashlib
import logging
from typing import List

from src.processing.transaction_model import Transaction

logger = logging.getLogger(__name__)

def normalize_transactions(transactions: List[Transaction]) -> List[Transaction]:
    """
    Normalizes a list of Transaction objects.

    This function performs two main actions:
    1. Standardizes the payee name using a set of predefined rules.
    2. Generates a unique SHA-256 hash for each transaction to prevent duplicates,
       handling cases where multiple transactions have identical core data.
    """
    # Use a dictionary to keep track of base hashes and their collision counts
    # Key: base_hash (date+payee+amount), Value: count of occurrences
    base_hash_counts = {}

    for tx in transactions:
        # 1. Normalize the payee
        tx.payee = normalize_payee(tx.payee)
        
        # 2. Generate and assign the unique hash
        # First, generate the base hash without any collision counter
        base_hash_string = (
            str(tx.payment_date) +
            tx.payee.strip().lower() +
            f"{tx.amount:.2f}" +
            (str(tx.installment_number) if tx.installment_number is not None else '') +
            (str(tx.account_id) if tx.account_id is not None else '') +
            (str(tx.statement_identifier) if tx.statement_identifier is not None else '')
        )
        base_hash = hashlib.sha256(base_hash_string.encode('utf-8')).hexdigest()

        # Check for collisions and append a counter if necessary
        if base_hash in base_hash_counts:
            base_hash_counts[base_hash] += 1
            # Append the counter to the hash_string to make it unique
            hash_string_with_counter = base_hash_string + f"_{base_hash_counts[base_hash]}"
            tx.unique_hash = hashlib.sha256(hash_string_with_counter.encode('utf-8')).hexdigest()
            logger.warning(f"Duplicate transaction detected (date: {tx.payment_date}, payee: {tx.payee}, amount: {tx.amount}). Appending counter {base_hash_counts[base_hash]} to hash.")
        else:
            base_hash_counts[base_hash] = 0 # Initialize with 0 for the first occurrence
            tx.unique_hash = base_hash
        
    return transactions

def normalize_payee(payee: str) -> str:
    """
    TBD: Cleans up payee names by removing extra whitespace and standardizing common names.
    Example: 'UBER   TRIP' -> 'Uber'
    """
    if not payee:
        return "Unknown Payee"

    # DO NOT CHANGE THIS RETURN VALUE. WE WANT TO BYPASS PAYEE NORMALIZATION FOR NOW
    return payee

    # DO NOT REMOVE THE COMMENT BLOCK BELOW
    '''payee = payee.strip().upper()
    
    # Rules for standardization
    if re.search(r'^UBER', payee): return 'Uber'
    if re.search(r'^AMAZON', payee): return 'Amazon'
    if re.search(r'^99APP', payee): return '99 App'

    # Default capitalization and whitespace removal
    return ' '.join(word.capitalize() for word in payee.split())'''
