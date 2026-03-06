import os
from langchain_text_splitters import RecursiveCharacterTextSplitter
from utils.obsidian import (
    build_backlinks,
    build_display_names,
    build_embedding_text,
    build_note_key_map,
    coerce_list,
    extract_block_ids,
    extract_code_fence_blocks,
    extract_block_math,
    extract_bold_phrases,
    extract_frontmatter,
    extract_inline_code_spans,
    extract_inline_math_expressions,
    extract_inline_tags,
    extract_markdown_sections,
    format_heading_context,
    is_markdown_source,
    normalize_key,
    normalize_obsidian_body_for_chunks,
    parse_obsidian_links,
    strip_block_ids,
    strip_code_and_comments,
)


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
            body_for_chunks = normalize_obsidian_body_for_chunks(body)
            priority_blocks: list[str] = []
            for block in extract_code_fence_blocks(body):
                priority_blocks.append(block)
            for block in extract_block_math(body):
                priority_blocks.append(block)
            for block in priority_blocks:
                if context_prefix:
                    chunks.append(f"{context_prefix}\n\n{block}")
                else:
                    chunks.append(block)
            if context_prefix:
                chunks.append(context_prefix)
            for chunk in splitter.split_text(body_for_chunks):
                cleaned = chunk.strip()
                if not cleaned:
                    continue
                if context_prefix:
                    chunks.append(f"{context_prefix}\n\n{cleaned}")
                else:
                    chunks.append(cleaned)
            bold_phrases = extract_bold_phrases(body)
            for phrase in bold_phrases:
                if context_prefix:
                    chunks.append(f"{context_prefix}\n\nBold: {phrase}")
                else:
                    chunks.append(f"Bold: {phrase}")
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
        if chunks:
            return chunks

        return [
            chunk.strip()
            for chunk in splitter.split_text(text)
            if chunk.strip()
        ]

    return [chunk.strip() for chunk in splitter.split_text(text) if chunk.strip()]
