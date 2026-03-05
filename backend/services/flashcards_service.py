import json
import math
import re
import ollama
from starlette.concurrency import run_in_threadpool
from fastapi import HTTPException
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from langchain_community.retrievers import BM25Retriever
from langchain.retrievers import EnsembleRetriever
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Session
from db.models import Flashcard, Sessions
from db.session import launch_db
from prompt import FLASHCARD_PROMPT
from services.embedding_service import embed_query, embed_query_sync
from utils.obsidian import format_context_content_for_llm, is_code_block_content

FLASHCARD_CHARS_PER_CARD = 800
FLASHCARD_MIN_COUNT = 1
FLASHCARD_MAX_COUNT = 20
FLASHCARD_MIN_CODE_CARDS = 1
FLASHCARD_MAX_CODE_BLOCKS_IN_CONTEXT = 3
HYBRID_VECTOR_WEIGHT = 0.6
HYBRID_KEYWORD_WEIGHT = 0.4

try:
    from pydantic import ConfigDict
except Exception:  # pragma: no cover - pydantic v1 fallback
    ConfigDict = None


def _build_embedding_filters(session_id: int | None, file_ids: list[int] | None):
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
    session_id: int | None,
    file_ids: list[int] | None,
    *,
    order_by: str | None = None,
    limit: int | None = None,
    qvec: object | None = None,
):
    base_query = "SELECT filename, chunk_index, content FROM embeddings "
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


class PgVectorRetriever(BaseRetriever):
    db: Session
    session_id: int | None
    file_ids: list[int] | None
    k: int | None

    if ConfigDict is not None:
        model_config = ConfigDict(arbitrary_types_allowed=True)
    else:
        class Config:
            arbitrary_types_allowed = True

    def _get_relevant_documents(self, query: str) -> list[Document]:
        qvec = embed_query_sync(query)
        rows = _fetch_embedding_rows(
            self.db,
            self.session_id,
            self.file_ids,
            qvec=qvec,
            limit=self.k,
        )
        return _rows_to_documents(rows)

    async def _aget_relevant_documents(self, query: str) -> list[Document]:
        qvec = await embed_query(query)
        rows = _fetch_embedding_rows(
            self.db,
            self.session_id,
            self.file_ids,
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


async def generate_flashcards(
    prompt: str | None,
    k: int | None,
    session_id: int | None,
    file_ids: list[int] | None,
    replace: bool,
    db: Session,
):
    """
    Retrieve chunks via hybrid BM25 + pgvector and ask llm to generate flashcards.
    """
    launch_db()

    if not prompt and session_id is None:
        raise HTTPException(
            status_code=400,
            detail="prompt is required unless session_id is provided",
        )

    if session_id is not None and db.get(Sessions, session_id) is None:
        raise HTTPException(status_code=404, detail="session_id not found")

    effective_k = k
    if effective_k is None and session_id is None:
        effective_k = 5

    row_items: list[tuple[str, int, str]] = []
    if prompt:
        bm25_rows = _fetch_embedding_rows(
            db,
            session_id,
            file_ids,
            order_by="chunk_index",
            limit=None,
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
            "FROM embeddings "
            "WHERE session_id = :sid AND content LIKE 'Code block%' "
            "ORDER BY chunk_index "
            "LIMIT :k"
        )
        if file_ids:
            code_query = (
                "SELECT filename, chunk_index, content "
                "FROM embeddings "
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
    for i, (filename, chunk_index, content) in enumerate(row_items):
        formatted = format_context_content_for_llm(content)
        context_lines.append(f"[{i}] {filename} (chunk {chunk_index}): {formatted}")
        sources.append(
            {
                "tag": i,
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
        n_flashcards = min(
            FLASHCARD_MAX_COUNT,
            max(FLASHCARD_MIN_COUNT, n_flashcards),
        )
        if code_items:
            n_flashcards = max(
                n_flashcards,
                min(len(code_items), FLASHCARD_MAX_COUNT),
            )
    llm_prompt = FLASHCARD_PROMPT.format(context=context, n_flashcards=n_flashcards)

    resp = await run_in_threadpool(
        ollama.chat,
        model="llama3.1",
        messages=[{"role": "user", "content": llm_prompt}],
    )
    content = resp["message"]["content"]

    flashcards = None
    saved_count = 0
    parsed = _parse_flashcards(content)
    if not parsed and content.strip() and content.strip().upper() != "NONE":
        parsed = [
            {
                "question": "Generated Output",
                "answer": _normalize_obsidian_latex(content.strip()),
                "source_tag": None,
            }
        ]

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
            rows_to_save: list[Flashcard] = []
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
                rows_to_save.append(
                    Flashcard(
                        session_id=session_id,
                        filename=filename,
                        question=question,
                        answer=answer,
                    )
                )
            if replace:
                db.execute(
                    sql_text("DELETE FROM flashcards WHERE session_id = :sid"),
                    {"sid": session_id},
                )
                if rows_to_save:
                    db.add_all(rows_to_save)
                db.commit()
                saved_count = len(rows_to_save)
            elif rows_to_save:
                db.add_all(rows_to_save)
                db.commit()
                saved_count = len(rows_to_save)
    flashcards = parsed if parsed else None

    return {
        "prompt": prompt,
        "flashcards": flashcards,
        "sources": sources,
        "raw": content,
        "saved_count": saved_count,
    }


def get_flashcards(session_id: int, db: Session):
    launch_db()
    if db.get(Sessions, session_id) is None:
        raise HTTPException(status_code=404, detail="session_id not found")
    rows = db.execute(
        sql_text(
            "SELECT id, filename, question, answer "
            "FROM flashcards "
            "WHERE session_id = :sid "
            "ORDER BY id"
        ),
        {"sid": session_id},
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
    return {"session_id": session_id, "flashcards": flashcards}


def get_files(session_id: int, db: Session):
    launch_db()
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
