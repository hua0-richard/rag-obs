from typing import List
from fastapi import APIRouter, File, Query, UploadFile
from services.upload_service import stream_document_upload

router = APIRouter()

# Document Streaming is NON-BLOCKING
@router.post("/upload-files")
async def document_upload(
    files: List[UploadFile] = File(...),
    session_id: int | None = Query(
        None, description="Existing session_id; if omitted a new one is created"
    ),
):
    return await stream_document_upload(files, session_id)
