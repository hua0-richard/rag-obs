import traceback
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from db.deps import get_db
from services.flashcards_service import (
    generate_flashcards,
    get_flashcard_decks,
    get_flashcards,
    get_files,
)

router = APIRouter()


class FlashcardGenerationRequest(BaseModel):
    prompt: str | None = None
    k: int | None = None
    session_id: UUID | None = None
    file_ids: list[int] | None = None
    replace: bool = False
    flashcard_amount: str | None = None


async def _run_flashcard_generation(
    *,
    prompt: str | None,
    k: int | None,
    session_id: UUID | None,
    file_ids: list[int] | None,
    replace: bool,
    flashcard_amount: str | None,
    db: Session,
):
    try:
        return await generate_flashcards(
            prompt=prompt,
            k=k,
            session_id=session_id,
            file_ids=file_ids,
            replace=replace,
            flashcard_amount=flashcard_amount,
            db=db,
        )
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Flashcard generation failed unexpectedly.",
        ) from exc


@router.get("/llm")
async def llm_flashcards(
    prompt: str | None = None,
    k: int | None = None,
    session_id: UUID | None = None,
    file_ids: list[int] | None = Query(None),
    replace: bool = Query(False),
    flashcard_amount: str | None = Query(None),
    db: Session = Depends(get_db),
):
    return await _run_flashcard_generation(
        prompt=prompt,
        k=k,
        session_id=session_id,
        file_ids=file_ids,
        replace=replace,
        flashcard_amount=flashcard_amount,
        db=db,
    )


@router.post("/llm")
async def llm_flashcards_post(
    payload: FlashcardGenerationRequest,
    db: Session = Depends(get_db),
):
    return await _run_flashcard_generation(
        prompt=payload.prompt,
        k=payload.k,
        session_id=payload.session_id,
        file_ids=payload.file_ids,
        replace=payload.replace,
        flashcard_amount=payload.flashcard_amount,
        db=db,
    )


@router.get("/flashcards")
def fetch_flashcards(
    session_id: UUID = Query(...),
    deck_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    return get_flashcards(session_id=session_id, deck_id=deck_id, db=db)


@router.get("/files")
def fetch_files(session_id: UUID = Query(...), db: Session = Depends(get_db)):
    return get_files(session_id=session_id, db=db)


@router.get("/flashcard-decks")
def fetch_flashcard_decks(session_id: UUID = Query(...), db: Session = Depends(get_db)):
    return get_flashcard_decks(session_id=session_id, db=db)
