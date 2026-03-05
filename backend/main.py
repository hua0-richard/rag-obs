import json
import os
import re
from collections import Counter, defaultdict
import ollama
from pathlib import Path
from models import Files, Embeddings, Sessions, Flashcard
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from typing import List
from fastapi.middleware.cors import CORSMiddleware
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer
from service import SessionLocal, launch_db
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from sqlalchemy import text as sql_text
from prompt import FLASHCARD_PROMPT

import time

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

MARKDOWN_EXTENSIONS = {".md", ".markdown", ".mdx"}
_HEADING_RE = re.compile(r"^\s{0,3}(#{1,6})\s+(.*)$")
_BLOCKQUOTE_PREFIX_RE = re.compile(r"^\s*(?:>\s*)*")
_INLINE_MATH_MAX_LEN = 200
_INLINE_MATH_MAX_PER_SECTION = 50
_INLINE_CODE_MAX_LEN = 200
_INLINE_CODE_MAX_PER_SECTION = 50


def strip_blockquote_prefix(line: str) -> str:
    return _BLOCKQUOTE_PREFIX_RE.sub("", line)


def split_obsidian_math_fence_line(line: str) -> list[str]:
    match = _BLOCKQUOTE_PREFIX_RE.match(line)
    prefix = match.group(0) if match else ""
    content = line[len(prefix):]
    if "$$" not in content:
        return [line]

    stripped = content.strip()
    if stripped == "$$":
        return [prefix + "$$"]

    if stripped.endswith("$$") and not stripped.startswith("$$"):
        before = content.rstrip()[:-2].rstrip()
        lines: list[str] = []
        if before.strip():
            lines.append(prefix + before)
        lines.append(prefix + "$$")
        return lines

    if stripped.startswith("$$") and not stripped.endswith("$$"):
        after = content.lstrip()[2:].lstrip()
        lines = [prefix + "$$"]
        if after.strip():
            lines.append(prefix + after)
        return lines

    return [line]


def find_inline_math_in_line(line: str) -> list[str]:
    results: list[str] = []
    if "$" not in line:
        return results
    in_inline = False
    start = 0
    i = 0
    while i < len(line):
        ch = line[i]
        if ch == "\\":
            i += 2
            continue
        if ch == "$":
            if i + 1 < len(line) and line[i + 1] == "$":
                i += 2
                continue
            if not in_inline:
                in_inline = True
                start = i
                i += 1
                continue
            expr = line[start + 1 : i]
            if expr.strip():
                math = f"${expr}$"
                if len(math) <= _INLINE_MATH_MAX_LEN:
                    results.append(math)
            in_inline = False
            i += 1
            continue
        i += 1
    return results


def find_inline_code_in_line(line: str) -> list[str]:
    results: list[str] = []
    if "`" not in line:
        return results
    i = 0
    while i < len(line):
        if line[i] != "`":
            i += 1
            continue
        run_start = i
        while i < len(line) and line[i] == "`":
            i += 1
        run_len = i - run_start
        closer = "`" * run_len
        end = line.find(closer, i)
        if end == -1:
            i = run_start + 1
            continue
        content = line[i:end]
        if content.startswith(" ") and content.endswith(" ") and len(content) > 1:
            content = content[1:-1]
        if content.strip() and len(content) <= _INLINE_CODE_MAX_LEN:
            results.append(content)
        i = end + run_len
    return results


def strip_inline_code(text: str) -> str:
    cleaned_lines: list[str] = []
    for line in text.splitlines():
        out: list[str] = []
        i = 0
        while i < len(line):
            if line[i] != "`":
                out.append(line[i])
                i += 1
                continue
            run_start = i
            while i < len(line) and line[i] == "`":
                i += 1
            run_len = i - run_start
            closer = "`" * run_len
            end = line.find(closer, i)
            if end == -1:
                out.append(line[run_start:i])
                continue
            out.append(" ")
            i = end + run_len
        cleaned_lines.append("".join(out))
    return "\n".join(cleaned_lines)

def extract_inline_math_expressions(text: str) -> list[str]:
    expressions: list[str] = []
    code_fence_len: int | None = None
    in_math_fence = False
    for raw_line in text.splitlines():
        fence_len = detect_code_fence_len(raw_line)
        if fence_len is not None:
            if code_fence_len is None:
                code_fence_len = fence_len
            elif fence_len >= code_fence_len:
                code_fence_len = None
            continue
        if code_fence_len is not None:
            continue

        for line in split_obsidian_math_fence_line(raw_line):
            is_math_line, toggle = latex_line_info(line)
            if is_math_line:
                if toggle:
                    in_math_fence = not in_math_fence
                continue
            if in_math_fence:
                continue
            expressions.extend(find_inline_math_in_line(line))
            if len(expressions) >= _INLINE_MATH_MAX_PER_SECTION:
                return expressions
    return expressions


def extract_inline_code_spans(text: str) -> list[str]:
    spans: list[str] = []
    code_fence_len: int | None = None
    in_math_fence = False
    for raw_line in text.splitlines():
        fence_len = detect_code_fence_len(raw_line)
        if fence_len is not None:
            if code_fence_len is None:
                code_fence_len = fence_len
            elif fence_len >= code_fence_len:
                code_fence_len = None
            continue
        if code_fence_len is not None:
            continue

        for line in split_obsidian_math_fence_line(raw_line):
            is_math_line, toggle = latex_line_info(line)
            if is_math_line:
                if toggle:
                    in_math_fence = not in_math_fence
                continue
            if in_math_fence:
                continue
            spans.extend(find_inline_code_in_line(line))
            if len(spans) >= _INLINE_CODE_MAX_PER_SECTION:
                return spans
    return spans

def detect_code_fence_len(line: str) -> int | None:
    stripped = strip_blockquote_prefix(line).lstrip()
    if not stripped.startswith("```"):
        return None
    count = 0
    for ch in stripped:
        if ch == "`":
            count += 1
        else:
            break
    return count if count >= 3 else None


def latex_line_info(line: str) -> tuple[bool, bool]:
    stripped = strip_blockquote_prefix(line).strip()
    if not stripped:
        return False, False
    if stripped == "$$":
        return True, True
    if stripped.startswith("$$") and stripped.endswith("$$") and len(stripped) > 4:
        return True, False
    if stripped.startswith("$") and stripped.endswith("$") and len(stripped) > 2:
        return True, False
    return False, False
FRONTMATTER_RE = re.compile(r"^---\s*\r?\n(.*?)\r?\n---\s*\r?\n?", re.DOTALL)
OBSIDIAN_COMMENT_RE = re.compile(r"%%.*?%%", re.DOTALL)
WIKILINK_RE = re.compile(r"(!)?\[\[([^\]]+?)\]\]")
MD_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
TAG_RE = re.compile(r"(?<![\w/])#(?!#)([A-Za-z][\w/-]*)")
BLOCK_ID_RE = re.compile(r"(?m)(?<=\S)\s*\^([A-Za-z0-9-]+)\s*$")


def is_markdown_source(filename: str | None, content_type: str | None) -> bool:
    if content_type and "markdown" in content_type.lower():
        return True
    if not filename:
        return False
    return Path(filename).suffix.lower() in MARKDOWN_EXTENSIONS


def extract_markdown_sections(text: str) -> list[tuple[list[str], str]]:
    sections: list[tuple[list[str], str]] = []
    if not text or not text.strip():
        return sections

    heading_stack: list[tuple[int, str]] = []
    current_lines: list[str] = []
    current_headings: list[str] = []
    code_fence_len: int | None = None
    in_math_fence = False

    def flush_section() -> None:
        nonlocal current_lines
        if not current_lines:
            return
        body = "\n".join(current_lines).strip()
        if body:
            sections.append((current_headings.copy(), body))
        current_lines = []

    for raw_line in text.splitlines():
        fence_len = detect_code_fence_len(raw_line)
        if fence_len is not None:
            if code_fence_len is None:
                code_fence_len = fence_len
            elif fence_len >= code_fence_len:
                code_fence_len = None
            current_lines.append(raw_line)
            continue

        if code_fence_len is not None:
            current_lines.append(raw_line)
            continue

        for line in split_obsidian_math_fence_line(raw_line):
            is_math_line, toggle = latex_line_info(line)
            if is_math_line:
                if toggle:
                    in_math_fence = not in_math_fence
                current_lines.append(line)
                continue
            if in_math_fence:
                current_lines.append(line)
                continue

            match = _HEADING_RE.match(line)
            if match:
                flush_section()
                level = len(match.group(1))
                title = re.sub(r"\s+#*$", "", match.group(2)).strip()
                while heading_stack and heading_stack[-1][0] >= level:
                    heading_stack.pop()
                heading_stack.append((level, title))
                current_headings = [h[1] for h in heading_stack]
                continue

            current_lines.append(line)

    flush_section()

    if not sections and text.strip():
        sections.append(([], text.strip()))

    return sections


def format_heading_context(headings: list[str]) -> str:
    if not headings:
        return ""
    lines: list[str] = []
    for level, title in enumerate(headings, start=1):
        safe_level = level if level <= 6 else 6
        lines.append(f"{'#' * safe_level} {title}")
    return "\n".join(lines)


def split_text_with_context(
    text: str,
    filename: str | None,
    content_type: str | None,
    splitter: RecursiveCharacterTextSplitter,
) -> list[str]:
    if is_markdown_source(filename, content_type):
        sections = extract_markdown_sections(text)
        chunks: list[str] = []
        for headings, body in sections:
            if not body:
                continue
            context_prefix = format_heading_context(headings)
            for chunk in splitter.split_text(body):
                cleaned = chunk.strip()
                if not cleaned:
                    continue
                if context_prefix:
                    chunks.append(f"{context_prefix}\n\n{cleaned}")
                else:
                    chunks.append(cleaned)
            inline_math = extract_inline_math_expressions(body)
            for expr in inline_math:
                if context_prefix:
                    chunks.append(f"{context_prefix}\n\nInline math: {expr}")
                else:
                    chunks.append(f"Inline math: {expr}")
            inline_code = extract_inline_code_spans(body)
            for code in inline_code:
                if context_prefix:
                    chunks.append(f"{context_prefix}\n\nInline code: {code}")
                else:
                    chunks.append(f"Inline code: {code}")
        return chunks

    return [chunk.strip() for chunk in splitter.split_text(text) if chunk.strip()]

def strip_code_and_comments(text: str) -> str:
    stripped = OBSIDIAN_COMMENT_RE.sub(" ", text)
    cleaned_lines: list[str] = []
    code_fence_len: int | None = None
    in_math_fence = False
    for raw_line in stripped.splitlines():
        fence_len = detect_code_fence_len(raw_line)
        if fence_len is not None:
            if code_fence_len is None:
                code_fence_len = fence_len
            elif fence_len >= code_fence_len:
                code_fence_len = None
            continue
        if code_fence_len is not None:
            continue

        for line in split_obsidian_math_fence_line(raw_line):
            is_math_line, toggle = latex_line_info(line)
            if is_math_line:
                if toggle:
                    in_math_fence = not in_math_fence
                continue
            if in_math_fence:
                continue

            cleaned_lines.append(line)

    stripped = "\n".join(cleaned_lines)
    stripped = strip_inline_code(stripped)
    return stripped

def extract_frontmatter(text: str) -> tuple[dict, str]:
    match = FRONTMATTER_RE.match(text)
    if not match:
        return {}, text
    block = match.group(1)
    remainder = text[match.end() :]
    return parse_frontmatter_block(block), remainder

def parse_frontmatter_block(block: str) -> dict:
    data: dict[str, object] = {}
    current_key: str | None = None
    for raw_line in block.splitlines():
        line = raw_line.rstrip()
        if not line.strip():
            continue
        if re.match(r"^\s*#", line):
            continue
        list_item = re.match(r"^\s*-\s*(.+)$", line)
        if list_item and current_key:
            items = data.setdefault(current_key, [])
            if isinstance(items, list):
                items.append(list_item.group(1).strip().strip("\"'"))
            continue
        kv = re.match(r"^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$", line)
        if not kv:
            current_key = None
            continue
        key = kv.group(1).strip().lower()
        value = kv.group(2).strip()
        if value == "":
            data[key] = []
            current_key = key
            continue
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            if inner:
                items = [
                    item.strip().strip("\"'")
                    for item in inner.split(",")
                    if item.strip()
                ]
                data[key] = items
            else:
                data[key] = []
        else:
            data[key] = value.strip().strip("\"'")
        current_key = key
    return data

def coerce_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if isinstance(value, str):
        value = value.strip()
        return [value] if value else []
    return [str(value)]

def parse_link_target(target: str) -> dict[str, str | None]:
    target = target.strip()
    note_part = target
    heading = None
    block = None
    if "#" in target:
        note_part, remainder = target.split("#", 1)
        if "^" in remainder:
            heading_part, block_part = remainder.split("^", 1)
            heading = heading_part.strip() or None
            block = block_part.strip() or None
        else:
            heading = remainder.strip() or None
    elif "^" in target:
        note_part, block_part = target.split("^", 1)
        block = block_part.strip() or None
    note_part = note_part.strip()
    if target.startswith("#") or target.startswith("^"):
        note_part = ""
    return {"note": note_part, "heading": heading, "block": block}

def format_link_target(info: dict[str, str | None], default_note: str | None = None) -> str:
    note = info.get("note") or default_note or "this note"
    heading = info.get("heading")
    block = info.get("block")
    label = note
    if heading:
        label = f"{label} > {heading}"
    if block:
        label = f"{label} (block {block})"
    return label

def parse_obsidian_links(text: str) -> tuple[str, list[dict], list[dict]]:
    links: list[dict] = []
    embeds: list[dict] = []

    def replace_wikilink(match: re.Match) -> str:
        is_embed = bool(match.group(1))
        content = match.group(2).strip()
        target = content
        alias = None
        if "|" in content:
            target, alias = content.split("|", 1)
            target = target.strip()
            alias = alias.strip() or None
        info = parse_link_target(target)
        entry = {
            "note": info.get("note") or "",
            "heading": info.get("heading"),
            "block": info.get("block"),
            "alias": alias,
            "embed": is_embed,
            "raw": content,
        }
        links.append(entry)
        if is_embed:
            embeds.append(entry)
        display = alias or format_link_target(info)
        if is_embed:
            return f"embedded: {display}"
        if alias and info.get("note"):
            return f"{alias} (link: {format_link_target(info)})"
        return display

    cleaned = WIKILINK_RE.sub(replace_wikilink, text)

    def replace_md_link(match: re.Match) -> str:
        label = match.group(1).strip()
        url = match.group(2).strip()
        if not url or re.match(r"^[a-z]+://", url):
            return match.group(0)
        url = url.split("?", 1)[0]
        url_no_fragment, _, fragment = url.partition("#")
        path = url_no_fragment.strip()
        if not path:
            return match.group(0)
        _, ext = os.path.splitext(path)
        if ext and ext.lower() not in {".md", ".markdown", ".mdx"}:
            return match.group(0)
        note_part = os.path.splitext(os.path.basename(path))[0] or path
        info = parse_link_target(note_part + (f"#{fragment}" if fragment else ""))
        entry = {
            "note": info.get("note") or "",
            "heading": info.get("heading"),
            "block": info.get("block"),
            "alias": label or None,
            "embed": False,
            "raw": path,
        }
        links.append(entry)
        return f"{label} (link: {format_link_target(info)})"

    cleaned = MD_LINK_RE.sub(replace_md_link, cleaned)
    return cleaned, links, embeds

def extract_inline_tags(text: str) -> set[str]:
    return set(TAG_RE.findall(text))

def extract_block_ids(text: str) -> set[str]:
    return set(BLOCK_ID_RE.findall(text))

def strip_block_ids(text: str) -> str:
    return BLOCK_ID_RE.sub("", text)

def normalize_key(value: str) -> str:
    return value.strip().replace("\\", "/").strip("/")

def build_note_key_map(notes: dict[str, dict]) -> dict[str, set[str]]:
    key_map: dict[str, set[str]] = defaultdict(set)
    for note in notes.values():
        filename = note["filename"]
        keys = set()
        title = note.get("title") or ""
        path_key = note.get("path_key") or ""
        if title:
            keys.add(normalize_key(title).lower())
        if path_key:
            keys.add(normalize_key(path_key).lower())
        frontmatter_title = note.get("frontmatter", {}).get("title")
        if isinstance(frontmatter_title, str) and frontmatter_title.strip():
            keys.add(normalize_key(frontmatter_title).lower())
        for alias in note.get("aliases", []):
            if alias:
                keys.add(normalize_key(alias).lower())
        for key in keys:
            key_map[key].add(filename)
    return key_map

def resolve_link_targets(link: dict, key_map: dict[str, set[str]]) -> set[str]:
    note_ref = link.get("note") or ""
    if not note_ref:
        return set()
    normalized = normalize_key(note_ref).lower()
    targets = set(key_map.get(normalized, []))
    if targets:
        return targets
    if "/" in normalized:
        base = normalize_key(os.path.basename(normalized)).lower()
        return set(key_map.get(base, []))
    return set()

def build_backlinks(notes: dict[str, dict], key_map: dict[str, set[str]]) -> dict[str, set[str]]:
    backlinks: dict[str, set[str]] = defaultdict(set)
    for note in notes.values():
        source = note["filename"]
        for link in note.get("links", []):
            for target in resolve_link_targets(link, key_map):
                if target != source:
                    backlinks[target].add(source)
    return backlinks

def build_display_names(notes: dict[str, dict]) -> dict[str, str]:
    titles = [note.get("title") or note["filename"] for note in notes.values()]
    counts = Counter(titles)
    display: dict[str, str] = {}
    for note in notes.values():
        title = note.get("title") or note["filename"]
        if counts[title] > 1:
            display[note["filename"]] = note.get("path_key") or note["filename"]
        else:
            display[note["filename"]] = title
    return display

def format_frontmatter_summary(frontmatter: dict) -> str | None:
    if not frontmatter:
        return None
    parts: list[str] = []
    for key, value in frontmatter.items():
        if key in {"tags", "tag", "aliases", "alias", "title"}:
            continue
        if isinstance(value, list):
            if not value:
                continue
            val = ", ".join(str(item) for item in value if str(item).strip())
        else:
            val = str(value).strip()
        if not val or len(val) > 200:
            continue
        parts.append(f"{key}: {val}")
    if not parts:
        return None
    return "Frontmatter: " + "; ".join(parts)

def build_embedding_text(
    note: dict,
    backlinks: dict[str, set[str]],
    display_names: dict[str, str],
    key_map: dict[str, set[str]],
) -> str:
    metadata_lines: list[str] = []
    title = note.get("title") or note["filename"]
    metadata_lines.append(f"Title: {title}")

    aliases = sorted(set(note.get("aliases", [])))
    if aliases:
        metadata_lines.append("Aliases: " + ", ".join(aliases))

    tags = sorted(set(note.get("tags", [])))
    if tags:
        metadata_lines.append("Tags: " + ", ".join(tags))

    block_ids = sorted(set(note.get("block_ids", [])))
    if block_ids:
        metadata_lines.append("Block IDs: " + ", ".join(block_ids))

    outgoing = []
    for link in note.get("links", []):
        targets = resolve_link_targets(link, key_map)
        if targets:
            for target in targets:
                outgoing.append(display_names.get(target, target))
        else:
            note_ref = link.get("note") or ""
            if note_ref:
                outgoing.append(note_ref)
    if outgoing:
        metadata_lines.append("Links: " + ", ".join(sorted(set(outgoing))))

    embeds = []
    for link in note.get("embeds", []):
        targets = resolve_link_targets(link, key_map)
        if targets:
            for target in targets:
                embeds.append(display_names.get(target, target))
        else:
            note_ref = link.get("note") or ""
            if note_ref:
                embeds.append(note_ref)
    if embeds:
        metadata_lines.append("Embeds: " + ", ".join(sorted(set(embeds))))

    backlink_sources = sorted(
        display_names.get(source, source)
        for source in backlinks.get(note["filename"], set())
    )
    if backlink_sources:
        metadata_lines.append("Backlinks: " + ", ".join(backlink_sources))

    frontmatter_summary = format_frontmatter_summary(note.get("frontmatter", {}))
    if frontmatter_summary:
        metadata_lines.append(frontmatter_summary)

    metadata_block = ""
    if metadata_lines:
        metadata_block = "Obsidian Metadata:\n" + "\n".join(metadata_lines) + "\n\n"

    return metadata_block + (note.get("cleaned_text") or "")

def build_obsidian_context(decoded_files: list[dict]) -> dict[str, dict]:
    notes: dict[str, dict] = {}
    for entry in decoded_files:
        filename = entry["filename"]
        content_type = entry.get("content_type")
        text = entry["text"]
        if not is_markdown_source(filename, content_type):
            notes[filename] = {
                "filename": filename,
                "title": os.path.splitext(os.path.basename(filename))[0],
                "path_key": normalize_key(os.path.splitext(filename)[0]),
                "frontmatter": {},
                "aliases": [],
                "tags": [],
                "links": [],
                "embeds": [],
                "block_ids": [],
                "cleaned_text": text.strip(),
            }
            continue
        frontmatter, body = extract_frontmatter(text)
        clean_body = strip_block_ids(body)
        cleaned_text, links, embeds = parse_obsidian_links(clean_body)
        tag_source = strip_code_and_comments(body)
        tags = set()
        tags.update(coerce_list(frontmatter.get("tags")))
        tags.update(coerce_list(frontmatter.get("tag")))
        tags.update(extract_inline_tags(tag_source))
        aliases = set()
        aliases.update(coerce_list(frontmatter.get("aliases")))
        aliases.update(coerce_list(frontmatter.get("alias")))
        frontmatter_title = frontmatter.get("title")
        if isinstance(frontmatter_title, str) and frontmatter_title.strip():
            aliases.add(frontmatter_title.strip())
        block_ids = extract_block_ids(body)

        title = os.path.splitext(os.path.basename(filename))[0]
        path_key = normalize_key(os.path.splitext(filename)[0])

        notes[filename] = {
            "filename": filename,
            "title": title,
            "path_key": path_key,
            "frontmatter": frontmatter,
            "aliases": sorted(aliases),
            "tags": sorted(tags),
            "links": links,
            "embeds": embeds,
            "block_ids": sorted(block_ids),
            "cleaned_text": cleaned_text.strip(),
        }

    key_map = build_note_key_map(notes)
    backlinks = build_backlinks(notes, key_map)
    display_names = build_display_names(notes)
    for note in notes.values():
        note["embedding_text"] = build_embedding_text(
            note, backlinks, display_names, key_map
        )
    return notes


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
# This is WORKING for now
@app.post("/upload-files")
async def document_upload(
    files: List[UploadFile] = File(...),
    session_id: int | None = Query(
        None, description="Existing session_id; if omitted a new one is created"
    ),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    
    # Need to tune
    splitter = RecursiveCharacterTextSplitter(chunk_size = 512)
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
                    vectors = await run_in_threadpool(
                        model.encode, chunks, convert_to_numpy=True
                    )

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

@app.get("/llm")
async def llm_flashcards(prompt: str | None = None, k: int | None = None, session_id: int | None = None, db: Session = Depends(get_db)):
    """
    Retrieve top-k chunks via pgvector and ask Ollama (llama3.1) to generate flashcards.
    """
    launch_db()

    if not prompt and session_id is None:
        raise HTTPException(
            status_code=400,
            detail="prompt is required unless session_id is provided",
        )

    qvec = None
    if prompt:
        # Embed the prompt off the event loop
        qvec = (await run_in_threadpool(model.encode, [prompt], convert_to_numpy=True))[0]

    if session_id is not None and db.get(Sessions, session_id) is None:
        raise HTTPException(status_code=404, detail="session_id not found")

    base_query = (
        "SELECT filename, chunk_index, content "
        "FROM embeddings "
    )
    clauses = []
    params = {}
    if session_id is not None:
        clauses.append("session_id = :sid")
        params["sid"] = session_id
    if clauses:
        base_query += "WHERE " + " AND ".join(clauses) + " "
    if qvec is not None:
        params["qvec"] = qvec.tolist()
        base_query += "ORDER BY embedding <=> (:qvec)::vector"
    else:
        base_query += "ORDER BY chunk_index"

    effective_k = k
    if effective_k is None and session_id is None:
        effective_k = 5
    if effective_k is not None:
        base_query += " LIMIT :k"
        params["k"] = effective_k

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

    n_flashcards = len(rows)
    llm_prompt = FLASHCARD_PROMPT.format(context=context, n_flashcards=n_flashcards)

    resp = await run_in_threadpool(
        ollama.chat,
        model="llama3.1",
        messages=[{"role": "user", "content": llm_prompt}],
    )
    content = resp["message"]["content"]

    def normalize_obsidian_latex(text: str) -> str:
        if not text:
            return text
        normalized = text
        normalized = re.sub(r"\\\((.+?)\\\)", r"$\1$", normalized, flags=re.DOTALL)
        normalized = re.sub(r"\\\[(.+?)\\\]", r"$$\1$$", normalized, flags=re.DOTALL)
        return normalized

    def normalize_card(item: object) -> dict | None:
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
            "question": normalize_obsidian_latex(question.strip()),
            "answer": normalize_obsidian_latex(answer.strip()),
            "source_tag": source_tag,
        }

    def parse_qa_blocks(text: str) -> list[dict]:
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
                        "question": normalize_obsidian_latex(inline.group(1).strip()),
                        "answer": normalize_obsidian_latex(inline.group(2).strip()),
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
                current_q = normalize_obsidian_latex(q_match.group(1).strip())
                continue

            a_match = re.match(r"^(?:A|Answer)\s*[:\-]\s*(.+)$", line, re.IGNORECASE)
            if a_match and current_q:
                in_answer = True
                current_a.append(normalize_obsidian_latex(a_match.group(1).strip()))
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
                current_a.append(normalize_obsidian_latex(line))

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
                        "question": normalize_obsidian_latex(dash_match.group(1).strip()),
                        "answer": normalize_obsidian_latex(dash_match.group(2).strip()),
                        "source_tag": None,
                    }
                )
        return cards

    def parse_flashcards(text: str) -> list[dict]:
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
                normalized_item = normalize_card(item)
                if normalized_item:
                    normalized.append(normalized_item)
            if normalized:
                return normalized

        return parse_qa_blocks(text)

    flashcards = None
    saved_count = 0
    parsed = parse_flashcards(content)
    if not parsed and content.strip() and content.strip().upper() != "NONE":
        parsed = [
            {
                "question": "Generated Output",
                "answer": normalize_obsidian_latex(content.strip()),
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
            if rows_to_save:
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

@app.get("/flashcards")
def get_flashcards(session_id: int = Query(...), db: Session = Depends(get_db)):
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

@app.get("/files")
def get_files(session_id: int = Query(...), db: Session = Depends(get_db)):
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
