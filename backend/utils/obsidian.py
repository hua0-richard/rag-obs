import os
import re
from collections import Counter, defaultdict
from pathlib import Path

MARKDOWN_EXTENSIONS = {".md", ".markdown", ".mdx"}
_HEADING_RE = re.compile(r"^\s{0,3}(#{1,6})\s+(.*)$")
_BLOCKQUOTE_PREFIX_RE = re.compile(r"^\s*(?:>\s*)*")
_INLINE_MATH_MAX_LEN = 200
_INLINE_MATH_MAX_PER_SECTION = 50
_INLINE_CODE_MAX_LEN = 200
_INLINE_CODE_MAX_PER_SECTION = 50
_BOLD_MAX_LEN = 200
_BOLD_MAX_PER_SECTION = 50
_BOLD_RE = re.compile(r"(?<!\\)(\*\*|__)(.+?)(?<!\\)\1")
_CALLOUT_HEADER_RE = re.compile(r"^\s*\[!([A-Za-z0-9_-]+)\](?:[+-])?\s*(.*)$")
_HORIZONTAL_RULE_RE = re.compile(r"^\s*[-*_]{3,}\s*$")
FRONTMATTER_RE = re.compile(r"^---\s*\r?\n(.*?)\r?\n---\s*\r?\n?", re.DOTALL)
OBSIDIAN_COMMENT_RE = re.compile(r"%%.*?%%", re.DOTALL)
WIKILINK_RE = re.compile(r"(!)?\[\[([^\]]+?)\]\]")
MD_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
TAG_RE = re.compile(r"(?<![\w/])#(?!#)([A-Za-z][\w/-]*)")
BLOCK_ID_RE = re.compile(r"(?m)(?<=\S)\s*\^([A-Za-z0-9-]+)\s*$")


def strip_blockquote_prefix(line: str) -> str:
    return _BLOCKQUOTE_PREFIX_RE.sub("", line)


def is_blockquote_line(line: str) -> bool:
    return line.lstrip().startswith(">")


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
            cleaned = strip_inline_code(line)
            expressions.extend(find_inline_math_in_line(cleaned))
            if len(expressions) >= _INLINE_MATH_MAX_PER_SECTION:
                return expressions
    return expressions


def extract_bold_phrases(text: str) -> list[str]:
    phrases: list[str] = []
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
            cleaned = strip_inline_code(line)
            for match in _BOLD_RE.finditer(cleaned):
                phrase = match.group(2).strip()
                if phrase and len(phrase) <= _BOLD_MAX_LEN:
                    phrases.append(phrase)
                    if len(phrases) >= _BOLD_MAX_PER_SECTION:
                        return phrases
    return phrases


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


def extract_code_fence_blocks(text: str) -> list[str]:
    blocks: list[str] = []
    code_fence_len: int | None = None
    code_lang: str | None = None
    buffer: list[str] = []
    for raw_line in text.splitlines():
        fence_len = detect_code_fence_len(raw_line)
        if fence_len is not None:
            stripped = strip_blockquote_prefix(raw_line).lstrip()
            info = stripped[fence_len:].strip()
            if code_fence_len is None:
                code_fence_len = fence_len
                code_lang = info.split()[0] if info else None
                buffer = []
            elif fence_len >= code_fence_len:
                if buffer:
                    code = "\n".join(buffer).rstrip()
                    if code:
                        label = (
                            f"Code block ({code_lang})"
                            if code_lang
                            else "Code block"
                        )
                        blocks.append(f"{label}:\n{code}")
                code_fence_len = None
                code_lang = None
                buffer = []
            continue
        if code_fence_len is not None:
            buffer.append(strip_blockquote_prefix(raw_line))
    if code_fence_len is not None and buffer:
        code = "\n".join(buffer).rstrip()
        if code:
            label = f"Code block ({code_lang})" if code_lang else "Code block"
            blocks.append(f"{label}:\n{code}")
    return blocks


def extract_block_math(text: str) -> list[str]:
    blocks: list[str] = []
    code_fence_len: int | None = None
    in_math_fence = False
    buffer: list[str] = []
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
            stripped = strip_blockquote_prefix(line).strip()
            if stripped.startswith("$$") and stripped.endswith("$$") and len(stripped) > 4:
                expr = stripped[2:-2].strip()
                if expr:
                    blocks.append(f"Math block:\n{expr}")
                continue
            if stripped == "$$":
                if in_math_fence:
                    expr = "\n".join(buffer).strip()
                    if expr:
                        blocks.append(f"Math block:\n{expr}")
                    buffer = []
                    in_math_fence = False
                else:
                    in_math_fence = True
                    buffer = []
                continue
            if in_math_fence:
                buffer.append(strip_blockquote_prefix(line))
    if in_math_fence and buffer:
        expr = "\n".join(buffer).strip()
        if expr:
            blocks.append(f"Math block:\n{expr}")
    return blocks


def normalize_obsidian_body_for_chunks(body: str) -> str:
    cleaned_lines: list[str] = []
    code_fence_len: int | None = None
    in_math_fence = False
    in_callout = False
    for raw_line in body.splitlines():
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
            stripped = strip_blockquote_prefix(line).strip()
            if stripped.startswith("$$") and stripped.endswith("$$") and len(stripped) > 4:
                continue
            if stripped == "$$":
                in_math_fence = not in_math_fence
                continue
            if in_math_fence:
                continue

            if is_blockquote_line(line):
                trimmed = strip_blockquote_prefix(line).rstrip()
                header_match = _CALLOUT_HEADER_RE.match(trimmed.strip())
                if header_match:
                    callout_type = header_match.group(1).lower()
                    title = header_match.group(2).strip()
                    if title:
                        cleaned_lines.append(f"Callout ({callout_type}): {title}")
                    else:
                        cleaned_lines.append(f"Callout ({callout_type})")
                    in_callout = True
                    continue
                if in_callout:
                    cleaned_lines.append(trimmed)
                    continue
                cleaned_lines.append(trimmed)
                continue

            in_callout = False
            if _HORIZONTAL_RULE_RE.match(stripped):
                continue
            cleaned_lines.append(line)
    return "\n".join(cleaned_lines)


def is_code_block_content(text: str) -> bool:
    return text.lstrip().startswith("Code block")


def format_context_content_for_llm(content: str) -> str:
    stripped = content.lstrip()
    if stripped.startswith("Math block:"):
        expr = stripped[len("Math block:") :].strip()
        if expr:
            return f"$$\n{expr}\n$$"
    return content


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


def is_markdown_source(filename: str | None, content_type: str | None) -> bool:
    if content_type and "markdown" in content_type.lower():
        return True
    if not filename:
        return False
    return Path(filename).suffix.lower() in MARKDOWN_EXTENSIONS


def extract_markdown_sections(text: str) -> list[tuple[list[tuple[int, str]], str]]:
    sections: list[tuple[list[tuple[int, str]], str]] = []
    if not text or not text.strip():
        return sections

    heading_stack: list[tuple[int, str]] = []
    current_lines: list[str] = []
    current_headings: list[tuple[int, str]] = []
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
                current_headings = heading_stack.copy()
                continue

            current_lines.append(line)

    flush_section()

    if not sections and text.strip():
        sections.append(([], text.strip()))

    return sections


def format_heading_context(headings: list[tuple[int, str]]) -> str:
    if not headings:
        return ""
    lines: list[str] = []
    for level, title in headings:
        safe_level = level if level <= 6 else 6
        lines.append(f"{'#' * safe_level} {title}")
    return "\n".join(lines)


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
