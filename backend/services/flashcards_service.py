import json
import math
import os
import re
from asyncio import TimeoutError as AsyncTimeoutError, wait_for
from datetime import datetime, timezone
from uuid import UUID
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError
import ollama
from starlette.concurrency import run_in_threadpool
from fastapi import HTTPException
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from langchain_community.retrievers import BM25Retriever
try:
    from langchain_community.retrievers import EnsembleRetriever
except (ImportError, ModuleNotFoundError):
    try:
        from langchain.retrievers import EnsembleRetriever
    except (ImportError, ModuleNotFoundError):
        from langchain.retrievers.ensemble import EnsembleRetriever
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Session
from db.models import (
    Embeddings,
    EmbeddingsCode,
    EmbeddingsVerbose,
    Files,
    Flashcard,
    FlashcardDecks,
    Sessions,
)
from prompt import FLASHCARD_PROMPT
from services.embedding_service import (
    EmbeddingProfile,
    CODE_EMBEDDING_PROFILE,
    DEFAULT_EMBEDDING_PROFILE,
    VERBOSE_EMBEDDING_PROFILE,
    embed_chunks,
    embed_query,
    embed_query_sync,
    get_embedding_table,
    normalize_embedding_profile,
    parse_embedding_profile,
)
from services.obsidian_service import split_text_with_context
from utils.obsidian import format_context_content_for_llm, is_code_block_content

FLASHCARD_CHARS_PER_CARD = 500
FLASHCARD_MIN_COUNT = 1
FLASHCARD_CHUNKS_PER_CARD = 2
FLASHCARD_DEFAULT_RETRIEVAL_K = 40
FLASHCARD_BM25_CANDIDATE_MULTIPLIER = 6
FLASHCARD_BM25_CANDIDATE_MAX = 600
FLASHCARD_MAX_CONTEXT_CHARS = 24000
FLASHCARD_MIN_CODE_CARDS = 1
FLASHCARD_MAX_CODE_BLOCKS_IN_CONTEXT = 3
HYBRID_VECTOR_WEIGHT = 0.6
HYBRID_KEYWORD_WEIGHT = 0.4
FLASHCARD_LLM_TIMEOUT_SECONDS = int(os.getenv("FLASHCARD_LLM_TIMEOUT_SECONDS", "90"))
FLASHCARD_LLM_MODEL = os.getenv("FLASHCARD_LLM_MODEL", "llama3.1")
FLASHCARD_LLM_KEEP_ALIVE = os.getenv("FLASHCARD_LLM_KEEP_ALIVE", "30m")
FLASHCARD_MAX_TOKENS_PER_CARD = int(os.getenv("FLASHCARD_MAX_TOKENS_PER_CARD", "110"))
FLASHCARD_LLM_MAX_TOKENS = int(os.getenv("FLASHCARD_LLM_MAX_TOKENS", "1800"))
ENV = os.getenv("ENV", "DEV").upper()
USE_OPENROUTER = ENV in {"PROD", "PRODUCTION"}
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "qwen/qwen3-next-80b-a3b-instruct:free")
OPENROUTER_REFERER = os.getenv("OPENROUTER_REFERER", "").strip()
OPENROUTER_TITLE = os.getenv("OPENROUTER_TITLE", "").strip()
OPENROUTER_FALLBACK_MODELS: list[str] = [
    m.strip()
    for m in os.getenv(
        "OPENROUTER_FALLBACK_MODELS",
        "meta-llama/llama-3.3-70b-instruct:free,"
        "qwen/qwen3-coder:free,"
        "openai/gpt-oss-120b:free,"
        "nvidia/nemotron-3-super-120b-a12b:free",
    ).split(",")
    if m.strip()
]
FLASHCARD_AMOUNT_MULTIPLIERS = {
    "small": 0.6,
    "medium": 1.0,
    "large": 2.0,
}

try:
    from pydantic import ConfigDict
except Exception:  # pragma: no cover - pydantic v1 fallback
    ConfigDict = None


def _build_embedding_filters(session_id: UUID | None, file_ids: list[int] | None):
    clauses: list[str] = []
    params: dict[str, object] = {}
    if session_id is not None:
        clauses.append("session_id = :sid")
        params["sid"] = session_id
    if file_ids:
        clauses.append("files_id = ANY(:file_ids)")
        params["file_ids"] = file_ids
    return clauses, params


def _fetch_embedding_rows(
    db: Session,
    session_id: UUID | None,
    file_ids: list[int] | None,
    *,
    table_name: str,
    order_by: str | None = None,
    limit: int | None = None,
    qvec: object | None = None,
):
    base_query = f"SELECT filename, chunk_index, content FROM {table_name} "
    clauses, params = _build_embedding_filters(session_id, file_ids)
    if clauses:
        base_query += "WHERE " + " AND ".join(clauses) + " "
    if qvec is not None:
        params["qvec"] = qvec.tolist()
        base_query += "ORDER BY embedding <=> (:qvec)::vector "
    elif order_by:
        base_query += f"ORDER BY {order_by} "
    if limit is not None:
        base_query += "LIMIT :k"
        params["k"] = limit
    return db.execute(sql_text(base_query), params).fetchall()


def _rows_to_documents(rows) -> list[Document]:
    return [
        Document(
            page_content=row.content,
            metadata={
                "filename": row.filename,
                "chunk_index": row.chunk_index,
            },
        )
        for row in rows
    ]


def _documents_to_row_items(docs: list[Document]) -> list[tuple[str, int, str]]:
    items: list[tuple[str, int, str]] = []
    for doc in docs:
        filename = doc.metadata.get("filename")
        chunk_index = doc.metadata.get("chunk_index")
        if isinstance(filename, str) and isinstance(chunk_index, int):
            items.append((filename, chunk_index, doc.page_content))
    return items


def _clean_filename(value: str) -> str:
    if not value:
        return ""
    trimmed = value.strip()
    if not trimmed:
        return ""
    base = re.split(r"[\\/]", trimmed)[-1]
    base = re.sub(r"\.[^/.]+$", "", base)
    return base or trimmed


_AUTH_ERROR_CODES = {401, 403}


def _openrouter_chat(prompt: str, target_tokens: int) -> tuple[str, str]:
    if not OPENROUTER_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="OpenRouter API key not configured. Set OPENROUTER_API_KEY.",
        )
    url = OPENROUTER_BASE_URL.rstrip("/") + "/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    if OPENROUTER_REFERER:
        headers["HTTP-Referer"] = OPENROUTER_REFERER
    if OPENROUTER_TITLE:
        headers["X-Title"] = OPENROUTER_TITLE

    # Build candidate list: primary model first, then fallbacks (deduped, preserving order)
    seen: set[str] = set()
    candidates: list[str] = []
    for m in [OPENROUTER_MODEL] + OPENROUTER_FALLBACK_MODELS:
        if m not in seen:
            seen.add(m)
            candidates.append(m)

    last_error: str = "OpenRouter request failed."
    for model in candidates:
        print(f"[OpenRouter] Trying model: {model}")
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": target_tokens,
            "temperature": 0.2,
        }
        data = json.dumps(payload).encode("utf-8")
        request = urlrequest.Request(url, data=data, headers=headers, method="POST")
        try:
            with urlrequest.urlopen(request, timeout=FLASHCARD_LLM_TIMEOUT_SECONDS) as resp:
                body = resp.read()
        except HTTPError as exc:
            try:
                error_body = exc.read().decode("utf-8")
            except Exception:
                error_body = ""
            if exc.code in _AUTH_ERROR_CODES:
                raise HTTPException(
                    status_code=401,
                    detail="OpenRouter authentication failed. Check your API key.",
                ) from exc
            try:
                err_json = json.loads(error_body)
                inner = err_json.get("error") if isinstance(err_json, dict) else None
                reason = (inner.get("message") if isinstance(inner, dict) else None) or error_body
            except (json.JSONDecodeError, AttributeError):
                reason = error_body or f"HTTP {exc.code}"
            print(f"[OpenRouter] {model} failed (HTTP {exc.code}): {reason}")
            last_error = reason or f"HTTP {exc.code}"
            continue
        except URLError as exc:
            raise HTTPException(
                status_code=502,
                detail="Could not connect to OpenRouter. Check your network.",
            ) from exc

        try:
            response = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            print(f"[OpenRouter] {model} returned malformed JSON")
            last_error = "malformed response"
            continue

        if isinstance(response, dict) and response.get("error"):
            error = response["error"]
            reason = error.get("message") if isinstance(error, dict) else str(error)
            print(f"[OpenRouter] {model} error: {reason}")
            last_error = reason or "unknown error"
            continue

        choices = response.get("choices")
        if not isinstance(choices, list) or not choices:
            print(f"[OpenRouter] {model} response missing choices")
            last_error = "missing choices in response"
            continue
        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str):
            print(f"[OpenRouter] {model} response missing content")
            last_error = "missing content in response"
            continue
        print(f"[OpenRouter] Success with model: {model}")
        return content, model

    raise HTTPException(
        status_code=503,
        detail=f"All models failed. Last error: {last_error}",
    )


def _build_deck_title(filenames: list[str]) -> str:
    cleaned = [_clean_filename(name) for name in filenames if isinstance(name, str)]
    cleaned = [name for name in cleaned if name]
    if not cleaned:
        return "Untitled Deck"
    first = cleaned[0]
    if len(cleaned) == 1:
        return first
    return f"{first} + {len(cleaned) - 1} more"


def _fetch_source_files(
    db: Session,
    session_id: UUID,
    file_ids: list[int] | None,
    fallback_filenames: list[str],
) -> list[dict]:
    rows = []
    filename_filter: list[str] = []
    seen_names: set[str] = set()
    for name in fallback_filenames:
        if not isinstance(name, str):
            continue
        trimmed = name.strip()
        if not trimmed or trimmed in seen_names:
            continue
        seen_names.add(trimmed)
        filename_filter.append(trimmed)
    if file_ids:
        rows = db.execute(
            sql_text(
                "SELECT id, filename "
                "FROM notes "
                "WHERE session_id = :sid AND id = ANY(:file_ids) "
                "ORDER BY id"
            ),
            {"sid": session_id, "file_ids": file_ids},
        ).fetchall()
    elif filename_filter:
        rows = db.execute(
            sql_text(
                "SELECT id, filename "
                "FROM notes "
                "WHERE session_id = :sid AND filename = ANY(:filenames) "
                "ORDER BY id"
            ),
            {"sid": session_id, "filenames": filename_filter},
        ).fetchall()
    else:
        rows = db.execute(
            sql_text(
                "SELECT id, filename "
                "FROM notes "
                "WHERE session_id = :sid "
                "ORDER BY id"
            ),
            {"sid": session_id},
        ).fetchall()

    sources: list[dict] = []
    seen = set()
    for row in rows:
        key = (row.id, row.filename)
        if key in seen:
            continue
        seen.add(key)
        sources.append({"id": row.id, "filename": row.filename})

    existing_names = {
        entry.get("filename")
        for entry in sources
        if isinstance(entry.get("filename"), str)
    }
    for name in fallback_filenames:
        if not isinstance(name, str) or not name.strip():
            continue
        if name in existing_names:
            continue
        sources.append({"id": None, "filename": name})
        existing_names.add(name)

    return sources


def _persist_flashcard_deck(
    db: Session,
    session_id: UUID,
    source_files: list[dict],
    source_chunks: list[dict],
    card_count: int,
) -> FlashcardDecks:
    filenames = [
        entry.get("filename")
        for entry in source_files
        if isinstance(entry.get("filename"), str)
    ]
    title = _build_deck_title(filenames)
    source_metadata = {"files": source_files, "chunks": source_chunks}
    note_count = len([name for name in filenames if name])
    deck = FlashcardDecks(
        session_id=session_id,
        title=title,
        source_metadata=source_metadata,
        source_label=title,
        card_count=card_count,
        note_count=note_count,
        created_at=datetime.now(timezone.utc),
    )
    db.add(deck)
    db.commit()
    db.refresh(deck)
    return deck


class PgVectorRetriever(BaseRetriever):
    db: Session
    session_id: UUID | None
    file_ids: list[int] | None
    k: int | None
    embedding_profile: EmbeddingProfile
    embedding_table: str

    if ConfigDict is not None:
        model_config = ConfigDict(arbitrary_types_allowed=True)
    else:
        class Config:
            arbitrary_types_allowed = True

    def _get_relevant_documents(self, query: str) -> list[Document]:
        qvec = embed_query_sync(query, profile=self.embedding_profile)
        rows = _fetch_embedding_rows(
            self.db,
            self.session_id,
            self.file_ids,
            table_name=self.embedding_table,
            qvec=qvec,
            limit=self.k,
        )
        return _rows_to_documents(rows)

    async def _aget_relevant_documents(self, query: str) -> list[Document]:
        qvec = await embed_query(query, profile=self.embedding_profile)
        rows = _fetch_embedding_rows(
            self.db,
            self.session_id,
            self.file_ids,
            table_name=self.embedding_table,
            qvec=qvec,
            limit=self.k,
        )
        return _rows_to_documents(rows)


async def _ainvoke_retriever(retriever, query: str):
    if hasattr(retriever, "ainvoke"):
        return await retriever.ainvoke(query)
    if hasattr(retriever, "aget_relevant_documents"):
        return await retriever.aget_relevant_documents(query)
    return retriever.get_relevant_documents(query)


async def _ensure_embeddings_for_profile(
    db: Session,
    *,
    session_id: UUID | None,
    file_ids: list[int] | None,
    embedding_profile: EmbeddingProfile,
):
    if session_id is None:
        return

    embedding_table = get_embedding_table(embedding_profile)
    embedding_row_model_map = {
        DEFAULT_EMBEDDING_PROFILE: Embeddings,
        CODE_EMBEDDING_PROFILE: EmbeddingsCode,
        VERBOSE_EMBEDDING_PROFILE: EmbeddingsVerbose,
    }
    embedding_row_model = embedding_row_model_map[embedding_profile]

    notes_query = db.query(Files).filter(Files.session_id == session_id)
    if file_ids:
        notes_query = notes_query.filter(Files.id.in_(file_ids))
    note_rows = notes_query.order_by(Files.id.asc()).all()
    if not note_rows:
        return

    params: dict[str, object] = {"sid": session_id}
    existing_query = (
        f"SELECT DISTINCT files_id FROM {embedding_table} "
        "WHERE session_id = :sid"
    )
    if file_ids:
        existing_query += " AND files_id = ANY(:file_ids)"
        params["file_ids"] = file_ids
    existing_ids = {
        row.files_id
        for row in db.execute(sql_text(existing_query), params).fetchall()
    }

    missing_rows = [row for row in note_rows if row.id not in existing_ids]
    if not missing_rows:
        return

    splitter = RecursiveCharacterTextSplitter(chunk_size=512)
    try:
        for note_row in missing_rows:
            raw_content = note_row.raw_content or b""
            if not raw_content:
                continue
            try:
                text = raw_content.decode("utf-8")
            except UnicodeDecodeError:
                continue

            filename = note_row.filename or f"note-{note_row.id}"
            chunks = split_text_with_context(
                text=text,
                filename=filename,
                content_type=note_row.content_type,
                splitter=splitter,
            )
            if not chunks:
                continue

            vectors = await embed_chunks(chunks, profile=embedding_profile)
            db.add_all(
                [
                    embedding_row_model(
                        files_id=note_row.id,
                        session_id=session_id,
                        filename=filename,
                        content_type=note_row.content_type or "text/plain",
                        chunk_index=i,
                        content=chunk,
                        embedding=vec.tolist(),
                    )
                    for i, (chunk, vec) in enumerate(zip(chunks, vectors))
                ]
            )
        db.commit()
    except Exception:
        db.rollback()
        raise


def _normalize_obsidian_latex(text: str) -> str:
    if not text:
        return text
    normalized = text

    def replace_math_block_labels(value: str) -> str:
        lines = value.splitlines()
        out: list[str] = []
        i = 0
        while i < len(lines):
            line = lines[i]
            if line.strip().startswith("Math block:"):
                remainder = line.split("Math block:", 1)[1].strip()
                block_lines: list[str] = []
                if remainder:
                    block_lines.append(remainder)
                    i += 1
                else:
                    i += 1
                    while i < len(lines) and lines[i].strip():
                        block_lines.append(lines[i])
                        i += 1
                expr = "\n".join(block_lines).strip()
                if expr:
                    out.append("$$")
                    out.append(expr)
                    out.append("$$")
                    continue
            out.append(line)
            i += 1
        return "\n".join(out)

    normalized = replace_math_block_labels(normalized)
    normalized = re.sub(r"\\\((.+?)\\\)", r"$\1$", normalized, flags=re.DOTALL)
    normalized = re.sub(r"\\\[(.+?)\\\]", r"$$\1$$", normalized, flags=re.DOTALL)
    return normalized


def _normalize_card(item: object) -> dict | None:
    if isinstance(item, dict):
        question = item.get("question") or item.get("q") or item.get("front")
        answer = item.get("answer") or item.get("a") or item.get("back")
        source_tag = item.get("source_tag") or item.get("source")
    elif isinstance(item, (list, tuple)) and len(item) >= 2:
        question = item[0]
        answer = item[1]
        source_tag = None
    else:
        return None
    if not isinstance(question, str) or not isinstance(answer, str):
        return None
    return {
        "question": _normalize_obsidian_latex(question.strip()),
        "answer": _normalize_obsidian_latex(answer.strip()),
        "source_tag": source_tag,
    }


def _parse_qa_blocks(text: str) -> list[dict]:
    cleaned = text.replace("```json", "").replace("```", "")
    cards: list[dict] = []
    current_q: str | None = None
    current_a: list[str] = []
    current_source: int | None = None
    in_answer = False

    def flush_current():
        nonlocal current_q, current_a, current_source, in_answer
        if current_q and current_a:
            cards.append(
                {
                    "question": current_q.strip(),
                    "answer": "\n".join(current_a).strip(),
                    "source_tag": current_source,
                }
            )
        current_q = None
        current_a = []
        current_source = None
        in_answer = False

    for raw_line in cleaned.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        line = re.sub(r"^\s*[-*•]\s*", "", line)

        inline = re.match(
            r"^(?:\d+[\).\s]+)?(?:Q|Question)\s*[:\-]\s*(.+?)\s+(?:A|Answer)\s*[:\-]\s*(.+)$",
            line,
            re.IGNORECASE,
        )
        if inline:
            flush_current()
            cards.append(
                {
                    "question": _normalize_obsidian_latex(inline.group(1).strip()),
                    "answer": _normalize_obsidian_latex(inline.group(2).strip()),
                    "source_tag": None,
                }
            )
            continue

        q_match = re.match(
            r"^(?:\d+[\).\s]+)?(?:Q|Question)\s*[:\-]\s*(.+)$",
            line,
            re.IGNORECASE,
        )
        if q_match:
            flush_current()
            current_q = _normalize_obsidian_latex(q_match.group(1).strip())
            continue

        a_match = re.match(r"^(?:A|Answer)\s*[:\-]\s*(.+)$", line, re.IGNORECASE)
        if a_match and current_q:
            in_answer = True
            current_a.append(_normalize_obsidian_latex(a_match.group(1).strip()))
            continue

        source_match = re.match(
            r"^(?:Source|Source Tag)\s*[:\-]\s*(.+)$",
            line,
            re.IGNORECASE,
        )
        if source_match and current_q:
            tag_str = source_match.group(1)
            match = re.search(r"\d+", tag_str)
            current_source = int(match.group(0)) if match else None
            continue

        if in_answer and current_q:
            current_a.append(_normalize_obsidian_latex(line))

    flush_current()

    if cards:
        return cards

    # Fallback: lines like "Question — Answer"
    for raw_line in cleaned.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        dash_match = re.match(r"^(?:\d+[\).\s]+)?(.+?)\s*[–—-]\s*(.+)$", line)
        if dash_match:
            cards.append(
                {
                    "question": _normalize_obsidian_latex(dash_match.group(1).strip()),
                    "answer": _normalize_obsidian_latex(dash_match.group(2).strip()),
                    "source_tag": None,
                }
            )
    return cards


def _parse_flashcards(text: str) -> list[dict]:
    parsed_json = None
    try:
        parsed_json = json.loads(text)
    except Exception:
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1 and end > start:
            candidate = text[start : end + 1]
            try:
                parsed_json = json.loads(candidate)
            except Exception:
                parsed_json = None

    if isinstance(parsed_json, list):
        normalized: list[dict] = []
        for item in parsed_json:
            normalized_item = _normalize_card(item)
            if normalized_item:
                normalized.append(normalized_item)
        if normalized:
            return normalized

    return _parse_qa_blocks(text)


def _apply_flashcard_amount(n_flashcards: int, amount: str | None) -> int:
    if not amount:
        return n_flashcards
    key = amount.strip().lower()
    if key == "small":
        return math.floor(n_flashcards * FLASHCARD_AMOUNT_MULTIPLIERS["small"])
    if key == "large":
        return math.ceil(n_flashcards * FLASHCARD_AMOUNT_MULTIPLIERS["large"])
    return n_flashcards


async def generate_flashcards(
    prompt: str | None,
    k: int | None,
    session_id: UUID | None,
    file_ids: list[int] | None,
    replace: bool,
    embedding_model: str | None,
    flashcard_amount: str | None,
    db: Session,
):
    """
    Retrieve chunks via hybrid BM25 + pgvector and ask llm to generate flashcards.
    """

    if not prompt and session_id is None:
        raise HTTPException(
            status_code=400,
            detail="prompt is required unless session_id is provided",
        )

    session_row = None
    if session_id is not None:
        session_row = db.get(Sessions, session_id)
        if session_row is None:
            raise HTTPException(status_code=404, detail="session_id not found")

    requested_profile = parse_embedding_profile(embedding_model)
    embedding_profile = (
        normalize_embedding_profile(session_row.embedding_profile)
        if session_row is not None
        else DEFAULT_EMBEDDING_PROFILE
    )
    if requested_profile is not None:
        embedding_profile = requested_profile
        if session_row is not None and session_row.embedding_profile != requested_profile:
            session_row.embedding_profile = requested_profile
            db.commit()
            db.refresh(session_row)
    embedding_table = get_embedding_table(embedding_profile)
    await _ensure_embeddings_for_profile(
        db=db,
        session_id=session_id,
        file_ids=file_ids,
        embedding_profile=embedding_profile,
    )

    effective_k = k
    if effective_k is None:
        # Prevent unbounded retrieval/context for session-wide generation.
        effective_k = 5 if session_id is None else FLASHCARD_DEFAULT_RETRIEVAL_K

    row_items: list[tuple[str, int, str]] = []
    if prompt:
        bm25_limit = min(
            FLASHCARD_BM25_CANDIDATE_MAX,
            max(
                effective_k * FLASHCARD_BM25_CANDIDATE_MULTIPLIER,
                effective_k,
            ),
        )
        bm25_rows = _fetch_embedding_rows(
            db,
            session_id,
            file_ids,
            table_name=embedding_table,
            order_by="chunk_index",
            limit=bm25_limit,
        )
        bm25_documents = _rows_to_documents(bm25_rows)
        if bm25_documents:
            bm25_k = effective_k if effective_k is not None else len(bm25_documents)
            bm25_retriever = BM25Retriever.from_documents(bm25_documents)
            bm25_retriever.k = bm25_k
            vector_retriever = PgVectorRetriever(
                db=db,
                session_id=session_id,
                file_ids=file_ids,
                k=effective_k,
                embedding_profile=embedding_profile,
                embedding_table=embedding_table,
            )
            ensemble = EnsembleRetriever(
                retrievers=[bm25_retriever, vector_retriever],
                weights=[HYBRID_KEYWORD_WEIGHT, HYBRID_VECTOR_WEIGHT],
            )
            hybrid_docs = await _ainvoke_retriever(ensemble, prompt)
            row_items = _documents_to_row_items(hybrid_docs)
    else:
        rows = _fetch_embedding_rows(
            db,
            session_id,
            file_ids,
            table_name=embedding_table,
            order_by="chunk_index",
            limit=effective_k,
        )
        row_items = [(row.filename, row.chunk_index, row.content) for row in rows]

    seen_keys: set[tuple[str, int]] = set()
    deduped_items: list[tuple[str, int, str]] = []
    for filename, chunk_index, content in row_items:
        key = (filename, chunk_index)
        if key in seen_keys:
            continue
        deduped_items.append((filename, chunk_index, content))
        seen_keys.add(key)
    if effective_k is not None:
        deduped_items = deduped_items[:effective_k]
        seen_keys = {(filename, chunk_index) for filename, chunk_index, _ in deduped_items}
    row_items = deduped_items

    code_items = [item for item in row_items if is_code_block_content(item[2])]
    if session_id is not None and len(code_items) < FLASHCARD_MIN_CODE_CARDS:
        code_query = (
            "SELECT filename, chunk_index, content "
            f"FROM {embedding_table} "
            "WHERE session_id = :sid AND content LIKE 'Code block%' "
            "ORDER BY chunk_index "
            "LIMIT :k"
        )
        if file_ids:
            code_query = (
                "SELECT filename, chunk_index, content "
                f"FROM {embedding_table} "
                "WHERE session_id = :sid AND files_id = ANY(:file_ids) AND content LIKE 'Code block%' "
                "ORDER BY chunk_index "
                "LIMIT :k"
            )
        code_params = {
            "sid": session_id,
            "k": FLASHCARD_MAX_CODE_BLOCKS_IN_CONTEXT,
        }
        if file_ids:
            code_params["file_ids"] = file_ids
        extra_rows = db.execute(sql_text(code_query), code_params).fetchall()
        for row in extra_rows:
            key = (row.filename, row.chunk_index)
            if key in seen_keys:
                continue
            row_items.append((row.filename, row.chunk_index, row.content))
            seen_keys.add(key)
            if is_code_block_content(row.content):
                code_items.append((row.filename, row.chunk_index, row.content))
                if len(code_items) >= FLASHCARD_MAX_CODE_BLOCKS_IN_CONTEXT:
                    break

    context_lines = []
    sources = []
    bounded_row_items: list[tuple[str, int, str]] = []
    bounded_code_items: list[tuple[str, int, str]] = []
    context_char_count = 0
    for filename, chunk_index, content in row_items:
        tag = len(sources)
        formatted = format_context_content_for_llm(content)
        line = f"[{tag}] {filename} (chunk {chunk_index}): {formatted}"
        line_cost = len(line) + 2
        if context_lines and (context_char_count + line_cost) > FLASHCARD_MAX_CONTEXT_CHARS:
            break
        context_lines.append(line)
        context_char_count += line_cost
        bounded_row_items.append((filename, chunk_index, content))
        if is_code_block_content(content):
            bounded_code_items.append((filename, chunk_index, content))
        sources.append(
            {
                "tag": tag,
                "filename": filename,
                "chunk_index": chunk_index,
            }
        )
    context = "\n\n".join(context_lines)
    context_len = len(context.strip())
    if context_len == 0:
        n_flashcards = 0
    else:
        n_flashcards = math.ceil(context_len / FLASHCARD_CHARS_PER_CARD)
        chunk_based_count = math.ceil(len(bounded_row_items) / FLASHCARD_CHUNKS_PER_CARD)
        n_flashcards = max(n_flashcards, chunk_based_count)
        n_flashcards = _apply_flashcard_amount(n_flashcards, flashcard_amount)
        n_flashcards = max(FLASHCARD_MIN_COUNT, n_flashcards)
        if bounded_code_items:
            n_flashcards = max(
                n_flashcards,
                len(bounded_code_items),
            )
    llm_prompt = FLASHCARD_PROMPT.format(context=context, n_flashcards=n_flashcards)
    target_tokens = min(
        FLASHCARD_LLM_MAX_TOKENS,
        max(128, n_flashcards * FLASHCARD_MAX_TOKENS_PER_CARD),
    )

    model_used: str | None = None
    try:
        if USE_OPENROUTER:
            content, model_used = await wait_for(
                run_in_threadpool(
                    _openrouter_chat,
                    llm_prompt,
                    target_tokens,
                ),
                timeout=FLASHCARD_LLM_TIMEOUT_SECONDS,
            )
        else:
            resp = await wait_for(
                run_in_threadpool(
                    ollama.chat,
                    model=FLASHCARD_LLM_MODEL,
                    messages=[{"role": "user", "content": llm_prompt}],
                    options={
                        "num_predict": target_tokens,
                        "temperature": 0.2,
                    },
                    keep_alive=FLASHCARD_LLM_KEEP_ALIVE,
                ),
                timeout=FLASHCARD_LLM_TIMEOUT_SECONDS,
            )
            content = resp["message"]["content"]
            model_used = FLASHCARD_LLM_MODEL
    except AsyncTimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail=(
                "Flashcard generation timed out. "
                "Try fewer files or a smaller selection."
            ),
        ) from exc

    flashcards = None
    saved_count = 0
    active_deck: FlashcardDecks | None = None
    parsed = _parse_flashcards(content)
    if not parsed and content.strip() and content.strip().upper() != "NONE":
        parsed = [
            {
                "question": "Generated Output",
                "answer": _normalize_obsidian_latex(content.strip()),
                "source_tag": None,
            }
        ]

    source_chunks = [
        {
            "tag": source.get("tag"),
            "filename": source.get("filename"),
            "chunk_index": source.get("chunk_index"),
        }
        for source in sources
    ]
    fallback_filenames = [
        source.get("filename")
        for source in sources
        if isinstance(source.get("filename"), str)
    ]
    source_files: list[dict] = []
    if session_id is not None:
        source_files = _fetch_source_files(
            db=db,
            session_id=session_id,
            file_ids=file_ids,
            fallback_filenames=fallback_filenames,
        )

    # Attach file source info when source_tag is provided
    if isinstance(parsed, list):
        by_tag = {s["tag"]: s for s in sources}
        for card in parsed:
            tag = card.get("source_tag")
            if isinstance(tag, str):
                match = re.search(r"\d+", tag)
                tag = int(match.group(0)) if match else None
                card["source_tag"] = tag
            if tag in by_tag:
                card["source"] = by_tag[tag]
        if session_id is not None:
            row_payloads: list[dict[str, str]] = []
            for card in parsed:
                question = card.get("question")
                answer = card.get("answer")
                if not question or not answer:
                    continue
                tag = card.get("source_tag")
                filename = None
                if tag in by_tag:
                    filename = by_tag[tag].get("filename")
                if not filename:
                    filename = "unknown"
                row_payloads.append(
                    {
                        "filename": filename,
                        "question": question,
                        "answer": answer,
                    }
                )

            active_deck = _persist_flashcard_deck(
                db=db,
                session_id=session_id,
                source_files=source_files,
                source_chunks=source_chunks,
                card_count=len(row_payloads),
            )

            if replace:
                db.execute(
                    sql_text("DELETE FROM flashcards WHERE deck_id = :deck_id"),
                    {"deck_id": active_deck.id},
                )

            if row_payloads:
                db.add_all(
                    [
                        Flashcard(
                            session_id=session_id,
                            deck_id=active_deck.id,
                            filename=item["filename"],
                            question=item["question"],
                            answer=item["answer"],
                        )
                        for item in row_payloads
                    ]
                )
                db.commit()
                saved_count = len(row_payloads)
    flashcards = parsed if parsed else None

    deck_payload = None
    if active_deck is not None:
        deck_payload = {
            "id": active_deck.id,
            "session_id": active_deck.session_id,
            "title": active_deck.title,
            "source_label": active_deck.source_label,
            "card_count": active_deck.card_count,
            "note_count": active_deck.note_count,
            "created_at": active_deck.created_at.isoformat() if active_deck.created_at else None,
        }

    return {
        "prompt": prompt,
        "flashcards": flashcards,
        "sources": sources,
        "raw": content,
        "saved_count": saved_count,
        "model_used": model_used,
        "deck": deck_payload,
    }


def get_flashcards(session_id: UUID, deck_id: int | None, db: Session):
    if db.get(Sessions, session_id) is None:
        raise HTTPException(status_code=404, detail="session_id not found")

    active_deck_id = deck_id
    if active_deck_id is not None:
        deck_row = db.execute(
            sql_text(
                "SELECT id FROM flashcard_decks "
                "WHERE id = :deck_id AND session_id = :sid "
                "LIMIT 1"
            ),
            {"deck_id": active_deck_id, "sid": session_id},
        ).fetchone()
        if deck_row is None:
            raise HTTPException(status_code=404, detail="deck_id not found")
    else:
        latest_deck_row = db.execute(
            sql_text(
                "SELECT id FROM flashcard_decks "
                "WHERE session_id = :sid "
                "ORDER BY created_at DESC, id DESC "
                "LIMIT 1"
            ),
            {"sid": session_id},
        ).fetchone()
        if latest_deck_row is not None:
            active_deck_id = latest_deck_row.id

    query = (
        "SELECT id, filename, question, answer "
        "FROM flashcards "
        "WHERE session_id = :sid "
    )
    params: dict[str, object] = {"sid": session_id}
    if active_deck_id is not None:
        query += "AND deck_id = :deck_id "
        params["deck_id"] = active_deck_id
    query += "ORDER BY id"

    rows = db.execute(
        sql_text(query),
        params,
    ).fetchall()
    flashcards = [
        {
            "id": row.id,
            "filename": row.filename,
            "question": row.question,
            "answer": row.answer,
        }
        for row in rows
    ]
    return {"session_id": session_id, "deck_id": active_deck_id, "flashcards": flashcards}


def get_files(session_id: UUID, db: Session):
    if db.get(Sessions, session_id) is None:
        raise HTTPException(status_code=404, detail="session_id not found")
    rows = db.execute(
        sql_text(
            "SELECT id, filename, content_type, "
            "COALESCE(octet_length(raw_content), 0) AS size_bytes "
            "FROM notes "
            "WHERE session_id = :sid "
            "ORDER BY id"
        ),
        {"sid": session_id},
    ).fetchall()
    files = [
        {
            "id": row.id,
            "filename": row.filename,
            "content_type": row.content_type,
            "size_bytes": row.size_bytes,
        }
        for row in rows
    ]
    return {"session_id": session_id, "files": files}


def get_flashcard_decks(session_id: UUID, db: Session):
    if db.get(Sessions, session_id) is None:
        raise HTTPException(status_code=404, detail="session_id not found")
    rows = db.execute(
        sql_text(
            "SELECT id, session_id, title, source_metadata, source_label, "
            "card_count, note_count, created_at "
            "FROM flashcard_decks "
            "WHERE session_id = :sid "
            "ORDER BY created_at DESC"
        ),
        {"sid": session_id},
    ).fetchall()
    decks = []
    for row in rows:
        source_metadata = row.source_metadata or {}
        decks.append(
            {
                "id": row.id,
                "session_id": row.session_id,
                "title": row.title,
                "source": source_metadata.get("files", []),
                "source_label": row.source_label,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "card_count": row.card_count,
                "note_count": row.note_count,
            }
        )
    return {"session_id": session_id, "decks": decks}
