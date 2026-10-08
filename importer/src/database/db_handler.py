"""Aggregate entry point for the database layer.

The implementation lives in the sibling domain modules (accounts, categories,
transactions, batches, payees, installments, connectors, import_rules,
secrets_store, users) over a shared connection helper. This module re-exports
them so callers can keep using `db_handler.<function>()` for any table.

Prefer importing the specific module in new code — `from src.database import
accounts` — and patch the owning module in tests, not this one.
"""

from src.database.accounts import (
    get_account_id_by_name,
    get_account_id_by_slug,
    get_account_id_by_slug_or_fail,
    get_account_name_by_id,
    get_account_names_by_ids_bulk,
    get_or_create_account,
    get_or_create_accounts_bulk,
)
from src.database.batches import (
    abort_stale_batches,
    create_and_fail_batch,
    create_import_batch,
    finalize_import_batch,
)
from src.database.categories import (
    get_categorization_rules,
    get_category_group_id_by_name,
    get_category_id_by_name,
    get_category_name_by_id,
    get_category_names_by_ids_bulk,
    get_or_create_categories_bulk,
    get_or_create_category,
    get_or_create_category_group,
    get_or_create_category_groups_bulk,
)
from src.database.connection import db_connection, db_cursor, get_db_connection
from src.database.connectors import (
    create_connector,
    delete_connector,
    get_all_enabled_connectors,
    get_connector,
    get_connector_accounts,
    get_connector_sync_state,
    list_connectors,
    store_connector_sync_state,
    update_connector,
)
from src.database.import_rules import (
    create_import_rule,
    delete_import_rule,
    list_import_rules,
    resolve_account_from_rules,
)
from src.database.installments import (
    get_category_for_installment,
    get_installment_categories_batch,
)
from src.database.payees import (
    get_payee_category_distribution,
    get_payee_category_distribution_batch,
)
from src.database.secrets_store import (
    add_pdf_password,
    delete_openexchange_key,
    delete_pdf_password,
    get_openexchange_key,
    get_pdf_passwords_plaintext,
    list_pdf_passwords,
    set_openexchange_key,
)
from src.database.transactions import (
    InsertResult,
    get_existing_statement_identifiers,
    get_existing_transaction_hashes,
    insert_transactions,
    update_transaction_status,
)
from src.database.users import resolve_user_id_from_key_hash

__all__ = [
    "InsertResult",
    "abort_stale_batches",
    "add_pdf_password",
    "create_and_fail_batch",
    "create_connector",
    "create_import_batch",
    "create_import_rule",
    "db_connection",
    "db_cursor",
    "delete_connector",
    "delete_import_rule",
    "delete_openexchange_key",
    "delete_pdf_password",
    "finalize_import_batch",
    "get_account_id_by_name",
    "get_account_id_by_slug",
    "get_account_id_by_slug_or_fail",
    "get_account_name_by_id",
    "get_account_names_by_ids_bulk",
    "get_all_enabled_connectors",
    "get_categorization_rules",
    "get_category_for_installment",
    "get_category_group_id_by_name",
    "get_category_id_by_name",
    "get_category_name_by_id",
    "get_category_names_by_ids_bulk",
    "get_connector",
    "get_connector_accounts",
    "get_connector_sync_state",
    "get_db_connection",
    "get_existing_statement_identifiers",
    "get_existing_transaction_hashes",
    "get_installment_categories_batch",
    "get_openexchange_key",
    "get_or_create_account",
    "get_or_create_accounts_bulk",
    "get_or_create_categories_bulk",
    "get_or_create_category",
    "get_or_create_category_group",
    "get_or_create_category_groups_bulk",
    "get_payee_category_distribution",
    "get_payee_category_distribution_batch",
    "get_pdf_passwords_plaintext",
    "insert_transactions",
    "list_connectors",
    "list_import_rules",
    "list_pdf_passwords",
    "resolve_account_from_rules",
    "resolve_user_id_from_key_hash",
    "set_openexchange_key",
    "store_connector_sync_state",
    "update_connector",
    "update_transaction_status",
]
