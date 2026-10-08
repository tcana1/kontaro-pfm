import os

from cryptography.fernet import Fernet, InvalidToken

_key = os.getenv("SECRETS_ENC_KEY")
if not _key:
    raise RuntimeError(
        "SECRETS_ENC_KEY is not set. The importer cannot start without it.\n"
        "Generate one with:\n"
        "  python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"\n"
        "Store it securely — losing this key makes all encrypted secrets irrecoverable."
    )

_fernet = Fernet(_key.encode())


def encrypt(plaintext: str) -> str:
    return "v1:" + _fernet.encrypt(plaintext.encode()).decode()


def decrypt(stored: str) -> str:
    if stored.startswith("v1:"):
        try:
            return _fernet.decrypt(stored[3:].encode()).decode()
        except InvalidToken:
            raise ValueError("Cannot decrypt secret: SECRETS_ENC_KEY may have been rotated or the value is corrupt")
    raise ValueError(f"Unknown encryption scheme prefix: {stored[:3]!r}")
