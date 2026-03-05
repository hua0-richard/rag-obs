from sentence_transformers import SentenceTransformer
from starlette.concurrency import run_in_threadpool

model = SentenceTransformer("all-MiniLM-L6-v2")


async def embed_chunks(chunks: list[str]):
    return await run_in_threadpool(model.encode, chunks, convert_to_numpy=True)


async def embed_query(prompt: str):
    return (await run_in_threadpool(model.encode, [prompt], convert_to_numpy=True))[0]
