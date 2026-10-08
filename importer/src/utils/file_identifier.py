import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

import pdfplumber

logger = logging.getLogger(__name__)

def find_pdf_password(file_path: str, password_list: Optional[List[str]] = None) -> Optional[str]:
    """
    Try to find the correct password for a password-protected PDF.
    Returns the password if found, None if PDF is password-protected but no password works,
    or empty string if PDF is not password-protected.
    """
    if password_list is None:
        password_list = [""]

    # First try without password
    try:
        with pdfplumber.open(file_path) as _pdf:
            # If we can open it without password, no password needed
            return ""
    except Exception:
        # PDF is likely password protected, try passwords
        logger.debug(f"PDF is password protected. Trying {len(password_list)} passwords...")
        for password in password_list:
            try:
                with pdfplumber.open(file_path, password=password) as _pdf:
                    # If we can open it with this password, return it
                    logger.debug("Success! Password found.")
                    return password
            except Exception:
                continue
        
        logger.warning("Could not decrypt PDF with the provided passwords.")
        return None

def extract_pdf_text(file_path: str, password: Optional[str] = None) -> str:
    """
    Extract text from PDF using pdfplumber with optional password.
    """
    try:
        with pdfplumber.open(file_path, password=password) as pdf:
            text_parts = []
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    text_parts.append(text)
            return "\n".join(text_parts)
    except Exception as e:
        logger.error(f"Error extracting text from PDF: {e}")
        return ""

def identify_file(file_path: str, password_list: Optional[List[str]] = None) -> Dict[str, Any]:
    # Check if file exists first
    if not os.path.exists(file_path):
        return {"error": f"File does not exist: {file_path}"}
    
    file_name = os.path.basename(file_path).lower()
    text = ""
    file_format = ""

    if file_name.endswith(('.xls', '.xlsx')):
        file_format = 'excel'
        try:
            import xlrd
            from openpyxl import load_workbook
            
            content_parts = []
            if file_name.endswith('.xlsx'):
                # Use openpyxl for .xlsx files
                workbook = load_workbook(file_path, data_only=True)
                for sheet_name in workbook.sheetnames:
                    worksheet = workbook[sheet_name]
                    rows = []
                    for row_num, row in enumerate(worksheet.iter_rows(values_only=True), 1):
                        if row_num > 500:  # Limit to first 500 rows like pandas head(500)
                            break
                        rows.append('\t'.join(str(cell) if cell is not None else '' for cell in row))
                    content_parts.append(f"Sheet: {sheet_name}\n" + '\n'.join(rows))
                workbook.close()
            else:
                # Use xlrd for .xls files
                workbook = xlrd.open_workbook(file_path)
                for sheet_name in workbook.sheet_names():
                    worksheet = workbook.sheet_by_name(sheet_name)
                    rows = []
                    for row_num in range(min(50, worksheet.nrows)):  # Limit to first 50 rows
                        row_values = []
                        for col_num in range(worksheet.ncols):
                            cell = worksheet.cell(row_num, col_num)
                            row_values.append(str(cell.value) if cell.value is not None else '')
                        rows.append('\t'.join(row_values))
                    content_parts.append(f"Sheet: {sheet_name}\n" + '\n'.join(rows))
            
            text = "\n".join(content_parts)
        except Exception as e:
            return {"error": f"Error reading Excel: {str(e)}"}
    elif file_name.endswith('.pdf'):
        file_format = 'pdf'
        try:
            # Find the correct password for the PDF (but don't modify the file)
            password = find_pdf_password(file_path, password_list=password_list)
            if password is None:
                return {"error": "PDF is password protected and could not be decrypted"}
            # Extract text using pdfplumber with the found password
            text = extract_pdf_text(file_path, password if password != "" else None)
        except Exception as e:
            return {"error": f"Error reading PDF: {str(e)}"}
    else:
        return {"error": "Unsupported File Type"}

    if not text:
        return {"error": "Could not extract any text from the file."}

    text_lower = text.lower()
    
    result = {
        "bank": "unknown",
        "type": "unknown",
        "variant": None,
        "format": file_format,
        "text": text,
    }

    # Bank Identification
    if "c6 bank" in text_lower and re.search(r"saldo do dia.*€", text_lower):
        result["bank"] = "c6"
        result["variant"] = "global_eur"
    elif "c6 bank" in text_lower and re.search(r"saldo do dia.*us\$", text_lower):
        result["bank"] = "c6"
        result["variant"] = "global_usd"
    elif "c6 bank" in text_lower:
        result["bank"] = "c6"
    elif "itau" in text_lower or "itaú" in text_lower:
        result["bank"] = "itau"
    elif "btg pactual" in text_lower:
        result["bank"] = "btg"
    elif "cartão xp" in text_lower:
        result["bank"] = "xp"
    elif "portoseguro.com.br" in text_lower:
        result["bank"] = "porto"
    
    logger.debug(f"Identified bank: {result['bank']}")

    # Type and Variant Identification
    is_cc = any(term in text_lower for term in ["fatura", "vencimento", "limite de crédito", "cartão"])
    is_account = any(term in text_lower for term in ["agência","saldo anterior", "conta corrente", "extrato de conta"])
    
    logger.debug(f"is_cc: {is_cc}, is_account: {is_account}")

    # Disambiguation logic for Itau Excel files
    if result["bank"] == "itau" and file_format == "excel":
        if is_cc and is_account:
            # For Itau Excel, if both CC and Account keywords are present,
            # prioritize Credit Card if specific CC indicators are strong.
            # The presence of "fatura" and the specific transaction header "data\tlançamento\tvalor"
            # (or similar pattern) is a strong indicator for CC.
            # Note: The extracted text from the Excel file will have tab-separated values.
            if "venc. da fatura" in text_lower or "pagamento efetuado" in text_lower:
                result["type"] = "credit_card"
                logger.debug("Disambiguated Itau Excel as credit_card due to CC-specific header.")
            else:
                # If not the specific CC header, default to bank_account if 'is_account' is true
                result["type"] = "bank_account"
                logger.debug("Disambiguated Itau Excel as bank_account.")
        elif is_cc:
            result["type"] = "credit_card"
        elif is_account:
            result["type"] = "bank_account"
        else:
            result["type"] = "unknown" # Fallback if neither is clearly identified

    else: # For other banks or PDF files, use existing logic
        if is_cc:
            result["type"] = "credit_card"
            logger.debug("Identified as credit card statement.")
        elif is_account:
            result["type"] = "bank_account"
            logger.debug("Identified as bank account statement.")
        else:
            result["type"] = "unknown"

    logger.debug(f"Identification result: {json.dumps(result, indent=4)}")
    return result
