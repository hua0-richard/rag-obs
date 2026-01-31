import json
from models import Files, Embeddings, Sessions
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from typing import List
from fastapi.middleware.cors import CORSMiddleware
import ollama
from langchain_text_splitters import RecursiveCharacterTextSplitter

from sentence_transformers import SentenceTransformer

from service import SessionLocal, launch_db
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from sqlalchemy import text as sql_text
from prompt import FLASHCARD_PROMPT

import uuid

model = SentenceTransformer("all-MiniLM-L6-v2")

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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/")
def root():
    return {"status": "ok"}

@app.get("/session-id")
def session_id(db: Session = Depends(get_db)):
    """Create a new session row and return its integer id."""
    launch_db()
    session_row = Sessions()
    db.add(session_row)
    db.commit()
    db.refresh(session_row)
    return {"session_id": session_row.id}

# This Stream is Blocking
@app.post("/upload-files")
async def document_upload(
    files: List[UploadFile] = File(...),
    session_id: int | None = Query(None, description="Existing session_id; if omitted a new one is created"),
    db: Session = Depends(get_db),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    
    # Need to tune
    splitter = RecursiveCharacterTextSplitter(chunk_size = 512)
    
    async def event_stream():
        launch_db()
        try:
            # create or reuse session
            if session_id is not None:
                session_row = db.get(Sessions, session_id)
                if session_row is None:
                    raise HTTPException(status_code=404, detail="session_id not found")
            else:
                session_row = Sessions()
                db.add(session_row)
                db.flush()
                session_id = session_row.id

            for uploaded in files:
                raw_bytes = await uploaded.read()
                text = raw_bytes.decode("utf-8")
                chunks = splitter.split_text(text)
                
                # non-blocking
                vectors = await run_in_threadpool(model.encode, chunks, convert_to_numpy=True)
                file_row = Files(session_id=session_id)
                db.add(file_row)
                db.flush()

                db.bulk_save_objects([
                    Embeddings(
                        files_id=file_row.id,
                        session_id=session_id,
                        filename=uploaded.filename,
                        content_type="text/markdown",
                        chunk_index=i,
                        content=chunk,
                        embedding=vec.tolist(),
                    )
                    for i, (chunk, vec) in enumerate(zip(chunks, vectors))
                ])
                
                payload = {"status": "embedded", "filename": uploaded.filename}
                yield f"data: {json.dumps(payload)}\n\n"

            db.commit()
            yield "data: [DONE]\n\n"
        except Exception as e:
            db.rollback()
            payload = {"status": "error", "detail": str(e)}
            yield f"data: {json.dumps(payload)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

@app.get("/llm")
async def llm_flashcards(prompt: str, k: int = 5, session_id: int | None = None, db: Session = Depends(get_db)):
    """
    Retrieve top-k chunks via pgvector and ask Ollama (llama3.1) to generate flashcards.
    """
    launch_db()

    # Embed the prompt off the event loop
    qvec = (await run_in_threadpool(model.encode, [prompt], convert_to_numpy=True))[0]

    if session_id is not None and db.get(Sessions, session_id) is None:
        raise HTTPException(status_code=404, detail="session_id not found")

    base_query = (
        "SELECT filename, chunk_index, content "
        "FROM embeddings "
    )
    clauses = []
    params = {"qvec": qvec.tolist(), "k": k}
    if session_id is not None:
        clauses.append("session_id = :sid")
        params["sid"] = session_id
    if clauses:
        base_query += "WHERE " + " AND ".join(clauses) + " "
    base_query += "ORDER BY embedding <=> (:qvec)::vector LIMIT :k"

    rows = db.execute(sql_text(base_query), params).fetchall()

    context_lines = []
    sources = []
    for i, row in enumerate(rows):
        context_lines.append(f"[{i}] {row.filename} (chunk {row.chunk_index}): {row.content}")
        sources.append(
            {
                "tag": i,
                "filename": row.filename,
                "chunk_index": row.chunk_index,
            }
        )
    context = "\n\n".join(context_lines)

    llm_prompt = FLASHCARD_PROMPT.format(context=context)

    resp = await run_in_threadpool(
        ollama.chat,
        model="llama3.1",
        messages=[{"role": "user", "content": llm_prompt}],
    )
    content = resp["message"]["content"]

    flashcards = None
    try:
        parsed = json.loads(content)
        # Attach file source info when source_tag is provided
        if isinstance(parsed, list):
            by_tag = {s["tag"]: s for s in sources}
            for card in parsed:
                tag = card.get("source_tag")
                if tag in by_tag:
                    card["source"] = by_tag[tag]
        flashcards = parsed
    except Exception:
        # leave flashcards as None; return raw text for visibility
        pass

    return {
        "prompt": prompt,
        "flashcards": flashcards,
        "sources": sources,
        "raw": content,
    }
