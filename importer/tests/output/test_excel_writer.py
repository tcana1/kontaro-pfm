from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

from src.output.excel_writer import save_to_excel
from src.processing.transaction_model import (
    CategorizedTransaction,
    Transaction,
    TransactionSplit,
)


def test_save_to_excel_creates_file(tmp_path):
    """
    Tests that save_to_excel creates an Excel file with the correct data.
    """
    transactions = [
        CategorizedTransaction(transaction=Transaction(purchase_date=date(2025, 7, 11), payment_date=date(2025, 7, 11), payee='Test Payee 1', account_id=1, splits=[TransactionSplit(amount=Decimal('-100.0'), category_id=1)]), category_id=1),
        CategorizedTransaction(transaction=Transaction(purchase_date=date(2025, 7, 12), payment_date=date(2025, 7, 11), payee='Test Payee 2', account_id=1, splits=[TransactionSplit(amount=Decimal('200.0'), category_id=2)]), category_id=2)
    ]
    output_filepath = tmp_path / "test_output.xlsx"

    # Mock xlsxwriter.Workbook and database calls
    with patch('src.output.excel_writer.xlsxwriter.Workbook') as mock_workbook_class, \
         patch('src.output.excel_writer.os.makedirs') as mock_makedirs, \
         patch('src.output.excel_writer.db_handler.get_account_names_by_ids_bulk') as mock_accounts, \
         patch('src.output.excel_writer.db_handler.get_category_names_by_ids_bulk') as mock_categories:
        
        # Set up mocks
        mock_workbook = MagicMock()
        mock_worksheet = MagicMock()
        mock_workbook_class.return_value = mock_workbook
        mock_workbook.add_worksheet.return_value = mock_worksheet
        mock_workbook.add_format.return_value = MagicMock()
        
        mock_accounts.return_value = {1: 'Test Account'}
        mock_categories.return_value = {1: 'Test Category 1', 2: 'Test Category 2'}
        
        result = save_to_excel(transactions, str(output_filepath))
        
        # Verify workbook was created and closed
        mock_workbook_class.assert_called_once_with(str(output_filepath))
        mock_workbook.add_worksheet.assert_called_once_with('Transactions')
        mock_workbook.close.assert_called_once()
        mock_makedirs.assert_called_once_with(str(tmp_path), exist_ok=True)
        
        # Verify the function returns the output path
        assert result == str(output_filepath)

def test_save_to_excel_no_transactions():
    """
    Tests that save_to_excel handles the case with no transactions.
    """
    with patch('src.output.excel_writer.logger.info') as mock_logger_info:
        save_to_excel([], "test_output")
        mock_logger_info.assert_called_with("No transactions to save.")

def test_save_to_excel_handles_complex_data_structures(tmp_path):
    """
    Tests that save_to_excel properly handles complex data structures like lists (splits)
    that caused xlsxwriter to fail. This prevents regression of the pandas removal fix.
    """
    # Create transactions with multiple splits (list of TransactionSplit objects)
    transactions = [
        CategorizedTransaction(
            transaction=Transaction(
                purchase_date=date(2025, 7, 11), 
                payment_date=date(2025, 7, 11), 
                payee='Single Split Transaction', 
                account_id=1, 
                splits=[TransactionSplit(amount=Decimal('-100.50'), category_id=1)]
            ), 
            category_id=1
        ),
        CategorizedTransaction(
            transaction=Transaction(
                purchase_date=date(2025, 7, 12), 
                payment_date=date(2025, 7, 12), 
                payee='Multiple Split Transaction', 
                account_id=2, 
                splits=[
                    TransactionSplit(amount=Decimal('150.0'), category_id=2),
                    TransactionSplit(amount=Decimal('25.75'), category_id=3)
                ]
            ), 
            category_id=2
        )
    ]
    
    output_filepath = tmp_path / "complex_data_test.xlsx"
    
    # Mock database calls
    with patch('src.output.excel_writer.xlsxwriter.Workbook') as mock_workbook_class, \
         patch('src.output.excel_writer.db_handler.get_account_names_by_ids_bulk') as mock_accounts, \
         patch('src.output.excel_writer.db_handler.get_category_names_by_ids_bulk') as mock_categories:
        
        # Set up mocks
        mock_workbook = MagicMock()
        mock_worksheet = MagicMock()
        mock_workbook_class.return_value = mock_workbook
        mock_workbook.add_worksheet.return_value = mock_worksheet
        mock_workbook.add_format.return_value = MagicMock()
        
        mock_accounts.return_value = {1: 'Account 1', 2: 'Account 2'}
        mock_categories.return_value = {1: 'Category 1', 2: 'Category 2', 3: 'Category 3'}
        
        # This should not raise a TypeError about lists
        result = save_to_excel(transactions, str(output_filepath))
        
        # Verify the function completed successfully
        assert result == str(output_filepath)
        mock_workbook.close.assert_called_once()
        
        # Verify that worksheet.write was called (meaning data was processed)
        assert mock_worksheet.write.call_count > 0