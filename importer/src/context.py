from contextvars import ContextVar
from typing import Optional

_user_id_var: ContextVar[Optional[str]] = ContextVar('user_id', default=None)

def get_user_id() -> str:
    user_id = _user_id_var.get()
    if not user_id:
        raise ValueError("user_id not set in request context")
    return user_id

def set_user_id(user_id: str) -> None:
    _user_id_var.set(user_id)
