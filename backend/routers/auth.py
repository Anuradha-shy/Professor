"""PIN-gate auth: one shared passcode, httpOnly JWT session cookie."""

import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request, Response
from pymongo import ReturnDocument

from lib.db import db
from models.tracker import DeviceOut, DeviceUpdate, MeOut, PinChangeIn, UnlockIn

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_NAME = "tracker_session"
ALGORITHM = "HS256"


def _secret() -> str:
    return os.environ.get("APP_SECRET", "ashoka-academy-dev-secret")


def _allow_any_device() -> bool:
    return os.environ.get("APP_ALLOW_ANY_DEVICE", "1").strip().lower() in {"1", "true", "yes", "on"}


def _default_unlock_value() -> str:
    return os.environ.get("APP_PASSKEY", os.environ.get("APP_PIN", "1947")).strip()


def _pin_hash(pin: str) -> str:
    return hashlib.sha256(f"{_secret()}:{pin}".encode()).hexdigest()


async def _active_pin_hash() -> str:
    """Verification hash of the active local unlock value: a stored override, else the env default."""
    meta = await db.app_meta.find_one({"key": "pin"})
    if meta and meta.get("hash"):
        return meta["hash"]
    return _pin_hash(_default_unlock_value())


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


async def _check_device(device_id: str, user_agent: str) -> None:
    """Device binding: normally the first trusted device gates the vault.

    This local workspace uses a direct unlock value and auto-approves the current
    device so stale approval records do not block access.
    """
    if not device_id:
        return
    if _allow_any_device():
        now = datetime.now(timezone.utc)
        await db.devices.update_one(
            {"id": device_id},
            {
                "$set": {"label": "This device", "user_agent": user_agent, "approved": True, "last_seen": now},
                "$setOnInsert": {"id": device_id, "created_at": now},
            },
            upsert=True,
        )
        return
    now = datetime.now(timezone.utc)
    has_trusted = await db.devices.count_documents({"approved": True}) > 0
    known = await db.devices.find_one({"id": device_id})
    if known:
        if known.get("approved") or not has_trusted:
            await db.devices.update_one(
                {"id": device_id},
                {"$set": {"approved": True, "last_seen": now, "user_agent": user_agent}},
            )
            return
        raise HTTPException(
            status_code=403,
            detail="This device is not approved. Approve it from Settings on your trusted device.",
        )
    await db.devices.update_one(
        {"id": device_id},
        {
            "$set": {
                "label": "This device" if not has_trusted else "New device",
                "user_agent": user_agent,
                "approved": not has_trusted,
                "last_seen": now,
            },
            "$setOnInsert": {"id": device_id, "created_at": now},
        },
        upsert=True,
    )
    if has_trusted:
        raise HTTPException(
            status_code=403,
            detail="New device detected. Approve it from Settings on your trusted device.",
        )


@router.post("/unlock", response_model=MeOut)
async def unlock(input: UnlockIn, response: Response, request: Request) -> MeOut:
    expected = await _active_pin_hash()
    candidate = (input.passkey or input.pin or "").strip()
    if not hmac.compare_digest(_pin_hash(candidate), expected):
        raise HTTPException(status_code=401, detail="Incorrect passcode")
    await _check_device(
        (input.device_id or "").strip(), request.headers.get("user-agent", "")[:200]
    )
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
    if not (new_pin.isalnum() and 4 <= len(new_pin) <= 32):
        raise HTTPException(
            status_code=422, detail="New passcode must be 4-32 letters or digits"
        )
    await db.app_meta.update_one(
        {"key": "pin"}, {"$set": {"hash": _pin_hash(new_pin)}}, upsert=True
    )
    return MeOut(authenticated=True)


@router.get("/devices", response_model=list[DeviceOut])
async def list_devices(
    _: None = Depends(require_auth),
    x_device_id: str | None = Header(default=None, alias="X-Device-Id"),
) -> list[DeviceOut]:
    docs = await db.devices.find().sort([("created_at", 1)]).to_list(50)
    return [
        DeviceOut(**{k: v for k, v in d.items() if k != "_id"}, current=d["id"] == x_device_id)
        for d in docs
    ]


@router.patch("/devices/{device_id}", response_model=DeviceOut)
async def update_device(
    device_id: str, input: DeviceUpdate, _: None = Depends(require_auth)
) -> DeviceOut:
    doc = await db.devices.find_one_and_update(
        {"id": device_id},
        {"$set": {"approved": input.approved}},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Device not found")
    return DeviceOut(**{k: v for k, v in doc.items() if k != "_id"})


@router.delete("/devices/{device_id}", status_code=204)
async def delete_device(device_id: str, _: None = Depends(require_auth)) -> None:
    res = await db.devices.delete_one({"id": device_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Device not found")
