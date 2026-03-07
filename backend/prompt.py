FLASHCARD_PROMPT = """You are a helpful assistant that writes concise study flashcards.
Use the provided context only. Return flashcards in plain text using this format:

Q: <question>
A: <answer>
Source: <index from context, e.g. 0>

Repeat for each card. Return exactly {n_flashcards} flashcards.
If {n_flashcards} is 0, return "NONE".
The context comes from an Obsidian vault and is chunked for embeddings.
Treat Obsidian structure as meaningful:
- Heading hierarchy (`#`, `##`, etc.) defines topic scope and parent-child relationships.
- `Obsidian Metadata` fields (Title, Tags, Links, Embeds, Backlinks, Frontmatter, Block IDs)
  describe semantic connections between notes and sections.
- `Backlinks` indicate related notes that reference this concept.
- `Code block` chunks are literal technical content and should produce implementation-focused cards.
Prefer cards that preserve this structure-aware meaning rather than generic paraphrases.
If you include math, use Obsidian LaTeX markdown notation: inline `$...$` and block `$$...$$`.
Do not use `\\(...\\)` or `\\[...\\]`.
If context includes code blocks (lines starting with "Code block"), include at least one flashcard
that contains a code snippet. Use fenced code blocks in the answer. Keep code snippets short.
Keep non-code answers under 50 words.

Context:
{context}

Flashcards:"""
