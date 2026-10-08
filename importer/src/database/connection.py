"""Postgres connection handling shared by every database module."""
import logging
import os
from contextlib import contextmanager, suppress

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

load_dotenv()


def get_db_connection():
    """Establishes and returns a database connection with timeout settings."""
    try:
        conn = psycopg2.connect(
            os.getenv("DATABASE_URL"),
            connect_timeout=10,  # 10 second connection timeout
            options="-c statement_timeout=30000 -c idle_in_transaction_session_timeout=30000"  # 30 second read/write timeouts
        )
        return conn
    except psycopg2.OperationalError as e:
        logger.error(f"Error connecting to the database: {e}")
        raise


@contextmanager
def db_connection():
    """Yields a raw connection, closing it on the way out.

    For code that drives its own commit/rollback across several statements —
    the batch insert path. Everything else wants db_cursor().
    """
    conn = get_db_connection()
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def db_cursor(commit: bool = False, dict_rows: bool = False):
    """Yields a cursor on a fresh connection, closing it on the way out.

    Commits after the block when `commit` is set; rolls back and re-raises if the
    block raises. `dict_rows` switches to RealDictCursor.

    Together with db_connection() this module is the only place that calls
    get_db_connection(), so tests patch `src.database.connection.get_db_connection`
    to cover every database module.
    """
    conn = get_db_connection()
    factory = psycopg2.extras.RealDictCursor if dict_rows else None
    try:
        with conn.cursor(cursor_factory=factory) as cur:
            yield cur
            if commit:
                conn.commit()
    except Exception:
        # A broken connection makes rollback() raise too; suppress it so the
        # caller sees the original failure instead of the cleanup error.
        with suppress(Exception):
            conn.rollback()
        raise
    finally:
        conn.close()
