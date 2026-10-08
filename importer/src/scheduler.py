"""In-process scheduler for the daily Pluggy sync.

Runs inside the importer's FastAPI process (see app.py lifespan) instead of
requiring an external cron/systemd timer. Controlled by SYNC_TIMES — a
comma-separated list of up to 3 "HH:MM" slots (24h clock, server-local time).
Unset or empty disables the scheduler; the CLI (`python -m
src.sources.pluggy.sync`) and the manual "Sync now" button remain available
either way.
"""

import asyncio
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

MAX_SLOTS = 3


def parse_sync_times(raw: str) -> list[tuple[int, int]]:
    """Parse a "HH:MM,HH:MM" string into sorted, de-duplicated (hour, minute) tuples.

    Raises ValueError on malformed input or more than MAX_SLOTS entries.
    """
    slots: set[tuple[int, int]] = set()
    for chunk in raw.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        try:
            hour_str, minute_str = chunk.split(":")
            hour, minute = int(hour_str), int(minute_str)
        except ValueError:
            raise ValueError(f"Invalid SYNC_TIMES entry {chunk!r} — expected HH:MM") from None
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError(f"Invalid SYNC_TIMES entry {chunk!r} — hour/minute out of range")
        slots.add((hour, minute))

    if len(slots) > MAX_SLOTS:
        raise ValueError(f"SYNC_TIMES supports at most {MAX_SLOTS} slots, got {len(slots)}")

    return sorted(slots)


def _next_run(now: datetime, slots: list[tuple[int, int]]) -> datetime:
    candidates = [now.replace(hour=h, minute=m, second=0, microsecond=0) for h, m in slots]
    candidates = [c if c > now else c + timedelta(days=1) for c in candidates]
    return min(candidates)


async def run_scheduler(sync_times: str) -> None:
    """Sleep until each configured slot, then run the daily sync in-process.

    Intended to be launched as a background asyncio task; runs until cancelled.
    """
    try:
        slots = parse_sync_times(sync_times)
    except ValueError as exc:
        logger.error("Sync scheduler disabled — %s", exc)
        return

    if not slots:
        logger.info("SYNC_TIMES not set — automatic sync scheduler disabled")
        return

    logger.info("Sync scheduler enabled — daily at %s", ", ".join(f"{h:02d}:{m:02d}" for h, m in slots))

    from src.sources.pluggy.sync import run_sync

    while True:
        now = datetime.now()
        target = _next_run(now, slots)
        await asyncio.sleep((target - now).total_seconds())
        logger.info("Running scheduled Pluggy sync")
        try:
            await asyncio.get_event_loop().run_in_executor(None, run_sync, "daily", False)
        except Exception:
            logger.exception("Scheduled Pluggy sync failed")
