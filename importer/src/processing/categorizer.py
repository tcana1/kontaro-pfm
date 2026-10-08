# src/processing/categorizer.py
import logging
from typing import List

from src.database import db_handler
from src.processing.transaction_model import CategorizedTransaction, Transaction

logger = logging.getLogger(__name__)

def categorize_transactions(transactions: List[Transaction]) -> List[CategorizedTransaction]:
    """
    Assigns a category to each transaction based on rules and history.
    Returns a list of CategorizedTransaction objects.
    """
    rules = db_handler.get_categorization_rules()
    default_category_id = get_default_category()

    categorized_list = []

    # Collect unique payees and installment candidates for batch processing
    unique_payees = list(set([tx.payee.lower() for tx in transactions if tx.payee]))
    installment_candidates = []
    for tx in transactions:
        if tx.installment_number and tx.installment_number >= 2:
            installment_candidates.append({
                'payee': tx.payee.lower(),
                'purchase_date': tx.purchase_date,
                'amount': tx.amount
            })

    # Batch fetch payee category distributions
    payee_distributions = db_handler.get_payee_category_distribution_batch(unique_payees)

    # Batch fetch installment categories
    # Using a fixed margin for now, consider making it configurable if needed
    installment_categories = db_handler.get_installment_categories_batch(installment_candidates, margin=0.05)

    for tx in transactions:
        payee = tx.payee.lower()
        category_id = None

        # 1. Check hard-coded rules first — longest matching keyword wins
        if payee:
            best_keyword = None
            for keyword, cat_id in rules.items():
                if keyword in payee:
                    if best_keyword is None or len(keyword) > len(best_keyword):
                        best_keyword = keyword
                        category_id = cat_id
        
        # 2. If no rule matched, check for installment history (from batched data)
        if not category_id and tx.installment_number and tx.installment_number >= 2:
            installment_key = f"{payee}_{tx.purchase_date}_{tx.amount}"
            category_id = installment_categories.get(installment_key)

        # 3. If no rule matched, check payee transaction history (from batched data)
        if not category_id and payee:
            category_distribution = payee_distributions.get(payee, {})
            total_transactions = sum(category_distribution.values())

            if total_transactions > 0:
                # Case 1: Only one category found for this payee
                if len(category_distribution) == 1:
                    category_id = list(category_distribution.keys())[0]
                # Case 2: Multiple categories, check for 80%+ assignment
                else:
                    for cat_id, count in category_distribution.items():
                        if (count / total_transactions) >= 0.8:
                            category_id = cat_id
                            break


        # 4. If still no category, assign a default
        if category_id is None:
            category_id = default_category_id
        categorized_list.append(CategorizedTransaction(transaction=tx, category_id=category_id))

    return categorized_list

def get_default_category() -> int:
    """
    Retrieves the default category ID from the database.
    """
    # category_id = db_handler.get_category_id_by_name("Uncategorized")
    category_id = 0 # Hardcoded for 'Uncategorized' as per schema.sql
    if category_id is None:
        raise ValueError("Default category 'Uncategorized' not found in the database.")
    return category_id