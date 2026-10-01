import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List
import uuid
from datetime import datetime


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, db, ensure_indexes

from routers.ai import router as ai_router
from routers.admin import router as admin_router
from routers.analytics import router as analytics_router
from routers.auth import router as auth_router
from routers.goals import router as goals_router
from routers.insights import router as insights_router
from routers.notion import router as notion_router
from routers.profile import router as profile_router
from routers.pyq import router as pyq_router
from routers.revisions import router as revisions_router
from routers.sessions import router as sessions_router
from routers.subjects import router as subjects_router
from routers.tests import router as tests_router
from routers.mock_tests import router as mock_tests_router


# Startup runs before the yield, shutdown after it. Add your own setup/teardown here.
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())  # background: a big index build must not block boot
    yield
    client.close()


# Create the main app without a prefix
app = FastAPI(lifespan=lifespan)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.model_dump())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Feature routers — every route stays under the /api prefix
api_router.include_router(auth_router)
api_router.include_router(profile_router)
api_router.include_router(subjects_router)
api_router.include_router(sessions_router)
api_router.include_router(goals_router)
api_router.include_router(revisions_router)
api_router.include_router(tests_router)
api_router.include_router(mock_tests_router)
api_router.include_router(insights_router)
api_router.include_router(analytics_router)
api_router.include_router(pyq_router)
api_router.include_router(ai_router)
api_router.include_router(notion_router)
api_router.include_router(admin_router)

# Include the router in the main app — keep this the LAST router statement
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
