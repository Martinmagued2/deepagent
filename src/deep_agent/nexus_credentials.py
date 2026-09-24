"""Secure credential storage for NexusAI.

Uses OS-level keychain when available (Windows Credential Manager, macOS Keychain,
Linux Secret Service via `keyring`), with an encrypted file fallback for environments
where keyring is unavailable. The plaintext key is NEVER written to disk.
"""
import os
import json
import base64
import hashlib
import platform
from typing import Optional

try:
    import keyring
    _HAS_KEYRING = True
except Exception:
    _HAS_KEYRING = False

SERVICE_NAME = "NexusAIStudio"
KEY_USER = "active_api_key"

# Encrypted fallback (used only if keyring is unavailable)
_FALLBACK_FILE = os.path.join(os.path.expanduser("~"), ".nexus_credentials.enc")
_MACHINE_ID = platform.node() + "-" + platform.machine()


def _derive_key() -> bytes:
    """Derive a 32-byte key from machine identity (best-effort, not crypto-grade)."""
    return hashlib.sha256(_MACHINE_ID.encode("utf-8")).digest()


def _xor_cipher(data: bytes, key: bytes) -> bytes:
    """Simple XOR cipher for obfuscation fallback (keyring is preferred)."""
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))


def store_api_key(key: Optional[str]) -> bool:
    """Persist the API key to OS keyring or encrypted fallback. Empty/None clears it."""
    if not key:
        return clear_api_key()
    if _HAS_KEYRING:
        try:
            keyring.set_password(SERVICE_NAME, KEY_USER, key)
            return True
        except Exception:
            pass
    # Fallback: XOR-obfuscated file (better than plaintext, worse than keyring)
    try:
        encoded = _xor_cipher(key.encode("utf-8"), _derive_key())
        with open(_FALLBACK_FILE, "wb") as f:
            f.write(base64.b64encode(encoded))
        os.chmod(_FALLBACK_FILE, 0o600)
        return True
    except Exception:
        return False


def load_api_key() -> Optional[str]:
    """Retrieve the API key from OS keyring or encrypted fallback. Returns None if not set."""
    if _HAS_KEYRING:
        try:
            v = keyring.get_password(SERVICE_NAME, KEY_USER)
            if v:
                return v
        except Exception:
            pass
    try:
        if os.path.exists(_FALLBACK_FILE):
            with open(_FALLBACK_FILE, "rb") as f:
                encoded = base64.b64decode(f.read())
            return _xor_cipher(encoded, _derive_key()).decode("utf-8")
    except Exception:
        pass
    return None


def clear_api_key() -> bool:
    """Remove the API key from all storage backends."""
    ok = True
    if _HAS_KEYRING:
        try:
            keyring.delete_password(SERVICE_NAME, KEY_USER)
        except Exception:
            pass
    try:
        if os.path.exists(_FALLBACK_FILE):
            os.remove(_FALLBACK_FILE)
    except Exception:
        ok = False
    return ok


def has_api_key() -> bool:
    return load_api_key() is not None
