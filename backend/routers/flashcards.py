from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from db.deps import get_db
from services.flashcards_service import (
    generate_flashcards,
    get_flashcard_decks,
    get_flashcards,
    get_files,
)

router = APIRouter()


@router.get("/llm")
async def llm_flashcards(
    prompt: str | None = None,
    k: int | None = None,
    session_id: int | None = None,
    file_ids: list[int] | None = Query(None),
    replace: bool = Query(False),
    embedding_model: str | None = Query(None),
    db: Session = Depends(get_db),
):
    return await generate_flashcards(
        prompt=prompt,
        k=k,
        session_id=session_id,
        file_ids=file_ids,
        replace=replace,
        embedding_model=embedding_model,
        db=db,
    )


@router.get("/flashcards")
def fetch_flashcards(
    session_id: int = Query(...),
    deck_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    return get_flashcards(session_id=session_id, deck_id=deck_id, db=db)


@router.get("/files")
def fetch_files(session_id: int = Query(...), db: Session = Depends(get_db)):
    return get_files(session_id=session_id, db=db)


@router.get("/flashcard-decks")
def fetch_flashcard_decks(session_id: int = Query(...), db: Session = Depends(get_db)):
    return get_flashcard_decks(session_id=session_id, db=db)
