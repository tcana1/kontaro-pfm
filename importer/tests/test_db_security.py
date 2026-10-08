"""
DB security property tests — validate the schema-level security guarantees.

These tests query pg_catalog directly to assert that security properties are
set correctly (security_invoker on views, RLS policies, privilege grants, etc.).
They complement application-level tests by catching regressions in the DB layer.

Requires a live DATABASE_URL. Skipped automatically when it is not set.
"""

import os

import psycopg2
import pytest

DATABASE_URL = os.getenv("DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL,
    reason="DATABASE_URL not set — skipping DB security checks",
)


@pytest.fixture(scope="module")
def db():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    yield conn
    conn.close()


def q(db, sql, params=None):
    with db.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()[0]


# =============================================================================
# v_transaction_splits
# =============================================================================

class TestViewSecurityInvoker:
    def test_security_invoker_on(self, db):
        """View must run as the calling user (not the owner) so RLS applies."""
        result = q(db, """
            SELECT 'security_invoker=on' = ANY(reloptions)
            FROM pg_class
            WHERE relname = 'v_transaction_splits'
              AND relnamespace = 'public'::regnamespace
        """)
        assert result is True, "v_transaction_splits is missing security_invoker=on — RLS is bypassed"

    def test_view_exists(self, db):
        result = q(db, """
            SELECT EXISTS (
                SELECT 1 FROM pg_class
                WHERE relname = 'v_transaction_splits'
                  AND relkind = 'v'
                  AND relnamespace = 'public'::regnamespace
            )
        """)
        assert result is True


# =============================================================================
# python_app_user
# =============================================================================

class TestPythonAppUser:
    def test_nologin(self, db):
        """Role ships with placeholder password — must not be allowed to connect."""
        result = q(db, "SELECT rolcanlogin FROM pg_roles WHERE rolname = 'python_app_user'")
        assert result is False, "python_app_user still has LOGIN — disable it with NOLOGIN"


# =============================================================================
# transactions RLS — IDOR fix
# =============================================================================

class TestTransactionsPolicy:
    def test_rls_enabled(self, db):
        result = q(db, """
            SELECT relrowsecurity FROM pg_class
            WHERE relname = 'transactions'
              AND relnamespace = 'public'::regnamespace
        """)
        assert result is True, "RLS is not enabled on transactions table"

    def test_policy_has_with_check(self, db):
        """WITH CHECK must validate account_id/to_account_id ownership (IDOR fix)."""
        result = q(db, """
            SELECT polwithcheck IS NOT NULL
            FROM pg_policy
            WHERE polrelid = 'public.transactions'::regclass
              AND polname = 'Only owner can access'
        """)
        assert result is True, (
            "transactions policy is missing WITH CHECK — "
            "account_id ownership is not validated on INSERT/UPDATE"
        )

    def test_policy_with_check_references_accounts(self, db):
        """WITH CHECK expression must reference the accounts table."""
        result = q(db, """
            SELECT pg_get_expr(polwithcheck, polrelid)
            FROM pg_policy
            WHERE polrelid = 'public.transactions'::regclass
              AND polname = 'Only owner can access'
        """)
        assert result is not None
        assert 'accounts' in result, (
            "WITH CHECK on transactions does not reference accounts table — "
            "account_id ownership may not be validated"
        )


# =============================================================================
# Matcher RPCs — anon access
# =============================================================================

class TestMatcherRpcPrivileges:
    def test_anon_cannot_execute_find_and_mark_matches(self, db):
        result = q(db, """
            SELECT has_function_privilege(
                'anon',
                'public.find_and_mark_matches(integer, uuid)',
                'EXECUTE'
            )
        """)
        assert result is False, (
            "anon can EXECUTE find_and_mark_matches — "
            "auth.uid() IS NOT NULL guard is no-op for anon"
        )

    def test_anon_cannot_execute_find_matches_for_transaction(self, db):
        result = q(db, """
            SELECT has_function_privilege(
                'anon',
                'public.find_matches_for_transaction(integer)',
                'EXECUTE'
            )
        """)
        assert result is False, (
            "anon can EXECUTE find_matches_for_transaction — REVOKE FROM anon is missing"
        )

    def test_authenticated_can_execute_find_and_mark_matches(self, db):
        """Sanity check — authenticated users still need access."""
        result = q(db, """
            SELECT has_function_privilege(
                'authenticated',
                'public.find_and_mark_matches(integer, uuid)',
                'EXECUTE'
            )
        """)
        assert result is True

    def test_both_functions_are_security_definer(self, db):
        result = q(db, """
            SELECT COUNT(*) FROM pg_proc
            WHERE proname IN ('find_and_mark_matches', 'find_matches_for_transaction')
              AND pronamespace = 'public'::regnamespace
              AND prosecdef = true
        """)
        assert result == 2, "Expected both matcher RPCs to be SECURITY DEFINER"


# =============================================================================
# user_api_keys — key_plaintext_once exposure
# =============================================================================

class TestApiKeyPrivileges:
    def test_authenticated_cannot_select_key_plaintext_once(self, db):
        """Column-level REVOKE alone doesn't override table-level SELECT grant."""
        result = q(db, """
            SELECT has_column_privilege(
                'authenticated',
                'public.user_api_keys',
                'key_plaintext_once',
                'SELECT'
            )
        """)
        assert result is False, (
            "authenticated can SELECT key_plaintext_once directly — "
            "table-level SELECT grant was not replaced with column-specific grants"
        )

    def test_authenticated_cannot_select_key_hash(self, db):
        result = q(db, """
            SELECT has_column_privilege(
                'authenticated',
                'public.user_api_keys',
                'key_hash',
                'SELECT'
            )
        """)
        assert result is False, "authenticated can SELECT key_hash — server-side secret"

    def test_authenticated_can_select_key_preview(self, db):
        """Sanity check — key_preview is the user-visible portion and must be readable."""
        result = q(db, """
            SELECT has_column_privilege(
                'authenticated',
                'public.user_api_keys',
                'key_preview',
                'SELECT'
            )
        """)
        assert result is True

    def test_anon_cannot_select_user_api_keys(self, db):
        result = q(db, """
            SELECT has_table_privilege('anon', 'public.user_api_keys', 'SELECT')
        """)
        assert result is False, "anon has table-level SELECT on user_api_keys"
