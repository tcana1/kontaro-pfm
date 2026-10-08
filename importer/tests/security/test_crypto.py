import pytest
from cryptography.fernet import Fernet

TEST_KEY = Fernet.generate_key().decode()


@pytest.fixture(autouse=True)
def set_secrets_enc_key(monkeypatch):
    monkeypatch.setenv("SECRETS_ENC_KEY", TEST_KEY)
    # Reload module so it picks up the patched env var
    import importlib

    import src.security.crypto as crypto_mod
    importlib.reload(crypto_mod)
    yield


def test_encrypt_decrypt_roundtrip():
    import importlib

    import src.security.crypto as crypto_mod
    importlib.reload(crypto_mod)

    plaintext = "super-secret-password"
    stored = crypto_mod.encrypt(plaintext)
    assert stored.startswith("v1:")
    assert crypto_mod.decrypt(stored) == plaintext


def test_encrypt_produces_different_ciphertext():
    import importlib

    import src.security.crypto as crypto_mod
    importlib.reload(crypto_mod)

    plaintext = "same-value"
    assert crypto_mod.encrypt(plaintext) != crypto_mod.encrypt(plaintext)


def test_decrypt_unknown_prefix_raises():
    import importlib

    import src.security.crypto as crypto_mod
    importlib.reload(crypto_mod)

    with pytest.raises(ValueError, match="Unknown encryption scheme prefix"):
        crypto_mod.decrypt("v2:someciphertext")


def test_missing_key_raises_on_import(monkeypatch):
    monkeypatch.delenv("SECRETS_ENC_KEY", raising=False)
    import importlib

    import src.security.crypto as crypto_mod
    with pytest.raises(RuntimeError, match="SECRETS_ENC_KEY"):
        importlib.reload(crypto_mod)


def test_decrypt_tampered_ciphertext_raises():
    import importlib

    import src.security.crypto as crypto_mod
    importlib.reload(crypto_mod)

    stored = crypto_mod.encrypt("sensitive-value")
    body = stored[3:]
    # Flip one character in the ciphertext body (keep the "v1:" prefix)
    tampered = "v1:" + body[:-1] + ("A" if body[-1] != "A" else "B")

    with pytest.raises(ValueError, match="Cannot decrypt"):
        crypto_mod.decrypt(tampered)
