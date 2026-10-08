import logging
import re
from typing import Optional

from fastapi import APIRouter, HTTPException, Security
from pydantic import BaseModel

from src.auth import get_current_user
from src.database import db_handler

logger = logging.getLogger(__name__)

router = APIRouter()


class ImportRuleCreate(BaseModel):
    account_id: int
    bank: str
    type: str
    text_pattern: Optional[str] = None
    filename_pattern: Optional[str] = None


class PdfPasswordCreate(BaseModel):
    label: str
    password: str  # plaintext; importer encrypts


class OpenExchangeKeyUpdate(BaseModel):
    key: str  # plaintext; importer encrypts


# ── Import rules ──────────────────────────────────────────────────────────────

@router.get("/import-rules")
async def list_import_rules(_auth: str = Security(get_current_user)):
    return db_handler.list_import_rules()


@router.post("/import-rules", status_code=201)
async def create_import_rule(body: ImportRuleCreate, _auth: str = Security(get_current_user)):
    if db_handler.get_account_name_by_id(body.account_id) is None:
        raise HTTPException(status_code=403, detail="Account not found or access denied")
    for field, pattern in [("text_pattern", body.text_pattern), ("filename_pattern", body.filename_pattern)]:
        if pattern:
            try:
                re.compile(pattern)
            except re.error as e:
                raise HTTPException(status_code=422, detail=f"Invalid regex in {field}: {e}")
    rule_id = db_handler.create_import_rule(
        body.account_id, body.bank, body.type,
        body.text_pattern, body.filename_pattern
    )
    return {"id": rule_id}


@router.delete("/import-rules/{rule_id}", status_code=204)
async def delete_import_rule(rule_id: str, _auth: str = Security(get_current_user)):
    if not db_handler.delete_import_rule(rule_id):
        raise HTTPException(status_code=404, detail="Rule not found")


# ── PDF passwords ─────────────────────────────────────────────────────────────

@router.get("/pdf-passwords")
async def list_pdf_passwords(_auth: str = Security(get_current_user)):
    return db_handler.list_pdf_passwords()


@router.post("/pdf-passwords", status_code=201)
async def add_pdf_password(body: PdfPasswordCreate, _auth: str = Security(get_current_user)):
    from src.security.crypto import encrypt
    pw_id = db_handler.add_pdf_password(body.label, encrypt(body.password))
    return {"id": pw_id}


@router.delete("/pdf-passwords/{pw_id}", status_code=204)
async def delete_pdf_password(pw_id: str, _auth: str = Security(get_current_user)):
    if not db_handler.delete_pdf_password(pw_id):
        raise HTTPException(status_code=404, detail="Password not found")


# ── OpenExchange key ──────────────────────────────────────────────────────────

@router.get("/openexchange-key")
async def get_openexchange_key(_auth: str = Security(get_current_user)):
    key = db_handler.get_openexchange_key()
    return {"configured": key is not None}


@router.put("/openexchange-key", status_code=204)
async def set_openexchange_key(body: OpenExchangeKeyUpdate, _auth: str = Security(get_current_user)):
    from src.security.crypto import encrypt
    db_handler.set_openexchange_key(encrypt(body.key))


@router.delete("/openexchange-key", status_code=204)
async def delete_openexchange_key(_auth: str = Security(get_current_user)):
    db_handler.delete_openexchange_key()
