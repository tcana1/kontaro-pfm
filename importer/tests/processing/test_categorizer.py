import unittest
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from src.processing.categorizer import categorize_transactions
from src.processing.transaction_model import (
    Transaction,
    TransactionSplit,
)

# Define a consistent ID for the 'Uncategorized' category for testing
UNCATEGORIZED_CATEGORY_ID = 0

class TestHardcodedRules(unittest.TestCase):
    @patch('src.processing.categorizer.db_handler')
    def test_categorize_with_hardcoded_rules(self, mock_db_handler):
        # Arrange
        mock_db_handler.get_categorization_rules.return_value = {
            'supermercado': 1,
            'uber': 2,
        }
        # Mock the get_category_id_by_name for 'Uncategorized'
        mock_db_handler.get_category_id_by_name.return_value = UNCATEGORIZED_CATEGORY_ID

        transactions = [
            Transaction(payee='Supermercado Pão de Açúcar', purchase_date=date(2025, 7, 17), payment_date=date(2025, 7, 17), splits=[TransactionSplit(amount=Decimal('100.0'))]),
            Transaction(payee='Uber Viagem', purchase_date=date(2025, 7, 17), payment_date=date(2025, 7, 17), splits=[TransactionSplit(amount=Decimal('25.0'))]),
            Transaction(payee='Padaria do Zé', purchase_date=date(2025, 7, 17), payment_date=date(2025, 7, 17), splits=[TransactionSplit(amount=Decimal('10.0'))]),
        ]

        # Act
        categorized_transactions = categorize_transactions(transactions)

        # Assert
        self.assertEqual(categorized_transactions[0].category_id, 1)
        self.assertEqual(categorized_transactions[1].category_id, 2)
        self.assertEqual(categorized_transactions[2].category_id, UNCATEGORIZED_CATEGORY_ID)

    @patch('src.processing.categorizer.db_handler')
    def test_longest_keyword_wins_on_conflict(self, mock_db_handler):
        mock_db_handler.get_categorization_rules.return_value = {
            'condomínio': 10,
            'condomínio residencial': 20,
        }
        mock_db_handler.get_category_id_by_name.return_value = UNCATEGORIZED_CATEGORY_ID

        transactions = [
            Transaction(payee='Condomínio Residencial JUL/2026', purchase_date=date(2026, 7, 11), payment_date=date(2026, 7, 11), splits=[TransactionSplit(amount=Decimal('-2500'))]),
            Transaction(payee='Condomínio Bela Vista JUL/2026', purchase_date=date(2026, 7, 11), payment_date=date(2026, 7, 11), splits=[TransactionSplit(amount=Decimal('-1800'))]),
        ]

        categorized = categorize_transactions(transactions)

        self.assertEqual(categorized[0].category_id, 20)  # "condomínio residencial" > "condomínio"
        self.assertEqual(categorized[1].category_id, 10)  # só "condomínio" casa


class TestTransactionHistory(unittest.TestCase):
    @patch('src.processing.categorizer.db_handler')
    def test_categorize_with_transaction_history(self, mock_db_handler):
        # Arrange
        mock_db_handler.get_categorization_rules.return_value = {}
        mock_db_handler.get_payee_category_distribution_batch.return_value = {
            'padaria do zé': {3: 10},
            'posto shell': {4: 9, 5: 1},
            'restaurante': {6: 5, 7: 5},
        }
        # Mock the get_category_id_by_name for 'Uncategorized'
        mock_db_handler.get_category_id_by_name.return_value = UNCATEGORIZED_CATEGORY_ID

        transactions = [
            Transaction(payee='Padaria do Zé', purchase_date=date(2025, 7, 17), payment_date=date(2025, 7, 17), splits=[TransactionSplit(amount=Decimal('10.0'))]),
            Transaction(payee='Posto Shell', purchase_date=date(2025, 7, 17), payment_date=date(2025, 7, 17), splits=[TransactionSplit(amount=Decimal('50.0'))]),
            Transaction(payee='Restaurante', purchase_date=date(2025, 7, 17), payment_date=date(2025, 7, 17), splits=[TransactionSplit(amount=Decimal('75.0'))]),
        ]

        # Act
        categorized_transactions = categorize_transactions(transactions)

        # Assert
        self.assertEqual(categorized_transactions[0].category_id, 3)
        self.assertEqual(categorized_transactions[1].category_id, 4)
        self.assertEqual(categorized_transactions[2].category_id, UNCATEGORIZED_CATEGORY_ID)

class TestInstallmentCategorization(unittest.TestCase):
    @patch('src.processing.categorizer.db_handler')
    def test_categorize_with_installment_history(self, mock_db_handler):
        # Arrange
        mock_db_handler.get_categorization_rules.return_value = {}
        mock_db_handler.get_payee_category_distribution.return_value = {}
        mock_db_handler.get_installment_categories_batch.return_value = {
            'loja de roupas_2025-06-01_50.0': 101,
            'loja de roupas_2025-06-01_50.05': 101,
        }
        # Mock the get_category_id_by_name for 'Uncategorized'
        mock_db_handler.get_category_id_by_name.return_value = UNCATEGORIZED_CATEGORY_ID

        transactions = [
            Transaction(payee='Loja de Roupas', purchase_date=date(2025, 6, 1), payment_date=date(2025, 7, 1), installment_number=2, installment_total=5, splits=[TransactionSplit(amount=Decimal('50.0'))]),
            Transaction(payee='Padaria do Zé', purchase_date=date(2025, 7, 17), payment_date=date(2025, 7, 17), splits=[TransactionSplit(amount=Decimal('10.0'))]),
            Transaction(payee='Loja de Roupas', purchase_date=date(2025, 6, 1), payment_date=date(2025, 8, 1), installment_number=3, installment_total=5, splits=[TransactionSplit(amount=Decimal('50.05'))]),
        ]

        # Act
        categorized_transactions = categorize_transactions(transactions)

        # Assert
        self.assertEqual(categorized_transactions[0].category_id, 101)
        self.assertEqual(categorized_transactions[1].category_id, UNCATEGORIZED_CATEGORY_ID)
        self.assertEqual(categorized_transactions[2].category_id, 101)

    @patch('src.processing.categorizer.db_handler')
    def test_categorize_installment_with_mixed_categories_returns_uncategorized(self, mock_db_handler):
        """
        Test that when past installments used different categories, 
        the function returns None (uncategorized) due to lack of 100% consistency.
        """
        # Arrange
        mock_db_handler.get_categorization_rules.return_value = {}
        mock_db_handler.get_payee_category_distribution.return_value = {}
        # Simulate mixed categories in installment history (should return None)
        mock_db_handler.get_installment_categories_batch.return_value = {
            'amazon_2025-04-29_-56.94': None,  # Mixed categories found, returns None
        }
        mock_db_handler.get_category_id_by_name.return_value = UNCATEGORIZED_CATEGORY_ID

        transactions = [
            Transaction(payee='Amazon', purchase_date=date(2025, 4, 29), payment_date=date(2025, 5, 1), 
                       installment_number=2, installment_total=3, 
                       splits=[TransactionSplit(amount=Decimal('-56.94'))]),
        ]

        # Act
        categorized_transactions = categorize_transactions(transactions)

        # Assert - Should be uncategorized due to mixed historical categories
        self.assertEqual(categorized_transactions[0].category_id, UNCATEGORIZED_CATEGORY_ID)

    @patch('src.processing.categorizer.db_handler')
    def test_categorize_installment_with_consistent_category_succeeds(self, mock_db_handler):
        """
        Test that when all past installments used the same category (100% consistency),
        the function returns that category.
        """
        # Arrange
        mock_db_handler.get_categorization_rules.return_value = {}
        mock_db_handler.get_payee_category_distribution.return_value = {}
        # Simulate consistent category in installment history  
        # Key format: {payee.lower()}_{purchase_date}_{amount}
        mock_db_handler.get_installment_categories_batch.return_value = {
            'amazon_2025-04-29_-56.94': 123,  # Consistent category found
        }
        mock_db_handler.get_category_id_by_name.return_value = UNCATEGORIZED_CATEGORY_ID

        transactions = [
            Transaction(payee='Amazon', purchase_date=date(2025, 4, 29), payment_date=date(2025, 5, 1), 
                       installment_number=2, installment_total=3, 
                       splits=[TransactionSplit(amount=Decimal('-56.94'))]),
        ]

        # Act
        categorized_transactions = categorize_transactions(transactions)

        # Assert - Should use the consistent historical category
        self.assertEqual(categorized_transactions[0].category_id, 123)


if __name__ == '__main__':
    unittest.main()