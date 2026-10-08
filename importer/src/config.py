MAX_FILE_SIZE_MB = 3
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
PROCESSING_TIMEOUT_SECONDS = 180  # 3 minutes

ALLOWED_FILE_TYPES = [
    "application/pdf",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]
ALLOWED_FILE_EXTENSIONS = [".pdf", ".xls", ".xlsx"]

# Magic bytes per extension — validated after reading, before processing.
MAGIC_BYTES: dict[str, bytes] = {
    ".pdf":  b"%PDF",
    ".xls":  b"\xD0\xCF\x11\xE0",   # OLE2 compound document
    ".xlsx": b"PK\x03\x04",          # ZIP (OOXML)
}
