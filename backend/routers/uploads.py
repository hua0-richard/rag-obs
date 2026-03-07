from typing import List
from uuid import UUID
from fastapi import APIRouter, File, Query, UploadFile
from services.upload_service import stream_document_upload

router = APIRouter()

# Document Streaming is NON-BLOCKING
@router.post("/upload-files")
async def document_upload(
    files: List[UploadFile] = File(...),
    session_id: UUID | None = Query(
        None, description="Existing session_id (UUID); if omitted a new one is created"
    ),
    embedding_model: str | None = Query(
        None, description="Embedding model selection (default, code, verbose, or model name)"
    ),
):
    return await stream_document_upload(files, session_id, embedding_model)
