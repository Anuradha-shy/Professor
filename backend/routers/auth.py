"""PIN-gate auth: one shared passcode, httpOnly JWT session cookie."""

import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel

from lib.db import db
from models.tracker import MeOut, PinChangeIn, UnlockIn

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_NAME = "tracker_session"
ALGORITHM = "HS256"


def _secret() -> str:
    return os.environ.get("APP_SECRET", "ashoka-academy-dev-secret")


def _pin_hash(pin: str) -> str:
    return hashlib.sha256(f"{_secret()}:{pin}".encode()).hexdigest()


async def _active_pin_hash() -> str:
    """Verification hash of the active PIN: a stored override, else the env default."""
    meta = await db.app_meta.find_one({"key": "pin"})
    if meta and meta.get("hash"):
        return meta["hash"]
    return _pin_hash(os.environ.get("APP_PIN", "1947"))


def create_token() -> str:
    payload = {"exp": datetime.now(timezone.utc) + timedelta(days=30), "scope": "tracker"}
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


async def require_auth(tracker_session: str | None = Cookie(default=None, alias=COOKIE_NAME)) -> None:
    if not tracker_session:
        raise HTTPException(status_code=401, detail="Vault is locked")
    try:
        jwt.decode(tracker_session, _secret(), algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Vault is locked")


@router.post("/unlock", response_model=MeOut)
async def unlock(input: UnlockIn, response: Response) -> MeOut:
    expected = await _active_pin_hash()
    if not hmac.compare_digest(_pin_hash(input.pin.strip()), expected):
        raise HTTPException(status_code=401, detail="Incorrect passcode")
    response.set_cookie(
        COOKIE_NAME,
        create_token(),
        httponly=True,
        samesite="lax",
        max_age=30 * 24 * 3600,
        path="/",
    )
    return MeOut(authenticated=True)


@router.get("/me", response_model=MeOut)
async def me(_: None = Depends(require_auth)) -> MeOut:
    return MeOut(authenticated=True)


@router.post("/logout")
async def logout(response: Response) -> dict:
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.post("/pin", response_model=MeOut)
async def change_pin(input: PinChangeIn, _: None = Depends(require_auth)) -> MeOut:
    expected = await _active_pin_hash()
    if not hmac.compare_digest(_pin_hash(input.current_pin.strip()), expected):
        raise HTTPException(status_code=401, detail="Current passcode is incorrect")
    new_pin = input.new_pin.strip()
    if not (new_pin.isdigit() and 4 <= len(new_pin) <= 8):
        raise HTTPException(status_code=422, detail="New passcode must be 4-8 digits")
    await db.app_meta.update_one(
        {"key": "pin"}, {"$set": {"hash": _pin_hash(new_pin)}}, upsert=True
    )
    return MeOut(authenticated=True)
