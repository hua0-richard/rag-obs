from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from db.deps import get_db
from db.models import Sessions

router = APIRouter()


@router.get("/session-id")
def session_id(db: Session = Depends(get_db)):
    """Create a new session row and return its UUID."""
    session_row = Sessions()
    db.add(session_row)
    db.commit()
    db.refresh(session_row)
    return {"session_id": session_row.id}
