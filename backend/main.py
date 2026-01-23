from fastapi import FastAPI, UploadFile, File
from fastapi.responses import StreamingResponse
from typing import List
import json
import re
import numpy as np
from fastapi.middleware.cors import CORSMiddleware
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

from sentence_transformers import SentenceTransformer
import ollama

from service import ensure_db_ready, SessionLocal, DocumentEmbedding, Flashcard, VECTOR_DIM
from sqlalchemy import bindparam, text as sql_text
from pgvector.sqlalchemy import Vector

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



@app.get("/")
def root():
    return {"status": "ok"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.post("/document-upload")
async def document_upload(file: UploadFile = File(...)):
    ensure_db_ready()
    content = await file.read()

    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("utf-8", errors="replace")

    model = SentenceTransformer("all-MiniLM-L6-v2")
    num_chunks = _embed_and_store_document(
        filename=file.filename,
        content_type=file.content_type,
        text=text,
        model=model,
    )

    summary_source = text[:4000]
    summary_prompt = (
        "Summarize the following document in 5-8 bullet points. "
        "Be concise and capture key facts.\n\n"
        f"{summary_source}"
    )
    summary_response = ollama.chat(
        model="llama3.1",
        messages=[{"role": "user", "content": summary_prompt}],
    )
    summary_text = summary_response["message"]["content"]

    print(file.filename, "split into", num_chunks, "chunks")
    
    return {
        "filename": file.filename,
        "status": "successfully uploaded",
        "num_chunks": num_chunks,
        "summary": summary_text,
    }


    ensure_db_ready()

    async def event_stream():
        model = SentenceTransformer("all-MiniLM-L6-v2")
        for file in files:
            content = await file.read()

            try:
                text = content.decode("utf-8")
            except UnicodeDecodeError:
                text = content.decode("utf-8", errors="replace")

            num_chunks = _embed_and_store_document(
                filename=file.filename,
                content_type=file.content_type,
                text=text,
                model=model,
            )

            payload = {
                "filename": file.filename,
                "status": "embedded",
                "num_chunks": num_chunks,
            }
            yield f"data: {json.dumps(payload)}\n\n"

        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/ollama-hi")
def ollama_hi():
    response = ollama.chat(model="llama3.1", messages=[
                           {"role": "user", "content": "Tell a bedtime story"}])
    print(response["message"]["content"])
    return {"response": response["message"]["content"]}


@app.get("/search")
def search(query: str, k: int = 5):
    ensure_db_ready()
    if k < 1:
        return {"results": []}

    model = SentenceTransformer("all-MiniLM-L6-v2")
    query_embedding = model.encode([query], normalize_embeddings=True)[0].tolist()

    session = SessionLocal()
    try:
        results = session.execute(
            sql_text(
                "SELECT filename, content_type, chunk_index, content, "
                "embedding <=> :query_embedding AS distance "
                "FROM document_embeddings "
                "ORDER BY embedding <=> :query_embedding "
                "LIMIT :k"
            ).bindparams(bindparam("query_embedding", type_=Vector(VECTOR_DIM))),
            {"query_embedding": query_embedding, "k": k},
        ).mappings().all()
    finally:
        session.close()

    return {"results": results}


def _embed_and_store_document(
    filename: str,
    content_type: str,
    text: str,
    model: SentenceTransformer,
):
    documents = [
        Document(
            page_content=text,
            metadata={
                "filename": filename,
                "content_type": content_type,
            },
        )
    ]

    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    document_chunks = splitter.split_documents(documents)

    chunk_texts = [chunk.page_content for chunk in document_chunks]
    embeddings = model.encode(
        chunk_texts,
        normalize_embeddings=True,
        batch_size=32,
        show_progress_bar=True
    )

    session = SessionLocal()
    try:
        for idx, (chunk, embedding) in enumerate(zip(document_chunks, embeddings)):
            session.add(
                DocumentEmbedding(
                    filename=filename,
                    content_type=content_type,
                    chunk_index=idx,
                    content=chunk.page_content,
                    embedding=embedding.tolist(),
                )
            )
        session.commit()
    finally:
        session.close()

    return len(document_chunks)


def _select_kmeans_representatives(
    contents: List[str],
    embeddings: List[List[float]],
    clusters: int,
    max_iters: int = 10,
    seed: int = 42,
):
    if len(contents) <= clusters:
        return contents

    vectors = np.array(embeddings, dtype=np.float32)
    rng = np.random.default_rng(seed)
    indices = rng.choice(len(vectors), size=clusters, replace=False)
    centroids = vectors[indices]

    for _ in range(max_iters):
        distances = np.linalg.norm(vectors[:, None, :] - centroids[None, :, :], axis=2)
        labels = np.argmin(distances, axis=1)
        new_centroids = []
        for idx in range(clusters):
            members = vectors[labels == idx]
            if len(members) == 0:
                new_centroids.append(centroids[idx])
            else:
                new_centroids.append(members.mean(axis=0))
        new_centroids = np.vstack(new_centroids)
        if np.allclose(centroids, new_centroids, atol=1e-4):
            centroids = new_centroids
            break
        centroids = new_centroids

    distances = np.linalg.norm(vectors[:, None, :] - centroids[None, :, :], axis=2)
    labels = np.argmin(distances, axis=1)
    selected = []
    for idx in range(clusters):
        members_idx = np.where(labels == idx)[0]
        if len(members_idx) == 0:
            continue
        member_vectors = vectors[members_idx]
        member_distances = np.linalg.norm(member_vectors - centroids[idx], axis=1)
        best_idx = members_idx[int(np.argmin(member_distances))]
        selected.append(contents[best_idx])
    return selected
