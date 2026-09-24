"""Secure credential storage for NexusAI.

Primary storage: encrypted file in the user's home directory.
Secondary storage (best-effort): OS keyring (Windows Credential Manager,
macOS Keychain, Linux Secret Service).

The plaintext key is NEVER written to disk. The encrypted file uses a
machine-derived key (best-effort obfuscation, not crypto-grade — but
much better than plaintext JSON).
"""
import os
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

# Encrypted file — ALWAYS written, so we have a reliable fallback if keyring fails
_FALLBACK_FILE = os.path.join(os.path.expanduser("~"), ".nexus_credentials.enc")
_MACHINE_ID = platform.node() + "-" + platform.machine()


def _derive_key() -> bytes:
    """Derive a 32-byte key from machine identity (best-effort)."""
    return hashlib.sha256(_MACHINE_ID.encode("utf-8")).digest()


def _xor_cipher(data: bytes, key: bytes) -> bytes:
    """XOR cipher for obfuscation (keyring is preferred when available)."""
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))


def store_api_key(key: Optional[str]) -> bool:
    """Persist the API key. Always writes to the encrypted file.
    Also tries the OS keyring as a secondary store (best-effort).
    Returns True if the key was successfully stored AND verified retrievable.
    """
    if not key:
        return clear_api_key()

    # 1. ALWAYS write to the encrypted file (primary, reliable)
    file_ok = False
    try:
        encoded = _xor_cipher(key.encode("utf-8"), _derive_key())
        with open(_FALLBACK_FILE, "wb") as f:
            f.write(base64.b64encode(encoded))
        try:
            os.chmod(_FALLBACK_FILE, 0o600)
        except Exception:
            pass  # chmod may fail on Windows, ignore
        file_ok = True
    except Exception as e:
        print(f"[nexus_credentials] Failed to write credential file: {e}")

    # 2. Also try keyring (best-effort, don't fail if it doesn't work)
    if _HAS_KEYRING:
        try:
            keyring.set_password(SERVICE_NAME, KEY_USER, key)
        except Exception as e:
            print(f"[nexus_credentials] Keyring storage failed (non-fatal): {e}")

    # 3. Verify we can read it back
    loaded = load_api_key()
    if loaded != key:
        print(f"[nexus_credentials] WARNING: verification failed — stored key doesn't match input")
        return False
    return True


def load_api_key() -> Optional[str]:
    """Retrieve the API key. Tries keyring first, then the encrypted file."""
    # Try keyring first
    if _HAS_KEYRING:
        try:
            v = keyring.get_password(SERVICE_NAME, KEY_USER)
            if v:
                return v
        except Exception:
            pass
    # Fall back to encrypted file
    try:
        if os.path.exists(_FALLBACK_FILE):
            with open(_FALLBACK_FILE, "rb") as f:
                encoded = base64.b64decode(f.read())
            return _xor_cipher(encoded, _derive_key()).decode("utf-8")
    except Exception as e:
        print(f"[nexus_credentials] Failed to read credential file: {e}")
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


def storage_info() -> dict:
    """Return diagnostic info about credential storage (for debugging)."""
    info = {
        "keyring_available": _HAS_KEYRING,
        "file_path": _FALLBACK_FILE,
        "file_exists": os.path.exists(_FALLBACK_FILE),
        "has_key": has_api_key(),
        "machine_id": _MACHINE_ID,
    }
    if _HAS_KEYRING:
        try:
            v = keyring.get_password(SERVICE_NAME, KEY_USER)
            info["keyring_has_key"] = v is not None
        except Exception as e:
            info["keyring_has_key"] = False
            info["keyring_error"] = str(e)
    else:
        info["keyring_has_key"] = False
    return info
