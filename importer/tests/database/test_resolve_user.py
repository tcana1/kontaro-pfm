"""Unit tests for resolve_user_id_from_key_hash (API-key → user resolution).

Used by the Pluggy sync and the API-key auth in app.py — auth-critical, no
test coverage until now. Mocks the cursor; also asserts the SQL filters out
revoked keys (that is the security property, not just the mock's return value).
"""

from unittest.mock import MagicMock, patch

from src.database.db_handler import resolve_user_id_from_key_hash


def _mock_cursor(fetchone_value):
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_cur.fetchone.return_value = fetchone_value
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur
    return mock_conn, mock_cur


class TestResolveUserId:
    def test_existing_active_key_returns_user_id(self):
        mock_conn, mock_cur = _mock_cursor(("user-uuid-123",))
        with patch("src.database.connection.get_db_connection", return_value=mock_conn):
            user_id = resolve_user_id_from_key_hash("some-hash")

        assert user_id == "user-uuid-123"

    def test_unknown_hash_returns_none(self):
        mock_conn, _ = _mock_cursor(None)
        with patch("src.database.connection.get_db_connection", return_value=mock_conn):
            assert resolve_user_id_from_key_hash("unknown-hash") is None

    def test_revoked_key_returns_none(self):
        # A revoked key must never resolve — assert the query itself filters
        # revoked_at IS NULL (security property), and that None → no user_id.
        mock_conn, mock_cur = _mock_cursor(None)
        with patch("src.database.connection.get_db_connection", return_value=mock_conn):
            assert resolve_user_id_from_key_hash("revoked-hash") is None

        executed_sql = mock_cur.execute.call_args[0][0]
        assert "revoked_at IS NULL" in executed_sql