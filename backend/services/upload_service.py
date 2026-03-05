import json
from typing import List
from fastapi import HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from langchain_text_splitters import RecursiveCharacterTextSplitter
from db.models import Embeddings, Files, Sessions
from db.session import SessionLocal, launch_db
from services.embedding_service import embed_chunks
from services.obsidian_service import build_obsidian_context, split_text_with_context


async def stream_document_upload(
    files: List[UploadFile],
    session_id: int | None,
) -> StreamingResponse:
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    # Need to tune
    splitter = RecursiveCharacterTextSplitter(chunk_size=512)
    # Read all uploads while the request context is active to avoid empty reads in the stream.
    prepared_files: list[tuple[str, bytes, str | None]] = []
    for uploaded in files:
        await uploaded.seek(0)
        raw_bytes = await uploaded.read()
        prepared_files.append((uploaded.filename, raw_bytes, uploaded.content_type))
        await uploaded.close()

    async def event_stream():
        db = SessionLocal()
        try:
            launch_db()
            active_session_id = session_id
            if active_session_id is not None:
                session_row = db.get(Sessions, active_session_id)
                if session_row is None:
                    payload = {"status": "error", "detail": "session_id not found"}
                    yield f"data: {json.dumps(payload)}\n\n"
                    return
            else:
                session_row = Sessions()
                db.add(session_row)
                db.commit()
                db.refresh(session_row)
                active_session_id = session_row.id

            yield f"data: {json.dumps({'status': 'session', 'session_id': active_session_id})}\n\n"

            decoded_files: list[dict] = []
            decode_errors: dict[str, str] = {}
            for filename, raw_bytes, content_type in prepared_files:
                if not raw_bytes:
                    continue
                try:
                    decoded_files.append(
                        {
                            "filename": filename,
                            "content_type": content_type or "text/plain",
                            "text": raw_bytes.decode("utf-8"),
                        }
                    )
                except UnicodeDecodeError:
                    decode_errors[filename] = "file is not valid utf-8 text"

            obsidian_context = build_obsidian_context(decoded_files)

            for filename, raw_bytes, content_type in prepared_files:
                if not raw_bytes:
                    payload = {
                        "status": "skipped",
                        "filename": filename,
                        "detail": "empty file",
                    }
                    yield f"data: {json.dumps(payload)}\n\n"
                    continue

                try:
                    file_row = Files(
                        session_id=active_session_id,
                        filename=filename,
                        content_type=content_type or "text/plain",
                        raw_content=raw_bytes,
                    )
                    db.add(file_row)
                    db.commit()
                    db.refresh(file_row)
                except Exception as e:
                    try:
                        db.rollback()
                    except Exception:
                        pass
                    payload = {
                        "status": "error",
                        "filename": filename,
                        "detail": f"failed to save file: {e}",
                    }
                    yield f"data: {json.dumps(payload)}\n\n"
                    continue

                if filename in decode_errors:
                    payload = {
                        "status": "error",
                        "filename": filename,
                        "detail": decode_errors[filename],
                    }
                    yield f"data: {json.dumps(payload)}\n\n"
                    continue

                text = obsidian_context.get(filename, {}).get("embedding_text")
                if text is None:
                    text = raw_bytes.decode("utf-8")

                chunks = split_text_with_context(
                    text=text,
                    filename=filename,
                    content_type=content_type,
                    splitter=splitter,
                )
                if not chunks:
                    payload = {
                        "status": "skipped",
                        "filename": filename,
                        "detail": "no text chunks produced",
                    }
                    yield f"data: {json.dumps(payload)}\n\n"
                    continue
                try:
                    # non-blocking
                    vectors = await embed_chunks(chunks)

                    db.add_all([
                        Embeddings(
                            files_id=file_row.id,
                            session_id=active_session_id,
                            filename=filename,
                            content_type=content_type or "text/plain",
                            chunk_index=i,
                            content=chunk,
                            embedding=vec.tolist(),
                        )
                        for i, (chunk, vec) in enumerate(zip(chunks, vectors))
                    ])
                    # Commit per file so embeddings persist even if the stream is interrupted.
                    db.commit()

                    payload = {"status": "embedded", "filename": filename}
                    yield f"data: {json.dumps(payload)}\n\n"
                except Exception as e:
                    try:
                        db.rollback()
                    except Exception:
                        pass
                    payload = {
                        "status": "error",
                        "filename": filename,
                        "detail": str(e),
                    }
                    yield f"data: {json.dumps(payload)}\n\n"

            yield "data: [DONE]\n\n"
        except Exception as e:
            try:
                db.rollback()
            except Exception:
                pass
            payload = {"status": "error", "detail": str(e)}
            yield f"data: {json.dumps(payload)}\n\n"
        finally:
            db.close()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
