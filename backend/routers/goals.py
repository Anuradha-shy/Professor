"""Goals / strategic milestones."""

from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument

from lib.db import db
from models.tracker import Goal, GoalCreate, GoalUpdate
from routers.auth import require_auth

router = APIRouter(prefix="/goals", tags=["goals"], dependencies=[Depends(require_auth)])


@router.get("", response_model=list[Goal])
async def list_goals() -> list[Goal]:
    docs = await db.goals.find().sort([("status", 1), ("target_date", 1)]).to_list(200)
    return [Goal(**d) for d in docs]


@router.post("", response_model=Goal, status_code=201)
async def create_goal(input: GoalCreate) -> Goal:
    goal = Goal(**input.model_dump())
    await db.goals.insert_one(goal.model_dump())
    return goal


@router.patch("/{goal_id}", response_model=Goal)
async def update_goal(goal_id: str, input: GoalUpdate) -> Goal:
    updates = {k: v for k, v in input.model_dump().items() if v is not None}
    if "progress" in updates:
        progress = max(0, min(100, int(updates["progress"])))
        updates["progress"] = progress
        if progress >= 100:
            updates["status"] = "done"
    doc = await db.goals.find_one_and_update(
        {"id": goal_id}, {"$set": updates}, return_document=ReturnDocument.AFTER
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Goal not found")
    return Goal(**doc)


@router.delete("/{goal_id}", status_code=204)
async def delete_goal(goal_id: str) -> None:
    res = await db.goals.delete_one({"id": goal_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Goal not found")
