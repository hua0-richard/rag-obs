from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.health import router as health_router
from routers.sessions import router as sessions_router
from routers.uploads import router as uploads_router
from routers.flashcards import router as flashcards_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:11434",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(sessions_router)
app.include_router(uploads_router)
app.include_router(flashcards_router)
