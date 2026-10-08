class EmptyStatementError(Exception):
    """Parser ran successfully but found no transactions (legitimate empty period)."""

class UnsupportedLayoutError(Exception):
    """Parser detected the document layout is not supported."""

class ParserError(Exception):
    """Parser raised an unexpected exception during extraction."""


class ErrorCode:
    PARSER_FAILURE     = "E_PARSER_FAILURE"
    UNSUPPORTED_LAYOUT = "E_UNSUPPORTED_LAYOUT"
    PDF_PASSWORD       = "E_PDF_PASSWORD"
    ROW_INSERT_FAILED  = "E_ROW_INSERT_FAILED"
    INTERNAL           = "E_INTERNAL"
    MORE_ERRORS        = "E_MORE_ERRORS"

MAX_ERRORS_PER_BATCH = 100
