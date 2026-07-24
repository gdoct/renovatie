"""Password hashing and JWT issuing/verification.

The signing secret comes from the JWT_SECRET environment variable when set;
otherwise it is generated once and persisted next to the database, so tokens
survive restarts without any configuration (the Docker volume keeps both).
"""

import os
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .database import DATABASE_PATH

ALGORITHM = "HS256"
TOKEN_TTL = timedelta(days=30)

# Unambiguous characters (no 0/O, 1/l/I) so generated passwords survive being
# read aloud or copied from a screenshot.
PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789"
PASSWORD_LENGTH = 12


def _load_secret() -> str:
    env_secret = os.environ.get("JWT_SECRET")
    if env_secret:
        return env_secret
    secret_path = DATABASE_PATH.parent / ".jwt_secret"
    if secret_path.exists():
        return secret_path.read_text().strip()
    secret = secrets.token_hex(32)
    secret_path.write_text(secret)
    secret_path.chmod(0o600)
    return secret


SECRET = _load_secret()


def generate_password() -> str:
    return "".join(secrets.choice(PASSWORD_ALPHABET) for _ in range(PASSWORD_LENGTH))


def hash_password(password: str) -> str:
    # bcrypt only looks at the first 72 bytes; truncate explicitly because
    # newer bcrypt versions raise on longer input.
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    return bcrypt.checkpw(password.encode()[:72], password_hash.encode())


def create_access_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + TOKEN_TTL,
    }
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)


def decode_access_token(token: str) -> int | None:
    """Return the user id in the token, or None if invalid/expired."""
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
        return int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        return None
