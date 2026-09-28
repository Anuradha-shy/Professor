"""Candidate profile — single Mongo document, env-free defaults."""

from fastapi import APIRouter, Depends

from lib.db import db
from models.tracker import Profile, ProfileUpdate
from routers.auth import require_auth

router = APIRouter(prefix="/profile", tags=["profile"], dependencies=[Depends(require_auth)])


async def _profile() -> Profile:
    doc = await db.profile.find_one({})
    return Profile(**doc) if doc else Profile()


@router.get("", response_model=Profile)
async def get_profile() -> Profile:
    return await _profile()


@router.patch("", response_model=Profile)
async def update_profile(input: ProfileUpdate) -> Profile:
    updates = {k: v for k, v in input.model_dump().items() if v is not None}
    if updates:
        await db.profile.update_one({}, {"$set": updates}, upsert=True)
    return await _profile()
