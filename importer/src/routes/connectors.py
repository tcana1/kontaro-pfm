import asyncio
import logging
from datetime import date
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, BackgroundTasks, HTTPException, Security
from pydantic import BaseModel, field_validator

from src import context
from src.auth import get_current_user
from src.database import db_handler
from src.security import crypto

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/connectors")


def _validate_timezone(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    try:
        ZoneInfo(v)
    except (ZoneInfoNotFoundError, ValueError):
        raise ValueError(f"Unknown IANA timezone: {v!r}") from None
    return v


class ConnectorCreate(BaseModel):
    provider: str = "pluggy"
    client_id: str
    client_secret: str
    pluggy_item_id: str
    schedule: str = "daily"
    import_from: Optional[date] = None
    timezone: str = "America/Sao_Paulo"

    _validate_timezone = field_validator("timezone")(_validate_timezone)


class ConnectorUpdate(BaseModel):
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    pluggy_item_id: Optional[str] = None
    schedule: Optional[str] = None
    enabled: Optional[bool] = None
    import_from: Optional[date] = None
    timezone: Optional[str] = None

    _validate_timezone = field_validator("timezone")(_validate_timezone)


class SyncRequest(BaseModel):
    date_from: Optional[date] = None

    @field_validator("date_from")
    @classmethod
    def _not_future(cls, v: Optional[date]) -> Optional[date]:
        if v is not None and v > date.today():
            raise ValueError("date_from cannot be in the future")
        return v


@router.post("", status_code=201)
async def create_connector(body: ConnectorCreate, _auth: str = Security(get_current_user)):
    client_secret_enc = crypto.encrypt(body.client_secret)
    connector_id = db_handler.create_connector(
        provider=body.provider,
        client_id=body.client_id,
        client_secret_enc=client_secret_enc,
        schedule=body.schedule,
        import_from=body.import_from,
        pluggy_item_id=body.pluggy_item_id,
        timezone=body.timezone,
    )
    return {"id": connector_id, "provider": body.provider, "client_id": body.client_id,
            "has_secret": True, "schedule": body.schedule, "enabled": False,
            "import_from": body.import_from, "pluggy_item_id": body.pluggy_item_id,
            "timezone": body.timezone}


@router.get("")
async def list_connectors(_auth: str = Security(get_current_user)):
    rows = db_handler.list_connectors()
    return [{"id": r["id"], "provider": r["provider"], "client_id": r["client_id"],
             "has_secret": True, "schedule": r["schedule"], "enabled": r["enabled"],
             "import_from": r["import_from"], "pluggy_item_id": r["pluggy_item_id"],
             "timezone": r["timezone"], "created_at": r["created_at"]}
            for r in rows]


@router.get("/{connector_id}/pluggy-accounts")
async def get_connector_pluggy_accounts(connector_id: str, _auth: str = Security(get_current_user)):
    from src.security.crypto import decrypt
    from src.sources.pluggy.provider import _get_api_key, _pluggy_get

    connector = db_handler.get_connector(connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    if not connector.get("pluggy_item_id"):
        raise HTTPException(status_code=422, detail="Connector has no pluggy_item_id configured")
    try:
        client_secret = decrypt(connector["client_secret_enc"])
        api_key = _get_api_key(connector["client_id"], client_secret)
        data = _pluggy_get(f"/accounts?itemId={connector['pluggy_item_id']}", api_key)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Pluggy API error: {e}")
    accounts = data.get("results", [])
    result = []
    for a in accounts:
        credit = a.get("creditData") or {}
        result.append({
            "id": a["id"],
            "name": a["name"],
            "type": a.get("type", ""),
            "subtype": a.get("subtype", ""),
            "number": a.get("number"),
            "brand": credit.get("brand"),
            "level": credit.get("level"),
        })
    return result


@router.patch("/{connector_id}")
async def update_connector(connector_id: str, body: ConnectorUpdate, _auth: str = Security(get_current_user)):
    fields = body.model_dump(exclude_none=True)
    if "client_secret" in fields:
        fields["client_secret_enc"] = crypto.encrypt(fields.pop("client_secret"))
    updated = db_handler.update_connector(connector_id, **fields)
    if not updated:
        raise HTTPException(status_code=404, detail="Connector not found")
    return {"updated": True}


@router.delete("/{connector_id}", status_code=204)
async def delete_connector(connector_id: str, _auth: str = Security(get_current_user)):
    deleted = db_handler.delete_connector(connector_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Connector not found")


@router.post("/{connector_id}/sync", status_code=202)
async def trigger_connector_sync(
    connector_id: str,
    background_tasks: BackgroundTasks,
    body: Optional[SyncRequest] = None,
    _auth: str = Security(get_current_user),
):
    from src.security.crypto import decrypt
    from src.sources.pluggy.provider import PluggyProvider
    from src.sources.pluggy.sync import sync_account

    connector = db_handler.get_connector(connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    accounts = db_handler.get_connector_accounts(connector_id)
    if not accounts:
        raise HTTPException(status_code=422, detail="Connector has no account mappings")

    client_secret = decrypt(connector["client_secret_enc"])
    provider = PluggyProvider(
        client_id=connector["client_id"],
        client_secret=client_secret,
        tz=connector["timezone"],
    )
    import_from = connector.get("import_from")
    date_from_override = body.date_from if body else None
    user_id = context.get_user_id()

    def _run():
        context.set_user_id(user_id)
        for account in accounts:
            try:
                sync_account(
                    account, provider, import_from, mode="daily", dry_run=False,
                    date_from_override=date_from_override,
                )
            except Exception as exc:
                logger.error("Error syncing account %s: %s", account["name"], exc)
                try:
                    db_handler.store_connector_sync_state(account["id"], str(exc))
                except Exception as exc2:
                    logger.warning("Error storing sync state for account %s: %s", account["name"], exc2)

    async def _bg():
        await asyncio.get_event_loop().run_in_executor(None, _run)

    background_tasks.add_task(_bg)
    return {"status": "sync_started", "connector_id": connector_id}
