from uuid import UUID
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from db.deps import get_db
from db.models import Sessions
from services.embedding_service import EMBEDDING_MODEL_NAMES, normalize_embedding_profile

router = APIRouter()


@router.get("/session-id")
def session_id(db: Session = Depends(get_db)):
    """Create a new session row and return its UUID."""
    session_row = Sessions()
    db.add(session_row)
    db.commit()
    db.refresh(session_row)
    return {"session_id": session_row.id}


@router.get("/session-profile")
def session_profile(session_id: UUID = Query(...), db: Session = Depends(get_db)):
    session_row = db.get(Sessions, session_id)
    if session_row is None:
        raise HTTPException(status_code=404, detail="session_id not found")
    embedding_profile = normalize_embedding_profile(session_row.embedding_profile)
    return {
        "session_id": session_id,
        "embedding_profile": embedding_profile,
        "embedding_model": EMBEDDING_MODEL_NAMES[embedding_profile],
    }
