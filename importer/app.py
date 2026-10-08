# app.py
import asyncio
import logging
import os
from contextlib import asynccontextmanager

import defusedxml

defusedxml.defuse_stdlib()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse

from src.routes import connectors, file_settings, statements, transactions
from src.scheduler import run_scheduler
from src.security import (
    crypto,  # noqa: F401 — imported for boot-time SECRETS_ENC_KEY validation
)
from src.utils.logger_config import setup_logging

setup_logging()
logger = logging.getLogger(__name__)

# When running behind nginx at /api/, ROOT_PATH="/api" so the Swagger UI fetches
# the spec from /api/openapi.json (which nginx proxies back to us at /openapi.json).
_root_path = os.getenv("ROOT_PATH", "").rstrip("/")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(run_scheduler(os.getenv("SYNC_TIMES", "")))
    yield
    task.cancel()


app = FastAPI(
    title="Statement Importer API",
    description="API for processing financial statements and categorizing transactions.",
    version="1.0.0",
    docs_url=None,  # custom /docs below with explicit openapi URL
    lifespan=lifespan,
)

# CORS — origins configurable via env (comma-separated); never use wildcard with credentials.
_cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:8181").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
)

app.include_router(statements.router)
app.include_router(transactions.router)
app.include_router(file_settings.router)
app.include_router(connectors.router)


@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


@app.get("/docs", include_in_schema=False)
async def swagger_ui() -> HTMLResponse:
    return get_swagger_ui_html(
        openapi_url=f"{_root_path}/openapi.json",
        title=f"{app.title} — Swagger UI",
    )


# To run this app:
# uvicorn app:app --reload --port 8000
