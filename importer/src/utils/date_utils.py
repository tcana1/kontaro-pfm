import logging
from datetime import date, datetime
from typing import Optional

from dateutil.relativedelta import relativedelta

logger = logging.getLogger(__name__)

def determine_transaction_year(date_str, reference_date: Optional[date] = None):
    """Determine the correct year for a transaction relative to a reference date.

    If the transaction month is later than the reference month, it likely occurred in the
    prior year. Pass reference_date (e.g. the statement end date) for idempotent behaviour;
    omitting it falls back to today, which breaks reprocessing across year boundaries.
    """
    ref = reference_date if reference_date is not None else datetime.now().date()
    current_month = ref.month
    current_year = ref.year
    transaction_month = int(date_str.split('/')[1])
    if transaction_month > current_month:
        return current_year - 1
    return current_year

def convert_to_excel_date(date_str):
    logger.debug(f"Converting date: {date_str}")
    parts = date_str.split('/')
    if len(parts) == 2:
        day, month = map(int, parts)
        year = determine_transaction_year(date_str)
        if year is None or year < 1900:
            current_year = datetime.now().year
            logger.warning(f"Invalid year {year} detected, defaulting to current year {current_year}")
            year = current_year
    elif len(parts) == 3:
        day, month, year_str = parts
        day, month = int(day), int(month)
        year = int(year_str)
        if len(year_str) == 2:
            prefix = 20 if year < 50 else 19
            year = prefix * 100 + year
            logger.debug(f"Converted 2-digit year {year_str} to {year}")
    else:
        raise ValueError(f"Invalid date format: {date_str}. Expected DD/MM or DD/MM/YYYY")
    date_obj = datetime(year, month, day)
    excel_base = datetime(1900, 1, 1)
    delta = date_obj - excel_base
    excel_date = delta.days + 2  # +2 because Excel incorrectly considers 1900 as a leap year
    logger.debug(f"Converted to Excel date: {excel_date}")
    return excel_date

def get_previous_first_of_month_date(date_str, fmt="%d/%m/%Y"):
    """Given a date string, return the first day of the previous month as a string in the same format."""
    date_obj = datetime.strptime(date_str, fmt).date()
    prev_month_date = (date_obj.replace(day=1) - relativedelta(months=1)).strftime(fmt)
    return prev_month_date
