from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

from sentence_transformers import SentenceTransformer
import ollama
import os


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

MODEL_NAME = "BAAI/bge-m3"
model = SentenceTransformer(MODEL_NAME)


@app.get("/")
def root():
    return {"status": "ok"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.post("/document-upload")
async def document_upload(file: UploadFile = File(...)):
    content = await file.read()

    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("utf-8", errors="replace")

    documents = [
        Document(
            page_content=text,
            metadata={
                "filename": file.filename,
                "content_type": file.content_type,
            },
        )
    ]
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    document_chunks = splitter.split_documents(documents)
    model = SentenceTransformer("all-MiniLM-L6-v2")
    embeddings = model.encode(
        text,
        normalize_embeddings=True,
        batch_size=32,
        show_progress_bar=True
    )

    print(file.filename, "split into", len(document_chunks), "chunks")
    return {
        "filename": file.filename,
        "status": "successfully uploaded",
        "num_chunks": len(document_chunks),
    }


@app.get("/ollama-hi")
def ollama_hi():
    response = ollama.chat(model="llama3.1", messages=[
                           {"role": "user", "content": "Say Hi!"}])
    print(response["message"]["content"])
    return {"response": response["message"]["content"]}
