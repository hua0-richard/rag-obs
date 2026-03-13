import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.health import router as health_router
from routers.sessions import router as sessions_router
from routers.uploads import router as uploads_router
from routers.flashcards import router as flashcards_router

app = FastAPI()

is_dev = os.getenv("ENV", "DEV").upper() == "DEV"
local_origin_regex = r"^https?://(localhost|127\\.0\\.0\\.1|\\[::1\\])(:\\d+)?$"
netlify_origin_regex = r"^https://.*\.netlify\.app$"

allowed_origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:11434",
]

frontend_url = os.getenv("FRONTEND_URL", "").strip()
if frontend_url:
    allowed_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=local_origin_regex if is_dev else netlify_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(sessions_router)
app.include_router(uploads_router)
app.include_router(flashcards_router)
